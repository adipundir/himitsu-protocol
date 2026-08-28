/**
 * `weight = amount * multiplier * fraction-of-epoch-since-deposit` (ARCHITECTURE.md), then
 * `reward_i = pot * weight_i / sum(weights)`.
 *
 * Implemented as pure bigint math: `epoch_duration` is a common factor of every weight_i within
 * one epoch, so it cancels in the final ratio and is deliberately omitted rather than divided
 * out early (multiply-first-divide-last avoids compounding rounding error, and keeps every
 * intermediate value an exact integer — this becomes a merkle leaf's `total`, so it must be).
 */
export interface WeightedEntry {
  key: string;
  amount: bigint;
  multiplierX10: bigint;
  /** Unix seconds the deposit landed. */
  depositTime: number;
}

export function rawWeight(entry: WeightedEntry, epochStart: number, epochEnd: number): bigint {
  const clampedDepositTime = Math.min(Math.max(entry.depositTime, epochStart), epochEnd);
  const secondsRemaining = BigInt(epochEnd - clampedDepositTime);
  return entry.amount * entry.multiplierX10 * secondsRemaining;
}

export function allocatePot(
  pot: bigint,
  weights: { key: string; rawWeight: bigint }[],
): Map<string, bigint> {
  const totalWeight = weights.reduce((sum, w) => sum + w.rawWeight, 0n);
  const result = new Map<string, bigint>();
  if (totalWeight === 0n) return result;
  for (const w of weights) {
    result.set(w.key, (pot * w.rawWeight) / totalWeight);
  }
  return result;
}

/**
 * Round every allocation DOWN to a multiple of `quantum`. Claims are public, so a
 * near-unique reward value watermarks the shielded note it creates: when that odd-valued
 * note later moves in a value-revealing way it can be amount-matched back to the claimer
 * (the same fingerprint class as Tutela's multi-denomination reveal on Tornado Cash).
 * Coarse, shared payout values shrink that fingerprint. Allocations that round to zero
 * are dropped — a zero-payout leaf would be unclaimable anyway. The rounding dust simply
 * stays unallocated (never posted on-chain; see `totalAllocated` in the epoch file).
 */
export function quantizeAllocations(
  allocations: Map<string, bigint>,
  quantum: bigint,
): Map<string, bigint> {
  if (quantum <= 0n) return allocations;
  const result = new Map<string, bigint>();
  for (const [key, value] of allocations) {
    const rounded = (value / quantum) * quantum;
    if (rounded > 0n) result.set(key, rounded);
  }
  return result;
}
