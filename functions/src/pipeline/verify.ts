/**
 * Step 5: the anti-fabrication gate. Code, not the model, decides whether a claim keeps its status.
 * Ported from v1 backend/pipeline.py::verify/normalize, now per claim rather than per cell.
 */
import type { Claim, FieldDefinition, MarketId, SourceDocument, Tier } from "@cc/shared";
import type { ExtractedClaim, ExtractedEvent } from "./extract.ts";
import { firstNumber, parsePrices } from "./numeric.ts";
import { findQuote, trim } from "./text.ts";

export interface VerifyReport {
  checked: number;
  downgraded: number;
  dropped: number;
  unverifiedQuotes: number;
  notes: string[];
}

const YES = new Set(["yes", "true", "y", "present", "included", "available"]);
const NO = new Set(["no", "false", "n", "absent", "not offered", "not available", "none"]);

export function newReport(): VerifyReport {
  return { checked: 0, downgraded: 0, dropped: 0, unverifiedQuotes: 0, notes: [] };
}

/**
 * Turn one model claim into a stored Claim, or null when it cannot survive verification.
 * `text` is the masked snapshot the quote must be a substring of.
 */
export function verifyClaim(
  x: ExtractedClaim,
  ctx: { doc: Pick<SourceDocument, "id" | "capturedAt" | "tier">; competitorId: string; field: FieldDefinition; text: string; claimId: string; now: string },
  rep: VerifyReport,
): Claim | null {
  const { field, text, doc } = ctx;
  rep.checked++;
  const tag = `${ctx.competitorId}/${field.id}/${x.marketId}`;
  let status: Claim["status"] = x.status;
  let note = x.note ?? "";
  const addNote = (s: string) => { note = [note, s].filter(Boolean).join("; "); };
  const downgrade = (why: string) => { status = "inferred"; rep.downgraded++; rep.notes.push(`${tag}: inferred — ${why}`); addNote(why); };
  const drop = (why: string) => { rep.dropped++; rep.notes.push(`${tag}: dropped — ${why}`); return null; };

  const span = x.quote ? findQuote(text, x.quote) : null;
  if (!span) {
    rep.unverifiedQuotes++;
    // A stated price / number / boolean without a real quote is exactly the fabrication we exist to stop.
    if (status === "stated" && (field.type === "price" || field.type === "number" || field.type === "boolean")) return drop("no verbatim quote matched the document");
    if (status === "stated") downgrade("no verbatim quote matched the document");
    if (!x.quote) return drop("no quote given");
    // Inferred with an unmatched quote: keep but anchor to nothing verifiable.
    return drop("quote not found in document");
  }
  const quote = text.slice(span[0], span[1]);
  const raw = (x.value ?? "").trim();
  let value: Claim["value"] = raw || null;
  let displayValue = raw;
  let numeric: Claim["numeric"];

  switch (field.type) {
    case "price": {
      const claimed = parsePrices(raw).length ? parsePrices(raw) : parsePrices(quote);
      const quoted = parsePrices(quote);
      if (claimed.length === 0) {
        if (status === "stated") downgrade("no concrete price in the document");
        displayValue = raw || trim(quote);
        value = displayValue;
        break;
      }
      const quotedAmounts = new Set(quoted.map((p) => p.amount));
      if (status === "stated" && !claimed.every((p) => quotedAmounts.has(p.amount))) downgrade("price is not present in the quoted evidence");
      displayValue = raw || claimed.map((p) => p.raw).join("; ");
      value = displayValue;
      if (new Set(claimed.map((p) => p.perMonth)).size > 1) addNote("several prices in one claim; not compared by rule");
      else numeric = { amount: claimed[0].amount, currency: claimed[0].currency, per: claimed[0].period };
      break;
    }
    case "number": {
      const n = firstNumber(raw) ?? firstNumber(quote);
      if (n === null) {
        if (status === "stated") downgrade("no concrete number in the document");
        displayValue = raw || trim(quote);
        value = displayValue;
        break;
      }
      if (status === "stated" && firstNumber(quote) === null) downgrade("number is not present in the quoted evidence");
      value = n;
      displayValue = raw || `${n}${field.unit ? ` ${field.unit}` : ""}`;
      numeric = { amount: n };
      break;
    }
    case "boolean": {
      const v = raw.toLowerCase();
      if (YES.has(v)) { value = true; displayValue = "Yes"; }
      else if (NO.has(v)) { value = false; displayValue = "No"; }
      else return drop("boolean value unclear");
      break;
    }
    case "list": {
      const items = raw.split(/[,;]|\band\b/).map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) return drop("empty list");
      value = items;
      displayValue = items.join(", ");
      break;
    }
    case "categorical": {
      if (field.allowedValues?.length) {
        const hit = field.allowedValues.find((a) => a.toLowerCase() === raw.toLowerCase());
        if (!hit) {
          const loose = field.allowedValues.find((a) => raw.toLowerCase().includes(a.toLowerCase()));
          if (!loose) { if (status === "stated") downgrade(`"${raw}" is not one of the allowed values`); }
          else { value = loose; displayValue = loose; addNote(`normalised from "${raw}"`); }
        } else { value = hit; displayValue = hit; }
      }
      if (!raw) return drop("empty value");
      break;
    }
    default: {
      if (!raw) return drop("empty value");
      displayValue = raw;
    }
  }

  return {
    id: ctx.claimId,
    competitorId: ctx.competitorId,
    fieldId: field.id,
    marketId: x.marketId as MarketId,
    documentId: doc.id,
    value,
    displayValue,
    status,
    quote,
    startChar: span[0],
    endChar: span[1],
    verified: true,
    tier: doc.tier as Tier,
    confidence: Math.min(1, Math.max(0, x.confidence)),
    note,
    firstSeenAt: doc.capturedAt,
    lastChangedAt: doc.capturedAt,
    lastCheckedAt: doc.capturedAt,
    rejected: false,
    numeric,
  };
}

/** Events keep only the quote check; there is no type to normalise. */
export function verifyEvent(
  x: ExtractedEvent,
  ctx: { doc: Pick<SourceDocument, "id" | "capturedAt" | "tier">; competitorId: string; text: string; eventId: string; now: string },
  rep: VerifyReport,
) {
  const span = x.quote ? findQuote(ctx.text, x.quote) : null;
  if (!span) { rep.dropped++; rep.notes.push(`${ctx.competitorId}/event: dropped — quote not in document`); return null; }
  const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(x.occurredAt) ? x.occurredAt : ctx.doc.capturedAt.slice(0, 10);
  return {
    id: ctx.eventId,
    competitorId: ctx.competitorId,
    kind: x.kind,
    headline: x.headline.trim(),
    summary: x.summary.trim(),
    occurredAt,
    dateIsApproximate: x.dateIsApproximate || !/^\d{4}-\d{2}-\d{2}$/.test(x.occurredAt),
    documentId: ctx.doc.id,
    quote: ctx.text.slice(span[0], span[1]),
    startChar: span[0],
    endChar: span[1],
    verified: true,
    tier: ctx.doc.tier as Tier,
    marketIds: x.marketIds,
    createdAt: ctx.now,
  };
}
