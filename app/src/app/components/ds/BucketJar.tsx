"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./jar.module.css";
import { HEAT_NOTE } from "./types";
import { displayMultiplier } from "./displayMultiplier";
import { useAnimatedNumber } from "./useAnimatedNumber";
import type { HeatStop } from "./types";

/** Deterministic ±0.6px horizontal jitter per dot index — stable across renders, never random. */
function jitterX(i: number): number {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return (h - Math.floor(h)) * 1.2 - 0.6;
}

const CAP = 120;

export default function BucketJar({
  denomination,
  tokenSymbol,
  depth,
  heat,
}: {
  denomination: number;
  tokenSymbol: string;
  depth: number;
  heat: HeatStop;
}) {
  // Dots present at first mount get the staggered pop-in; dots added later (poll or the
  // shield moment) get a single pop via justAddedIndex instead — kept as two disjoint cases
  // so an already-settled dot's animation-delay is never touched again.
  const initialDepthRef = useRef<number | null>(null);
  if (initialDepthRef.current === null) initialDepthRef.current = depth;
  const initialDepth = initialDepthRef.current;

  const prevDepthRef = useRef(depth);
  const [justAddedIndex, setJustAddedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (depth > prevDepthRef.current) {
      const newIndex = depth - 1;
      setJustAddedIndex(newIndex);
      const t = setTimeout(() => setJustAddedIndex(null), 460);
      prevDepthRef.current = depth;
      return () => clearTimeout(t);
    }
    prevDepthRef.current = depth;
  }, [depth]);

  const displayedDepth = useAnimatedNumber(depth, 500);
  const displayedMultiplier = useAnimatedNumber(displayMultiplier(depth), 500);
  const hungry = heat <= 2;
  const shown = Math.min(depth, CAP);
  const overflow = depth - shown;

  return (
    <div className={styles.jar} data-heat={heat} data-hungry={hungry}>
      <div className={styles.jarHead}>
        <span className={`${styles.jarDenom} numeral`}>
          {denomination.toLocaleString()} <span className={styles.jarToken}>{tokenSymbol}</span>
        </span>
        <span className={`${styles.jarMultiplier} numeral`} data-heat={heat}>
          {displayedMultiplier.toFixed(1)}×
        </span>
      </div>
      <p className={`${styles.jarMood} caption`}>{HEAT_NOTE[heat]}</p>

      <div
        className={styles.pit}
        role="img"
        aria-label={`${denomination.toLocaleString()} ${tokenSymbol} bucket — ${depth} depositor${depth === 1 ? "" : "s"}`}
      >
        {depth === 0 ? (
          <div className={styles.pitEmpty} aria-hidden="true" />
        ) : (
          Array.from({ length: shown }, (_, i) => {
            const isNew = i === justAddedIndex;
            const isInitial = i < initialDepth;
            const cls = isNew
              ? `${styles.dot} ${styles.dotPopNew}`
              : isInitial
                ? `${styles.dot} ${styles.dotPopInitial}`
                : styles.dot;
            return (
              <span
                key={i}
                aria-hidden="true"
                className={cls}
                data-heat={heat}
                style={{
                  transform: `translateX(${jitterX(i).toFixed(2)}px)`,
                  animationDelay: isInitial && !isNew ? `${Math.min(i, 40) * 18}ms` : undefined,
                }}
              />
            );
          })
        )}
        {overflow > 0 && <span className={`${styles.dotOverflow} numeral`}>+{overflow}</span>}
      </div>

      <p className={styles.jarFooter}>
        <b className="numeral">{Math.round(displayedDepth).toLocaleString()}</b> in the crowd
      </p>
    </div>
  );
}
