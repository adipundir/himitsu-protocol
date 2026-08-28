import { test } from "node:test";
import assert from "node:assert/strict";
import { allocatePot, quantizeAllocations, rawWeight } from "./reward.ts";

const Q = 10n ** 17n; // 0.1 token, 18 decimals

test("quantize: rounds every allocation down to the quantum grid", () => {
  const input = new Map([
    ["a", 123_456_789_012_345_678n], // 0.1234... -> 0.1
    ["b", 999_999_999_999_999_999n], // 0.9999... -> 0.9
    ["c", 300_000_000_000_000_000n], // exactly 0.3 stays
  ]);
  const q = quantizeAllocations(input, Q);
  assert.equal(q.get("a"), 100_000_000_000_000_000n);
  assert.equal(q.get("b"), 900_000_000_000_000_000n);
  assert.equal(q.get("c"), 300_000_000_000_000_000n);
  for (const v of q.values()) assert.equal(v % Q, 0n);
});

test("quantize: sub-quantum allocations are dropped, never zero-valued leaves", () => {
  const q = quantizeAllocations(new Map([["dust", Q - 1n], ["real", Q]]), Q);
  assert.equal(q.has("dust"), false);
  assert.equal(q.get("real"), Q);
});

test("quantize: never increases the total (pot conservation)", () => {
  const input = allocatePot(1_000n * 10n ** 18n, [
    { key: "a", rawWeight: 7n },
    { key: "b", rawWeight: 11n },
    { key: "c", rawWeight: 13n },
  ]);
  const before = [...input.values()].reduce((s, v) => s + v, 0n);
  const after = [...quantizeAllocations(input, Q).values()].reduce((s, v) => s + v, 0n);
  assert.ok(after <= before);
  assert.ok(before - after < 3n * Q); // at most one quantum of dust per allocation
});

test("quantize: quantum 0 is a no-op passthrough", () => {
  const input = new Map([["a", 123n]]);
  assert.equal(quantizeAllocations(input, 0n).get("a"), 123n);
});

test("rawWeight clamps deposit time into the epoch window", () => {
  const w = rawWeight({ key: "x", amount: 100n, multiplierX10: 30n, depositTime: 50 }, 100, 200);
  // Deposit before the window start counts from the window start (full epoch).
  assert.equal(w, 100n * 30n * 100n);
});
