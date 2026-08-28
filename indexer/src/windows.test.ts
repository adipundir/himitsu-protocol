import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNoOverlap, nextFromBlock, type EpochWindow } from "./windows.ts";

const GENESIS = 8_978_970;

test("nextFromBlock: genesis when nothing is published", () => {
  assert.equal(nextFromBlock([], GENESIS), GENESIS);
});

test("nextFromBlock: one past the latest published toBlock", () => {
  const published: EpochWindow[] = [
    { epoch: 1, fromBlock: GENESIS, toBlock: 9_000_000 },
    { epoch: 2, fromBlock: 9_000_001, toBlock: 9_100_000 },
  ];
  assert.equal(nextFromBlock(published, GENESIS), 9_100_001);
});

test("assertNoOverlap: disjoint windows pass", () => {
  const published: EpochWindow[] = [{ epoch: 1, fromBlock: 100, toBlock: 200 }];
  assert.doesNotThrow(() => assertNoOverlap(published, 2, 201, 300));
});

test("assertNoOverlap: overlapping window throws (would double-pay a deposit)", () => {
  const published: EpochWindow[] = [{ epoch: 1, fromBlock: 100, toBlock: 200 }];
  assert.throws(() => assertNoOverlap(published, 2, 150, 300), /overlaps published epoch 1/);
});

test("assertNoOverlap: touching boundary block is an overlap", () => {
  const published: EpochWindow[] = [{ epoch: 1, fromBlock: 100, toBlock: 200 }];
  assert.throws(() => assertNoOverlap(published, 2, 200, 300), /overlaps/);
});

test("assertNoOverlap: containment is an overlap", () => {
  const published: EpochWindow[] = [{ epoch: 1, fromBlock: 100, toBlock: 400 }];
  assert.throws(() => assertNoOverlap(published, 2, 200, 300), /overlaps/);
});

test("assertNoOverlap: re-closing the same epoch number is allowed", () => {
  const published: EpochWindow[] = [{ epoch: 1, fromBlock: 100, toBlock: 200 }];
  assert.doesNotThrow(() => assertNoOverlap(published, 1, 100, 200));
});

test("assertNoOverlap: inverted window throws", () => {
  assert.throws(() => assertNoOverlap([], 1, 300, 200), /fromBlock 300 > toBlock 200/);
});
