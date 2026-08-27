import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadStore, storePathFor } from "./store.ts";
import { joinDepositsAndRegistrations } from "./join.ts";
import { computeRunningDepth } from "./depth.ts";
import { gaugeMultiplierX10 } from "./gauge.ts";
import { rawWeight, allocatePot } from "./reward.ts";
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
 * --pot is a required flag, not auto-summed from the vault's `Funded` events: Funded's exact
 * key/data layout isn't pinned down yet (Phase 1 only implements commitment/leaf/merkle-verify
 * so far, not the full vault). Once the real event ABI exists, wire in an automatic sum here.
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
    // Short by design for the sprint (IMPLEMENTATION_PLAN.md Phase 5: "set short for the sprint").
    vestDuration: values["vest-duration"] ? Number(values["vest-duration"]) : 3600,
    out: values.out,
  };
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
  const args = {
    ...parsed,
    fromBlock: parsed.fromBlock ?? POOL_GENESIS_BLOCK,
    toBlock: parsed.toBlock ?? highestIndexedBlock,
  };

  const inWindow = <T extends { blockNumber: number }>(events: T[]) =>
    events.filter((e) => e.blockNumber >= args.fromBlock && e.blockNumber <= args.toBlock);

  const deposits = inWindow(store.deposits);
  const registrations = inWindow(store.registrations);

  const depthByTxHash = new Map(computeRunningDepth(deposits).map((p) => [p.txHash, p]));
  const joined = joinDepositsAndRegistrations(deposits, registrations).filter((j) => j.token === args.token);

  if (joined.length === 0) {
    throw new Error(`no registrations joined to a deposit for token ${args.token} in blocks ${args.fromBlock}..${args.toBlock}`);
  }

  const weighted = joined.map((j) => {
    const depth = depthByTxHash.get(j.depositTxHash);
    if (!depth) throw new Error(`internal error: no depth entry for deposit ${j.depositTxHash}`);
    const multiplierX10 = gaugeMultiplierX10(j.amount, depth.depthAfter);
    const weight = rawWeight(
      { key: j.commitment.toString(), amount: j.amount, multiplierX10, depositTime: j.depositBlock },
      args.fromBlock,
      args.toBlock,
    );
    return { joined: j, multiplierX10, weight };
  });

  const allocations = allocatePot(
    args.pot,
    weighted.map((w) => ({ key: w.joined.commitment.toString(), rawWeight: w.weight })),
  );

  const leafEntries = weighted.map((w) => {
    const total = allocations.get(w.joined.commitment.toString()) ?? 0n;
    const leaf = computeLeaf(w.joined.commitment, args.token, total);
    // Sanity: the commitment came from an on-chain `Registered` event, so it must already equal
    // poseidon(REG_TAG, secret) for whatever secret the depositor holds — we never see the
    // secret here, we just re-derive the leaf that secret's owner will need to reveal to claim.
    return { commitment: w.joined.commitment, caller: w.joined.caller, total, leaf };
  });

  const tree = buildMerkleTree(leafEntries.map((e) => e.leaf));

  const output = {
    epoch: args.epoch,
    pool: args.pool,
    vault: args.vault,
    token: `0x${args.token.toString(16)}`,
    fromBlock: args.fromBlock,
    toBlock: args.toBlock,
    pot: args.pot.toString(),
    vestStart: args.vestStart,
    vestDuration: args.vestDuration,
    root: `0x${tree.root.toString(16)}`,
    allocations: leafEntries.map((e, i) => ({
      commitment: `0x${e.commitment.toString(16)}`,
      caller: `0x${e.caller.toString(16)}`,
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
