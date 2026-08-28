"use client";
import { useEffect, useState } from "react";
import styles from "./himitsu.module.css";
import { addrSTRK, DENOMS } from "@/utils/constants";

interface DepthData { generatedAt: string; buckets: Record<string, number> }

/** k-anonymity depth per (token, denomination) bucket — single series, so no legend;
 *  labels wear ink tokens, the bar alone carries the accent (dataviz method). */
export default function Depth() {
  const [data, setData] = useState<DepthData | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    fetch("/epochs/depth.json").then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <p className={styles.hint}>
        No depth data published yet — it appears after the first indexer run (`make dashboard-data`).
        The dashboard graphs the pool&apos;s k-anonymity depth per denomination: how many
        indistinguishable deposits a withdrawal of that shape can hide among.
      </p>
    );
  }

  const strkDec = BigInt(addrSTRK).toString();
  const rows = Object.entries(data.buckets)
    .map(([bucket, depth]) => {
      const [tok, denom] = bucket.split(":");
      const tokenLabel = tok === strkDec ? "STRK" : `${tok!.slice(0, 8)}…`;
      const denomLabel = denom === "non-standard" ? "non-standard" : DENOMS.find((d) => d.human.toString() === denom)?.label ?? `${denom} ${tokenLabel}`;
      return { key: bucket, label: denomLabel, token: tokenLabel, depth };
    })
    .sort((a, b) => b.depth - a.depth);
  const max = Math.max(1, ...rows.map((r) => r.depth));

  return (
    <div>
      <p className={styles.lede}>
        <strong>k-anonymity depth</strong> per denomination bucket — the crowd a withdrawal of that
        shape hides in. Thin buckets pay the highest gauge multiplier, so rewards flow to exactly
        the corner of the set that needs bodies.
      </p>
      <button className={styles.linkBtn} onClick={() => setTable(!table)}>{table ? "Bar view" : "Table view"}</button>
      {table ? (
        <table className={styles.depthTable}>
          <thead><tr><th>Bucket</th><th>Token</th><th>Depth</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}><td>{r.label}</td><td>{r.token}</td><td className="mono">{r.depth}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className={styles.bars}>
          {rows.map((r) => (
            <div key={r.key} className={styles.barRow} title={`${r.label}: ${r.depth} deposits`}>
              <span className={styles.barLabel}>{r.label}</span>
              <span className={styles.barTrack}><i style={{ width: `${(r.depth / max) * 100}%` }} /></span>
              <span className={`${styles.barVal} mono`}>{r.depth}</span>
            </div>
          ))}
        </div>
      )}
      <p className={styles.small}>Updated {new Date(data.generatedAt).toLocaleString()} · recompute it yourself: the indexer reads only public chain data.</p>
    </div>
  );
}
