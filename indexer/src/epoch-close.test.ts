import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  JOIN_RULE_V2_FROM_EPOCH,
  REWARD_FEE_BPS,
  applyRewardFee,
  assignDepthPoints,
  attributeFeeByBucket,
  bucketMapToJson,
  computeEpochClose,
  distributeTwoTranches,
  joinRuleForEpoch,
  loadPriorEarmarks,
  sumWeightsByCommitment,
  type WeightedPiece,
} from "./epoch-close.ts";
import type { EventStore } from "./store.ts";
import { allocatePot } from "./reward.ts";
import { computeRunningDepth } from "./depth.ts";
import { gaugeMultiplierX10 } from "./gauge.ts";
import type { DepositEvent, JoinedRegistration } from "./types.ts";

function piece(commitment: bigint, weight: bigint, multiplierX10: bigint, depositBlock: number): WeightedPiece {
  const joined: JoinedRegistration = {
    commitment,
    caller: 0xa1n,
    token: 0xabcn,
    amount: 100n,
    depositBlock,
    depositTxHash: `0xd${depositBlock}`,
    registerBlock: 500,
    registerTxHash: "0xe500",
  };
  return { joined, multiplierX10, weight };
}

// ─── join rule versioning (epoch 1 is published under v1, forever) ──────────

test("epoch 1 selects join rule v1; epochs >= JOIN_RULE_V2_FROM_EPOCH select v2", () => {
  assert.equal(JOIN_RULE_V2_FROM_EPOCH, 2);
  assert.equal(joinRuleForEpoch(1), 1);
  assert.equal(joinRuleForEpoch(2), 2);
  assert.equal(joinRuleForEpoch(7), 2);
});

// ─── per-commitment weight summation (the allocatePot overwrite landmine) ───

test("sumWeightsByCommitment: sums piece weights per commitment, keeps every piece", () => {
  // Two pieces of one commitment with DIFFERENT multipliers/weights (each piece keeps its own
  // depth multiplier and deposit-time factor; only the summation is per-commitment).
  const pieces = [
    piece(0xc1n, 2_700n, 30n, 110),
    piece(0xc1n, 2_640n, 20n, 112),
    piece(0xc2n, 1_000n, 12n, 120),
  ];
  const summed = sumWeightsByCommitment(pieces);
  assert.equal(summed.length, 2);
  const c1 = summed.find((c) => c.commitment === 0xc1n)!;
  const c2 = summed.find((c) => c.commitment === 0xc2n)!;
  assert.equal(c1.rawWeight, 5_340n);
  assert.equal(c1.pieces.length, 2);
  assert.deepEqual(c1.pieces.map((p) => p.multiplierX10), [30n, 20n]);
  assert.equal(c2.rawWeight, 1_000n);
  assert.equal(c2.pieces.length, 1);
});

test("allocator: duplicate keys OVERWRITE in allocatePot — summing first pays the full share", () => {
  const pot = 1_000n;
  // Fed per-piece (duplicate keys), allocatePot keeps only the last piece's share: the
  // documented landmine sumWeightsByCommitment exists to defuse.
  const perPiece = allocatePot(pot, [
    { key: "c1", rawWeight: 300n },
    { key: "c1", rawWeight: 100n },
    { key: "c2", rawWeight: 100n },
  ]);
  assert.equal(perPiece.get("c1"), 200n); // 1000 * 100 / 500 — the 300-weight piece vanished
  // Fed per-commitment (summed), the commitment gets its combined share.
  const summed = sumWeightsByCommitment([
    piece(0xc1n, 300n, 30n, 110),
    piece(0xc1n, 100n, 30n, 112),
    piece(0xc2n, 100n, 30n, 120),
  ]);
  const perCommitment = allocatePot(
    pot,
    summed.map((c) => ({ key: c.commitment.toString(), rawWeight: c.rawWeight })),
  );
  assert.equal(perCommitment.get(0xc1n.toString()), 800n); // 1000 * 400 / 500
  assert.equal(perCommitment.get(0xc2n.toString()), 200n);
});

// ─── per-piece depth lookup (split batches share ONE txHash) ────────────────

const E18 = 10n ** 18n;
const TOKEN = 0xabcn; // default 18 decimals in gauge.ts

function depositEvent(txHash: string, blockNumber: number, amount: bigint): DepositEvent {
  return { txHash, blockNumber, userAddress: 0xa1n, token: TOKEN, amount };
}

function rowFor(d: DepositEvent): JoinedRegistration {
  return {
    commitment: 0xc1n,
    caller: d.userAddress,
    token: d.token,
    amount: d.amount,
    depositBlock: d.blockNumber,
    depositTxHash: d.txHash,
    registerBlock: 500,
    registerTxHash: "0xe500",
  };
}

test("assignDepthPoints: pieces batched in ONE tx each read their OWN bucket's depth", () => {
  // 30 prior 10-STRK deposits deepen the 10-bucket to 30. Then one split-session tx carries
  // a 10k piece and a 10 piece — same txHash. A tx-keyed lookup would hand the 10 piece the
  // 10k piece's depth (1 -> 3.0x); its true depth is 31 (2.0x).
  const prior = Array.from({ length: 30 }, (_, i) => depositEvent(`0xa${i}`, 10 + i, 10n * E18));
  const batch = [depositEvent("0xba7c4", 100, 10_000n * E18), depositEvent("0xba7c4", 100, 10n * E18)];
  const kept = batch.map(rowFor);
  const depths = assignDepthPoints(kept, computeRunningDepth([...prior, ...batch]));
  assert.deepEqual(depths.map((p) => p.depthAfter), [1, 31]);
  assert.deepEqual(
    kept.map((j, i) => gaugeMultiplierX10(j.token, j.amount, depths[i]!.depthAfter)),
    [30n, 20n],
  );
});

test("assignDepthPoints: same-bucket duplicates in one tx take consecutive ranks", () => {
  // Three 10-STRK pieces in one tx over a 23-deep bucket land at depths 24, 25, 26 — the
  // batch itself crosses the 3.0x/2.0x boundary at 25, so the pieces must not all read the
  // highest rank (nor the same one).
  const prior = Array.from({ length: 23 }, (_, i) => depositEvent(`0xa${i}`, 10 + i, 10n * E18));
  const batch = Array.from({ length: 3 }, () => depositEvent("0xba7c4", 100, 10n * E18));
  const kept = batch.map(rowFor);
  const depths = assignDepthPoints(kept, computeRunningDepth([...prior, ...batch]));
  assert.deepEqual(depths.map((p) => p.depthAfter), [24, 25, 26]);
  assert.deepEqual(
    kept.map((j, i) => gaugeMultiplierX10(j.token, j.amount, depths[i]!.depthAfter)),
    [30n, 20n, 20n],
  );
});

test("sumWeightsByCommitment: v1-shaped input (one piece per commitment) is a pass-through", () => {
  const pieces = [piece(0xc1n, 2_700n, 30n, 110), piece(0xc2n, 1_000n, 12n, 120)];
  const summed = sumWeightsByCommitment(pieces);
  assert.deepEqual(summed.map((c) => [c.commitment, c.rawWeight, c.pieces.length]), [
    [0xc1n, 2_700n, 1],
    [0xc2n, 1_000n, 1],
  ]);
});

test("reward fee: feeBps of DEPOSIT total comes off the gross allocation, floored at zero", () => {
  const piece = (commitment: bigint, amount: bigint): WeightedPiece =>
    ({ joined: { commitment, amount } as never, multiplierX10: 30n, weight: 1n }) as WeightedPiece;
  // C1 deposited 1000e18 across two pieces; C2 deposited 10e18 with a tiny gross allocation.
  const byCommitment = sumWeightsByCommitment([
    piece(1n, 600n * 10n ** 18n),
    piece(1n, 400n * 10n ** 18n),
    piece(2n, 10n * 10n ** 18n),
  ]);
  const gross = new Map<string, bigint>([
    ["1", 100n * 10n ** 18n],
    ["2", 10n ** 15n], // far below its 0.5% deposit fee
  ]);
  const { net, withheld, withheldByCommitment } = applyRewardFee(gross, byCommitment, REWARD_FEE_BPS);
  // C1: fee = 0.5% of 1000e18 = 5e18, net 95e18.
  assert.equal(net.get("1"), 95n * 10n ** 18n);
  // C2: fee (5e16) exceeds gross (1e15) — whole allocation withheld, entry dropped, never negative.
  assert.equal(net.get("2"), undefined);
  assert.equal(withheld, 5n * 10n ** 18n + 10n ** 15n);
  assert.deepEqual(withheldByCommitment, new Map([["1", 5n * 10n ** 18n], ["2", 10n ** 15n]]));
});

// ─── targeted fee recycling (rules-v2): attribution, carry-forward, two tranches ───

/** A weighted piece with a real bucketable amount (TOKEN has 18 decimals in gauge.ts). */
function bucketPiece(commitment: bigint, amount: bigint, weight: bigint): WeightedPiece {
  const joined: JoinedRegistration = {
    commitment,
    caller: 0xa1n,
    token: TOKEN,
    amount,
    depositBlock: 110,
    depositTxHash: "0xd110",
    registerBlock: 500,
    registerTxHash: "0xe500",
  };
  return { joined, multiplierX10: 30n, weight };
}

const potEntries = (byCommitment: ReturnType<typeof sumWeightsByCommitment>) =>
  byCommitment.map((c) => ({ key: c.commitment.toString(), rawWeight: c.rawWeight }));

test("fee attribution: pro-rata by piece amount, remainder to the largest bucket, sums exact", () => {
  // C1 deposited 10e18 (bucket 10) + 100e18 (bucket 100), withheld 100 wei:
  // floor(100*10/110)=9 to bucket 10, floor(100*100/110)=90 to bucket 100, remainder 1
  // to the LARGEST bucket (100) so the per-bucket sums equal the total withheld exactly.
  const byCommitment = sumWeightsByCommitment([
    bucketPiece(1n, 10n * E18, 1n),
    bucketPiece(1n, 100n * E18, 1n),
    bucketPiece(2n, 10n * E18, 1n),
  ]);
  const buckets = attributeFeeByBucket(new Map([["1", 100n], ["2", 5n]]), byCommitment);
  // C2's 5 wei is all in bucket 10, aggregated with C1's 9.
  assert.deepEqual([...buckets.entries()], [[10, 14n], [100, 91n]]);
  assert.equal([...buckets.values()].reduce((s, v) => s + v, 0n), 105n);
  assert.deepEqual(bucketMapToJson(buckets), { "10": "14", "100": "91" });
});

test("fee attribution: per-bucket sums equal applyRewardFee's total withheld", () => {
  const byCommitment = sumWeightsByCommitment([
    bucketPiece(1n, 1_000n * E18, 3n),
    bucketPiece(1n, 10n * E18, 1n),
    bucketPiece(2n, 100n * E18, 2n),
  ]);
  const gross = new Map<string, bigint>([
    ["1", 50n * E18],
    ["2", 7n * E18],
  ]);
  const { withheld, withheldByCommitment } = applyRewardFee(gross, byCommitment, REWARD_FEE_BPS);
  const buckets = attributeFeeByBucket(withheldByCommitment, byCommitment);
  assert.equal([...buckets.values()].reduce((s, v) => s + v, 0n), withheld);
  // C1: 0.5% of 1010e18 = 5.05e18 split 10:1000 by amount; C2: 0.5% of 100e18 = 5e17.
  assert.deepEqual(
    [...buckets.entries()],
    [[10, 5n * 10n ** 16n], [100, 5n * 10n ** 17n], [1_000, 5n * 10n ** 18n]],
  );
});

test("two tranches: empty earmarks reproduce the single allocatePot exactly", () => {
  const byCommitment = sumWeightsByCommitment([
    bucketPiece(1n, 10n * E18, 7n),
    bucketPiece(2n, 100n * E18, 11n),
    bucketPiece(3n, 1_000n * E18, 13n),
  ]);
  const r = distributeTwoTranches(1_000n, new Map(), byCommitment);
  assert.deepEqual(r.gross, allocatePot(1_000n, potEntries(byCommitment)));
  assert.equal(r.generalPot, 1_000n);
  assert.equal(r.earmarksApplied.size, 0);
});

test("two tranches: a targeted commitment beats its general-only allocation (hand-computed)", () => {
  // C1's whole weight sits in bucket 10, C2's in bucket 100. Pot 1000.
  const byCommitment = sumWeightsByCommitment([
    bucketPiece(1n, 10n * E18, 100n),
    bucketPiece(2n, 100n * E18, 900n),
  ]);
  const plain = distributeTwoTranches(1_000n, new Map(), byCommitment);
  assert.equal(plain.gross.get("1"), 100n); // 1000 * 100 / 1000
  // 500 earmarked to bucket 10: general tranche 500 pays C1 50 and C2 450 by total weight;
  // the full targeted 500 goes to C1, the only commitment with weight in bucket 10.
  const r = distributeTwoTranches(1_000n, new Map([[10, 500n]]), byCommitment);
  assert.equal(r.generalPot, 500n);
  assert.equal(r.gross.get("1"), 50n + 500n);
  assert.equal(r.gross.get("2"), 450n);
  assert.ok(r.gross.get("1")! > plain.gross.get("1")!);
  assert.deepEqual([...r.earmarksApplied.entries()], [[10, 500n]]);
});

test("two tranches: earmarks exceeding the pot scale by floor(pot * earmark / total); never over-allocates", () => {
  const byCommitment = sumWeightsByCommitment([
    bucketPiece(1n, 10n * E18, 300n),
    bucketPiece(2n, 100n * E18, 700n),
  ]);
  // targetedTotal 1500 > pot 1000: scaled to floor(1000*600/1500)=400 and floor(1000*900/1500)=600.
  const r = distributeTwoTranches(1_000n, new Map([[10, 600n], [100, 900n]]), byCommitment);
  assert.equal(r.generalPot, 0n);
  assert.deepEqual([...r.earmarksApplied.entries()], [[10, 400n], [100, 600n]]);
  assert.equal(r.gross.get("1"), 400n);
  assert.equal(r.gross.get("2"), 600n);
  assert.ok([...r.gross.values()].reduce((s, v) => s + v, 0n) <= 1_000n);
});

test("two tranches: scaling that floors to zero still never yields a negative general pot", () => {
  const byCommitment = sumWeightsByCommitment([bucketPiece(1n, 10n * E18, 1n)]);
  // targetedTotal 3 > pot 2; every earmark floors to 0, so the whole pot stays general.
  const r = distributeTwoTranches(2n, new Map([[10, 1n], [100, 1n], [1_000, 1n]]), byCommitment);
  assert.equal(r.generalPot, 2n);
  assert.deepEqual([...r.earmarksApplied.entries()], [[10, 0n], [100, 0n], [1_000, 0n]]);
  assert.deepEqual(r.gross, allocatePot(2n, potEntries(byCommitment)));
});

test("two tranches: per-bucket weight isolation — no pieces in bucket b means none of b's earmark", () => {
  // C1 has weight in BOTH buckets (10-weight 100, 100-weight 300); C2 only in bucket 10.
  const byCommitment = sumWeightsByCommitment([
    bucketPiece(1n, 10n * E18, 100n),
    bucketPiece(1n, 100n * E18, 300n),
    bucketPiece(2n, 10n * E18, 300n),
  ]);
  // Whole pot earmarked to bucket 10: only bucket-10 piece weights count (C1 100, C2 300);
  // C1's 100-bucket weight must not leak into the bucket-10 tranche.
  const r = distributeTwoTranches(400n, new Map([[10, 400n]]), byCommitment);
  assert.equal(r.generalPot, 0n);
  assert.equal(r.gross.get("1"), 100n); // 400 * 100 / 400
  assert.equal(r.gross.get("2"), 300n);
  // And a commitment with NO pieces in the earmarked bucket receives none of it: earmark
  // bucket 1000 has no weighted pieces at all, so nothing distributes (applied 0) and the
  // reserved amount simply stays unallocated.
  const r2 = distributeTwoTranches(1_000n, new Map([[1_000, 300n]]), byCommitment);
  assert.deepEqual([...r2.earmarksApplied.entries()], [[1_000, 0n]]);
  assert.equal(r2.generalPot, 700n);
  assert.ok([...r2.gross.values()].reduce((s, v) => s + v, 0n) <= 700n);
});

// ─── epoch-1 byte identity (the load-bearing v1 invariant) ──────────────────

test("epoch 1 byte identity: a full rule-1 close reproduces epochs/epoch-1.json exactly", () => {
  // The original event store for epoch 1's vault is not committed, so this replays the close
  // over a minimal reconstructed store — one standard-denomination deposit and its
  // registration, consistent with the published single-allocation file. That locks the whole
  // v1 pipeline to the published bytes: rule selection (no v2 fields may appear), join,
  // depth/multiplier lookup, allocation, quantization, leaf and root computation, field
  // order, and serialization. What it CANNOT catch is a semantic change that only bites
  // event shapes absent from this fixture (e.g. several deposits sharing one txHash) —
  // before the next post_root, a re-run against the real indexed store is still the
  // required check.
  const epoch1Path = path.join(import.meta.dirname, "..", "..", "epochs", "epoch-1.json");
  const publishedRaw = readFileSync(epoch1Path, "utf8");
  const published = JSON.parse(publishedRaw) as {
    epoch: number;
    pool: string;
    vault: string;
    token: string;
    fromBlock: number;
    toBlock: number;
    pot: string;
    quantum: string;
    vestStart: number;
    vestDuration: number;
    allocations: { commitment: string }[];
  };
  const token = BigInt(published.token);
  const commitment = BigInt(published.allocations[0]!.commitment);
  const depositBlock = published.fromBlock + 1_000_000; // strictly inside the window, weight > 0
  const store: EventStore = {
    lastIndexedBlock: published.toBlock,
    deposits: [{ txHash: "0xd1", blockNumber: depositBlock, userAddress: 0xa1n, token, amount: 100n * E18 }],
    registrations: [{ txHash: "0xe1", blockNumber: depositBlock + 10, caller: 0xa1n, commitment }],
  };
  const output = computeEpochClose(
    store,
    {
      epoch: published.epoch,
      pool: published.pool,
      vault: published.vault,
      token,
      pot: BigInt(published.pot),
      fromBlock: published.fromBlock,
      toBlock: published.toBlock,
      vestStart: published.vestStart,
      vestDuration: published.vestDuration,
      quantum: BigInt(published.quantum),
    },
    new Map(),
  );
  assert.equal(JSON.stringify(output, null, 2) + "\n", publishedRaw);
});

test("prior earmarks: loadPriorEarmarks classifies missing / v1-era / v2 prior files", () => {
  // How each outcome is handled is the CLI's decision (epoch-close.ts loadEarmarksForClose):
  // "no-field" (a v1-era predecessor) falls back to empty earmarks; "missing" is a hard
  // error for any epoch whose predecessor is rules-v2, unless --no-prior is passed.
  const dir = mkdtempSync(path.join(tmpdir(), "himitsu-epoch-close-"));
  try {
    assert.deepEqual(loadPriorEarmarks(path.join(dir, "epoch-1.json")), { kind: "missing" });
    // v1-era file: real epoch shape, no feeWithheldByBucket.
    writeFileSync(path.join(dir, "epoch-1.json"), JSON.stringify({ epoch: 1, pot: "5000", allocations: [] }));
    assert.deepEqual(loadPriorEarmarks(path.join(dir, "epoch-1.json")), { kind: "no-field" });
    // v2 file: parses to per-bucket bigints, zero entries dropped, keys ascending.
    writeFileSync(
      path.join(dir, "epoch-2.json"),
      JSON.stringify({ epoch: 2, feeWithheldByBucket: { "100": "7", "10": "5", "1000": "0" } }),
    );
    const loaded = loadPriorEarmarks(path.join(dir, "epoch-2.json"));
    assert.equal(loaded.kind, "loaded");
    if (loaded.kind === "loaded") {
      assert.deepEqual([...loaded.earmarks.entries()], [[10, 5n], [100, 7n]]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
