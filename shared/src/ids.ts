import type { MarketId } from "./schema.ts";

/** cells and verdicts share one id per (competitor, field, market) so the browser can address them directly. */
export const cellId = (competitorId: string, fieldId: string, marketId: MarketId) =>
  `${competitorId}__${fieldId}__${marketId}`;

export const parseCellId = (id: string): { competitorId: string; fieldId: string; marketId: MarketId } => {
  const [competitorId, fieldId, marketId] = id.split("__");
  return { competitorId, fieldId, marketId: marketId as MarketId };
};

export const battlecardId = (competitorId: string, marketId: MarketId) => `${competitorId}__${marketId}`;

/** Lower-case, strip punctuation, collapse whitespace: used for alias matching and dedupe of values. */
export const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "c$1") || "unnamed";
