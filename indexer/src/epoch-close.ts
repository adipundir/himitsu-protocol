import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { assertNoOverlap, nextFromBlock, type EpochWindow } from "./windows.ts";
import { loadStore, storePathFor } from "./store.ts";
import { joinDepositsAndRegistrations, dedupeByCommitment } from "./join.ts";
import { computeRunningDepth } from "./depth.ts";
import { gaugeMultiplierX10 } from "./gauge.ts";
import { rawWeight, allocatePot, quantizeAllocations } from "./reward.ts";
import { computeLeaf } from "./poseidon.ts";
import { buildMerkleTree, proofFor } from "./merkle.ts";

/** Pool deployment block (ARCHITECTURE.md, verified against mainnet RPC). Default --from-block. */
const POOL_GENESIS_BLOCK = 8978970;

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
  vestStart: number;
  vestDuration: number;
  quantum: bigint;
  out?: string;
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
      "vest-start": { type: "string" },
      "vest-duration": { type: "string" },
      quantum: { type: "string" },
      out: { type: "string" },
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
    vestStart: values["vest-start"] ? Number(values["vest-start"]) : Math.floor(Date.now() / 1000),
    // Short by design for the first epochs; production epochs should pass an explicit --vest-duration.
    vestDuration: values["vest-duration"] ? Number(values["vest-duration"]) : 3600,
    // Payout grid: 0.1 token (18 decimals) by default — public claim values are watermarks
    // on the shielded note they create, so payouts snap to a coarse shared grid (reward.ts).
    quantum: values.quantum ? BigInt(values.quantum) : 10n ** 17n,
    out: values.out,
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
    fromBlock: parsed.fromBlock ?? nextFromBlock(published, POOL_GENESIS_BLOCK),
    toBlock: parsed.toBlock ?? highestIndexedBlock,
  };
  assertNoOverlap(published, args.epoch, args.fromBlock, args.toBlock);

  const inWindow = <T extends { blockNumber: number }>(events: T[]) =>
    events.filter((e) => e.blockNumber >= args.fromBlock && e.blockNumber <= args.toBlock);

  const deposits = inWindow(store.deposits);
  const registrations = inWindow(store.registrations);

  // Gauge depth is CUMULATIVE from genesis up to the window's end — the real standing
  // anonymity set — never the within-window rank: a per-window count would reset depth to 1
  // each epoch and hand the thin-bucket tier to whoever lands first, forever, even in buckets
  // that are already deep. The window decides who is eligible, not what depth is.
  const depthByTxHash = new Map(
    computeRunningDepth(store.deposits.filter((d) => d.blockNumber <= args.toBlock)).map((p) => [p.txHash, p]),
  );

  const { kept, dropped } = dedupeByCommitment(
    joinDepositsAndRegistrations(deposits, registrations).filter((j) => j.token === args.token),
  );
  for (const d of dropped) {
    console.warn(
      `epoch-close: WARNING dropped duplicate registration of commitment 0x${d.commitment.toString(16)} ` +
        `(block ${d.registerBlock}, tx ${d.registerTxHash}) — possible griefing attempt; earliest registration wins`,
    );
  }

  const weighted = kept
    .map((j) => {
      const depth = depthByTxHash.get(j.depositTxHash);
      if (!depth) throw new Error(`internal error: no depth entry for deposit ${j.depositTxHash}`);
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

  // Canonical leaf order (by commitment): the published root must be a pure function of the
  // event set, independent of RPC arrival order.
  weighted.sort((a, b) => (a.joined.commitment < b.joined.commitment ? -1 : a.joined.commitment > b.joined.commitment ? 1 : 0));

  const allocations = quantizeAllocations(
    allocatePot(
      args.pot,
      weighted.map((w) => ({ key: w.joined.commitment.toString(), rawWeight: w.weight })),
    ),
    args.quantum,
  );

  // Allocations that rounded to zero carry no claimable value — drop their leaves.
  const allocated = weighted.filter((w) => (allocations.get(w.joined.commitment.toString()) ?? 0n) > 0n);
  if (allocated.length < weighted.length) {
    console.warn(`epoch-close: ${weighted.length - allocated.length} allocation(s) below the ${args.quantum} quantum were dropped`);
  }

  const leafEntries = allocated.map((w) => {
    const total = allocations.get(w.joined.commitment.toString()) ?? 0n;
    const leaf = computeLeaf(w.joined.commitment, args.token, total);
    // NOTE: we deliberately do NOT emit the depositor address (w.joined.caller). It is dead data
    // for the claim flow, and publishing it would hand an observer the leaf->depositor link for
    // free. The claim needs only commitment/total/leaf/proof.
    return { commitment: w.joined.commitment, total, leaf };
  });

  const tree = buildMerkleTree(leafEntries.map((e) => e.leaf));

  // What post_root must reserve on-chain: the sum of quantized allocations, NOT the raw
  // pot — reserving the full pot would strand the rounding dust in pot_remaining forever.
  const totalAllocated = leafEntries.reduce((s, e) => s + e.total, 0n);

  const output = {
    epoch: args.epoch,
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

  const outPath = args.out ?? path.join(import.meta.dirname, "..", "..", "epochs", `epoch-${args.epoch}.json`);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");

  console.log(`epoch-close: wrote ${outPath}`);
  console.log(`epoch-close: ${leafEntries.length} allocations, pot ${args.pot}, root 0x${tree.root.toString(16)}`);
}

main();
