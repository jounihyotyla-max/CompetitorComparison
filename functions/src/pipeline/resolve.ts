/**
 * Step 6: claims -> cells (docs/v2-architecture.md §5). Pure: the Firestore wrapper lives in run.ts.
 *
 * Given the incoming verified claim, the cell it targets (if any), the claim currently backing that cell,
 * and the other live claims for the same (competitor, field, market), decide:
 *   - agree with the current value  -> corroborate
 *   - disagree, strictly higher tier -> incoming wins, current and its supporters are superseded
 *   - disagree, same or lower tier   -> keep current, flag conflict, open a review
 */
import { cellId, isPublishable, norm, outranks, type Cell, type Claim, type FieldDefinition, type Review } from "@cc/shared";

export interface Resolution {
  cell: Cell;
  /** claim ids to mark supersededBy incoming.id */
  supersede: string[];
  review: Review | null;
  outcome: "new" | "corroborated" | "replaced" | "conflict";
}

export function valuesAgree(a: Pick<Claim, "value" | "displayValue" | "numeric">, b: Pick<Claim, "value" | "displayValue" | "numeric">): boolean {
  if (a.numeric && b.numeric) {
    return a.numeric.amount === b.numeric.amount && (a.numeric.currency ?? "") === (b.numeric.currency ?? "");
  }
  if (Array.isArray(a.value) && Array.isArray(b.value)) {
    const A = new Set(a.value.map(norm)), B = new Set(b.value.map(norm));
    return A.size === B.size && [...A].every((x) => B.has(x));
  }
  if (typeof a.value === "boolean" || typeof b.value === "boolean") return a.value === b.value;
  return norm(a.displayValue) === norm(b.displayValue);
}

const later = (a: string | null, b: string) => (a && a > b ? a : b);

export function resolveClaim(
  incoming: Claim,
  field: FieldDefinition,
  current: { cell: Cell; claim: Claim | null } | null,
  liveClaims: Claim[],
  now: string,
  reviewId: string,
): Resolution {
  const id = cellId(incoming.competitorId, incoming.fieldId, incoming.marketId);
  const base = (over: Partial<Cell>): Cell => {
    const c: Cell = {
      id,
      competitorId: incoming.competitorId,
      fieldId: incoming.fieldId,
      marketId: incoming.marketId,
      claimId: incoming.id,
      value: incoming.value,
      displayValue: incoming.displayValue,
      note: incoming.note,
      status: incoming.status,
      tier: incoming.tier,
      corroboration: { count: 1, agreeing: 1, conflicting: 0 },
      conflict: false,
      firstSeenAt: incoming.firstSeenAt,
      lastChangedAt: incoming.lastChangedAt,
      lastCheckedAt: incoming.lastCheckedAt,
      outdated: false,
      publishable: false,
      numeric: incoming.numeric,
      updatedAt: now,
      ...over,
    };
    c.publishable = isPublishable(c, field, new Date(now));
    return c;
  };

  // No cell yet, or a cell with nothing behind it: the incoming claim simply becomes the answer.
  if (!current || current.cell.status === "missing" || !current.claim) {
    return { cell: base({}), supersede: [], review: null, outcome: "new" };
  }
  const { cell, claim } = current;

  if (valuesAgree(claim, incoming)) {
    const supporters = liveClaims.filter((c) => c.id !== incoming.id && valuesAgree(claim, c));
    const others = liveClaims.filter((c) => c.id !== incoming.id && !valuesAgree(claim, c));
    const betterEvidence = outranks(incoming.tier, cell.tier);
    const next = base({
      claimId: betterEvidence ? incoming.id : claim.id,
      value: betterEvidence ? incoming.value : claim.value,
      displayValue: betterEvidence ? incoming.displayValue : claim.displayValue,
      note: betterEvidence ? incoming.note : claim.note,
      status: betterEvidence ? incoming.status : cell.status,
      tier: betterEvidence ? incoming.tier : cell.tier,
      numeric: betterEvidence ? incoming.numeric : cell.numeric,
      corroboration: { count: supporters.length + 1, agreeing: supporters.length + 1, conflicting: others.length },
      conflict: cell.conflict,
      firstSeenAt: cell.firstSeenAt ?? incoming.firstSeenAt,
      lastChangedAt: cell.lastChangedAt ?? incoming.lastChangedAt,
      lastCheckedAt: later(cell.lastCheckedAt, incoming.lastCheckedAt),
      // A fresh confirmation from a source clears a human "outdated" flag only when it outranks the flagger's evidence.
      outdated: cell.outdated && !betterEvidence,
      outdatedBy: cell.outdatedBy,
      outdatedAt: cell.outdatedAt,
      confirmedBy: cell.confirmedBy,
      confirmedAt: cell.confirmedAt,
    });
    return { cell: next, supersede: [], review: null, outcome: "corroborated" };
  }

  if (outranks(incoming.tier, cell.tier)) {
    const losing = liveClaims.filter((c) => c.id !== incoming.id && !valuesAgree(incoming, c)).map((c) => c.id);
    const agreeing = liveClaims.filter((c) => c.id !== incoming.id && valuesAgree(incoming, c));
    const next = base({
      corroboration: { count: agreeing.length + 1, agreeing: agreeing.length + 1, conflicting: 0 },
      firstSeenAt: cell.firstSeenAt ?? incoming.firstSeenAt,
      lastChangedAt: now,
      lastCheckedAt: incoming.lastCheckedAt,
    });
    return { cell: next, supersede: losing, review: null, outcome: "replaced" };
  }

  const next = base({
    claimId: claim.id,
    value: claim.value,
    displayValue: claim.displayValue,
    note: claim.note,
    status: cell.status,
    tier: cell.tier,
    numeric: cell.numeric,
    corroboration: { ...cell.corroboration, conflicting: cell.corroboration.conflicting + 1 },
    conflict: true,
    firstSeenAt: cell.firstSeenAt,
    lastChangedAt: cell.lastChangedAt,
    lastCheckedAt: cell.lastCheckedAt,
    outdated: cell.outdated,
    outdatedBy: cell.outdatedBy,
    outdatedAt: cell.outdatedAt,
    confirmedBy: cell.confirmedBy,
    confirmedAt: cell.confirmedAt,
  });
  const review: Review = {
    id: reviewId,
    kind: "conflict",
    cellId: id,
    competitorId: incoming.competitorId,
    fieldId: incoming.fieldId,
    marketId: incoming.marketId,
    claimIds: [incoming.id],
    currentClaimId: claim.id,
    summary: `${field.label}: current "${claim.displayValue}" (tier ${cell.tier}) vs new "${incoming.displayValue}" (tier ${incoming.tier})`,
    status: "open",
    createdAt: now,
  };
  return { cell: next, supersede: [], review, outcome: "conflict" };
}
