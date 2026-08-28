"use client";
import { useEffect, useState } from "react";
import styles from "./ds.module.css";

function format(seconds: number): string {
  if (seconds <= 0) return "unlocked";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

/**
 * The arc fills over the whole vest period as a "time is passing" signal only — never a
 * partial-claim affordance. There is no partial claim; DESIGN.md §10 rule 6.
 */
export default function CliffCountdown({ vestStart, vestDuration }: { vestStart: number; vestDuration: number }) {
  const cliff = vestStart + vestDuration;
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, cliff - now);
  const elapsedFraction = vestDuration > 0 ? Math.min(1, Math.max(0, (now - vestStart) / vestDuration)) : 1;
  const unlocked = remaining === 0;

  const r = 42;
  const c = 2 * Math.PI * r;

  return (
    <div className={styles.cliffCountdown}>
      <svg width="100" height="100" viewBox="0 0 100 100" role="img" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={unlocked ? "var(--success)" : "var(--ink)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - elapsedFraction)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div aria-live="polite" className={styles.cliffText}>
        <span className="numeral-l">{format(remaining)}</span>
        <span className="caption">{unlocked ? "cliff open: all-or-nothing claim" : "until the cliff opens"}</span>
      </div>
    </div>
  );
}
