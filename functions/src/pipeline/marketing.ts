/**
 * Marketing pack per market: what Nofence can say out loud, built from publishable cells (docs §6: tier ≤ 2,
 * fresh, undisputed). Non-publishable values are still shown to the model, tagged, so it can list them under
 * "don't use" with the reason instead of silently dropping them.
 */
import { COLLECTIONS, Cell, Competitor, FieldDefinition, MarketingPack, cellId, freshness, isPublishable, type MarketId } from "@cc/shared";
import { clean, db, nowIso } from "../lib/admin.ts";
import type { ModelClient } from "./extract.ts";

export interface MarketingRow { fieldId: string; label: string; values: { competitorId: string; name: string; isSelf: boolean; value: string; cellId: string; publishable: boolean; why: string }[] }

async function cellFor(competitorId: string, fieldId: string, marketId: MarketId): Promise<Cell | null> {
  for (const m of marketId === "GLOBAL" ? ["GLOBAL" as MarketId] : [marketId, "GLOBAL" as MarketId]) {
    const s = await db.collection(COLLECTIONS.cells).doc(cellId(competitorId, fieldId, m)).get();
    if (s.exists) { const r = Cell.safeParse(s.data()); if (r.success && r.data.status !== "missing") return r.data; }
  }
  return null;
}

function whyNot(c: Cell, f: FieldDefinition): string {
  if (c.tier !== null && c.tier > 2) return c.tier >= 4 ? "hearsay or opinion source" : "internal source";
  if (c.conflict) return "sources disagree, review open";
  if (c.outdated) return "marked outdated";
  if (freshness(c, f.decayDays).level === "stale") return "stale";
  if (c.status === "inferred") return "inferred, not stated";
  return "";
}

export async function generateMarketing(marketId: MarketId, model: ModelClient): Promise<MarketingPack> {
  const [fieldsSnap, compSnap] = await Promise.all([
    db.collection(COLLECTIONS.fields).where("enabled", "==", true).get(),
    db.collection(COLLECTIONS.competitors).get(),
  ]);
  const fields = fieldsSnap.docs.map((d) => FieldDefinition.parse(d.data())).sort((a, b) => a.order - b.order);
  const competitors = compSnap.docs.flatMap((d) => { const r = Competitor.safeParse(d.data()); return r.success && r.data.status === "active" ? [r.data] : []; });
  const rows: MarketingRow[] = [];
  for (const f of fields) {
    if (f.comparisonRule === "not_compared" && f.group !== "pricing") continue;
    const values: MarketingRow["values"] = [];
    for (const c of competitors) {
      const cell = await cellFor(c.id, f.id, marketId);
      if (!cell) continue;
      const pub = isPublishable(cell, f);
      values.push({ competitorId: c.id, name: c.name, isSelf: c.isSelf, value: cell.displayValue, cellId: cell.id, publishable: pub, why: pub ? "" : whyNot(cell, f) });
    }
    if (values.length) rows.push({ fieldId: f.id, label: f.label, values });
  }
  const raw = await model.marketing(marketId, rows);
  // The model sometimes answers with names ("Nofence", "Halter") or Title_Case ids instead of registry ids. Map what
  // we can, drop what we cannot, so one odd id no longer rejects the whole pack.
  const compIndex = new Map<string, string>();
  for (const c of competitors) for (const k of [c.id, c.name, ...c.aliases]) compIndex.set(k.toLowerCase().trim(), c.id);
  const fieldIndex = new Map<string, string>();
  for (const f of fields) for (const k of [f.id, f.label]) fieldIndex.set(k.toLowerCase().trim(), f.id);
  const normId = (idx: Map<string, string>, v: string) => idx.get(String(v).toLowerCase().trim()) ?? idx.get(String(v).toLowerCase().trim().replace(/[\s-]+/g, "_"));
  const compIds = (ids: string[]) => [...new Set(ids.map((v) => normId(compIndex, v)).filter((x): x is string => !!x))];
  const fieldId = (v: string) => normId(fieldIndex, v);
  const out = {
    differentiators: raw.differentiators.flatMap((d) => { const f = fieldId(d.fieldId); return f ? [{ ...d, fieldId: f, competitorIds: compIds(d.competitorIds) }] : []; }),
    snippets: raw.snippets.map((s) => ({ ...s, fieldIds: s.fieldIds.map(fieldId).filter((x): x is string => !!x) })),
    dontUse: raw.dontUse.flatMap((x) => { const f = fieldId(x.fieldId); return f ? [{ ...x, fieldId: f }] : []; }),
  };
  const cellsFor = (fieldId: string, ids: string[]) => rows.find((r) => r.fieldId === fieldId)?.values.filter((v) => v.isSelf || ids.includes(v.competitorId)).map((v) => v.cellId) ?? [];
  const allPub = (fieldId: string, ids: string[]) => rows.find((r) => r.fieldId === fieldId)?.values.filter((v) => v.isSelf || ids.includes(v.competitorId)).every((v) => v.publishable) ?? false;
  const pack: MarketingPack = {
    id: marketId, marketId,
    differentiators: out.differentiators.map((d) => ({ ...d, cellIds: cellsFor(d.fieldId, d.competitorIds), status: allPub(d.fieldId, d.competitorIds) ? "safe" : "check" })),
    snippets: out.snippets.map((s) => ({ kind: s.kind, text: s.text, cellIds: s.fieldIds.flatMap((f) => cellsFor(f, competitors.map((c) => c.id))) })),
    dontUse: out.dontUse.map((x) => ({ text: x.text, reason: x.reason, cellIds: cellsFor(x.fieldId, competitors.map((c) => c.id)) })),
    generatedFromCellIds: rows.flatMap((r) => r.values.map((v) => v.cellId)),
    generatedAt: nowIso(),
  };
  await db.collection(COLLECTIONS.snippets).doc(marketId).set(clean(MarketingPack.parse(pack)));
  return pack;
}
