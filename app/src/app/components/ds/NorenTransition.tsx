"use client";
import { useEffect, useState } from "react";
import styles from "./ds.module.css";

/**
 * Plays once, on a successful claim. Two ink panels sweep in over the reward figure and part
 * again to reveal empty space. A decorative, non-blocking reveal (~1.6s total) — the duration-tier
 * exception for mount reveals in the animation reference. Reduced motion: instant crossfade.
 */
export default function NorenTransition({ amount }: { amount: string }) {
  const [phase, setPhase] = useState<"cover" | "reveal">("cover");

  useEffect(() => {
    const t = setTimeout(() => setPhase("reveal"), 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={styles.noren}>
      <div className={styles.norenStage}>
        <span className="numeral-l">{amount} STRK</span>
        <div className={`${styles.norenPanel} ${styles.norenPanelLeft}`} data-phase={phase} aria-hidden="true" />
        <div className={`${styles.norenPanel} ${styles.norenPanelRight}`} data-phase={phase} aria-hidden="true" />
      </div>
      <p className="display">It&apos;s in a note now. Where it goes next is yours.</p>
    </div>
  );
}
