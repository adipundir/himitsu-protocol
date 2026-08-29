import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketKey, gaugeMultiplierX10, matchedDenomination, standardDenominationBaseUnits } from "./gauge.ts";

const E18 = 10n ** 18n;
const STRK = 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938dn;

test("REGRESSION: raw on-chain amounts (base units) match standard denominations", () => {
  // A real 100 STRK deposit arrives as 100 * 10^18 — it MUST land in the 100-bucket.
  assert.equal(matchedDenomination(STRK, 10n * E18), 10);
  assert.equal(matchedDenomination(STRK, 100n * E18), 100);
  assert.equal(matchedDenomination(STRK, 1_000n * E18), 1_000);
  assert.equal(matchedDenomination(STRK, 10_000n * E18), 10_000);
  // The human-unit literal alone (what the old code matched) is NOT a valid raw amount.
  assert.equal(matchedDenomination(STRK, 100n), undefined);
});

test("non-round and off-denomination amounts are non-standard", () => {
  assert.equal(matchedDenomination(STRK, 100n * E18 + 1n), undefined);
  assert.equal(matchedDenomination(STRK, 250n * E18), undefined);
  // Dropped tiers: 0.1 and 1 STRK were briefly standard, deliberately removed as too small
  // to subsidize.
  assert.equal(matchedDenomination(STRK, E18 / 10n), undefined);
  assert.equal(matchedDenomination(STRK, E18), undefined);
  assert.equal(bucketKey(STRK, 250n * E18), `${STRK}:non-standard`);
});

test("multiplier tiers by depth; non-standard is ineligible (0)", () => {
  assert.equal(gaugeMultiplierX10(STRK, 100n * E18, 1), 30n);
  assert.equal(gaugeMultiplierX10(STRK, 100n * E18, 50), 20n);
  assert.equal(gaugeMultiplierX10(STRK, 100n * E18, 200), 15n);
  assert.equal(gaugeMultiplierX10(STRK, 100n * E18, 500), 12n);
  // Non-standard amounts add no standard-denomination anonymity — they must earn nothing,
  // or a single large distinctive deposit could capture the pot (adversarial review, Aug 28).
  assert.equal(gaugeMultiplierX10(STRK, 123n * E18, 1), 0n);
  // 0.1 and 1 STRK were dropped from STANDARD_DENOMINATIONS — no longer reward-eligible.
  assert.equal(gaugeMultiplierX10(STRK, E18 / 10n, 1), 0n);
  assert.equal(gaugeMultiplierX10(STRK, E18, 1), 0n);
});

test("standardDenominationBaseUnits is the exact inverse of matchedDenomination", () => {
  for (const human of [10, 100, 1_000, 10_000]) {
    const units = standardDenominationBaseUnits(STRK, human);
    assert.equal(matchedDenomination(STRK, units), human);
  }
  assert.equal(standardDenominationBaseUnits(STRK, 10), 10n * E18);
  assert.throws(() => standardDenominationBaseUnits(STRK, 0.1));
  assert.throws(() => standardDenominationBaseUnits(STRK, 1));
  assert.throws(() => standardDenominationBaseUnits(STRK, 5));
});
