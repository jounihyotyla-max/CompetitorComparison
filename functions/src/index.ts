import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import { COLLECTIONS, Competitor, MarketId, Review, Role } from "@cc/shared";
import { db, nowIso } from "./lib/admin.ts";
import { anthropicClient, DEFAULT_MODEL } from "./pipeline/extract.ts";
import { processDocument } from "./pipeline/run.ts";
import { applyReview } from "./pipeline/review.ts";
import { generateBattlecard } from "./pipeline/battlecard.ts";
import { generateMarketing } from "./pipeline/marketing.ts";
import { answer } from "./pipeline/ask.ts";
import { seedAll } from "./seed/seed.ts";
import { runCrawl } from "./connectors/crawl.ts";
import { discoverPages } from "./connectors/discover.ts";
import { syncSlack } from "./connectors/slack.ts";
import { buildDigest, postDigest } from "./pipeline/digest.ts";

setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const SLACK_BOT_TOKEN = defineSecret("SLACK_BOT_TOKEN");
const CLAUDE_MODEL = defineString("CLAUDE_MODEL", { default: DEFAULT_MODEL });
/** Comma-separated emails that become admins on first sign-in; everyone else starts as viewer. */
const ADMIN_EMAILS = defineString("ADMIN_EMAILS", { default: "jouni.hyotyla@nofence.com" });

const model = () => anthropicClient(ANTHROPIC_API_KEY.value(), CLAUDE_MODEL.value());

async function requireRole(uid: string | undefined, roles: Role[]) {
  if (!uid) throw new HttpsError("unauthenticated", "sign in first");
  const u = await db.collection(COLLECTIONS.users).doc(uid).get();
  const role = u.data()?.role as Role | undefined;
  if (!role || !roles.includes(role)) throw new HttpsError("permission-denied", `needs one of: ${roles.join(", ")}`);
}

/** Every new source document (connector or manual note) runs the pipeline once. */
export const onDocumentNew = onDocumentCreated(
  { document: `${COLLECTIONS.documents}/{id}`, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "1GiB" },
  async (event) => {
    await processDocument(event.params.id, model());
  },
);

/** Admin: run a document again (e.g. after a field or prompt change). Old claims from it are replaced. */
export const reprocessDocument = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "1GiB" },
  async (req) => {
    await requireRole(req.auth?.uid, ["admin"]);
    const id = String(req.data?.id ?? "");
    if (!id) throw new HttpsError("invalid-argument", "id required");
    const rep = await processDocument(id, model(), { force: true });
    return { ok: true, report: rep ?? null };
  },
);

/** Admin: load the registry (markets, fields, competitors, settings) and the phase-1 sample notes. */
export const seed = onCall({ timeoutSeconds: 300 }, async (req) => {
  await requireRole(req.auth?.uid, ["admin"]);
  const withNotes = req.data?.withNotes !== false;
  const result = await seedAll(db, { withNotes, author: req.auth?.token.email ?? "seed", resetCompetitors: req.data?.resetCompetitors === true });
  return result;
});

/** Editor: (re)generate the battlecard for one competitor in one market from the current cells. */
export const battlecard = onCall({ secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300 }, async (req) => {
  await requireRole(req.auth?.uid, ["editor", "admin"]);
  const competitorId = String(req.data?.competitorId ?? "");
  const marketId = MarketId.safeParse(req.data?.marketId ?? "GLOBAL");
  if (!competitorId || !marketId.success) throw new HttpsError("invalid-argument", "competitorId and a valid marketId required");
  return generateBattlecard(competitorId, marketId.data, model());
});

/**
 * Admin: settle open reviews on descriptive (free_text) fields by accepting the newer claim, which is what the
 * resolver now does automatically for new claims. Numbers, prices, booleans and categories stay in the inbox.
 */
export const autoResolveReviews = onCall({ timeoutSeconds: 300 }, async (req) => {
  await requireRole(req.auth?.uid, ["admin"]);
  const fields = new Map((await db.collection(COLLECTIONS.fields).get()).docs.map((d) => [d.id, d.data().type as string]));
  const open = await db.collection(COLLECTIONS.reviews).where("status", "==", "open").get();
  // 1. Fold duplicates: one review per cell, oldest kept, challenger claims merged.
  const byCell = new Map<string, typeof open.docs>();
  for (const d of open.docs) { const k = String(d.data().cellId ?? d.id); byCell.set(k, [...(byCell.get(k) ?? []), d]); }
  let folded = 0;
  for (const docs of byCell.values()) {
    if (docs.length < 2) continue;
    docs.sort((a, b) => String(a.data().createdAt).localeCompare(String(b.data().createdAt)));
    const [keep, ...rest] = docs;
    const ids = new Set<string>(keep.data().claimIds ?? []);
    for (const d of rest) { for (const id of d.data().claimIds ?? []) ids.add(id); await d.ref.delete(); folded++; }
    await keep.ref.update({ claimIds: [...ids] });
  }
  // 2. Descriptive fields: newest source wins. Lists: union of all sides.
  let n = 0;
  const stillOpen = await db.collection(COLLECTIONS.reviews).where("status", "==", "open").get();
  for (const d of stillOpen.docs) {
    const r = d.data();
    const type = fields.get(String(r.fieldId));
    if (type === "free_text") {
      await d.ref.update({ status: "accepted", decidedBy: "rule: descriptive field, newest source wins", decidedAt: nowIso(), decision: "auto-resolved" });
      n++;
    } else if (type === "list") {
      const ids = [r.currentClaimId, ...(r.claimIds ?? [])].filter(Boolean) as string[];
      const items: string[] = [];
      for (const id of ids) { const c = (await db.collection(COLLECTIONS.claims).doc(id).get()).data(); if (Array.isArray(c?.value)) items.push(...(c!.value as string[])); }
      const seen = new Set<string>();
      const union = items.filter((x) => (seen.has(x.toLowerCase()) ? false : (seen.add(x.toLowerCase()), true)));
      if (union.length === 0) continue;
      await d.ref.update({ status: "merged", mergedValue: union.join(", "), decidedBy: "rule: lists extend each other", decidedAt: nowIso(), decision: "auto-merged union" });
      n++;
    }
  }
  return { folded, resolved: n, remaining: stillOpen.size - n };
});

/** Editor: (re)generate the marketing pack for one market from publishable cells. */
export const marketing = onCall({ secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300 }, async (req) => {
  await requireRole(req.auth?.uid, ["editor", "admin"]);
  const marketId = MarketId.safeParse(req.data?.marketId ?? "GLOBAL");
  if (!marketId.success) throw new HttpsError("invalid-argument", "valid marketId required");
  return generateMarketing(marketId.data, model());
});

/** Anyone signed in: ask a question of the data. Answer cites cells, events and passages; stored per user. */
export const ask = onCall({ secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 180 }, async (req) => {
  await requireRole(req.auth?.uid, ["viewer", "editor", "admin"]);
  const question = String(req.data?.question ?? "").trim().slice(0, 500);
  if (question.length < 3) throw new HttpsError("invalid-argument", "question required");
  return answer(req.auth!.uid, question, model());
});

/** Daily at 06:30 Oslo: read the configured Slack channels since the last cursor; competitor mentions become tier-4 sources. */
export const slackScheduled = onSchedule(
  { schedule: "every day 06:30", timeZone: "Europe/Oslo", timeoutSeconds: 900, secrets: [SLACK_BOT_TOKEN] },
  async () => { await syncSlack(SLACK_BOT_TOKEN.value()); },
);

/** Admin: sync Slack now. `force` re-reads the last 30 days (duplicates are skipped). */
export const slackSyncNow = onCall({ timeoutSeconds: 900, secrets: [SLACK_BOT_TOKEN] }, async (req) => {
  await requireRole(req.auth?.uid, ["admin"]);
  return syncSlack(SLACK_BOT_TOKEN.value(), { force: req.data?.force === true });
});

/** Monday 07:00 Oslo: the weekly digest to the configured channel. */
export const digestWeekly = onSchedule(
  { schedule: "every monday 07:00", timeZone: "Europe/Oslo", timeoutSeconds: 300, secrets: [SLACK_BOT_TOKEN] },
  async () => {
    const settings = (await db.collection(COLLECTIONS.settings).doc("global").get()).data();
    const channel = String(settings?.digestSlackChannel ?? "");
    if (!channel) { console.log("[digest] no channel configured"); return; }
    await postDigest(SLACK_BOT_TOKEN.value(), channel);
  },
);

/** Admin: preview the digest text, or post it now (`post: true`). */
export const digestNow = onCall({ timeoutSeconds: 300, secrets: [SLACK_BOT_TOKEN] }, async (req) => {
  await requireRole(req.auth?.uid, ["admin"]);
  if (req.data?.post === true) {
    const settings = (await db.collection(COLLECTIONS.settings).doc("global").get()).data();
    const channel = String(req.data?.channel ?? settings?.digestSlackChannel ?? "");
    if (!channel) throw new HttpsError("failed-precondition", "no digest channel configured");
    return { posted: true, channel, text: await postDigest(SLACK_BOT_TOKEN.value(), channel) };
  }
  return { posted: false, text: (await buildDigest()).text };
});

/** Daily at 06:00 Oslo time: re-fetch competitor pages older than the crawl interval, and all feeds. */
export const crawlScheduled = onSchedule(
  { schedule: "every day 06:00", timeZone: "Europe/Oslo", timeoutSeconds: 1800, memory: "1GiB" },
  async () => { await runCrawl(); },
);

/** Admin: scan a competitor's website for pricing, product, news and regional pages plus feeds, to pick from. */
export const suggestPages = onCall({ timeoutSeconds: 300, memory: "512MiB" }, async (req) => {
  await requireRole(req.auth?.uid, ["admin"]);
  const id = String(req.data?.competitorId ?? "");
  const snap = await db.collection(COLLECTIONS.competitors).doc(id).get();
  if (!snap.exists) throw new HttpsError("not-found", "competitor not found");
  const c = Competitor.parse(snap.data());
  const website = String(req.data?.website ?? c.website ?? c.crawlPages[0]?.url ?? "");
  if (!website) throw new HttpsError("invalid-argument", "the competitor has no website yet");
  const d = await discoverPages(website);
  const have = new Set(c.crawlPages.map((p) => p.url.replace(/\/$/, "")));
  return { ...d, pages: d.pages.filter((p) => !have.has(p.url)), feeds: d.feeds.filter((f) => !c.feeds.includes(f)) };
});

/** Admin: crawl now, all competitors or one. Ignores the interval. */
export const crawlNow = onCall({ timeoutSeconds: 1800, memory: "1GiB" }, async (req) => {
  await requireRole(req.auth?.uid, ["admin"]);
  const competitorId = req.data?.competitorId ? String(req.data.competitorId) : undefined;
  return runCrawl({ competitorId, force: true });
});

/** An editor decided a review in the browser (open -> accepted / rejected / merged); apply it to the cell. */
export const onReviewDecided = onDocumentUpdated(
  { document: `${COLLECTIONS.reviews}/{id}`, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300 },
  async (event) => {
    const before = String(event.data?.before.data()?.status ?? "");
    const after = Review.safeParse({ id: event.params.id, ...event.data?.after.data() });
    if (!after.success) return;
    const decided = after.data.status === "accepted" || after.data.status === "rejected" || after.data.status === "merged";
    if (!decided || (before !== "open" && before !== "parked")) return;
    await applyReview(after.data, model());
  },
);

/** First sign-in creates users/{uid} as viewer from the browser; admins listed in ADMIN_EMAILS are promoted here. */
export const onUserNew = onDocumentCreated(`${COLLECTIONS.users}/{uid}`, async (event) => {
  const email = String(event.data?.data()?.email ?? "").toLowerCase();
  const admins = ADMIN_EMAILS.value().split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (admins.includes(email)) {
    await event.data!.ref.update({ role: "admin", promotedAt: nowIso() });
  }
});
