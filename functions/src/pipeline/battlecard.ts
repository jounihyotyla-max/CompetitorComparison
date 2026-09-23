/**
 * Battlecard for one competitor in one market: where we win, where they genuinely win, objection handling,
 * generated from the compared cells only (never from general knowledge) and stored with the cell ids it used,
 * so the UI can flag it when any input changed afterwards.
 */
import { Battlecard, COLLECTIONS, Cell, Competitor, FieldDefinition, Verdict, battlecardId, cellId, type MarketId, type Tier } from "@cc/shared";
import { clean, db, nowIso } from "../lib/admin.ts";
import type { ModelClient } from "./extract.ts";

export interface BattlecardRow { fieldId: string; label: string; ours: string; theirs: string; verdict: Verdict["verdict"]; rationale: string; ourCellId?: string; theirCellId?: string; tier: Tier }

async function cellFor(competitorId: string, fieldId: string, marketId: MarketId): Promise<Cell | null> {
  for (const m of marketId === "GLOBAL" ? ["GLOBAL" as MarketId] : [marketId, "GLOBAL" as MarketId]) {
    const s = await db.collection(COLLECTIONS.cells).doc(cellId(competitorId, fieldId, m)).get();
    if (s.exists) { const r = Cell.safeParse(s.data()); if (r.success && r.data.status !== "missing") return r.data; }
  }
  return null;
}

export async function generateBattlecard(competitorId: string, marketId: MarketId, model: ModelClient): Promise<Battlecard> {
  const [fieldsSnap, compSnap, settings] = await Promise.all([
    db.collection(COLLECTIONS.fields).where("enabled", "==", true).get(),
    db.collection(COLLECTIONS.competitors).doc(competitorId).get(),
    db.collection(COLLECTIONS.settings).doc("global").get(),
  ]);
  const rival = Competitor.parse(compSnap.data());
  const selfId = (settings.data()?.selfCompetitorId as string) ?? "nofence";
  const fields = fieldsSnap.docs.map((d) => FieldDefinition.parse(d.data())).sort((a, b) => a.order - b.order);

  const rows: BattlecardRow[] = [];
  for (const f of fields) {
    const [ours, theirs] = await Promise.all([cellFor(selfId, f.id, marketId), cellFor(competitorId, f.id, marketId)]);
    if (!ours && !theirs) continue;
    const vSnap = theirs ? await db.collection(COLLECTIONS.verdicts).doc(cellId(competitorId, f.id, theirs.marketId)).get() : null;
    const v = vSnap?.exists ? Verdict.parse(vSnap.data()) : null;
    rows.push({
      fieldId: f.id, label: f.label, ours: ours?.displayValue ?? "", theirs: theirs?.displayValue ?? "",
      verdict: v?.verdict ?? "n/a", rationale: v?.rationale ?? "", ourCellId: ours?.id, theirCellId: theirs?.id,
      tier: Math.max(ours?.tier ?? 1, theirs?.tier ?? 1) as Tier,
    });
  }
  const out = await model.battlecard(rival.name, marketId, rows);
  const byField = new Map(rows.map((r) => [r.fieldId, r]));
  const pick = (fieldId: string) => byField.get(fieldId);
  const card: Battlecard = {
    id: battlecardId(competitorId, marketId), competitorId, marketId,
    wins: out.wins.flatMap((w) => { const r = pick(w.fieldId); return r ? [{ text: w.text, cellId: r.ourCellId ?? r.theirCellId ?? "", tier: r.tier }] : []; }),
    theirWins: out.theirWins.flatMap((w) => { const r = pick(w.fieldId); return r ? [{ text: w.text, cellId: r.theirCellId ?? r.ourCellId ?? "", tier: r.tier }] : []; }),
    objections: out.objections.flatMap((o) => { const r = pick(o.fieldId); return r ? [{ fieldId: o.fieldId, objection: o.objection, response: o.response, cellIds: [r.ourCellId, r.theirCellId].filter(Boolean) as string[] }] : []; }),
    generatedFromCellIds: rows.flatMap((r) => [r.ourCellId, r.theirCellId].filter(Boolean) as string[]),
    generatedAt: nowIso(),
    staleInputs: false,
  };
  await db.collection(COLLECTIONS.battlecards).doc(card.id).set(clean(Battlecard.parse(card)));
  return card;
}
