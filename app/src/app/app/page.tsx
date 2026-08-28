"use client";
import { WifiOffIcon } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./page.module.css";
import { useDepthSnapshot } from "../components/ds/useDepthSnapshot";
import BucketJar from "../components/ds/BucketJar";
import VisibilityStrip from "../components/ds/VisibilityStrip";
import type { Bucket, HeatStop } from "../components/ds/types";
import { STANDARD_DENOMS } from "@/utils/constants";

/** Fill in denominations with zero deposits so an empty bucket is never hidden. */
function withEmptyBuckets(buckets: Bucket[]): Bucket[] {
  const byToken = new Map<string, Bucket[]>();
  for (const b of buckets) {
    const arr = byToken.get(b.token);
    if (arr) arr.push(b);
    else byToken.set(b.token, [b]);
  }
  const out: Bucket[] = [];
  for (const [token, rows] of byToken) {
    const tokenSymbol = rows[0]!.tokenSymbol;
    for (const denomination of STANDARD_DENOMS) {
      const existing = rows.find((r) => r.denomination === denomination);
      out.push(existing ?? { token, tokenSymbol, denomination, depth: 0, multiplier: 8, heat: 1 as HeatStop });
    }
  }
  return out;
}

export default function DashboardPage() {
  const { data, loading, error, stale } = useDepthSnapshot();

  return (
    <div className={styles.dashboard}>
      {stale && data?.generatedAt && (
        <div className={styles.staleBanner} role="status">
          Depth data is stale. Last updated {new Date(data.generatedAt).toLocaleString()}.
        </div>
      )}

      <section>
        <h2 className={styles.sectionTitle}>Standard denomination gauges</h2>
        <p className={`${styles.sectionSub} caption`}>Thin jars pay the highest multiplier.</p>
        {loading && (
          <div className={styles.jarGrid}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className={styles.jarSkeleton} />
            ))}
          </div>
        )}
        {!loading && error && <ErrorState />}
        {!loading && !error && data && (
          <div className={styles.jarGrid}>
            {withEmptyBuckets(data.buckets).map((b) => (
              <BucketJar
                key={`${b.token}:${b.denomination}`}
                denomination={b.denomination}
                tokenSymbol={b.tokenSymbol}
                depth={b.depth}
                heat={b.heat}
              />
            ))}
          </div>
        )}
      </section>

      <VisibilityStrip screen="dashboard" />
    </div>
  );
}

function ErrorState() {
  return (
    <Empty className={styles.errorBox}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WifiOffIcon />
        </EmptyMedia>
        <EmptyTitle>Couldn&apos;t load depth data</EmptyTitle>
        <EmptyDescription>This is usually a network hiccup — reload to try again.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
