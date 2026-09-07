import { Card, CardContent } from "@/components/ui/card";
import styles from "./ds.module.css";
import { gaugeTier, SPLIT_FEE_BPS, splitFeeRaw } from "@/utils/constants";
import { formatUnits, type SplitPlan } from "../himitsu/lib";
import type { Bucket } from "./types";

/**
 * The split plan for a custom amount: the standard pieces it becomes, the remainder that
 * stays in the wallet, and what the whole thing costs. Replaces the old
 * switch-to-one-denomination nudge — a custom amount no longer dead-ends, it splits.
 *
 * `buckets` is null while the depth snapshot is missing (still loading, or the fetch
 * failed): depth is then unknown, so rows show "up to 3.0×" rather than a number that could
 * overstate a deep bucket.
 */
export default function SplitSuggestion({ plan, buckets }: { plan: SplitPlan; buckets: Bucket[] | null }) {
  return (
    <Card className={styles.splitSuggestion}>
      <CardContent className={styles.splitSuggestionBody}>
        <div className={styles.splitPlanRows}>
          {plan.pieces.map((piece) => {
            const bucket = buckets?.find((b) => b.denomination === piece.denomination);
            // Tiers are simulated per piece, not read off the bucket's pre-batch tier: the
            // batch itself moves depth, and depthAfter counts the piece (indexer/src/gauge.ts),
            // so piece i of this denomination lands at depth + i + 1. When the batch crosses a
            // tier boundary the row shows the first→last range. A bucket absent from a loaded
            // snapshot is genuinely empty (depth 0).
            const depth = buckets ? (bucket?.depth ?? 0) : null;
            const firstTier = depth === null ? null : gaugeTier(depth + 1);
            const lastTier = depth === null ? null : gaugeTier(depth + piece.count);
            const heat = bucket?.heat ?? 1;
            return (
              <div key={piece.denomination} className={styles.splitPlanRow}>
                <span className="numeral-m">
                  {piece.count} × {piece.denomination.toLocaleString()} STRK
                </span>
                <span className={`${styles.splitMultiplier} numeral-m`} data-heat={heat}>
                  {firstTier === null || lastTier === null
                    ? "up to 3.0×"
                    : firstTier === lastTier
                      ? `${firstTier.toFixed(1)}×`
                      : `${firstTier.toFixed(1)}× → ${lastTier.toFixed(1)}×`}
                </span>
              </div>
            );
          })}
          {plan.remainder > 0n && (
            <p className="caption">{formatUnits(plan.remainder)} STRK stays in your wallet.</p>
          )}
        </div>
        <div className={styles.splitCosts}>
          <div className={styles.splitStrip} aria-label="Batching: all pieces, one transaction, one pool fee">
            <span className={styles.stripChip}>
              {plan.pieceCount} {plan.pieceCount === 1 ? "piece" : "pieces"}
            </span>
            <span className={styles.stripArrow} aria-hidden="true">→</span>
            <span className={styles.stripChip}>1 transaction</span>
            <span className={styles.stripArrow} aria-hidden="true">→</span>
            <span className={styles.stripChip}>6 STRK pool fee</span>
          </div>
          <div className={styles.feeBar} aria-label="Himitsu's fee is a small slice of the reward, never the deposit">
            <span className={styles.feeBarReward}>your reward</span>
            <span className={styles.feeBarFee}>
              −{(Number(SPLIT_FEE_BPS) / 100).toFixed(1)}%
            </span>
          </div>
          <p className="caption">
            The fee ({formatUnits(splitFeeRaw(plan.depositTotal))} STRK) comes out of rewards,
            never your deposit.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
