/**
 * Win / lose / tie / n/a per competitor cell, from Nofence's point of view. Rules first (prices, numbers,
 * presence); the model only for qualitative rows. Ported from v1 pipeline.rule_verdict.
 */
import { cellId, type Cell, type FieldDefinition, type MarketId, type Verdict } from "@cc/shared";
import { compareNumbers, comparePrices, parsePrices } from "./numeric.ts";

export type CellLike = Pick<Cell, "status" | "value" | "displayValue" | "numeric"> | null;

const MISSING: NonNullable<CellLike> = { status: "missing", value: null, displayValue: "", numeric: undefined };

export function ruleVerdict(f: FieldDefinition, ours: CellLike, theirs: CellLike, competitorId: string, marketId: MarketId, now: string): Verdict | null {
  const you = ours ?? MISSING, them = theirs ?? MISSING;
  const v = (verdict: Verdict["verdict"], rationale: string): Verdict =>
    ({ id: cellId(competitorId, f.id, marketId), competitorId, fieldId: f.id, marketId, verdict, rationale, method: "rule", updatedAt: now });
  if (f.comparisonRule === "not_compared") return v("n/a", "informational row; not compared");
  if (you.status === "missing" && them.status === "missing") return v("n/a", "no source covers this for either side");
  if (you.status === "missing") return v("n/a", "no source covers this for Nofence");
  if (them.status === "missing") return v("n/a", "no source covers this for them");
  const suffix = you.status === "inferred" || them.status === "inferred" ? " (based on an inferred value)" : "";

  if (f.comparisonRule === "lower_is_better" || f.comparisonRule === "higher_is_better") {
    if (f.type === "price") {
      const py = you.numeric?.amount !== undefined ? parsePrices(you.displayValue) : [], pt = them.numeric?.amount !== undefined ? parsePrices(them.displayValue) : [];
      if (!py.length || !pt.length) return v("n/a", "no comparable price");
      const [verdict, why] = comparePrices(py[0], pt[0]);
      // lower_is_better is the only sensible rule for prices; a higher_is_better price row is a config error, treat as n/a.
      return f.comparisonRule === "lower_is_better" ? v(verdict as Verdict["verdict"], why + suffix) : v("n/a", "price rows compare lower-is-better only");
    }
    const ny = you.numeric?.amount, nt = them.numeric?.amount;
    if (ny === undefined || nt === undefined) return v("n/a", "no comparable number");
    const [verdict, why] = compareNumbers(ny, nt, f.comparisonRule === "higher_is_better", f.unit ?? "");
    return v(verdict as Verdict["verdict"], why + suffix);
  }
  if (f.comparisonRule === "presence_is_better") {
    if (f.type === "boolean") {
      const y = you.value === true, t = them.value === true;
      if (y && !t) return v("win", "we have it, they don't" + suffix);
      if (t && !y) return v("lose", "they have it, we don't" + suffix);
      return v("tie", (y ? "both have it" : "neither has it") + suffix);
    }
    if (f.type === "list") {
      const y = Array.isArray(you.value) ? you.value.length : 0, t = Array.isArray(them.value) ? them.value.length : 0;
      if (y === t) return v("tie", `${y} vs ${t}${suffix}`);
      return v(y > t ? "win" : "lose", `${y} vs ${t}${suffix}`);
    }
    return v("tie", "both present" + suffix);
  }
  return null; // qualitative_llm -> model
}
