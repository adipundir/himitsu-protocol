/**
 * Gauge multipliers per ARCHITECTURE.md. Multipliers are scaled x10 (3.0x -> 30n) so the whole
 * pipeline stays bigint-exact — no floating point anywhere near a value that ends up committed
 * on-chain as a merkle leaf.
 */

/** Standard denominations in HUMAN token units (100 / 1k / 10k tokens). */
export const STANDARD_DENOMINATIONS = [100n, 1_000n, 10_000n] as const;

/**
 * On-chain amounts are raw base units (a 100 STRK deposit arrives as 100 * 10^18), so
 * denomination matching must divide out the token's decimals first. Default is 18 (STRK, ETH);
 * add an entry per token that differs (e.g. USDC = 6) before adding it to the app's presets.
 */
export const TOKEN_DECIMALS: Record<string, number> = {
  // STRK (Starknet mainnet)
  "2009894490435840142178314390393166646092438090257831307886760648929397478285": 18,
};

export function baseUnit(token: bigint): bigint {
  return 10n ** BigInt(TOKEN_DECIMALS[token.toString()] ?? 18);
}

/** The matched standard denomination in human units, or undefined for non-standard amounts. */
export function matchedDenomination(token: bigint, amount: bigint): bigint | undefined {
  const unit = baseUnit(token);
  if (amount % unit !== 0n) return undefined;
  const whole = amount / unit;
  return STANDARD_DENOMINATIONS.find((d) => d === whole);
}

export function bucketKey(token: bigint, amount: bigint): string {
  const denom = matchedDenomination(token, amount);
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
export function gaugeMultiplierX10(token: bigint, amount: bigint, bucketDepthAtDeposit: number): bigint {
  if (matchedDenomination(token, amount) === undefined) return 10n;
  if (bucketDepthAtDeposit < 25) return 30n;
  if (bucketDepthAtDeposit < 100) return 20n;
  if (bucketDepthAtDeposit < 400) return 15n;
  return 12n;
}
