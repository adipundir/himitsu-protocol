import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRunningDepth } from "./depth.ts";
import type { DepositEvent } from "./types.ts";

const E18 = 10n ** 18n;

// Amounts are RAW base units, as they arrive from the chain (100 STRK = 100 * 10^18).
function deposit(block: number, humanAmount: bigint, txHash = `0x${block}`): DepositEvent {
  return { txHash, blockNumber: block, userAddress: 1n, token: 0xabcn, amount: humanAmount * E18 };
}

test("depth increments per bucket independently, in block order", () => {
  const points = computeRunningDepth([
    deposit(3, 1_000n), // 1000-bucket, 2nd
    deposit(1, 1_000n), // 1000-bucket, 1st
    deposit(2, 100n), // 100-bucket, 1st
  ]);
  const byBlock = new Map(points.map((p) => [p.blockNumber, p]));
  assert.equal(byBlock.get(1)!.depthAfter, 1);
  assert.equal(byBlock.get(3)!.depthAfter, 2);
  assert.equal(byBlock.get(2)!.depthAfter, 1);
});

test("non-standard amounts get their own bucket, separate from standard denominations", () => {
  const points = computeRunningDepth([deposit(1, 1_000n), deposit(2, 1_234n)]);
  assert.notEqual(points[0]!.bucket, points[1]!.bucket);
});

test("running depth is independent of input array order (consensus tie-breaks)", () => {
  const E18 = 10n ** 18n;
  const STRK = 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938dn;
  const mk = (tx: string, block: number, amount: bigint) =>
    ({ txHash: tx, blockNumber: block, userAddress: 1n, token: STRK, amount });
  // Two same-block deposits in the same bucket: rank assignment must not depend on RPC order.
  const deposits = [mk("0x1", 100, 100n * E18), mk("0x2", 100, 100n * E18), mk("0x3", 101, 100n * E18)];
  const a = computeRunningDepth(deposits);
  const b = computeRunningDepth([...deposits].reverse());
  assert.deepEqual(a, b);
  assert.equal(a[0]!.txHash, "0x1"); // lower txHash ranks first at the tied block
});
