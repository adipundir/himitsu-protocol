import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import styles from "./ds.module.css";
import { STANDARD_DENOMS } from "./DenominationPicker";
import type { Bucket } from "./types";

/** Best standard denomination this custom amount could split into (largest that still fits ≥2×). */
function bestSplit(amount: number): { denom: number; count: number } | null {
  for (const denom of [...STANDARD_DENOMS].sort((a, b) => b - a)) {
    if (amount >= denom * 2) return { denom, count: Math.floor(amount / denom) };
  }
  return null;
}

export default function SplitSuggestion({
  amount,
  buckets,
  onSwitchToStandard,
}: {
  amount: number;
  buckets: Bucket[];
  onSwitchToStandard: (denom: number) => void;
}) {
  const split = bestSplit(amount);
  if (!split) return null;
  const bucket = buckets.find((b) => b.denomination === split.denom);
  const multiplier = bucket?.multiplier ?? 3.0;

  return (
    <Card className={styles.splitSuggestion}>
      <CardContent className={styles.splitSuggestionBody}>
        <p className="body">
          Split into {split.count} × {split.denom.toLocaleString()} instead. {split.count} indistinguishable
          entries in a fuller bucket, at{" "}
          <span className={styles.splitMultiplier}>{multiplier.toFixed(1)}×</span> the rate. Splitting
          isn&apos;t cheating — it&apos;s the product.
        </p>
        <Button size="sm" onClick={() => onSwitchToStandard(split.denom)}>
          Switch to {split.denom.toLocaleString()} →
        </Button>
      </CardContent>
    </Card>
  );
}
