/**
 * Applying a human decision on a conflict review (docs/v2-architecture.md §5, step 3).
 *   accepted: the challenger becomes the cell's value; the current claim and its supporters are superseded
 *   rejected: the challenger is marked rejected; the cell keeps its value and loses the conflict flag once no
 *             other live claim disagrees
 *   merged:   the reviewer typed the value; it becomes the cell's value, marked confirmed, both claims kept
 * Every path recomputes corroboration from the live claims and the verdicts for the cell's key.
 */
import { COLLECTIONS, Cell, Claim, FieldDefinition, Review, isPublishable, type MarketId } from "@cc/shared";
import { clean, db, nowIso } from "../lib/admin.ts";
import type { ModelClient } from "./extract.ts";
import { valuesAgree } from "./resolve.ts";
import { parsePrices } from "./numeric.ts";
import { recomputeVerdicts } from "./run.ts";

const log = (...a: unknown[]) => console.log("[review]", ...a);

export async function applyReview(review: Review, model: ModelClient) {
  if (review.kind !== "conflict" || !review.cellId || review.status === "open") return;
  const cellRef = db.collection(COLLECTIONS.cells).doc(review.cellId);
  const cellSnap = await cellRef.get();
  if (!cellSnap.exists) { log(review.id, "cell gone, nothing to apply"); return; }
  const cell = Cell.parse(cellSnap.data());
  const field = FieldDefinition.parse((await db.collection(COLLECTIONS.fields).doc(cell.fieldId).get()).data());
  const q = await db.collection(COLLECTIONS.claims)
    .where("competitorId", "==", cell.competitorId).where("fieldId", "==", cell.fieldId).where("marketId", "==", cell.marketId).get();
  const all = q.docs.flatMap((d) => { const r = Claim.safeParse(d.data()); return r.success ? [r.data] : []; });
  const live = () => all.filter((c) => !c.supersededBy && !c.rejected);
  const challenger = all.find((c) => c.id === review.claimIds[0]);
  const current = all.find((c) => c.id === cell.claimId) ?? null;
  const now = nowIso();
  const who = review.decidedBy ?? "reviewer";
  const batch = db.batch();

  if (review.status === "accepted" && challenger) {
    for (const c of live()) {
      if (c.id !== challenger.id && !valuesAgree(challenger, c)) { c.supersededBy = challenger.id; batch.update(db.collection(COLLECTIONS.claims).doc(c.id), { supersededBy: challenger.id }); }
    }
    const agreeing = live().filter((c) => valuesAgree(challenger, c));
    Object.assign(cell, {
      claimId: challenger.id, value: challenger.value, displayValue: challenger.displayValue, note: challenger.note,
      status: challenger.status, tier: challenger.tier, numeric: challenger.numeric,
      corroboration: { count: agreeing.length, agreeing: agreeing.length, conflicting: 0 },
      conflict: false, lastChangedAt: now, lastCheckedAt: challenger.lastCheckedAt,
      confirmedBy: who, confirmedAt: now, outdated: false, updatedAt: now,
    });
  } else if (review.status === "rejected" && challenger) {
    challenger.rejected = true;
    batch.update(db.collection(COLLECTIONS.claims).doc(challenger.id), { rejected: true, rejectedBy: who });
    const anchor = current ?? live()[0];
    const agreeing = anchor ? live().filter((c) => valuesAgree(anchor, c)) : [];
    const disagreeing = anchor ? live().filter((c) => !valuesAgree(anchor, c)) : [];
    Object.assign(cell, {
      corroboration: { count: agreeing.length, agreeing: agreeing.length, conflicting: disagreeing.length },
      conflict: disagreeing.length > 0, confirmedBy: who, confirmedAt: now, updatedAt: now,
    });
  } else if (review.status === "merged" && review.mergedValue) {
    // The reviewer's value is typed like any other claim, so the tables keep rendering it correctly.
    const raw = review.mergedValue.trim();
    let value: Cell["value"] = raw, displayValue = raw, numeric: Cell["numeric"];
    if (field.type === "boolean") { const yes = /^(yes|true|y)$/i.test(raw); value = yes; displayValue = yes ? "Yes" : "No"; }
    else if (field.type === "list") { const items = raw.split(/[,;]|\band\b/).map((x) => x.trim()).filter(Boolean); value = items; displayValue = items.join(", "); }
    else if (field.type === "number") { const n = parseFloat(raw.replace(/,/g, "")); if (!Number.isNaN(n)) { value = n; numeric = { amount: n }; displayValue = `${n}${field.unit ? ` ${field.unit}` : ""}`; } }
    else if (field.type === "price") { const p = parsePrices(raw)[0]; if (p) numeric = { amount: p.amount, currency: p.currency, per: p.period }; }
    Object.assign(cell, {
      value, displayValue, note: review.mergedNote?.trim() || `merged by ${who}`,
      status: "stated", conflict: false, lastChangedAt: now, lastCheckedAt: now,
      confirmedBy: who, confirmedAt: now, outdated: false, numeric, updatedAt: now,
    });
  } else {
    log(review.id, "nothing to apply for", review.status);
    return;
  }
  cell.publishable = isPublishable(cell, field, new Date(now));
  batch.set(cellRef, clean(cell));
  // Other open reviews on the same cell are settled by this decision.
  const others = await db.collection(COLLECTIONS.reviews).where("cellId", "==", review.cellId).where("status", "==", "open").get();
  for (const d of others.docs) if (d.id !== review.id) batch.update(d.ref, { status: "rejected", decidedBy: who, decidedAt: now, decision: `settled by review ${review.id}` });
  await batch.commit();
  log(review.id, review.status, "->", cell.displayValue);
  await recomputeVerdicts([{ fieldId: cell.fieldId, marketId: cell.marketId as MarketId }], model);
}
