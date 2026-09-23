import { test } from "node:test";
import assert from "node:assert/strict";
import type { Claim, FieldDefinition } from "@cc/shared";
import { resolveClaim } from "../src/pipeline/resolve.ts";
import { mask } from "../src/pipeline/mask.ts";
import { matchCompetitors } from "../src/pipeline/match.ts";

const now = "2026-09-23T00:00:00.000Z";
const field: FieldDefinition = { id: "price_first_year", label: "Collar + first year", type: "price", comparisonRule: "lower_is_better", description: "", perMarket: true, decayDays: 90, group: "pricing", order: 1, enabled: true };
const claim = (id: string, tier: Claim["tier"], amount: number, over: Partial<Claim> = {}): Claim => ({
  id, competitorId: "monil", fieldId: field.id, marketId: "UK_IE", documentId: `doc_${id}`,
  value: `£${amount}`, displayValue: `£${amount}`, status: "stated", quote: `£${amount}`, startChar: 0, endChar: 4, verified: true,
  tier, confidence: 0.9, note: "", firstSeenAt: "2026-09-01T00:00:00.000Z", lastChangedAt: "2026-09-01T00:00:00.000Z", lastCheckedAt: "2026-09-01T00:00:00.000Z",
  rejected: false, numeric: { amount, currency: "GBP", per: "unspecified" }, ...over,
});

test("first claim creates the cell", () => {
  const a = claim("a", 4, 230);
  const r = resolveClaim(a, field, null, [a], now, "rv1");
  assert.equal(r.outcome, "new");
  assert.equal(r.cell.displayValue, "£230");
  assert.equal(r.cell.corroboration.count, 1);
  assert.equal(r.cell.publishable, false); // tier 4 is never publishable
});

test("agreeing claim corroborates and better tier takes over the evidence", () => {
  const a = claim("a", 4, 230);
  const cell = resolveClaim(a, field, null, [a], now, "rv1").cell;
  const b = claim("b", 1, 230, { lastCheckedAt: "2026-09-20T00:00:00.000Z" });
  const r = resolveClaim(b, field, { cell, claim: a }, [a, b], now, "rv2");
  assert.equal(r.outcome, "corroborated");
  assert.equal(r.cell.corroboration.agreeing, 2);
  assert.equal(r.cell.tier, 1);
  assert.equal(r.cell.claimId, "b");
  assert.equal(r.cell.lastCheckedAt, "2026-09-20T00:00:00.000Z");
  assert.equal(r.cell.publishable, true);
  assert.equal(r.review, null);
});

test("higher tier disagreement replaces the value and supersedes the losers", () => {
  const a = claim("a", 4, 230);
  const cell = resolveClaim(a, field, null, [a], now, "rv1").cell;
  const b = claim("b", 1, 215);
  const r = resolveClaim(b, field, { cell, claim: a }, [a, b], now, "rv2");
  assert.equal(r.outcome, "replaced");
  assert.equal(r.cell.displayValue, "£215");
  assert.deepEqual(r.supersede, ["a"]);
  assert.equal(r.cell.lastChangedAt, now);
  assert.equal(r.cell.conflict, false);
});

test("same or lower tier disagreement keeps the value, flags conflict, opens a review", () => {
  const a = claim("a", 1, 215);
  const cell = resolveClaim(a, field, null, [a], now, "rv1").cell;
  const b = claim("b", 4, 230);
  const r = resolveClaim(b, field, { cell, claim: a }, [a, b], now, "rv2");
  assert.equal(r.outcome, "conflict");
  assert.equal(r.cell.displayValue, "£215");
  assert.equal(r.cell.conflict, true);
  assert.equal(r.cell.corroboration.conflicting, 1);
  assert.equal(r.cell.publishable, false);
  assert.ok(r.review);
  assert.equal(r.review.kind, "conflict");
  assert.deepEqual(r.review.claimIds, ["b"]);
  assert.equal(r.review.currentClaimId, "a");
});

test("masking replaces emails, phones and labelled names but keeps prices, years and employees", () => {
  const r = mask("Farmer: Ola Nordmann called on +47 912 34 567, email ola@farm.no. Founded 2011, price £215. Rep jouni.hyotyla@nofence.com noted Ola Nordmann wants 40 collars.");
  assert.match(r.text, /Farmer: Customer A/);
  assert.match(r.text, /\[phone 1\]/);
  assert.match(r.text, /\[email 1\]/);
  assert.match(r.text, /Founded 2011, price £215/);
  assert.match(r.text, /jouni\.hyotyla@nofence\.com/);
  assert.equal(r.replacements, 3);
});

test("competitor matching is whole-word and alias aware", () => {
  const comps = [
    { id: "halter", name: "Halter", aliases: ["halterhq"], status: "active" },
    { id: "monil", name: "Monil", aliases: [], status: "active" },
    { id: "nofence", name: "Nofence", aliases: ["N3"], status: "active" },
  ] as never;
  const m = matchCompetitors("The farmer compared Halter's lease with our N3. He never mentioned halters for horses.", comps);
  assert.deepEqual(m.map((x) => x.id), ["halter", "nofence"]);
});
