import { TIER_LABEL, type CellStatus, type Tier, type VerdictKind } from "@cc/shared";
import type { FreshnessLevel } from "@cc/shared";

export const StatusBadge = ({ status }: { status: CellStatus }) => <span className={`badge badge-${status}`}>{status}</span>;

const VERDICT_LABEL: Record<VerdictKind, string> = { win: "Win", lose: "Lose", tie: "Tie", "n/a": "n/a" };
export const VerdictBadge = ({ verdict, title }: { verdict: VerdictKind; title?: string }) => (
  <span className={`verdict verdict-${verdict === "n/a" ? "na" : verdict}`} title={title}>{VERDICT_LABEL[verdict]}</span>
);

export const TierTag = ({ tier }: { tier: Tier | null }) =>
  tier === null ? null : <span className={`tag-tier tag-tier-${tier}`} title={`Trust tier ${tier}`}>{TIER_LABEL[tier]}</span>;

export const FreshTag = ({ level, label }: { level: FreshnessLevel; label: string }) =>
  level === "never" ? null : <span className={`tag-fresh tag-fresh-${level}`}>{label}</span>;

export const ConflictTag = () => <span className="tag-conflict" title="Another source disagrees; waiting for review">conflict</span>;
