import type { Cell, DecayDays, FieldDefinition, Tier } from "./schema.ts";

export type FreshnessLevel = "fresh" | "aging" | "stale" | "never";

export const DAY_MS = 86_400_000;

export const daysBetween = (fromIso: string, to: Date = new Date()) =>
  Math.max(0, Math.floor((to.getTime() - new Date(fromIso).getTime()) / DAY_MS));

/**
 * docs/v2-architecture.md §6. Level is computed from lastCheckedAt against the field's decay:
 * fresh under half the decay, aging up to the full decay, stale past it or when a human marked it outdated.
 * A field with decayDays null never goes stale.
 */
export function freshness(
  cell: Pick<Cell, "lastCheckedAt" | "outdated" | "status">,
  decayDays: DecayDays,
  now: Date = new Date(),
): { level: FreshnessLevel; days: number | null; label: string } {
  if (cell.status === "missing" || !cell.lastCheckedAt) return { level: "never", days: null, label: "no source" };
  const days = daysBetween(cell.lastCheckedAt, now);
  const d = `${days} day${days === 1 ? "" : "s"}`;
  if (cell.outdated) return { level: "stale", days, label: `${d} · marked outdated` };
  if (decayDays === null) return { level: "fresh", days, label: `${d} · does not age` };
  if (days < decayDays / 2) return { level: "fresh", days, label: d };
  if (days <= decayDays) return { level: "aging", days, label: `${d} · check soon` };
  return { level: "stale", days, label: `${d} · stale` };
}

/** Marketing may only quote official or third-party public sources that are current and undisputed. */
export function isPublishable(
  cell: Pick<Cell, "status" | "tier" | "conflict" | "outdated" | "lastCheckedAt">,
  field: Pick<FieldDefinition, "decayDays">,
  now: Date = new Date(),
): boolean {
  if (cell.status === "missing" || cell.tier === null || cell.tier > 2) return false;
  if (cell.conflict || cell.outdated) return false;
  return freshness(cell, field.decayDays, now).level !== "stale";
}

/** Strictly-higher trust wins automatically; equal or lower goes to the review inbox (§5). */
export const outranks = (challenger: Tier, incumbent: Tier | null) => incumbent === null || challenger < incumbent;
