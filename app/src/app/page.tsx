import { Anton, Inter } from "next/font/google";
import Link from "next/link";
import styles from "./home.module.css";

const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });

const REPO = "https://github.com/adipundir/himitsu-protocol";

export default function MarketingHome() {
  return (
    <div className={`${styles.page} ${anton.variable} ${inter.variable}`}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Link href="/" className={styles.wordmark}>
            <span className={styles.wordmarkKanji}>秘密</span>
            <span>Himitsu</span>
          </Link>
          <p className={styles.tagline}>
            Anonymity mining for the STRK20 pool on Starknet. Deposit a standard amount, register,
            claim privately.
          </p>
        </div>
        <div className={styles.headerRight}>
          <nav className={styles.nav} aria-label="Marketing">
            <a href={`${REPO}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer">
              Docs
            </a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link href="/app/verify">Verify</Link>
          </nav>
          <Link href="/app" className={styles.launchBtn}>
            Launch app <Arrow />
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <h1 className={`${styles.display} ${styles.heroHead}`}>
          Privacy is a crowd.
          <br />
          Get paid to be in it.
        </h1>
        <p className={styles.heroSub}>
          Himitsu pays STRK rewards for shielding standard denominations into Starknet&apos;s
          STRK20 pool — deepening the anonymity set every privacy app on the chain depends on.
          Thin buckets pay the most.
        </p>
      </section>

      <Link href="/app/shield" className={styles.ctaBar}>
        <span>Shield &amp; earn</span>
        <Arrow size={22} />
      </Link>

      <div className={styles.pillsRow}>
        {["Shield", "Register", "Wait", "Claim"].map((p) => (
          <span key={p} className={styles.pill}>
            {p}
          </span>
        ))}
      </div>

      <div className={styles.illoBand}>
        <GaugeIllustration className={styles.illoSvg} />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionGrid}>
          <div>
            <h2 className={styles.display} style={{ fontSize: "clamp(40px, 6vw, 88px)" }}>
              Gauges.
            </h2>
            <p className={styles.sectionCopy}>
              Every standard-denomination bucket has a multiplier that&apos;s inversely
              proportional to its depth. Thin buckets — the ones an observer could actually pick
              apart — automatically pay the most. Split a large deposit into standard pieces and
              you raise your own weight <em>and</em> the bucket&apos;s depth. That&apos;s the
              product working, not a loophole.
            </p>
          </div>
          <ShieldIllustration className={styles.gaugeIllo} dark={false} />
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionDark}`}>
        <div className={styles.sectionGrid}>
          <div>
            <h2 className={styles.display} style={{ fontSize: "clamp(40px, 6vw, 88px)" }}>
              Private claims.
            </h2>
            <p className={styles.sectionCopy}>
              You join the crowd publicly — deposits are public by protocol design. You collect
              privately: the claim runs through the pool itself, and the reward lands directly in
              your shielded balance, unlinkable to the address that registered.
            </p>
            <Link href="/app/claim" className={styles.sectionLink}>
              See the claim flow <Arrow />
            </Link>
          </div>
          <EyeIllustration className={styles.gaugeIllo} />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionGrid}>
          <div>
            <h2 className={styles.display} style={{ fontSize: "clamp(40px, 6vw, 88px)" }}>
              Verifiable.
            </h2>
            <p className={styles.sectionCopy}>
              Every epoch&apos;s root is recomputed from public chain data — deposit events,
              registrations — and posted on-chain. The operator can censor; they can&apos;t
              secretly inflate. Anyone can run the exact same computation and check.
            </p>
            <Link href="/app/verify" className={styles.sectionLink}>
              Recompute a root <Arrow />
            </Link>
          </div>
          <GridIllustration className={styles.gaugeIllo} />
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Himitsu Protocol · MIT licensed</span>
        <div className={styles.footerLinks}>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={`${REPO}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer">
            Architecture
          </a>
          <Link href="/app">Launch app</Link>
        </div>
      </footer>
    </div>
  );
}

function Arrow({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Restrained abstract line-art: concentric gauge-dial arcs (the multiplier concept) over a
 * faint grid, with a couple of soft gradient accents — evokes the reference mood without
 * borrowing its exact icon set (which was for a wallet/exchange product, not this one). */
function GaugeIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 900 340" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="blob1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3c9d9" />
          <stop offset="100%" stopColor="#cdd9ea" />
        </linearGradient>
        <linearGradient id="blob2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d8e7b0" />
          <stop offset="100%" stopColor="#f3c9d9" />
        </linearGradient>
      </defs>
      {Array.from({ length: 10 }, (_, i) => (
        <line key={`v${i}`} x1={i * 90} y1="0" x2={i * 90} y2="340" stroke="#14140f" strokeOpacity="0.06" />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 85} x2="900" y2={i * 85} stroke="#14140f" strokeOpacity="0.06" />
      ))}
      <circle cx="330" cy="170" r="120" fill="url(#blob1)" opacity="0.55" />
      <circle cx="560" cy="120" r="70" fill="url(#blob2)" opacity="0.5" />
      {[150, 108, 66].map((r, i) => (
        <path
          key={r}
          d={`M ${330 - r} 170 A ${r} ${r} 0 0 1 ${330 + r} 170`}
          stroke="#14140f"
          strokeWidth={i === 2 ? 3 : 1.4}
          fill="none"
        />
      ))}
      <circle cx="330" cy="170" r="4" fill="#14140f" />
      <line x1="330" y1="170" x2="410" y2="95" stroke="#14140f" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="600" y="230" width="14" height="14" fill="none" stroke="#14140f" strokeWidth="1.4" />
      <rect x="760" y="60" width="14" height="14" fill="none" stroke="#14140f" strokeWidth="1.4" />
      <path d="M700 260 L707 246 L714 260 L707 274 Z" fill="#14140f" opacity="0.85" />
      <text x="480" y="180" fontFamily="ui-monospace, monospace" fontSize="14" fill="#14140f" opacity="0.7">
        depth ↓ multiplier ↑
      </text>
    </svg>
  );
}

/** A simple shielded/lock motif — deposits go in public, come out private. */
function ShieldIllustration({ className }: { className?: string; dark?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 280 280" fill="none" aria-hidden="true">
      <circle cx="140" cy="140" r="120" fill="#d8e7b0" opacity="0.35" />
      <path
        d="M140 40 L220 70 V140 C220 190 186 226 140 240 C94 226 60 190 60 140 V70 Z"
        stroke="#14140f"
        strokeWidth="3"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M110 140 L132 162 L172 118" stroke="#14140f" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Visibility motif — "everyone sees / nobody sees" (the honest-accounting theme). */
function EyeIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 280 280" fill="none" aria-hidden="true">
      <circle cx="140" cy="140" r="120" fill="#cdd9ea" opacity="0.18" />
      <path d="M50 140C80 90 200 90 230 140C200 190 80 190 50 140Z" stroke="#f5f4ef" strokeWidth="3" fill="none" />
      <circle cx="140" cy="140" r="30" stroke="#f5f4ef" strokeWidth="3" fill="none" />
      <circle cx="140" cy="140" r="8" fill="#f5f4ef" />
      <line x1="30" y1="230" x2="250" y2="50" stroke="#f5f4ef" strokeWidth="2" strokeDasharray="6 6" opacity="0.5" />
    </svg>
  );
}

/** Grid + recompute-check motif for the verifiability section. */
function GridIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 280 280" fill="none" aria-hidden="true">
      <circle cx="140" cy="140" r="120" fill="#f3c9d9" opacity="0.3" />
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`v${i}`} x1={40 + i * 40} y1="40" x2={40 + i * 40} y2="240" stroke="#14140f" strokeOpacity="0.25" />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`h${i}`} x1="40" y1={40 + i * 40} x2="240" y2={40 + i * 40} stroke="#14140f" strokeOpacity="0.25" />
      ))}
      <path d="M100 145 L130 175 L190 105" stroke="#14140f" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
