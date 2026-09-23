import { test } from "node:test";
import assert from "node:assert/strict";
import type { FieldDefinition } from "@cc/shared";
import { newReport, verifyClaim } from "../src/pipeline/verify.ts";
import { findQuote } from "../src/pipeline/text.ts";
import { comparePrices, parsePrices } from "../src/pipeline/numeric.ts";

const TEXT = "Monil. Cattle and sheep, no goat product. UK ~£230 including first year, sub £28-40/yr. Norway 3,499 NOK including first year. ‘Best in class’ support, they say.";
const doc = { id: "d1", capturedAt: "2026-09-22T12:00:00.000Z", tier: 4 as const };
const now = "2026-09-23T00:00:00.000Z";
const field = (over: Partial<FieldDefinition>): FieldDefinition =>
  ({ id: "f", label: "F", type: "free_text", comparisonRule: "not_compared", description: "", perMarket: false, decayDays: 90, group: "context", order: 0, enabled: true, ...over });
const PRICE = field({ id: "price_first_year", type: "price", comparisonRule: "lower_is_better", perMarket: true });
const BOOL = field({ id: "goat_collars", type: "boolean", comparisonRule: "presence_is_better" });
const LIST = field({ id: "livestock_species", type: "list", comparisonRule: "presence_is_better" });

const claim = (over: Partial<Parameters<typeof verifyClaim>[0]>) =>
  ({ fieldId: "f", marketId: "GLOBAL" as const, value: "x", status: "stated" as const, quote: "", confidence: 0.9, note: "", ...over });

test("real quote is verified and offsets recomputed", () => {
  const rep = newReport();
  const c = verifyClaim(claim({ fieldId: PRICE.id, marketId: "UK_IE", value: "£230 including first year", quote: "UK ~£230 including first year" }), { doc, competitorId: "monil", field: PRICE, text: TEXT, claimId: "c1", now }, rep);
  assert.ok(c);
  assert.equal(TEXT.slice(c.startChar, c.endChar), c.quote);
  assert.equal(c.status, "stated");
  assert.equal(c.numeric?.amount, 230);
  assert.equal(c.numeric?.currency, "GBP");
  assert.equal(rep.downgraded, 0);
});

test("fabricated quote drops a stated price entirely", () => {
  const rep = newReport();
  const c = verifyClaim(claim({ fieldId: PRICE.id, value: "£5/month", quote: "Only £5 per month!" }), { doc, competitorId: "monil", field: PRICE, text: TEXT, claimId: "c2", now }, rep);
  assert.equal(c, null);
  assert.equal(rep.unverifiedQuotes, 1);
  assert.equal(rep.dropped, 1);
});

test("stated price not present in the quote becomes inferred", () => {
  const rep = newReport();
  const c = verifyClaim(claim({ fieldId: PRICE.id, value: "£199", quote: "UK ~£230 including first year" }), { doc, competitorId: "monil", field: PRICE, text: TEXT, claimId: "c3", now }, rep);
  assert.ok(c);
  assert.equal(c.status, "inferred");
  assert.match(c.note, /not present in the quoted evidence/);
});

test("curly quotes and whitespace are tolerated when matching", () => {
  const span = findQuote(TEXT, "'best in class'  support");
  assert.ok(span);
  assert.equal(TEXT.slice(span[0], span[1]), "‘Best in class’ support");
});

test("booleans normalise to true/false and unclear ones are dropped", () => {
  const rep = newReport();
  const no = verifyClaim(claim({ fieldId: BOOL.id, value: "No", quote: "no goat product" }), { doc, competitorId: "monil", field: BOOL, text: TEXT, claimId: "c4", now }, rep);
  assert.equal(no?.value, false);
  assert.equal(no?.displayValue, "No");
  const meh = verifyClaim(claim({ fieldId: BOOL.id, value: "maybe", quote: "no goat product" }), { doc, competitorId: "monil", field: BOOL, text: TEXT, claimId: "c5", now }, rep);
  assert.equal(meh, null);
});

test("lists split on commas and 'and'", () => {
  const c = verifyClaim(claim({ fieldId: LIST.id, value: "Cattle and sheep", quote: "Cattle and sheep, no goat product" }), { doc, competitorId: "monil", field: LIST, text: TEXT, claimId: "c6", now }, newReport());
  assert.deepEqual(c?.value, ["Cattle", "sheep"]);
});

test("NOK is parsed and not compared against GBP", () => {
  const nok = parsePrices("3,499 NOK including first year")[0];
  assert.equal(nok.amount, 3499);
  assert.equal(nok.currency, "NOK");
  const gbp = parsePrices("£215")[0];
  assert.equal(comparePrices(gbp, nok)[0], "n/a");
  assert.equal(comparePrices(parsePrices("£215")[0], parsePrices("£230")[0])[0], "win");
});
