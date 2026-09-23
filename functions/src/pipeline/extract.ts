import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EventKind, MarketId, type Competitor, type FieldDefinition, type Market } from "@cc/shared";
import { BATTLECARD_SYSTEM, EXTRACTION_SYSTEM, JUDGE_SYSTEM } from "./prompts.ts";

export const DEFAULT_MODEL = "claude-opus-5";

/** What the model returns for one (document, competitor). Offsets and verification are added by code afterwards. */
export const ExtractedClaim = z.object({
  fieldId: z.string(),
  marketId: MarketId,
  value: z.string().nullable(),
  status: z.enum(["stated", "inferred"]),
  quote: z.string(),
  confidence: z.number(),
  note: z.string(),
});
export type ExtractedClaim = z.infer<typeof ExtractedClaim>;

export const ExtractedEvent = z.object({
  kind: EventKind,
  headline: z.string(),
  summary: z.string(),
  occurredAt: z.string().describe("YYYY-MM-DD or empty"),
  dateIsApproximate: z.boolean(),
  quote: z.string(),
  marketIds: z.array(MarketId),
});
export type ExtractedEvent = z.infer<typeof ExtractedEvent>;

export const Extraction = z.object({ claims: z.array(ExtractedClaim), events: z.array(ExtractedEvent) });
export type Extraction = z.infer<typeof Extraction>;

const JudgedVerdict = z.object({
  fieldId: z.string(),
  verdict: z.enum(["win", "lose", "tie", "n/a"]),
  rationale: z.string(),
});
const Judgement = z.object({ verdicts: z.array(JudgedVerdict) });

const BattlecardOut = z.object({
  wins: z.array(z.object({ fieldId: z.string(), text: z.string() })),
  theirWins: z.array(z.object({ fieldId: z.string(), text: z.string() })),
  objections: z.array(z.object({ fieldId: z.string(), objection: z.string(), response: z.string() })),
});
export type BattlecardOut = z.infer<typeof BattlecardOut>;

export interface ModelClient {
  extract(doc: { title: string; text: string; capturedAt: string }, competitor: Competitor, fields: FieldDefinition[], markets: Market[]): Promise<Extraction>;
  judge(competitorName: string, rows: { fieldId: string; label: string; ours: string; theirs: string }[]): Promise<z.infer<typeof Judgement>["verdicts"]>;
  battlecard(competitorName: string, marketId: MarketId, rows: { fieldId: string; label: string; ours: string; theirs: string; verdict: string; rationale: string }[]): Promise<BattlecardOut>;
}

const fieldsBlock = (fields: FieldDefinition[]) =>
  fields
    .map((f) => {
      const extra = [f.unit ? `unit ${f.unit}` : "", f.allowedValues?.length ? `allowed: ${f.allowedValues.join(" | ")}` : "", f.perMarket ? "per market" : ""]
        .filter(Boolean).join("; ");
      return `- ${f.id} (${f.type}${extra ? `; ${extra}` : ""}): ${f.label}. ${f.description}`;
    })
    .join("\n");

const marketsBlock = (markets: Market[]) =>
  markets.map((m) => `- ${m.id}: ${m.label}${m.currencies.length ? ` (${m.currencies.join(", ")})` : ""}`).join("\n");

/** Anthropic-backed client. `apiKey` comes from the ANTHROPIC_API_KEY secret in production. */
export function anthropicClient(apiKey: string, model = DEFAULT_MODEL): ModelClient {
  const client = new Anthropic({ apiKey, maxRetries: 3, timeout: 8 * 60_000 });
  return {
    async extract(doc, competitor, fields, markets) {
      const user =
        `Company to extract claims about: ${competitor.name}` +
        (competitor.aliases.length ? ` (also written: ${competitor.aliases.join(", ")})` : "") +
        `\nDocument captured: ${doc.capturedAt.slice(0, 10)}${doc.title ? `\nDocument title: ${doc.title}` : ""}` +
        `\n\nMarkets:\n${marketsBlock(markets)}` +
        `\n\nFields (fieldId (type; options): label. guidance):\n${fieldsBlock(fields)}` +
        `\n\n<document>\n${doc.text}\n</document>`;
      const res = await client.messages.parse({
        model,
        max_tokens: 16000,
        system: [{ type: "text", text: EXTRACTION_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: { format: zodOutputFormat(Extraction) },
      });
      if (res.stop_reason === "refusal") throw new Error(`model refused: ${res.stop_details?.explanation ?? ""}`);
      if (!res.parsed_output) throw new Error(`extraction returned no parsable output (stop_reason ${res.stop_reason})`);
      return res.parsed_output;
    },
    async judge(competitorName, rows) {
      if (rows.length === 0) return [];
      const lines = rows.map((r) => `- ${r.fieldId} (${r.label}): Nofence: "${r.ours}" | ${competitorName}: "${r.theirs}"`).join("\n");
      const res = await client.messages.parse({
        model,
        max_tokens: 8000,
        system: [{ type: "text", text: JUDGE_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `Competitor: ${competitorName}.\n\nRows:\n${lines}\n\nReturn one verdict per fieldId above.` }],
        output_config: { format: zodOutputFormat(Judgement) },
      });
      if (!res.parsed_output) throw new Error(`judge returned no parsable output (stop_reason ${res.stop_reason})`);
      const wanted = new Set(rows.map((r) => r.fieldId));
      return res.parsed_output.verdicts.filter((v) => wanted.has(v.fieldId));
    },
    async battlecard(competitorName, marketId, rows) {
      const lines = rows.map((r) => `- ${r.fieldId} (${r.label}) verdict=${r.verdict}${r.rationale ? ` (${r.rationale})` : ""}: Nofence: "${r.ours}" | ${competitorName}: "${r.theirs}"`).join("\n");
      const res = await client.messages.parse({
        model,
        max_tokens: 8000,
        system: [{ type: "text", text: BATTLECARD_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `Competitor: ${competitorName}. Market: ${marketId === "GLOBAL" ? "all markets" : marketId}.\n\nRows:\n${lines}` }],
        output_config: { format: zodOutputFormat(BattlecardOut) },
      });
      if (!res.parsed_output) throw new Error(`battlecard returned no parsable output (stop_reason ${res.stop_reason})`);
      return res.parsed_output;
    },
  };
}
