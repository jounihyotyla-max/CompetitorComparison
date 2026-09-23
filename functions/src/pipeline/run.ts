/**
 * Orchestrator: one source document in, claims / events / cells / verdicts / reviews out.
 * Firestore IO lives here; every step it calls is pure and unit-tested on its own.
 */
import {
  COLLECTIONS, Cell, Claim, Competitor, CompetitorEvent, FieldDefinition, Market, Review, SourceDocument, Verdict,
  cellId, type MarketId,
} from "@cc/shared";
import { FieldValue } from "firebase-admin/firestore";
import { clean, db, nowIso, storage } from "../lib/admin.ts";
import type { ModelClient } from "./extract.ts";
import { mask } from "./mask.ts";
import { matchCompetitors } from "./match.ts";
import { resolveClaim } from "./resolve.ts";
import { sha256 } from "./text.ts";
import { ruleVerdict, type CellLike } from "./verdict.ts";
import { newReport, verifyClaim, verifyEvent } from "./verify.ts";

const MAX_INLINE_TEXT = 200_000; // Firestore documents cap at 1 MB; keep the inline copy well under that
const log = (...a: unknown[]) => console.log("[pipeline]", ...a);

async function loadRegistry() {
  const [f, c, m] = await Promise.all([
    db.collection(COLLECTIONS.fields).where("enabled", "==", true).get(),
    db.collection(COLLECTIONS.competitors).get(),
    db.collection(COLLECTIONS.markets).get(),
  ]);
  const fields = f.docs.map((d) => FieldDefinition.parse(d.data())).sort((a, b) => a.order - b.order);
  const competitors = c.docs.map((d) => Competitor.parse(d.data()));
  const markets = m.docs.map((d) => Market.parse(d.data())).sort((a, b) => a.order - b.order);
  return { fields, competitors, markets };
}

/** Delete everything a previous run of this document produced, so reprocessing never double-counts. */
async function forgetDocument(docId: string) {
  const [claims, events] = await Promise.all([
    db.collection(COLLECTIONS.claims).where("documentId", "==", docId).get(),
    db.collection(COLLECTIONS.events).where("documentId", "==", docId).get(),
  ]);
  const keys = new Set<string>();
  const batch = db.batch();
  const claimIds = new Set(claims.docs.map((d) => d.id));
  for (const d of claims.docs) { const c = d.data() as Claim; keys.add(cellId(c.competitorId, c.fieldId, c.marketId)); batch.delete(d.ref); }
  // Open or parked reviews that were about these claims have nothing left to decide.
  for (const status of ["open", "parked"]) {
    const rv = await db.collection(COLLECTIONS.reviews).where("status", "==", status).get();
    for (const d of rv.docs) {
      const r = d.data() as Review;
      if (r.claimIds.some((id) => claimIds.has(id)) || (r.currentClaimId && claimIds.has(r.currentClaimId))) batch.delete(d.ref);
    }
  }
  for (const d of events.docs) batch.delete(d.ref);
  await batch.commit();
  // Cells backed by a deleted claim are rebuilt from whatever live claims remain; verdicts follow the cells.
  for (const key of keys) await rebuildCell(key);
  const vb = db.batch();
  for (const key of keys) vb.delete(db.collection(COLLECTIONS.verdicts).doc(key));
  await vb.commit();
}

async function rebuildCell(key: string) {
  const ref = db.collection(COLLECTIONS.cells).doc(key);
  const snap = await ref.get();
  if (!snap.exists) return;
  const parsed = Cell.safeParse(snap.data());
  if (!parsed.success) {
    // A cell from an older schema (e.g. a market that no longer exists) cannot be rebuilt; drop it with its verdict.
    log(key, "dropping legacy cell:", parsed.error.issues[0]?.message);
    await Promise.all([ref.delete(), db.collection(COLLECTIONS.verdicts).doc(key).delete()]);
    return;
  }
  const cell = parsed.data;
  const live = await liveClaims(cell.competitorId, cell.fieldId, cell.marketId);
  if (live.length === 0) { await ref.delete(); return; }
  const fieldSnap = await db.collection(COLLECTIONS.fields).doc(cell.fieldId).get();
  const field = FieldDefinition.parse(fieldSnap.data());
  // Replay: best tier first, then oldest; the resolver rebuilds corroboration as it goes.
  live.sort((a, b) => a.tier - b.tier || a.firstSeenAt.localeCompare(b.firstSeenAt));
  let current: { cell: Cell; claim: Claim | null } | null = null;
  const now = nowIso();
  for (const c of live) {
    const r = resolveClaim(c, field, current, live, now, "replay");
    current = { cell: r.cell, claim: live.find((x) => x.id === r.cell.claimId) ?? c };
  }
  await ref.set(clean(current!.cell));
}

const liveClaims = async (competitorId: string, fieldId: string, marketId: MarketId) => {
  const q = await db.collection(COLLECTIONS.claims)
    .where("competitorId", "==", competitorId).where("fieldId", "==", fieldId).where("marketId", "==", marketId).get();
  return q.docs.flatMap((d) => { const r = Claim.safeParse(d.data()); return r.success ? [r.data] : []; }).filter((c) => !c.supersededBy && !c.rejected);
};

export async function processDocument(docId: string, model: ModelClient, opts: { force?: boolean } = {}) {
  const ref = db.collection(COLLECTIONS.documents).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`document ${docId} not found`);
  const doc = SourceDocument.parse({ id: docId, ...snap.data() });
  if (doc.status !== "new" && !opts.force) { log(docId, "skip: status", doc.status); return; }
  await ref.update({ status: "processing", error: FieldValue.delete() });
  const now = nowIso();

  try {
    if (opts.force) await forgetDocument(docId);
    const { fields, competitors, markets } = await loadRegistry();

    // 2. mask (idempotent: a manual note already masked in the browser is unchanged)
    const masked = mask(doc.text, { keep: [doc.author] });
    const text = masked.text;
    const contentHash = await sha256(text);

    // 3. relevance + competitor match
    const matched = doc.competitorIds.length
      ? doc.competitorIds
      : matchCompetitors(text, competitors).map((m) => m.id);
    if (matched.length === 0) {
      await ref.update({ text: text.slice(0, MAX_INLINE_TEXT), contentHash, charCount: text.length, competitorIds: [], status: "ignored", processedAt: nowIso(), relevance: 0 });
      log(docId, "ignored: no competitor mentioned");
      return;
    }

    // snapshot: masked text to Storage when a bucket exists; inline copy always
    let snapshotPath = doc.snapshotPath;
    try {
      const file = storage.bucket().file(`snapshots/${docId}.txt`);
      await file.save(text, { contentType: "text/plain; charset=utf-8", resumable: false });
      snapshotPath = file.name;
    } catch (e) {
      log(docId, "snapshot not stored (no bucket yet?):", (e as Error).message.split("\n")[0]);
    }
    await ref.update({ text: text.slice(0, MAX_INLINE_TEXT), contentHash, charCount: text.length, competitorIds: matched, snapshotPath });

    // 4-6 per competitor
    const rep = newReport();
    const touched = new Set<string>(); // fieldId|marketId
    let claimCount = 0, eventCount = 0;
    for (const competitorId of matched) {
      const competitor = competitors.find((c) => c.id === competitorId);
      if (!competitor) continue;
      log(docId, "extract for", competitor.name);
      const x = await model.extract({ title: doc.title, text, capturedAt: doc.capturedAt }, competitor, fields, markets);
      const fieldById = new Map(fields.map((f) => [f.id, f]));

      for (const raw of x.claims) {
        const field = fieldById.get(raw.fieldId);
        if (!field) { rep.notes.push(`${competitorId}: unknown field ${raw.fieldId}`); continue; }
        const marketId: MarketId = field.perMarket ? raw.marketId : "GLOBAL";
        const claimRef = db.collection(COLLECTIONS.claims).doc();
        const claim = verifyClaim({ ...raw, marketId }, { doc, competitorId, field, text, claimId: claimRef.id, now }, rep);
        if (!claim) continue;
        const sourceKey = doc.externalId ? `${doc.connector}:${doc.externalId}` : undefined;
        claim.sourceKey = sourceKey;
        let live = await liveClaims(competitorId, field.id, marketId);
        // A newer snapshot of the same source (a re-crawled page, a re-fetched feed item) replaces what that
        // source said before, whatever the values: the old text is no longer what the source says.
        const stale = sourceKey ? live.filter((c) => c.sourceKey === sourceKey && c.documentId !== doc.id) : [];
        if (stale.length) {
          const sb = db.batch();
          for (const c of stale) sb.update(db.collection(COLLECTIONS.claims).doc(c.id), { supersededBy: claim.id });
          await sb.commit();
          live = live.filter((c) => !stale.includes(c));
        }
        const key = cellId(competitorId, field.id, marketId);
        const cellRef = db.collection(COLLECTIONS.cells).doc(key);
        const cellSnap = await cellRef.get();
        const cell = cellSnap.exists ? Cell.parse(cellSnap.data()) : null;
        const currentClaim = cell?.claimId ? live.find((c) => c.id === cell.claimId) ?? null : null;
        // If the cell's backing claim was just superseded by this same source, fall back to the best remaining live claim.
        const anchor = currentClaim ?? (cell && stale.some((c) => c.id === cell.claimId) ? live.sort((a, b) => a.tier - b.tier)[0] ?? null : null);
        const currentForResolve = cell ? (anchor ? { cell: anchor.id === cell.claimId ? cell : { ...cell, claimId: anchor.id, value: anchor.value, displayValue: anchor.displayValue, tier: anchor.tier, status: anchor.status, numeric: anchor.numeric }, claim: anchor } : { cell, claim: null }) : null;
        const r = resolveClaim(claim, field, currentForResolve, [...live, claim], now, db.collection(COLLECTIONS.reviews).doc().id);

        const batch = db.batch();
        batch.set(claimRef, clean(claim));
        batch.set(cellRef, clean(r.cell));
        for (const id of r.supersede) batch.update(db.collection(COLLECTIONS.claims).doc(id), { supersededBy: claim.id });
        if (r.review) {
          // One review per cell: a second source disagreeing with the same cell joins the open review instead of
          // opening another (two shop pages saying "5 Year Warranty" is one question, not two).
          const existing = await db.collection(COLLECTIONS.reviews).where("cellId", "==", key).where("status", "in", ["open", "parked"]).limit(1).get();
          if (existing.empty) batch.set(db.collection(COLLECTIONS.reviews).doc(r.review.id), clean(r.review));
          else batch.update(existing.docs[0].ref, { claimIds: FieldValue.arrayUnion(claim.id) });
        }
        await batch.commit();
        touched.add(`${field.id}|${marketId}`);
        claimCount++;
        log(docId, competitorId, field.id, marketId, r.outcome, "->", r.cell.displayValue);
      }

      for (const raw of x.events) {
        const evRef = db.collection(COLLECTIONS.events).doc();
        const ev = verifyEvent(raw, { doc, competitorId, text, eventId: evRef.id, now }, rep);
        if (!ev) continue;
        await evRef.set(clean(CompetitorEvent.parse(ev)));
        eventCount++;
      }
    }

    await recomputeVerdicts([...touched].map((k) => { const [fieldId, marketId] = k.split("|"); return { fieldId, marketId: marketId as MarketId }; }), model);
    await ref.update({ status: "processed", processedAt: nowIso(), claimCount, eventCount, relevance: 1 });
    log(docId, "done:", claimCount, "claims,", eventCount, "events;", rep.downgraded, "downgraded,", rep.dropped, "dropped");
    return rep;
  } catch (e) {
    const msg = (e as Error).stack ?? String(e);
    log(docId, "FAILED", msg);
    await ref.update({ status: "failed", error: msg.slice(0, 2000), processedAt: nowIso() });
    throw e;
  }
}

/**
 * Verdicts for every active competitor on the given (field, market) keys. A competitor's cell for a market
 * falls back to its GLOBAL cell; so does ours.
 */
export async function recomputeVerdicts(keys: { fieldId: string; marketId: MarketId }[], model: ModelClient) {
  if (keys.length === 0) return;
  const { fields, competitors } = await loadRegistry();
  const settings = await db.collection(COLLECTIONS.settings).doc("global").get();
  const selfId = (settings.data()?.selfCompetitorId as string) ?? competitors.find((c) => c.isSelf)?.id ?? "nofence";
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const now = nowIso();

  const cellFor = async (competitorId: string, fieldId: string, marketId: MarketId): Promise<CellLike> => {
    const s = await db.collection(COLLECTIONS.cells).doc(cellId(competitorId, fieldId, marketId)).get();
    if (s.exists) return Cell.parse(s.data());
    if (marketId !== "GLOBAL") {
      const g = await db.collection(COLLECTIONS.cells).doc(cellId(competitorId, fieldId, "GLOBAL")).get();
      if (g.exists) return Cell.parse(g.data());
    }
    return null;
  };

  const rivals = competitors.filter((c) => !c.isSelf && c.id !== selfId && c.status === "active");
  for (const rival of rivals) {
    const pending: { fieldId: string; marketId: MarketId; label: string; ours: string; theirs: string }[] = [];
    const batch = db.batch();
    for (const { fieldId, marketId } of keys) {
      const field = fieldById.get(fieldId);
      if (!field) continue;
      const [ours, theirs] = await Promise.all([cellFor(selfId, fieldId, marketId), cellFor(rival.id, fieldId, marketId)]);
      const rv = ruleVerdict(field, ours, theirs, rival.id, marketId, now);
      if (rv) batch.set(db.collection(COLLECTIONS.verdicts).doc(rv.id), clean(rv));
      else pending.push({ fieldId, marketId, label: field.label, ours: ours?.displayValue ?? "", theirs: theirs?.displayValue ?? "" });
    }
    await batch.commit();
    if (pending.length === 0) continue;
    const judged = await model.judge(rival.name, pending.map((p) => ({ fieldId: `${p.fieldId}@${p.marketId}`, label: p.label, ours: p.ours, theirs: p.theirs })));
    const b2 = db.batch();
    for (const j of judged) {
      const [fieldId, marketId] = j.fieldId.split("@") as [string, MarketId];
      const v: Verdict = { id: cellId(rival.id, fieldId, marketId), competitorId: rival.id, fieldId, marketId, verdict: j.verdict, rationale: j.rationale, method: "llm", updatedAt: now };
      b2.set(db.collection(COLLECTIONS.verdicts).doc(v.id), clean(Verdict.parse(v)));
    }
    await b2.commit();
  }
}

/** A source was re-fetched and is byte-identical: its claims and their cells were checked again today. */
export async function touchDocument(docId: string, now: string) {
  const claims = await db.collection(COLLECTIONS.claims).where("documentId", "==", docId).get();
  const batch = db.batch();
  const keys = new Set<string>();
  for (const d of claims.docs) {
    const c = d.data() as Claim;
    if (c.supersededBy || c.rejected) continue;
    batch.update(d.ref, { lastCheckedAt: now });
    keys.add(cellId(c.competitorId, c.fieldId, c.marketId));
  }
  for (const key of keys) {
    const ref = db.collection(COLLECTIONS.cells).doc(key);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const cell = snap.data() as Cell;
    // Only when this document backs the cell (or agrees with it) does the check refresh the cell itself.
    if (claims.docs.some((d) => d.id === cell.claimId)) batch.update(ref, { lastCheckedAt: now, updatedAt: now });
  }
  batch.update(db.collection(COLLECTIONS.documents).doc(docId), { lastCheckedAt: now, checkCount: FieldValue.increment(1) });
  await batch.commit();
  return keys.size;
}

export type { Review };
