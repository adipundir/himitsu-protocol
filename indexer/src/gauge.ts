/**
 * Gauge multipliers per ARCHITECTURE.md. Multipliers are scaled x10 (3.0x -> 30n) so the whole
 * pipeline stays bigint-exact — no floating point anywhere near a value that ends up committed
 * on-chain as a merkle leaf.
 */
export const STANDARD_DENOMINATIONS = [100n, 1_000n, 10_000n] as const;

export function matchedDenomination(amount: bigint): bigint | undefined {
  return STANDARD_DENOMINATIONS.find((d) => d === amount);
}

export function bucketKey(token: bigint, amount: bigint): string {
  const denom = matchedDenomination(amount);
  return denom !== undefined ? `${token}:${denom}` : `${token}:non-standard`;
}

/**
 * `bucketDepthAtDeposit` is the 1-indexed rank of this deposit within its (token, denomination)
 * bucket for the epoch, counting itself — i.e. "how many deposits have landed in this bucket
 * so far, including this one". Deposit #1 into an empty bucket gets the richest tier; later
 * deposits into the same filling bucket get progressively smaller multipliers within the same
 * epoch. This is a deliberate design choice (confirmed): it directly rewards being early into a
 * thin bucket, on top of the bucket eventually deepening for everyone after.
 */
export function gaugeMultiplierX10(amount: bigint, bucketDepthAtDeposit: number): bigint {
  if (matchedDenomination(amount) === undefined) return 10n;
  if (bucketDepthAtDeposit < 25) return 30n;
  if (bucketDepthAtDeposit < 100) return 20n;
  if (bucketDepthAtDeposit < 400) return 15n;
  return 12n;
}
