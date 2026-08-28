"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./jar.module.css";
import { HEAT_NOTE } from "./types";
import { useAnimatedNumber } from "./useAnimatedNumber";
import type { HeatStop } from "./types";

/**
 * The one orchestrated motion moment in the app, played once right after the viewer's own
 * shield tx confirms. In order: a dot arcs in from the button's screen position -> the jar
 * wobbles and a "+1" floats up while multiplier/depth tick to their new values -> then every
 * dot (including the new one) fades to a uniform fill together. No highlight, no "your dot"
 * marker, ever — the point is that it's no longer findable.
 */
export default function BucketJarMoment({
  denomination,
  tokenSymbol,
  depthBefore,
  multiplier,
  heat,
  originRect,
}: {
  denomination: number;
  tokenSymbol: string;
  depthBefore: number;
  /** The indexer-published gauge multiplier — never re-derived in the app (DESIGN.md §9). */
  multiplier: number;
  heat: HeatStop;
  originRect: DOMRect | null;
}) {
  const pitRef = useRef<HTMLDivElement>(null);
  const flyerRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<"arcing" | "landed" | "settling" | "settled">(
    originRect ? "arcing" : "landed",
  );
  const depthAfter = depthBefore + 1;
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Phase 1: arc the flying dot from the button to the jar's pit.
  useEffect(() => {
    if (phase !== "arcing" || !originRect || !flyerRef.current || !pitRef.current) return;
    const pitRect = pitRef.current.getBoundingClientRect();
    const from = { x: originRect.left + originRect.width / 2, y: originRect.top + originRect.height / 2 };
    const to = { x: pitRect.left + pitRect.width * 0.8, y: pitRect.bottom - 14 };
    const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 90 };

    if (reduced) {
      setPhase("landed");
      return;
    }
    const anim = flyerRef.current.animate(
      [
        { left: `${from.x}px`, top: `${from.y}px`, opacity: 1 },
        { left: `${mid.x}px`, top: `${mid.y}px`, opacity: 1 },
        { left: `${to.x}px`, top: `${to.y}px`, opacity: 1 },
      ],
      { duration: 300, easing: "ease-out", fill: "forwards" },
    );
    anim.onfinish = () => setPhase("landed");
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Phase 2: wobble + "+1" float + numbers tick, then settle.
  useEffect(() => {
    if (phase !== "landed") return;
    const t = setTimeout(() => setPhase("settling"), reduced ? 0 : 900);
    return () => clearTimeout(t);
  }, [phase, reduced]);

  useEffect(() => {
    if (phase !== "settling") return;
    const t = setTimeout(() => setPhase("settled"), reduced ? 0 : 600);
    return () => clearTimeout(t);
  }, [phase]);

  const displayedDepth = useAnimatedNumber(phase === "landed" || phase === "settling" || phase === "settled" ? depthAfter : depthBefore, 500);
  // Only depth ticks: the multiplier shown is the published gauge value, and inventing an
  // "after" tier here would re-derive thresholds the indexer owns.
  const displayedMultiplier = multiplier;

  return (
    <div className={styles.jarMomentWrap}>
      {phase === "arcing" && originRect && (
        <span
          ref={flyerRef}
          className={styles.flyer}
          data-heat={heat}
          style={{ left: originRect.left, top: originRect.top, position: "fixed" }}
          aria-hidden="true"
        />
      )}

      <div
        ref={pitRef}
        className={styles.jar}
        data-heat={heat}
        data-wobble={phase === "landed"}
      >
        <div className={styles.jarHead}>
          <span className={`${styles.jarDenom} numeral`}>
            {denomination.toLocaleString()} <span className={styles.jarToken}>{tokenSymbol}</span>
          </span>
          <span className={`${styles.jarMultiplier} numeral`} data-heat={heat}>
            {displayedMultiplier.toFixed(1)}×
          </span>
        </div>
        <p className={`${styles.jarMood} caption`}>{HEAT_NOTE[heat]}</p>

        <div className={styles.pit}>
          {Array.from({ length: Math.min(depthAfter, 120) }, (_, i) => {
            const isNew = i === depthAfter - 1 && (phase === "landed" || phase === "settling" || phase === "settled");
            const uniform = phase === "settled";
            return (
              <span
                key={i}
                className={[styles.dot, isNew && phase === "landed" ? styles.dotPopNew : "", uniform ? styles.dotUniform : ""].join(" ")}
                data-heat={heat}
                aria-hidden="true"
              />
            );
          })}
          {(phase === "landed" || phase === "settling") && (
            <span className={styles.floatPlusOne} data-heat={heat} aria-hidden="true">
              +1
            </span>
          )}
        </div>

        <p className={styles.jarFooter}>
          <b className="numeral">{Math.round(displayedDepth).toLocaleString()}</b> in the crowd
        </p>
      </div>

      {phase === "settled" && (
        <p className={`${styles.momentCaption} display`}>Your entry is in there. So is everyone else&apos;s.</p>
      )}
    </div>
  );
}
