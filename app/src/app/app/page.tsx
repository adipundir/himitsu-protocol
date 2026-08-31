"use client";
import Link from "next/link";
import { WifiOffIcon } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./page.module.css";
import { useDepthSnapshot } from "../components/ds/useDepthSnapshot";
import { fmtPotSTRK, useRewardPot } from "../components/ds/useRewardPot";
import BucketJar from "../components/ds/BucketJar";
import VisibilityStrip from "../components/ds/VisibilityStrip";
import type { Bucket, HeatStop } from "../components/ds/types";
import { useFrontendProvider } from "../components/client/provider/providerContext";
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
      // 3.0 is the real thin-bucket tier (indexer/src/gauge.ts), not an invented teaser rate.
      out.push(existing ?? { token, tokenSymbol, denomination, depth: 0, multiplier: 3, heat: 1 as HeatStop });
    }
  }
  return out;
}

export default function DashboardPage() {
  const { data, loading, error, stale } = useDepthSnapshot();
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const pot = useRewardPot(providerIndex);

  return (
    <div className={styles.dashboard}>
      <header className={styles.pageHead}>
        <h1>Earn</h1>
        <p className={styles.intro}>
          Thin jars pay the highest multiplier, weight scales with amount, and depositing earlier in an epoch earns more. Deposit standard pieces and earn from the pot.
        </p>
      </header>

      {pot !== null && (
        <div className={styles.potBlock}>
          <span className={styles.potLabel}>Reward pot</span>
          <span className={`${styles.potValue} numeral`}>{fmtPotSTRK(pot)} STRK</span>
          <p className={styles.potNote}>
            Sponsor funded on the <Link href="/app/fund">Fund page</Link>, split each epoch by
            multiplier weight, plus last epoch&apos;s withheld fees earmarked back to their buckets.
          </p>
        </div>
      )}

      {stale && data?.generatedAt && (
        <p className={styles.staleBanner} role="status">
          Depth data is stale. Last updated {new Date(data.generatedAt).toLocaleString()}.
        </p>
      )}

      <section>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Standard denominations</h2>
          {data?.generatedAt && (
            <span className={styles.snapshotNote}>
              Mainnet snapshot · {new Date(data.generatedAt).toLocaleString()}
            </span>
          )}
        </div>
        {loading && (
          <div className={styles.jarGrid}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className={styles.jarSkeleton} />
            ))}
          </div>
        )}
        {!loading && error && <ErrorState />}
        {!loading && !error && data && (
          <div className={styles.jarGrid}>
            {/* Only the token the app supports: sepolia test runs left standard-denomination
                deposits in unknown test tokens, and a jar block per hex address is noise. */}
            {withEmptyBuckets(data.buckets.filter((b) => b.tokenSymbol === "STRK")).map((b) => (
              <Link
                key={`${b.token}:${b.denomination}`}
                href={`/app/shield?d=${b.denomination}`}
                className={styles.jarLink}
                aria-label={`Shield ${b.denomination.toLocaleString()} ${b.tokenSymbol}`}
              >
                <BucketJar
                  denomination={b.denomination}
                  tokenSymbol={b.tokenSymbol}
                  depth={b.depth}
                  multiplier={b.multiplier}
                  heat={b.heat}
                />
              </Link>
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
        <EmptyDescription>This is usually a network hiccup. Reload to try again.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
