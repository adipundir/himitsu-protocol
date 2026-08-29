/**
 * Gauge multipliers per ARCHITECTURE.md. Multipliers are scaled x10 (3.0x -> 30n) so the whole
 * pipeline stays bigint-exact — no floating point anywhere near a value that ends up committed
 * on-chain as a merkle leaf.
 */

/** Standard denominations in HUMAN token units (10 / 100 / 1k / 10k tokens). 0.1 and 1 were
 *  briefly standard tiers and deliberately dropped — too small a deposit to be worth
 *  subsidizing. Matching still runs in exact-bigint tenths-of-a-token (never a float against
 *  baseUnit()) rather than reverting to whole-token arithmetic, since it's a strict
 *  generalization and costs nothing now that every tier is whole-number again. */
export const STANDARD_DENOMINATIONS = [10, 100, 1_000, 10_000] as const;

/** STANDARD_DENOMINATIONS expressed in tenths of a token, index-aligned — the bigint form
 *  matching actually runs against. `Math.round` only ever corrects float noise from `d * 10`
 *  on these specific single-decimal-digit literals (0.1 -> 1, 1 -> 10, ..., 10_000 -> 100_000);
 *  it never rounds a real amount. */
const STANDARD_DENOMINATIONS_TENTHS = STANDARD_DENOMINATIONS.map((d) => BigInt(Math.round(d * 10)));

/**
 * On-chain amounts are raw base units (a 100 STRK deposit arrives as 100 * 10^18), so
 * denomination matching must divide out the token's decimals first. Default is 18 (STRK, ETH);
 * add an entry per token that differs (e.g. USDC = 6) before adding it to the app's presets.
 * Must be >=1: matching works in tenths of a token (for the 0.1 tier), so baseUnit(token)/10n
 * has to divide evenly.
 */
export const TOKEN_DECIMALS: Record<string, number> = {
  // STRK (Starknet mainnet)
  "2009894490435840142178314390393166646092438090257831307886760648929397478285": 18,
};

export function baseUnit(token: bigint): bigint {
  return 10n ** BigInt(TOKEN_DECIMALS[token.toString()] ?? 18);
}

/** Precise (never float-multiplied) base units for a STANDARD_DENOMINATIONS entry — the
 *  inverse of matchedDenomination, e.g. for reconstructing amounts from an aggregated bucket
 *  key (dashboard.ts) where only the human denomination survives, not the original amount. */
export function standardDenominationBaseUnits(token: bigint, human: number): bigint {
  const idx = STANDARD_DENOMINATIONS.indexOf(human as (typeof STANDARD_DENOMINATIONS)[number]);
  if (idx === -1) throw new Error(`${human} is not a standard denomination`);
  return STANDARD_DENOMINATIONS_TENTHS[idx]! * (baseUnit(token) / 10n);
}

/** The matched standard denomination in human units, or undefined for non-standard amounts. */
export function matchedDenomination(token: bigint, amount: bigint): number | undefined {
  const tenth = baseUnit(token) / 10n;
  if (amount % tenth !== 0n) return undefined;
  const tenths = amount / tenth;
  const idx = STANDARD_DENOMINATIONS_TENTHS.indexOf(tenths);
  return idx === -1 ? undefined : STANDARD_DENOMINATIONS[idx];
}

export function bucketKey(token: bigint, amount: bigint): string {
  const denom = matchedDenomination(token, amount);
  return denom !== undefined ? `${token}:${denom}` : `${token}:non-standard`;
}

/**
 * `bucketDepthAtDeposit` is the 1-indexed rank of this deposit within its (token, denomination)
 * bucket counting CUMULATIVELY from pool genesis, itself included. Cumulative, not per-epoch:
 * the multiplier prices the real standing anonymity set, so a bucket that is already deep can
 * never pay the thin-bucket tier again just because a new epoch window opened.
 *
 * Non-standard amounts earn 0: a distinctive amount is its own bucket of one — it adds no
 * standard-denomination anonymity, so subsidizing it would pay for exactly the behavior the
 * gauges exist to correct. (Non-standard deposits still show in the depth dashboard.)
 */
export function gaugeMultiplierX10(token: bigint, amount: bigint, bucketDepthAtDeposit: number): bigint {
  if (matchedDenomination(token, amount) === undefined) return 0n;
  if (bucketDepthAtDeposit < 25) return 30n;
  if (bucketDepthAtDeposit < 100) return 20n;
  if (bucketDepthAtDeposit < 400) return 15n;
  return 12n;
}
