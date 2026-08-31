import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoOverlap, nextFromBlock, type EpochWindow } from "./windows.ts";
import { loadStore, storePathFor, type EventStore } from "./store.ts";
import { joinDepositsAndRegistrations, dedupeByCommitment, type JoinRule } from "./join.ts";
import type { JoinedRegistration } from "./types.ts";
import { computeRunningDepth, type DepthPoint } from "./depth.ts";
import { bucketKey, gaugeMultiplierX10, matchedDenomination } from "./gauge.ts";
import { rawWeight, allocatePot, quantizeAllocations } from "./reward.ts";
import { computeLeaf } from "./poseidon.ts";
import { buildMerkleTree, proofFor } from "./merkle.ts";

/** Pool deployment block (ARCHITECTURE.md, verified against mainnet RPC). Default --genesis-block,
 *  used as --from-block for an epoch's first-ever window. Mainnet default so existing invocations
 *  without --genesis-block are unaffected; other networks (e.g. Sepolia) pass their own, mirroring
 *  index.ts's --genesis-block flag. */
const MAINNET_POOL_GENESIS_BLOCK = 8978970;

/** Join rule v2 (session aggregation, join.ts) activates at this epoch id. Epoch 1 was
 *  published under v1 and epochs/epoch-1.json is history — a re-run must stay byte-identical —
 *  so the rule is selected by epoch id, never by flag, and recorded in the epoch file
 *  (`joinRule`; absent in v1-era files, which means rule 1). */
export const JOIN_RULE_V2_FROM_EPOCH = 2;

export function joinRuleForEpoch(epoch: number): JoinRule {
  return epoch >= JOIN_RULE_V2_FROM_EPOCH ? 2 : 1;
}

export interface WeightedPiece {
  joined: JoinedRegistration;
  multiplierX10: bigint;
  weight: bigint;
}

export interface CommitmentWeight {
  commitment: bigint;
  /** Sum of the piece weights for this commitment. */
  rawWeight: bigint;
  pieces: WeightedPiece[];
}

/**
 * One weight entry per commitment. Under join rule 2 several deposit pieces share one
 * commitment, but the merkle leaf (and the claim) is per commitment — and allocatePot
 * (reward.ts) OVERWRITES on duplicate keys, so it must only ever see summed totals. Each
 * piece keeps its own depth multiplier and its own deposit-time factor inside its weight;
 * only the summation happens here. Grouping preserves the input's deterministic order.
 */
export function sumWeightsByCommitment(weighted: WeightedPiece[]): CommitmentWeight[] {
  const byCommitment = new Map<string, CommitmentWeight>();
  for (const w of weighted) {
    const key = w.joined.commitment.toString();
    const entry = byCommitment.get(key);
    if (entry) {
      entry.rawWeight += w.weight;
      entry.pieces.push(w);
    } else {
      byCommitment.set(key, { commitment: w.joined.commitment, rawWeight: w.weight, pieces: [w] });
    }
  }
  return [...byCommitment.values()];
}

/** Reward fee (rules-v2 epochs): funding source 1 in ARCHITECTURE.md. A commitment's gross
 *  allocation is reduced by feeBps of its DEPOSIT total (never below zero) before
 *  quantization. Withheld STRK is simply not allocated, so it stays in `available` for
 *  future epochs, exactly like quantization dust. Enforced here, in the public reward
 *  rules, so no front-end bypass or rejected transaction can dodge it. */
export const REWARD_FEE_BPS = 50n;

export function applyRewardFee(
  gross: Map<string, bigint>,
  byCommitment: CommitmentWeight[],
  feeBps: bigint,
): { net: Map<string, bigint>; withheld: bigint; withheldByCommitment: Map<string, bigint> } {
  const net = new Map<string, bigint>();
  const withheldByCommitment = new Map<string, bigint>();
  let withheld = 0n;
  for (const c of byCommitment) {
    const key = c.commitment.toString();
    const g = gross.get(key) ?? 0n;
    if (g === 0n) continue;
    const depositTotal = c.pieces.reduce((sum, piece) => sum + piece.joined.amount, 0n);
    const fee = (depositTotal * feeBps) / 10_000n;
    const take = fee > g ? g : fee;
    withheld += take;
    if (take > 0n) withheldByCommitment.set(key, take);
    const n = g - take;
    if (n > 0n) net.set(key, n);
  }
  return { net, withheld, withheldByCommitment };
}

/** Human denomination of a weighted piece. Every piece that reaches sumWeightsByCommitment
 *  passed the multiplier-0 filter (epoch-close pipeline), so its amount matches a standard
 *  denomination; anything else is an internal invariant violation, not user input. */
function pieceDenomination(p: WeightedPiece): number {
  const denom = matchedDenomination(p.joined.token, p.joined.amount);
  if (denom === undefined) {
    throw new Error(
      `internal error: non-standard piece (amount ${p.joined.amount}) survived the multiplier filter`,
    );
  }
  return denom;
}

/**
 * Targeted fee recycling, step 1 (rules-v2): attribute each commitment's withheld fee
 * pro-rata across its pieces' denomination buckets by piece amount, in exact bigint math.
 * Any pro-rata rounding remainder lands in the commitment's LARGEST bucket, so the
 * per-bucket sums equal the total withheld to the wei. The result is published as
 * `feeWithheldByBucket` and becomes the NEXT epoch's earmarks: the fee a privacy user paid
 * for splitting into buckets rewards future depositors into those same buckets, so cover
 * forms exactly where it was paid for. Keys are human denominations, ascending.
 */
export function attributeFeeByBucket(
  withheldByCommitment: Map<string, bigint>,
  byCommitment: CommitmentWeight[],
): Map<number, bigint> {
  const totals = new Map<number, bigint>();
  for (const c of byCommitment) {
    const w = withheldByCommitment.get(c.commitment.toString()) ?? 0n;
    if (w === 0n) continue;
    const amountByDenom = new Map<number, bigint>();
    let depositTotal = 0n;
    for (const p of c.pieces) {
      const d = pieceDenomination(p);
      amountByDenom.set(d, (amountByDenom.get(d) ?? 0n) + p.joined.amount);
      depositTotal += p.joined.amount;
    }
    const denoms = [...amountByDenom.keys()].sort((a, b) => a - b);
    let attributed = 0n;
    for (const d of denoms) {
      const share = (w * amountByDenom.get(d)!) / depositTotal;
      attributed += share;
      if (share > 0n) totals.set(d, (totals.get(d) ?? 0n) + share);
    }
    const remainder = w - attributed;
    if (remainder > 0n) {
      const largest = denoms[denoms.length - 1]!;
      totals.set(largest, (totals.get(largest) ?? 0n) + remainder);
    }
  }
  return new Map([...totals.entries()].sort((a, b) => a[0] - b[0]));
}

/**
 * Targeted fee recycling, step 2 (rules-v2): read the PRIOR epoch's published
 * `feeWithheldByBucket` as this epoch's per-bucket earmarks. Returns undefined when the
 * field is absent (a v1-era file predating targeted recycling), so the caller can fall back
 * to a plain general distribution. Zero entries are dropped; keys ascend by denomination.
 */
export function parsePriorEarmarks(priorJson: unknown): Map<number, bigint> | undefined {
  const field = (priorJson as { feeWithheldByBucket?: unknown } | null)?.feeWithheldByBucket;
  if (field === undefined || field === null || typeof field !== "object") return undefined;
  const out = new Map<number, bigint>();
  for (const [k, v] of Object.entries(field as Record<string, string>)) {
    const amount = BigInt(v);
    if (amount > 0n) out.set(Number(k), amount);
  }
  return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}

export type PriorEarmarkOutcome =
  | { kind: "loaded"; earmarks: Map<number, bigint> }
  | { kind: "missing" }
  | { kind: "no-field" };

export function loadPriorEarmarks(priorPath: string): PriorEarmarkOutcome {
  let raw: string;
  try {
    raw = readFileSync(priorPath, "utf8");
  } catch {
    return { kind: "missing" };
  }
  const earmarks = parsePriorEarmarks(JSON.parse(raw));
  return earmarks === undefined ? { kind: "no-field" } : { kind: "loaded", earmarks };
}

/**
 * Targeted fee recycling, step 3 (rules-v2): two-tranche distribution replacing the single
 * allocatePot call, per commitment, before the fee haircut and quantization.
 *
 * - If the earmark total exceeds the pot, each earmark scales by floor(pot * earmark_b /
 *   targetedTotal); flooring keeps the scaled sum <= pot, so generalPot is never negative.
 * - General tranche: (pot - scaledSum) across ALL commitments by total rawWeight, exactly
 *   the pre-existing allocatePot semantics. Empty earmarks therefore reproduce today's
 *   distribution bit for bit.
 * - Targeted tranche: each bucket's scaled earmark across commitments by their weight IN
 *   that bucket only; a commitment with no pieces in the bucket gets none of it. A bucket
 *   with an earmark but no weighted pieces this epoch distributes nothing (applied 0); the
 *   undistributed STRK simply stays in `available`, like quantization dust.
 *
 * `earmarksApplied` records the scaled amount each bucket actually distributed, published
 * for verifiability; `earmarksScaled` is the post-scaling reservation per bucket whether or
 * not it distributed, so the caller can log exactly what a scale-down or an empty bucket
 * left unallocated. Buckets iterate in ascending denomination order; everything is bigint.
 */
export function distributeTwoTranches(
  pot: bigint,
  earmarks: Map<number, bigint>,
  byCommitment: CommitmentWeight[],
): {
  gross: Map<string, bigint>;
  earmarksApplied: Map<number, bigint>;
  earmarksScaled: Map<number, bigint>;
  generalPot: bigint;
} {
  const buckets = [...earmarks.entries()].filter(([, v]) => v > 0n).sort((a, b) => a[0] - b[0]);
  const targetedTotal = buckets.reduce((sum, [, v]) => sum + v, 0n);
  const scaled: [number, bigint][] =
    targetedTotal > pot ? buckets.map(([b, e]) => [b, (pot * e) / targetedTotal]) : buckets;
  const scaledSum = scaled.reduce((sum, [, v]) => sum + v, 0n);
  const generalPot = pot - scaledSum;

  const gross = allocatePot(
    generalPot,
    byCommitment.map((c) => ({ key: c.commitment.toString(), rawWeight: c.rawWeight })),
  );
  const earmarksApplied = new Map<number, bigint>();
  for (const [bucket, amount] of scaled) {
    const entries = byCommitment
      .map((c) => ({
        key: c.commitment.toString(),
        rawWeight: c.pieces.reduce((sum, p) => (pieceDenomination(p) === bucket ? sum + p.weight : sum), 0n),
      }))
      .filter((e) => e.rawWeight > 0n);
    if (amount === 0n || entries.length === 0) {
      earmarksApplied.set(bucket, 0n);
      continue;
    }
    for (const [key, share] of allocatePot(amount, entries)) {
      gross.set(key, (gross.get(key) ?? 0n) + share);
    }
    earmarksApplied.set(bucket, amount);
  }
  return { gross, earmarksApplied, earmarksScaled: new Map(scaled), generalPot };
}

/** Serialize a per-bucket bigint map for the epoch file: `{ "<denomination>": "<raw>" }`,
 *  keys ascending, values in raw base units. */
export function bucketMapToJson(m: Map<number, bigint>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of [...m.entries()].sort((a, b) => a[0] - b[0])) out[String(k)] = v.toString();
  return out;
}

/**
 * Aligns each kept join row with its own DepthPoint, keyed by (txHash, bucket) with
 * occurrence-indexed ranks — never by txHash alone. The "shield any amount" split flow
 * batches every piece of a session into ONE pool transaction, so all its deposits share a
 * txHash; a tx-keyed map would keep a single point per tx and hand every piece the same
 * bucket depth (e.g. a 10-STRK piece at true depth 31 paid the same-tx 10k piece's depth-1
 * tier), silently violating "each piece keeps its own depth multiplier"
 * (sumWeightsByCommitment). Same-bucket duplicates in one tx take consecutive ranks in the
 * deterministic order computeRunningDepth emits them, so the k-th such piece reads the k-th
 * cumulative depth.
 */
export function assignDepthPoints(kept: JoinedRegistration[], points: DepthPoint[]): DepthPoint[] {
  const byTxBucket = new Map<string, DepthPoint[]>();
  for (const p of points) {
    const key = `${p.txHash}:${p.bucket}`;
    const arr = byTxBucket.get(key);
    if (arr) arr.push(p);
    else byTxBucket.set(key, [p]);
  }
  const occurrence = new Map<string, number>();
  return kept.map((j) => {
    const key = `${j.depositTxHash}:${bucketKey(j.token, j.amount)}`;
    const k = occurrence.get(key) ?? 0;
    occurrence.set(key, k + 1);
    const point = byTxBucket.get(key)?.[k];
    if (!point) throw new Error(`internal error: no depth entry for deposit ${key} (piece ${k + 1})`);
    return point;
  });
}

/**
 * Reads events already captured by `index.ts` (does not touch RPC itself), computes
 * gauge-weighted vesting allocations for one epoch, builds the sorted-pair Poseidon merkle
 * tree, and writes epochs/epoch-N.json — the public recompute evidence anyone can rebuild from
 * chain data (ARCHITECTURE.md's trust model).
 *
 * Epoch windows here are block-based, not wall-clock: --from-block/--to-block bound both the
 * gauge-depth count and the "fraction of epoch since deposit" weighting. This is independent of
 * --vest-start/--vest-duration, which are wall-clock seconds passed straight through to
 * `post_root` for the *contract's* on-chain vesting clock — the two never need to agree.
 *
 * --pot is a required flag rather than auto-summed from the vault's `Funded` events, so the
 * operator states the intent explicitly; `post_root` reverts on-chain if the pot exceeds what
 * was actually funded, which is the real safety check.
 *
 * Windows must not overlap across epochs (see windows.ts): the claim nullifier is
 * per-(epoch_id, leaf), so a deposit allocated in two windows would be claimable twice.
 * --from-block defaults to one past the latest published epoch's toBlock.
 */

interface Args {
  epoch: number;
  pool: string;
  vault: string;
  token: bigint;
  pot: bigint;
  fromBlock?: number;
  toBlock?: number;
  genesisBlock: number;
  vestStart: number;
  vestDuration: number;
  quantum: bigint;
  out?: string;
  prior?: string;
  noPrior: boolean;
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      epoch: { type: "string" },
      pool: { type: "string" },
      vault: { type: "string" },
      token: { type: "string" },
      pot: { type: "string" },
      "from-block": { type: "string" },
      "to-block": { type: "string" },
      "genesis-block": { type: "string" },
      "vest-start": { type: "string" },
      "vest-duration": { type: "string" },
      quantum: { type: "string" },
      out: { type: "string" },
      // Path of the prior epoch's file, the earmark source for targeted fee recycling.
      // Defaults to epoch-(N-1).json next to this epoch's output path.
      prior: { type: "string" },
      // Explicit opt-out: close with empty earmarks even though the predecessor is a
      // rules-v2 epoch whose file (and earmarks) would otherwise be REQUIRED to exist.
      "no-prior": { type: "boolean" },
    },
  });

  const required = (name: string, v: string | undefined): string => {
    if (!v) throw new Error(`--${name} is required`);
    return v;
  };

  return {
    epoch: Number(required("epoch", values.epoch)),
    pool: required("pool", values.pool),
    vault: required("vault", values.vault),
    token: BigInt(required("token", values.token)),
    pot: BigInt(required("pot", values.pot)),
    fromBlock: values["from-block"] ? Number(values["from-block"]) : undefined,
    toBlock: values["to-block"] ? Number(values["to-block"]) : undefined,
    genesisBlock: values["genesis-block"] ? Number(values["genesis-block"]) : MAINNET_POOL_GENESIS_BLOCK,
    vestStart: values["vest-start"] ? Number(values["vest-start"]) : Math.floor(Date.now() / 1000),
    // Short by design for the first epochs; production epochs should pass an explicit --vest-duration.
    vestDuration: values["vest-duration"] ? Number(values["vest-duration"]) : 3600,
    // Payout grid: 0.1 token (18 decimals) by default — public claim values are watermarks
    // on the shielded note they create, so payouts snap to a coarse shared grid (reward.ts).
    quantum: values.quantum ? BigInt(values.quantum) : 10n ** 17n,
    out: values.out,
    prior: values.prior,
    noPrior: values["no-prior"] ?? false,
  };
}

function publishedWindows(epochsDir: string): EpochWindow[] {
  let names: string[];
  try {
    names = readdirSync(epochsDir);
  } catch {
    return [];
  }
  const out: EpochWindow[] = [];
  for (const name of names) {
    const m = /^epoch-(\d+)\.json$/.exec(name);
    if (!m) continue;
    const j = JSON.parse(readFileSync(path.join(epochsDir, name), "utf8")) as {
      fromBlock: number;
      toBlock: number;
    };
    out.push({ epoch: Number(m[1]), fromBlock: j.fromBlock, toBlock: j.toBlock });
  }
  return out;
}

function main(): void {
  const parsed = parseCliArgs();

  const store = loadStore(storePathFor(parsed.vault));
  if (store.deposits.length === 0 && store.registrations.length === 0) {
    throw new Error(`no indexed events found for vault ${parsed.vault} — run \`make indexer-once\` first`);
  }

  // Default --to-block to the highest block actually indexed, not an unbounded sentinel: the
  // "fraction of epoch since deposit" term is (toBlock - depositBlock), so an artificially huge
  // toBlock would make every deposit look equally "recent" and silently flatten that weighting.
  const highestIndexedBlock = Math.max(
    store.lastIndexedBlock,
    ...store.deposits.map((d) => d.blockNumber),
    ...store.registrations.map((r) => r.blockNumber),
  );
  const epochsDir = path.join(import.meta.dirname, "..", "..", "epochs");
  const published = publishedWindows(epochsDir);
  const args = {
    ...parsed,
    fromBlock: parsed.fromBlock ?? nextFromBlock(published, parsed.genesisBlock),
    toBlock: parsed.toBlock ?? highestIndexedBlock,
  };
  assertNoOverlap(published, args.epoch, args.fromBlock, args.toBlock);

  const outPath = args.out ?? path.join(epochsDir, `epoch-${args.epoch}.json`);

  // Targeted fee recycling (rules-v2 only; epoch 1 re-runs untouched): the prior epoch's
  // published feeWithheldByBucket becomes this epoch's per-bucket earmarks, so the fee a
  // privacy user paid rewards future depositors into the same buckets. Both the file and
  // the event set are public, so the close stays a pure function of public inputs.
  const earmarks = loadEarmarksForClose(args, outPath);

  const output = computeEpochClose(store, args, earmarks);

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");

  console.log(`epoch-close: wrote ${outPath}`);
  console.log(`epoch-close: ${output.allocations.length} allocations, pot ${args.pot}, root ${output.root}`);
}

/**
 * Resolve and load the prior epoch's earmarks per the CLI policy. Fails CLOSED on the money
 * path: for any epoch >= JOIN_RULE_V2_FROM_EPOCH + 1 the predecessor is itself a rules-v2
 * file that must exist, so "missing" at close time always means misconfiguration (a typo'd
 * --prior, an --out pointed at a scratch dir shifting the default prior next to it) —
 * proceeding would silently drop ALL targeting from a root that is then posted write-once
 * on-chain. Only an explicit --no-prior closes with empty earmarks in that case. Epoch 2's
 * v1-era predecessor legitimately has no feeWithheldByBucket ("no-field"), so it, and only
 * it, keeps the quiet empty-earmark fallback.
 */
function loadEarmarksForClose(args: Args, outPath: string): Map<number, bigint> {
  if (joinRuleForEpoch(args.epoch) < 2) return new Map();
  if (args.noPrior) {
    console.warn("epoch-close: WARNING --no-prior: closing with empty earmarks, general distribution only");
    return new Map();
  }
  const priorPath = args.prior ?? path.join(path.dirname(outPath), `epoch-${args.epoch - 1}.json`);
  const prior = loadPriorEarmarks(priorPath);
  if (prior.kind === "missing") {
    if (args.epoch - 1 >= JOIN_RULE_V2_FROM_EPOCH) {
      throw new Error(
        `prior epoch file not found at ${priorPath} — epoch ${args.epoch - 1} is a rules-v2 epoch whose ` +
          `feeWithheldByBucket is this close's earmark source, so a missing file means a misconfigured ` +
          `--prior/--out. Fix the path, or pass --no-prior to deliberately close with empty earmarks.`,
      );
    }
    console.warn(`epoch-close: WARNING no prior epoch file at ${priorPath}; earmarks empty, general distribution only`);
    return new Map();
  }
  if (prior.kind === "no-field") {
    console.log(
      `epoch-close: prior epoch file ${priorPath} has no feeWithheldByBucket (predates targeted recycling); earmarks empty, general distribution only`,
    );
    return new Map();
  }
  const carried = [...prior.earmarks.values()].reduce((sum, v) => sum + v, 0n);
  console.log(`epoch-close: earmarks carried from ${priorPath}: ${carried} total across ${prior.earmarks.size} bucket(s)`);
  return prior.earmarks;
}

/** CLI-independent inputs of one epoch close: every default already resolved, so the close
 *  is a pure function of (event store, inputs, earmarks). */
export interface EpochCloseInputs {
  epoch: number;
  pool: string;
  vault: string;
  token: bigint;
  pot: bigint;
  fromBlock: number;
  toBlock: number;
  vestStart: number;
  vestDuration: number;
  quantum: bigint;
}

/**
 * The full close pipeline as a function of the event store and resolved inputs — no
 * filesystem, CLI, or RPC. main() wraps it; tests replay it directly, which is what makes
 * the epoch-1 byte-identity invariant (see JOIN_RULE_V2_FROM_EPOCH) checkable at all.
 * Returns the exact object serialized into epochs/epoch-N.json.
 */
export function computeEpochClose(store: EventStore, args: EpochCloseInputs, earmarks: Map<number, bigint>) {
  const inWindow = <T extends { blockNumber: number }>(events: T[]) =>
    events.filter((e) => e.blockNumber >= args.fromBlock && e.blockNumber <= args.toBlock);

  const deposits = inWindow(store.deposits);
  const registrations = inWindow(store.registrations);

  // Gauge depth is CUMULATIVE from genesis up to the window's end — the real standing
  // anonymity set — never the within-window rank: a per-window count would reset depth to 1
  // each epoch and hand the thin-bucket tier to whoever lands first, forever, even in buckets
  // that are already deep. The window decides who is eligible, not what depth is.
  const depthPoints = computeRunningDepth(store.deposits.filter((d) => d.blockNumber <= args.toBlock));

  const joinRule = joinRuleForEpoch(args.epoch);

  // The token filter runs BEFORE dedupe, so earliest-event-wins is per token: a duplicate
  // registration only competes against events that produced rows in THIS token. (This also
  // blunts cross-token dust griefing — a dust deposit in another token never even enters the
  // contest here.)
  const { kept, dropped } = dedupeByCommitment(
    joinDepositsAndRegistrations(deposits, registrations, joinRule).filter((j) => j.token === args.token),
    joinRule,
  );
  for (const d of dropped) {
    console.warn(
      `epoch-close: WARNING dropped duplicate registration of commitment 0x${d.commitment.toString(16)} ` +
        `(block ${d.registerBlock}, tx ${d.registerTxHash}) — possible griefing attempt; earliest registration wins`,
    );
  }

  const keptDepths = assignDepthPoints(kept, depthPoints);
  const weighted = kept
    .map((j, i) => {
      const depth = keptDepths[i]!;
      const multiplierX10 = gaugeMultiplierX10(j.token, j.amount, depth.depthAfter);
      const weight = rawWeight(
        { key: j.commitment.toString(), amount: j.amount, multiplierX10, depositTime: j.depositBlock },
        args.fromBlock,
        args.toBlock,
      );
      return { joined: j, multiplierX10, weight };
    })
    // multiplier 0 = non-standard amount = ineligible by design (gauge.ts).
    .filter((w) => w.multiplierX10 !== 0n);

  if (weighted.length === 0) {
    throw new Error(
      `no eligible standard-denomination registrations for token ${args.token} in blocks ${args.fromBlock}..${args.toBlock}`,
    );
  }

  // One entry per commitment (piece weights summed), in canonical leaf order (by commitment):
  // the published root must be a pure function of the event set, independent of RPC arrival
  // order, and the leaf/claim/allocation granularity is the commitment, never the piece.
  const byCommitment = sumWeightsByCommitment(weighted);
  byCommitment.sort((a, b) => (a.commitment < b.commitment ? -1 : a.commitment > b.commitment ? 1 : 0));

  // Rules-v2: two tranches (general by total weight, targeted by per-bucket weight from the
  // prior epoch's earmarks); with empty earmarks this reduces to exactly the single
  // allocatePot below. Rule 1 keeps the original call untouched (epoch 1 byte identity).
  let gross: Map<string, bigint>;
  let earmarksApplied = new Map<number, bigint>();
  if (joinRule >= 2) {
    let generalPot: bigint;
    let earmarksScaled: Map<number, bigint>;
    ({ gross, earmarksApplied, earmarksScaled, generalPot } = distributeTwoTranches(args.pot, earmarks, byCommitment));
    // Operator-visible accounting for EVERY earmarked bucket, not only the ones that
    // distributed: a bucket with no weighted pieces this epoch, or a pot-driven scale-down,
    // leaves real STRK unallocated, and the console must say so. (The public record captures
    // it regardless — the prior file's feeWithheldByBucket vs this file's earmarksApplied.)
    if (earmarks.size > 0) {
      for (const [bucket, carriedAmount] of earmarks) {
        const scaledAmount = earmarksScaled.get(bucket) ?? 0n;
        const appliedAmount = earmarksApplied.get(bucket) ?? 0n;
        console.log(
          `epoch-close: bucket ${bucket}: earmark carried ${carriedAmount}, scaled ${scaledAmount}, applied ${appliedAmount}`,
        );
        if (appliedAmount < carriedAmount) {
          console.log(
            `epoch-close: bucket ${bucket}: ${carriedAmount - appliedAmount} left unallocated (stays in available)`,
          );
        }
      }
      console.log(`epoch-close: general tranche ${generalPot} of pot ${args.pot}`);
    }
  } else {
    gross = allocatePot(
      args.pot,
      byCommitment.map((c) => ({ key: c.commitment.toString(), rawWeight: c.rawWeight })),
    );
  }
  // Fee activates with the same versioned boundary as join rule 2; epoch 1 re-runs untouched.
  const { net, withheld, withheldByCommitment } =
    joinRule >= 2
      ? applyRewardFee(gross, byCommitment, REWARD_FEE_BPS)
      : { net: gross, withheld: 0n, withheldByCommitment: new Map<string, bigint>() };
  if (withheld > 0n) {
    console.log(`epoch-close: reward fee withheld ${withheld} (stays in available for future epochs)`);
  }
  const feeWithheldByBucket = attributeFeeByBucket(withheldByCommitment, byCommitment);
  const allocations = quantizeAllocations(net, args.quantum);

  // Allocations that rounded to zero carry no claimable value — drop their leaves.
  const allocated = byCommitment.filter((c) => (allocations.get(c.commitment.toString()) ?? 0n) > 0n);
  if (allocated.length < byCommitment.length) {
    console.warn(`epoch-close: ${byCommitment.length - allocated.length} allocation(s) below the ${args.quantum} quantum were dropped`);
  }

  const leafEntries = allocated.map((c) => {
    const total = allocations.get(c.commitment.toString()) ?? 0n;
    const leaf = computeLeaf(c.commitment, args.token, total);
    // NOTE: we deliberately do NOT emit the depositor address (pieces[].joined.caller). It is
    // dead data for the claim flow, and publishing it would hand an observer the
    // leaf->depositor link for free. The claim needs only commitment/total/leaf/proof.
    return { commitment: c.commitment, total, leaf };
  });

  const tree = buildMerkleTree(leafEntries.map((e) => e.leaf));

  // What post_root must reserve on-chain: the sum of quantized allocations, NOT the raw
  // pot — reserving the full pot would strand the rounding dust in pot_remaining forever.
  const totalAllocated = leafEntries.reduce((s, e) => s + e.total, 0n);

  const output = {
    epoch: args.epoch,
    // Which join rule reproduces this root (join.ts). Omitted for rule 1: v1-era epoch files
    // predate the field and epochs/epoch-1.json must re-run byte-identical; absent means 1.
    ...(joinRule >= 2
      ? {
          joinRule,
          feeBps: Number(REWARD_FEE_BPS),
          feeWithheld: withheld.toString(),
          // Per-bucket attribution of feeWithheld (sums to it exactly): the NEXT epoch's
          // earmarks for targeted fee recycling.
          feeWithheldByBucket: bucketMapToJson(feeWithheldByBucket),
          // Scaled earmark each bucket actually distributed this epoch (from the PRIOR
          // epoch's feeWithheldByBucket), published so anyone can verify the two tranches.
          earmarksApplied: bucketMapToJson(earmarksApplied),
        }
      : {}),
    pool: args.pool,
    vault: args.vault,
    token: `0x${args.token.toString(16)}`,
    fromBlock: args.fromBlock,
    toBlock: args.toBlock,
    pot: args.pot.toString(),
    totalAllocated: totalAllocated.toString(),
    quantum: args.quantum.toString(),
    vestStart: args.vestStart,
    vestDuration: args.vestDuration,
    root: `0x${tree.root.toString(16)}`,
    allocations: leafEntries.map((e, i) => ({
      commitment: `0x${e.commitment.toString(16)}`,
      total: e.total.toString(),
      leaf: `0x${e.leaf.toString(16)}`,
      proof: proofFor(tree, i).map((p) => `0x${p.toString(16)}`),
    })),
  };

  return output;
}

// CLI entrypoint guard so tests can import the exports above without running main().
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
