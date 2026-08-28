"use client";
import { useEffect, useState } from "react";
import styles from "./himitsu.module.css";
import { DENOMS, TOKEN_LABELS } from "@/utils/constants";

interface DepthData { generatedAt: string; buckets: Record<string, number> }

interface Row { key: string; label: string; token: string; depth: number }

/** k-anonymity depth per (token, denomination) bucket — single series, so no legend;
 *  labels wear ink tokens, the bar alone carries the accent (dataviz method).
 *  Standard denominations (the crowds Himitsu pays to grow) get their own bar scale;
 *  non-standard flow is the context that motivates them, so it lives in a separate table. */
export default function Depth() {
  const [data, setData] = useState<DepthData | null>(null);

  useEffect(() => {
    fetch("/epochs/depth.json").then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <p className={styles.hint}>
        No depth data published yet — the dashboard appears after the first indexer pass over the
        pool&apos;s public deposit events. It graphs the pool&apos;s k-anonymity depth per
        denomination: how many indistinguishable deposits a withdrawal of that shape can hide among.
      </p>
    );
  }

  const standard: Row[] = [];
  const nonStandard: Row[] = [];
  for (const [bucket, depth] of Object.entries(data.buckets)) {
    const [tok, denom] = bucket.split(":");
    const token = TOKEN_LABELS[tok!] ?? `0x${BigInt(tok!).toString(16).slice(0, 6)}…`;
    if (denom === "non-standard") {
      nonStandard.push({ key: bucket, label: token, token, depth });
    } else {
      const label = DENOMS.find((d) => d.human.toString() === denom)?.label.replace("STRK", token) ?? `${denom} ${token}`;
      standard.push({ key: bucket, label, token, depth });
    }
  }
  standard.sort((a, b) => b.depth - a.depth);
  nonStandard.sort((a, b) => b.depth - a.depth);
  const max = Math.max(1, ...standard.map((r) => r.depth));
  const nonStandardTotal = nonStandard.reduce((s, r) => s + r.depth, 0);
  // Collapse the dust tail: named tokens and anything with real volume stay, the rest aggregate.
  const shown = nonStandard.filter((r, i) => i < 8 || r.depth >= 10);
  const tail = nonStandard.filter((r) => !shown.includes(r));
  const tailTotal = tail.reduce((s, r) => s + r.depth, 0);

  return (
    <div>
      <p className={styles.lede}>
        <strong>k-anonymity depth</strong> per denomination bucket — the crowd a withdrawal of that
        shape hides in. Thin buckets pay the highest gauge multiplier, so rewards flow to exactly
        the corner of the set that needs bodies.
      </p>

      <h3 className={styles.sectionHead}>Standard denominations — the crowds Himitsu pays to grow</h3>
      {standard.length ? (
        <div className={styles.bars}>
          {standard.map((r) => (
            <div key={r.key} className={styles.barRow} title={`${r.label}: ${r.depth} deposits`}>
              <span className={styles.barLabel}>{r.label}</span>
              <span className={styles.barTrack}><i style={{ width: `${(r.depth / max) * 100}%` }} /></span>
              <span className={`${styles.barVal} mono`}>{r.depth}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.hint}>No standard-denomination deposits observed yet.</p>
      )}

      <h3 className={styles.sectionHead}>Non-standard flow — the problem the gauges exist to fix</h3>
      <p className={styles.small}>
        {nonStandardTotal.toLocaleString()} deposits used distinctive amounts. Every one of them is
        easier to trace than a round one — and none of them deepens a crowd.
      </p>
      <table className={styles.depthTable}>
        <thead><tr><th>Token</th><th>Non-standard deposits</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.key}><td>{r.label}</td><td className="mono">{r.depth.toLocaleString()}</td></tr>
          ))}
          {tail.length > 0 && (
            <tr><td>{tail.length} other tokens</td><td className="mono">{tailTotal.toLocaleString()}</td></tr>
          )}
        </tbody>
      </table>

      <p className={styles.small}>
        Live mainnet data: every deposit event since pool genesis. Updated{" "}
        {new Date(data.generatedAt).toLocaleString()} · recompute it yourself — the indexer reads
        only public chain data.
      </p>
    </div>
  );
}
