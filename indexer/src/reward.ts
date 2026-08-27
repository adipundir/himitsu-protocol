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
