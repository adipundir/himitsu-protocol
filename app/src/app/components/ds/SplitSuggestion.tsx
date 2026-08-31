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
        <p className="body">
          A custom amount is a crowd of one: whoever sees it go in can watch for it coming out.
          So this shields it as standard pieces, each an ordinary entry in its bucket. Splitting
          isn&apos;t cheating. It&apos;s the product.
        </p>
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
            <p className="caption">
              {formatUnits(plan.remainder)} STRK stays in your wallet. Anything below 10 is never
              deposited.
            </p>
          )}
        </div>
        <div className={styles.splitCosts}>
          <p className="caption">
            {plan.pieceCount === 1
              ? "One deposit, one pool transaction: STRK20's own flat 6 STRK fee applies once."
              : `All ${plan.pieceCount} pieces go in as one pool transaction, so STRK20's own flat 6 STRK fee applies once instead of ${plan.pieceCount} times.`}
          </p>
          <p className="caption">
            Registering earns you a share of each epoch&apos;s reward pot. Himitsu&apos;s fee, up to{" "}
            {(Number(SPLIT_FEE_BPS) / 100).toFixed(1)}% of the deposit
            ({formatUnits(splitFeeRaw(plan.depositTotal))} STRK), comes out of that share only, never
            out of your deposit: no reward, no fee. What is withheld is earmarked to reward the next
            depositors into these same buckets, in the published math, the same for every interface.
          </p>
          <p className="caption">
            Depositing earlier in an epoch earns more weight.
          </p>
          <p className="caption">
            Rewards depend on what the pot holds and how many others deposit. Nothing here is a
            fixed rate.
          </p>
          <p className="caption">
            The split itself is public: observers see these pieces enter from your address.
            Privacy comes when you spend inside the pool or exit in standard pieces among the
            crowd.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
