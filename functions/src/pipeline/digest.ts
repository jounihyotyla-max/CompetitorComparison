/**
 * Weekly digest to Slack: what changed, what waits for a decision, what is going stale, and what people asked for.
 * Plain mrkdwn, one message, links into the tool.
 */
import { COLLECTIONS, Cell, Competitor, FieldDefinition, Feedback, Review, SourceDocument, freshness } from "@cc/shared";
import { db, nowIso } from "../lib/admin.ts";
import { slackClient } from "../connectors/slack.ts";

const TOOL_URL = "https://nofence-competitor-compare.web.app";

export async function buildDigest(days = 7): Promise<{ text: string; blocks: unknown[] }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [cellsSnap, reviewsSnap, docsSnap, compSnap, fieldsSnap, fbSnap] = await Promise.all([
    db.collection(COLLECTIONS.cells).get(), db.collection(COLLECTIONS.reviews).where("status", "in", ["open", "parked"]).get(),
    db.collection(COLLECTIONS.documents).where("capturedAt", ">=", since).get(), db.collection(COLLECTIONS.competitors).get(),
    db.collection(COLLECTIONS.fields).get(), db.collection(COLLECTIONS.feedback).where("status", "==", "open").get(),
  ]);
  const cells = cellsSnap.docs.flatMap((d) => { const r = Cell.safeParse(d.data()); return r.success ? [r.data] : []; });
  const reviews = reviewsSnap.docs.flatMap((d) => { const r = Review.safeParse({ id: d.id, ...d.data() }); return r.success ? [r.data] : []; });
  const docs = docsSnap.docs.flatMap((d) => { const r = SourceDocument.safeParse({ id: d.id, ...d.data() }); return r.success ? [r.data] : []; });
  const competitors = compSnap.docs.flatMap((d) => { const r = Competitor.safeParse(d.data()); return r.success ? [r.data] : []; });
  const fields = new Map(fieldsSnap.docs.map((d) => [d.id, FieldDefinition.parse(d.data())]));
  const feedback = fbSnap.docs.flatMap((d) => { const r = Feedback.safeParse({ id: d.id, ...d.data() }); return r.success ? [r.data] : []; });
  const name = (id: string) => competitors.find((c) => c.id === id)?.name ?? id;
  const label = (id: string) => fields.get(id)?.label ?? id;

  const changed = cells.filter((c) => c.lastChangedAt && c.lastChangedAt >= since && c.status !== "missing").sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9));
  const byConnector = docs.reduce<Record<string, number>>((acc, d) => ((acc[d.connector] = (acc[d.connector] ?? 0) + 1), acc), {});
  const open = reviews.filter((r) => r.status === "open");
  const stalePricing = cells.filter((c) => { const f = fields.get(c.fieldId); return f?.group === "pricing" && c.status !== "missing" && freshness(c, f.decayDays).level === "stale"; });
  const drafts = competitors.filter((c) => c.status === "draft");

  const lines: string[] = [];
  lines.push(`*Competitor analytics, week of ${nowIso().slice(0, 10)}*  <${TOOL_URL}|open the tool>`);
  lines.push("");
  lines.push(`*New sources this week:* ${docs.length}${docs.length ? " (" + Object.entries(byConnector).map(([k, v]) => `${v} ${k}`).join(", ") + ")" : ""}`);
  if (changed.length) {
    lines.push(`*Values that changed (${changed.length}):*`);
    for (const c of changed.slice(0, 10)) lines.push(`• ${name(c.competitorId)} · ${label(c.fieldId)}${c.marketId !== "GLOBAL" ? ` (${c.marketId})` : ""}: ${c.displayValue}${c.tier ? ` _(tier ${c.tier})_` : ""}`);
    if (changed.length > 10) lines.push(`• …and ${changed.length - 10} more`);
  } else lines.push("*Values that changed:* none");
  lines.push(`*Waiting for a decision:* ${open.length} open review${open.length === 1 ? "" : "s"}${reviews.length - open.length ? `, ${reviews.length - open.length} parked` : ""}`);
  for (const r of open.slice(0, 5)) lines.push(`• ${name(r.competitorId ?? "")} · ${label(r.fieldId ?? "")}: ${r.summary}`);
  if (stalePricing.length) {
    lines.push(`*Pricing going stale (${stalePricing.length}):* ` + stalePricing.slice(0, 6).map((c) => `${name(c.competitorId)} ${c.marketId}`).join(", ") + (stalePricing.length > 6 ? ", …" : ""));
  }
  if (drafts.length) lines.push(`*Draft competitors awaiting a decision:* ${drafts.map((d) => d.name).join(", ")}`);
  if (feedback.length) {
    lines.push(`*Ideas and problems filed (${feedback.length} open):*`);
    for (const f of feedback.slice(0, 5)) lines.push(`• ${f.text.slice(0, 140)}${f.text.length > 140 ? "…" : ""} _(${f.email || "someone"})_`);
  }
  const text = lines.join("\n");
  return { text, blocks: [{ type: "section", text: { type: "mrkdwn", text } }] };
}

export async function postDigest(token: string, channel: string, days = 7) {
  const d = await buildDigest(days);
  const client = slackClient(token);
  await client.post(channel.startsWith("#") ? channel : `#${channel}`, d.text, d.blocks);
  return d.text;
}
