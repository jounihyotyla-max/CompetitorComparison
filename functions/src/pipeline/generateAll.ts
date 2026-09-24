/**
 * One admin action to fill the generated tabs before people look: battlecards for every active competitor
 * (all markets, plus each country where that competitor has a per-market cell) and marketing packs for GLOBAL
 * plus every country. Skips what is fresh (generated after its inputs last changed) unless forced.
 */
import { COLLECTIONS, Cell, Competitor, MarketId, Market, battlecardId, type MarketId as M } from "@cc/shared";
import { db } from "../lib/admin.ts";
import { generateBattlecard } from "./battlecard.ts";
import type { ModelClient } from "./extract.ts";
import { generateMarketing } from "./marketing.ts";

export async function generateAll(model: ModelClient, opts: { force?: boolean } = {}) {
  const [compSnap, mktSnap, cellSnap, bcSnap, mkSnap] = await Promise.all([
    db.collection(COLLECTIONS.competitors).get(), db.collection(COLLECTIONS.markets).get(), db.collection(COLLECTIONS.cells).get(),
    db.collection(COLLECTIONS.battlecards).get(), db.collection(COLLECTIONS.snippets).get(),
  ]);
  const rivals = compSnap.docs.flatMap((d) => { const r = Competitor.safeParse(d.data()); return r.success && r.data.status === "active" && !r.data.isSelf ? [r.data] : []; });
  const countries = mktSnap.docs.flatMap((d) => { const r = Market.safeParse(d.data()); return r.success && r.data.id !== "GLOBAL" ? [r.data.id] : []; });
  const cells = cellSnap.docs.flatMap((d) => { const r = Cell.safeParse(d.data()); return r.success ? [r.data] : []; });
  const latestChange = (pred: (c: Cell) => boolean) => cells.filter(pred).reduce((m, c) => (c.updatedAt > m ? c.updatedAt : m), "");
  const generatedAt = new Map<string, string>([...bcSnap.docs, ...mkSnap.docs].map((d) => [d.id, String(d.data().generatedAt ?? "")]));
  const fresh = (id: string, since: string) => !opts.force && (generatedAt.get(id) ?? "") > since;

  const out = { battlecards: 0, marketing: 0, skipped: 0, errors: [] as string[] };
  for (const c of rivals) {
    const markets: M[] = ["GLOBAL", ...countries.filter((m) => cells.some((x) => x.competitorId === c.id && x.marketId === m && x.status !== "missing"))];
    for (const m of markets) {
      const id = battlecardId(c.id, m);
      if (fresh(id, latestChange((x) => x.competitorId === c.id || x.competitorId === "nofence"))) { out.skipped++; continue; }
      try { await generateBattlecard(c.id, m, model); out.battlecards++; } catch (e) { out.errors.push(`${c.name} ${m}: ${(e as Error).message}`); }
    }
  }
  for (const m of ["GLOBAL", ...countries] as M[]) {
    if (fresh(m, latestChange(() => true))) { out.skipped++; continue; }
    try { await generateMarketing(MarketId.parse(m), model); out.marketing++; } catch (e) { out.errors.push(`marketing ${m}: ${(e as Error).message}`); }
  }
  return out;
}
