/**
 * Deterministic chain-order comparator. RPC providers agree on block numbers and tx hashes
 * (consensus data) but not necessarily on array order within a response, and
 * starknet_getEvents exposes no within-block event index. Every ordering decision in the
 * epoch pipeline must therefore tie-break on consensus data only, so that "anyone can
 * recompute the root" holds bit-for-bit across providers and runs.
 */

export interface ChainOrdered {
  blockNumber: number;
  txHash: string;
}

export function compareChainOrder(a: ChainOrdered, b: ChainOrdered): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
  const ta = BigInt(a.txHash);
  const tb = BigInt(b.txHash);
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

/** compareChainOrder, then a caller-supplied final key for events inside one transaction. */
export function compareChainOrderThen<T extends ChainOrdered>(
  finalKey: (x: T) => bigint,
): (a: T, b: T) => number {
  return (a, b) => {
    const byChain = compareChainOrder(a, b);
    if (byChain !== 0) return byChain;
    const ka = finalKey(a);
    const kb = finalKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}
