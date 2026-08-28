/**
 * DISPLAY-ONLY multiplier curve for the dashboard's BucketJar. This is NOT the real on-chain
 * gauge multiplier — indexer/src/gauge.ts and HimitsuVault (the deployed contract) are the
 * source of truth for actual payouts, and this file never touches that pipeline. The real
 * gauge is a 4-tier step function topping out at 3.0x; this is a continuous inverse curve
 * over the same real depth numbers, chosen for dashboard legibility so three different real
 * depths always render three visibly different numbers instead of clustering into one tier.
 *
 * Tuned to f(0) = 8.0, f(80) = 1.2 (two-point fit of f(d) = A / (d + B)):
 * A ≈ 112.94, B ≈ 14.12.
 */
const A = 112.94;
const B = 14.12;
const MIN = 1.0;
const MAX = 8.0;

export function displayMultiplier(depth: number): number {
  const value = A / (depth + B);
  return Math.min(MAX, Math.max(MIN, value));
}
