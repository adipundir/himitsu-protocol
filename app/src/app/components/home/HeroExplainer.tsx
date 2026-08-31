"use client";
import { useEffect, useState } from "react";
import styles from "./heroExplainer.module.css";

/**
 * The hero explains HIMITSU, not just STRK20: two bounded regions, Public flow and Private
 * flow. In the public flow your wallet joins a denomination bucket's crowd and the sponsor
 * pot pays by gauge weight (thin crowds pay most); in the private flow the claimed reward
 * lands in a shielded balance. Three phases loop with a short display title above and one
 * quiet line below. Reduced motion: the full diagram, static.
 */

const PHASES = [
  { title: "Join the crowd.", sub: "Deposit any amount. It goes in as standard pieces, public by design." },
  { title: "Your fee builds cover.", sub: "Up to 0.5%, withheld from your reward, pays the next depositors into the same buckets." },
  { title: "Exit in the crowd.", sub: "Rewards land shielded. Send privately or withdraw anytime." },
] as const;

const DURATIONS = [3400, 3400, 3800] as const;

export default function HeroExplainer() {
  const [phase, setPhase] = useState<0 | 1 | 2 | "static">("static");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let alive = true;
    let timer: number;
    let i: 0 | 1 | 2 = 0;
    setPhase(0);
    const advance = () => {
      if (!alive) return;
      i = ((i + 1) % 3) as 0 | 1 | 2;
      setPhase(i);
      timer = window.setTimeout(advance, DURATIONS[i]);
    };
    timer = window.setTimeout(advance, DURATIONS[0]);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const captionIndex = phase === "static" ? 1 : phase;

  return (
    <div className={styles.scene} data-phase={phase}>
      <p className={styles.phaseTitle} key={`t${captionIndex}`}>
        {PHASES[captionIndex].title}
      </p>

      <div className={styles.flows}>
        <div className={`${styles.flow} ${styles.flowPublic}`}>
          <span className={styles.flowLabel}>
            <EyeIcon /> Public flow
          </span>
          <div className={`${styles.chip} ${styles.walletChip}`}>
            <span className={styles.chipLabel}>Your wallet</span>
            <span className={styles.chipMono}>0x7a4…9c1</span>
            <span className={styles.chipAmount}>1,000 STRK</span>
          </div>
          <div className={styles.crowd}>
            <span className={styles.gauge}>3.0×</span>
            <span className={styles.crowdDots} aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} />
              ))}
            </span>
            <span className={styles.crowdLabel}>the bucket&apos;s crowd</span>
          </div>
          <div className={styles.pot}>
            <span className={styles.chipLabel}>Sponsor pot</span>
            <span className={styles.chipAmount}>splits each epoch</span>
          </div>
        </div>

        <div className={`${styles.flow} ${styles.flowPrivate}`}>
          <span className={styles.flowLabel}>
            <EyeOffIcon /> Private flow
          </span>
          <div className={`${styles.chip} ${styles.shieldChip}`}>
            <span className={styles.chipLabel}>Shielded balance</span>
            <span className={styles.chipMono}>秘密</span>
            <span className={`${styles.chipAmount} ${styles.rewardTag}`}>+ reward</span>
          </div>
        </div>

        <i className={styles.depositDot} aria-hidden="true" />
        <i className={styles.claimDot} aria-hidden="true" />
      </div>

      <p className={styles.phaseSub} key={`s${captionIndex}`}>
        {PHASES[captionIndex].sub}
      </p>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M1 7.5S3.5 2.8 7.5 2.8 14 7.5 14 7.5 11.5 12.2 7.5 12.2 1 7.5 1 7.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="7.5" r="2.1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M2 2l11 11M6.2 4.6c.4-.1.85-.15 1.3-.15 4 0 6.5 4.7 6.5 4.7s-.75 1.4-2.15 2.75M4.1 5.15C2.4 6.4 1 7.5 1 7.5s2.5 4.7 6.5 4.7c.9 0 1.7-.24 2.42-.62"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
