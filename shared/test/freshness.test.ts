import { test } from "node:test";
import assert from "node:assert/strict";
import { freshness, isPublishable, outranks } from "../src/freshness.ts";

const now = new Date("2026-09-23T00:00:00Z");
const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
const cell = (daysAgo: number, extra: Partial<{ outdated: boolean; status: "stated" | "inferred" | "missing" }> = {}) =>
  ({ lastCheckedAt: at(daysAgo), outdated: false, status: "stated" as const, ...extra });

test("fresh under half decay, aging to full decay, stale after", () => {
  assert.equal(freshness(cell(10), 90, now).level, "fresh");
  assert.equal(freshness(cell(60), 90, now).level, "aging");
  assert.equal(freshness(cell(120), 90, now).level, "stale");
});

test("null decay never goes stale; outdated always does", () => {
  assert.equal(freshness(cell(2000), null, now).level, "fresh");
  assert.equal(freshness(cell(1, { outdated: true }), null, now).level, "stale");
});

test("missing cells have no freshness", () => {
  assert.equal(freshness(cell(1, { status: "missing" }), 90, now).level, "never");
});

test("publishable needs tier 1-2, no conflict, not stale", () => {
  const base = { status: "stated" as const, tier: 1 as const, conflict: false, outdated: false, lastCheckedAt: at(5) };
  assert.equal(isPublishable(base, { decayDays: 90 }, now), true);
  assert.equal(isPublishable({ ...base, tier: 3 }, { decayDays: 90 }, now), false);
  assert.equal(isPublishable({ ...base, conflict: true }, { decayDays: 90 }, now), false);
  assert.equal(isPublishable({ ...base, lastCheckedAt: at(200) }, { decayDays: 90 }, now), false);
});

test("strictly higher tier outranks; equal does not", () => {
  assert.equal(outranks(1, 3), true);
  assert.equal(outranks(3, 3), false);
  assert.equal(outranks(4, 1), false);
  assert.equal(outranks(5, null), true);
});
