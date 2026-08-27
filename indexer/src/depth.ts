import type { DepositEvent } from "./types.ts";
import { bucketKey } from "./gauge.ts";

export interface DepthPoint {
  txHash: string;
  blockNumber: number;
  bucket: string;
  /** Rank of this deposit within its bucket, counting itself (1-indexed). */
  depthAfter: number;
}

/**
 * Running depth-per-bucket over an ordered deposit stream. Depth counts every deposit into the
 * bucket, not just ones that later register for rewards — depth is the anonymity set itself
 * (README: "it is the countable entry that deepens the set"), independent of who claims.
 * Powers both the gauge multiplier lookup (epoch-close.ts) and the depth dashboard.
 */
export function computeRunningDepth(deposits: DepositEvent[]): DepthPoint[] {
  const ordered = [...deposits].sort((a, b) => a.blockNumber - b.blockNumber);
  const counts = new Map<string, number>();
  const points: DepthPoint[] = [];
  for (const d of ordered) {
    const bucket = bucketKey(d.token, d.amount);
    const next = (counts.get(bucket) ?? 0) + 1;
    counts.set(bucket, next);
    points.push({ txHash: d.txHash, blockNumber: d.blockNumber, bucket, depthAfter: next });
  }
  return points;
}
