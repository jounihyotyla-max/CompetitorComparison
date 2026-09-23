/**
 * Firestore collections as Zod schemas. The Cloud Functions validate on write, the web app
 * parses on read, and both import the inferred types. Collection names are the exported
 * `COLLECTIONS` constants; document id conventions are in ./ids.ts.
 *
 * Dates are ISO-8601 strings, not Firestore Timestamps, so the same objects round-trip
 * through JSON (seed fixtures, tests, exports) unchanged.
 */
import { z } from "zod";

export const COLLECTIONS = {
  competitors: "competitors",
  fields: "fields",
  markets: "markets",
  documents: "documents",
  claims: "claims",
  cells: "cells",
  verdicts: "verdicts",
  events: "events",
  reviews: "reviews",
  users: "users",
  settings: "settings",
  battlecards: "battlecards",
  snippets: "snippets",
  questions: "questions",
  feedback: "feedback",
} as const;

const iso = z.string().describe("ISO-8601 date-time");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("ISO date, YYYY-MM-DD");
export const slug = z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case id");

// ---------------------------------------------------------------- registry
export const MarketId = z.enum(["GLOBAL", "US", "UK", "IE", "NO", "SE", "ES"]);
export type MarketId = z.infer<typeof MarketId>;

export const Market = z.object({
  id: MarketId,
  label: z.string(),
  /** Switcher group, e.g. UK and IE share "UK/IE". GLOBAL's group is "All". */
  group: z.string().default(""),
  currencies: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  order: z.number().int().default(0),
});
export type Market = z.infer<typeof Market>;

export const CrawlPage = z.object({
  url: z.url(),
  label: z.string().default(""),
  marketId: MarketId.default("GLOBAL"),
  kind: z.enum(["product", "pricing", "news", "about", "other"]).default("other"),
});
export type CrawlPage = z.infer<typeof CrawlPage>;

export const Competitor = z.object({
  id: slug,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  website: z.url().optional(),
  hqCountry: z.string().optional(),
  crawlPages: z.array(CrawlPage).default([]),
  feeds: z.array(z.url()).default([]),
  markets: z.array(MarketId).default([]),
  /** Nofence itself is a competitor row so every table has an anchor column. */
  isSelf: z.boolean().default(false),
  status: z.enum(["active", "draft", "archived"]).default("active"),
  detectedFrom: z.string().optional().describe("documentId that first mentioned a draft competitor"),
  createdAt: iso,
  updatedAt: iso,
});
export type Competitor = z.infer<typeof Competitor>;

// ---------------------------------------------------------------- fields
export const FieldType = z.enum(["price", "number", "list", "categorical", "boolean", "free_text"]);
export type FieldType = z.infer<typeof FieldType>;
export const ComparisonRule = z.enum([
  "lower_is_better", "higher_is_better", "presence_is_better", "qualitative_llm", "not_compared",
]);
export type ComparisonRule = z.infer<typeof ComparisonRule>;
export const FieldGroup = z.enum(["overview", "features", "pricing", "context"]);
export type FieldGroup = z.infer<typeof FieldGroup>;
/** Freshness decay presets in days; null never goes stale (founding year). */
export const DecayDays = z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365), z.null()]);
export type DecayDays = z.infer<typeof DecayDays>;

export const FieldDefinition = z.object({
  id: slug,
  label: z.string().min(1),
  type: FieldType,
  comparisonRule: ComparisonRule,
  description: z.string().default("").describe("extraction guidance shown to the model"),
  unit: z.string().optional(),
  allowedValues: z.array(z.string()).optional().describe("categorical fields only"),
  /** true: the cell may hold a different value per market (prices, availability, offers). */
  perMarket: z.boolean().default(false),
  decayDays: DecayDays.default(90),
  group: FieldGroup.default("context"),
  order: z.number().int().default(0),
  enabled: z.boolean().default(true),
});
export type FieldDefinition = z.infer<typeof FieldDefinition>;

// ---------------------------------------------------------------- sources
export const Connector = z.enum(["slack", "hubspot", "aircall", "web", "rss", "manual"]);
export type Connector = z.infer<typeof Connector>;

/** docs/v2-architecture.md §5. Lower number = more trusted. */
export const Tier = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export type Tier = z.infer<typeof Tier>;
export const TIER_LABEL: Record<Tier, string> = {
  1: "Official",
  2: "Third-party public",
  3: "Firsthand internal",
  4: "Hearsay",
  5: "Opinion",
};
export const DEFAULT_TIER: Record<Connector, Tier> = {
  web: 1, rss: 2, hubspot: 3, aircall: 3, slack: 4, manual: 4,
};

export const DocumentStatus = z.enum(["new", "processing", "processed", "ignored", "failed"]);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

export const SourceDocument = z.object({
  id: z.string(),
  connector: Connector,
  externalId: z.string().default(""),
  externalUrl: z.string().default(""),
  title: z.string().default(""),
  /** Employee email for internal sources; role placeholder ("Customer A") after masking for customers. */
  author: z.string().default(""),
  capturedAt: iso,
  publishedAt: iso.optional(),
  competitorIds: z.array(slug).default([]),
  marketId: MarketId.default("GLOBAL"),
  tier: Tier,
  relevance: z.number().min(0).max(1).default(1),
  status: DocumentStatus.default("new"),
  /** Cloud Storage path of the masked text; raw text is never stored. */
  snapshotPath: z.string().default(""),
  /** Masked text is also kept inline while small so the popover needs no second fetch. */
  text: z.string().default(""),
  contentHash: z.string().default(""),
  charCount: z.number().int().default(0),
  error: z.string().optional(),
  processedAt: iso.optional(),
  /** Set by the pipeline: how many claims / events this document produced. */
  claimCount: z.number().int().default(0),
  eventCount: z.number().int().default(0),
  /** Connectors that re-visit a source (web, rss): when it was last fetched and found unchanged. */
  lastCheckedAt: iso.optional(),
  checkCount: z.number().int().default(0),
});
export type SourceDocument = z.infer<typeof SourceDocument>;

// ---------------------------------------------------------------- claims and cells
export const ClaimStatus = z.enum(["stated", "inferred"]);
export type ClaimStatus = z.infer<typeof ClaimStatus>;
export const CellStatus = z.enum(["stated", "inferred", "missing"]);
export type CellStatus = z.infer<typeof CellStatus>;
export const CellValue = z.union([z.string(), z.number(), z.array(z.string()), z.boolean(), z.null()]);
export type CellValue = z.infer<typeof CellValue>;

export const Claim = z.object({
  id: z.string(),
  competitorId: slug,
  fieldId: slug,
  marketId: MarketId,
  documentId: z.string(),
  value: CellValue,
  displayValue: z.string(),
  status: ClaimStatus,
  quote: z.string().describe("verbatim substring of the masked snapshot"),
  startChar: z.number().int(),
  endChar: z.number().int(),
  verified: z.boolean().default(false),
  tier: Tier,
  confidence: z.number().min(0).max(1),
  note: z.string().default(""),
  firstSeenAt: iso,
  lastChangedAt: iso,
  lastCheckedAt: iso,
  supersededBy: z.string().optional(),
  rejected: z.boolean().default(false),
  rejectedBy: z.string().optional(),
  /** Numeric shadow for rule verdicts on price / number fields. */
  numeric: z.object({ amount: z.number(), currency: z.string().optional(), per: z.string().optional() }).optional(),
  /** `connector:externalId` of the document; a newer snapshot of the same source supersedes older claims from it. */
  sourceKey: z.string().optional(),
});
export type Claim = z.infer<typeof Claim>;

export const Corroboration = z.object({
  count: z.number().int().default(0).describe("distinct documents supporting the current value"),
  agreeing: z.number().int().default(0),
  conflicting: z.number().int().default(0),
});
export type Corroboration = z.infer<typeof Corroboration>;

export const Cell = z.object({
  id: z.string(),
  competitorId: slug,
  fieldId: slug,
  marketId: MarketId,
  claimId: z.string().nullable(),
  value: CellValue,
  displayValue: z.string().default(""),
  /** The winning claim's note (e.g. "$4,500 base station"), shown beside icons in the feature table. */
  note: z.string().default(""),
  status: CellStatus,
  tier: Tier.nullable(),
  corroboration: Corroboration.default({ count: 0, agreeing: 0, conflicting: 0 }),
  conflict: z.boolean().default(false),
  firstSeenAt: iso.nullable(),
  lastChangedAt: iso.nullable(),
  lastCheckedAt: iso.nullable(),
  confirmedBy: z.string().optional(),
  confirmedAt: iso.optional(),
  outdated: z.boolean().default(false),
  outdatedBy: z.string().optional(),
  outdatedAt: iso.optional(),
  /** tier <= 2, not stale, not conflicting, not outdated. Marketing reads this. */
  publishable: z.boolean().default(false),
  numeric: Claim.shape.numeric,
  updatedAt: iso,
});
export type Cell = z.infer<typeof Cell>;

export const VerdictKind = z.enum(["win", "lose", "tie", "n/a"]);
export type VerdictKind = z.infer<typeof VerdictKind>;
export const Verdict = z.object({
  id: z.string(),
  competitorId: slug,
  fieldId: slug,
  marketId: MarketId,
  verdict: VerdictKind,
  rationale: z.string().default(""),
  method: z.enum(["rule", "llm"]),
  confidence: z.number().min(0).max(1).optional(),
  updatedAt: iso,
});
export type Verdict = z.infer<typeof Verdict>;

// ---------------------------------------------------------------- events
export const EventKind = z.enum([
  "funding", "launch", "market_entry", "pricing_change", "partnership", "leadership", "warranty", "other",
]);
export type EventKind = z.infer<typeof EventKind>;
export const CompetitorEvent = z.object({
  id: z.string(),
  competitorId: slug,
  kind: EventKind,
  headline: z.string().min(1),
  summary: z.string().default(""),
  occurredAt: isoDate.describe("best-known date the thing happened; capture date when unknown"),
  dateIsApproximate: z.boolean().default(false),
  documentId: z.string(),
  quote: z.string(),
  startChar: z.number().int(),
  endChar: z.number().int(),
  verified: z.boolean().default(false),
  tier: Tier,
  marketIds: z.array(MarketId).default([]),
  createdAt: iso,
});
export type CompetitorEvent = z.infer<typeof CompetitorEvent>;

// ---------------------------------------------------------------- review inbox
export const ReviewKind = z.enum(["conflict", "new_competitor", "low_confidence", "stale_pricing"]);
export type ReviewKind = z.infer<typeof ReviewKind>;
export const ReviewStatus = z.enum(["open", "parked", "accepted", "rejected", "merged"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;
export const Review = z.object({
  id: z.string(),
  kind: ReviewKind,
  cellId: z.string().optional(),
  competitorId: slug.optional(),
  fieldId: slug.optional(),
  marketId: MarketId.optional(),
  /** The claim(s) that triggered the review; for a conflict, the challenger. */
  claimIds: z.array(z.string()).default([]),
  currentClaimId: z.string().optional(),
  summary: z.string().default(""),
  status: ReviewStatus.default("open"),
  /** Parked: someone looked and could not decide yet; the cell keeps its conflict flag. */
  note: z.string().optional(),
  parkedBy: z.string().optional(),
  decision: z.string().optional(),
  mergedValue: z.string().optional(),
  decidedBy: z.string().optional(),
  decidedAt: iso.optional(),
  createdAt: iso,
});
export type Review = z.infer<typeof Review>;

// ---------------------------------------------------------------- people and settings
export const Role = z.enum(["viewer", "editor", "admin"]);
export type Role = z.infer<typeof Role>;
export const User = z.object({
  id: z.string().describe("Firebase Auth uid"),
  email: z.email(),
  displayName: z.string().default(""),
  role: Role.default("viewer"),
  createdAt: iso,
  lastSeenAt: iso.optional(),
});
export type User = z.infer<typeof User>;

export const Settings = z.object({
  id: z.literal("global").default("global"),
  selfCompetitorId: slug.default("nofence"),
  digestSlackChannel: z.string().default(""),
  digestWeekday: z.number().int().min(0).max(6).default(1),
  crawlEveryDays: z.number().int().min(1).default(7),
  /** Trade-media feeds not tied to one competitor; items are kept only when they mention a known competitor. */
  newsFeeds: z.array(z.url()).default([]),
  slackChannels: z.array(z.string()).default([]),
  updatedAt: iso,
});
export type Settings = z.infer<typeof Settings>;

// ---------------------------------------------------------------- generated content
export const Objection = z.object({
  fieldId: slug,
  objection: z.string(),
  response: z.string(),
  cellIds: z.array(z.string()).default([]),
});
export const Battlecard = z.object({
  id: z.string().describe("competitorId__marketId"),
  competitorId: slug,
  marketId: MarketId,
  wins: z.array(z.object({ text: z.string(), cellId: z.string(), tier: Tier })).default([]),
  theirWins: z.array(z.object({ text: z.string(), cellId: z.string(), tier: Tier })).default([]),
  objections: z.array(Objection).default([]),
  generatedFromCellIds: z.array(z.string()).default([]),
  generatedAt: iso,
  staleInputs: z.boolean().default(false),
});
export type Battlecard = z.infer<typeof Battlecard>;

/** Marketing pack per market: differentiators safe to publish, ready-to-use snippets, and what not to use. */
export const MarketingPack = z.object({
  id: MarketId,
  marketId: MarketId,
  differentiators: z.array(z.object({
    headline: z.string(), support: z.string(), fieldId: slug, competitorIds: z.array(slug), cellIds: z.array(z.string()),
    /** "safe" = every cited cell is publishable; "check" = ours is fine but a competitor value is internal or stale */
    status: z.enum(["safe", "check"]),
  })).default([]),
  snippets: z.array(z.object({ kind: z.string(), text: z.string(), cellIds: z.array(z.string()) })).default([]),
  dontUse: z.array(z.object({ text: z.string(), reason: z.string(), cellIds: z.array(z.string()) })).default([]),
  generatedFromCellIds: z.array(z.string()).default([]),
  generatedAt: iso,
});
export type MarketingPack = z.infer<typeof MarketingPack>;

export const Question = z.object({
  id: z.string(),
  userId: z.string(),
  question: z.string().min(1),
  answer: z.string().optional(),
  citations: z.array(z.object({ kind: z.enum(["cell", "event", "document"]), id: z.string(), label: z.string() })).default([]),
  status: z.enum(["pending", "answered", "failed"]).default("pending"),
  askedAt: iso,
  answeredAt: iso.optional(),
});
export type Question = z.infer<typeof Question>;

/** Ideas and problems reported from the Ask pane. Admins read them; "Copy for Claude" hands them to the builder. */
export const FeedbackKind = z.enum(["angle", "format", "data", "bug", "idea"]);
export type FeedbackKind = z.infer<typeof FeedbackKind>;
export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  angle: "Analyse differently", format: "Show it differently", data: "Data wrong or missing", bug: "Something broke", idea: "Other idea",
};
export const Feedback = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string().default(""),
  kind: FeedbackKind.default("idea"),
  text: z.string().min(1),
  /** Where they were when they said it, attached automatically. */
  context: z.object({
    tab: z.string().default(""), market: z.string().default(""), competitorId: z.string().optional(), cellId: z.string().optional(), question: z.string().optional(),
  }).default({ tab: "", market: "" }),
  status: z.enum(["open", "done"]).default("open"),
  createdAt: iso,
  doneAt: iso.optional(),
});
export type Feedback = z.infer<typeof Feedback>;
