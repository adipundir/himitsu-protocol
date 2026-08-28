/**
 * Epoch-window discipline. A deposit must be allocated (and therefore paid) at most once:
 * the on-chain claim nullifier is per-(epoch_id, leaf), so it does NOT dedupe across epochs —
 * two epochs whose block windows overlap would both allocate the same deposit, and both
 * allocations would be claimable. The guard lives here, off-chain, because the contract
 * interface is frozen and the operator is already trusted for window selection (roots are
 * publicly recomputable, so a violation is detectable by anyone — this makes it impossible
 * to do by accident too).
 */

export interface EpochWindow {
  epoch: number;
  fromBlock: number;
  toBlock: number;
}

/** Default start for a new epoch: one block past the latest published window (or genesis). */
export function nextFromBlock(published: EpochWindow[], genesisBlock: number): number {
  if (published.length === 0) return genesisBlock;
  return Math.max(...published.map((w) => w.toBlock)) + 1;
}

/**
 * Throws if [fromBlock, toBlock] overlaps any published epoch's window. The epoch being
 * (re)closed is exempt from the check against itself, so regenerating an epoch's file with
 * the same number is allowed.
 */
export function assertNoOverlap(
  published: EpochWindow[],
  epoch: number,
  fromBlock: number,
  toBlock: number,
): void {
  if (fromBlock > toBlock) throw new Error(`epoch ${epoch}: fromBlock ${fromBlock} > toBlock ${toBlock}`);
  for (const w of published) {
    if (w.epoch === epoch) continue;
    if (fromBlock <= w.toBlock && toBlock >= w.fromBlock) {
      throw new Error(
        `epoch ${epoch} window ${fromBlock}..${toBlock} overlaps published epoch ${w.epoch} ` +
          `(${w.fromBlock}..${w.toBlock}) — a deposit may only be allocated once; ` +
          `claim nullifiers do not dedupe across epochs. Pass --from-block ${w.toBlock + 1} or later.`,
      );
    }
  }
}
