import { Anton, Inter } from "next/font/google";
import Link from "next/link";
import styles from "./home.module.css";
import ProblemSketch from "./components/home/ProblemSketch";
import ProtocolFlow from "./components/home/ProtocolFlow";
import Reveal from "./components/home/Reveal";
import ThemeToggle from "./components/shell/ThemeToggle";

const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });

const REPO = "https://github.com/adipundir/himitsu-protocol";

const FLOW_STEPS = [
  {
    title: "Deposit",
    detail: "Any amount goes in as standard pieces, public by protocol design.",
  },
  {
    title: "Withdraw",
    detail:
      "Standard pieces leave over time and hide in their crowds. You can hold or send privately in between.",
  },
] as const;

const REWARD_STEPS = [
  {
    title: "Register",
    detail:
      "One wallet signature derives your secret, and your registered pieces earn by bucket thinness.",
  },
  {
    title: "Claim",
    detail:
      "The epoch closes, the root posts on-chain for anyone to check, and the claim lands in your shielded balance.",
  },
] as const;

const COMPARE = [
  {
    name: "Zcash",
    marks: ["✓", "—", "—"],
    note: "31.5% of its shielded coins were linked by amount round-trips at the edges (Quesnelle, 2017).",
    us: false,
  },
  {
    name: "Tornado Cash",
    marks: ["—", "✓", "ended"],
    note: "It moved $7.6B through four fixed sizes. Arbitrary amounts never shipped, and mining ended in 2021.",
    us: false,
  },
  {
    name: "Namada",
    marks: ["✓", "—", "✓"],
    note: "It pays for its shielded set on its own chain, but amounts still fingerprint the edges.",
    us: false,
  },
  {
    name: "STRK20 alone",
    marks: ["✓", "—", "—"],
    note: "It is encrypted inside, on Starknet, but amounts are printed in plain sight at both edges.",
    us: false,
  },
  {
    name: "Himitsu on STRK20",
    marks: ["✓", "✓", "✓"],
    note: "It puts standard pieces at the edges and pays to fill the thin buckets, on the live mainnet pool.",
    us: true,
  },
] as const;

export default function MarketingHome() {
  return (
    <div className={`${styles.page} ${anton.variable} ${inter.variable}`}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark}>
          <span className={styles.wordmarkKanji}>秘密</span>
          <span>Himitsu</span>
        </Link>
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
          <ThemeToggle />
          <Link href="/app" className={styles.launchBtn}>
            Launch app <Arrow />
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className={`${styles.display} ${styles.heroHead}`}>
            {(
              [
                { t: "We" },
                { t: "fix" },
                { t: "the" },
                { t: "amount-matching", hot: true },
                { t: "problem" },
                { t: "in" },
                { t: "STRK20." },
              ] as Array<{ t: string; hot?: boolean }>
            ).map((w, i) => (
              <span key={i} className={styles.wordMask}>
                <span className={styles.word} style={{ animationDelay: `${0.1 + i * 0.09}s` }}>
                  {w.hot ? <span className={styles.heroMark}>{w.t}</span> : w.t}
                </span>
              </span>
            ))}
          </h1>
          <p className={styles.heroSub}>
            A distinctive amount links your entry to your exit on the public record.
            Himitsu splits any deposit into standard pieces that disappear into the crowd.
          </p>
          <div className={styles.heroActions}>
            <Link href="/app/shield" className={styles.heroCta}>
              Deposit &amp; earn <Arrow size={18} />
            </Link>
            <a href="#how" className={styles.heroSecondary}>
              How it works
            </a>
          </div>
        </div>
      </section>

      <section className={styles.problem} id="problem">
        <p className={styles.sectionLabel}>The problem</p>
        <h2 className={`${styles.display} ${styles.sectionHead}`}>Your deposit amount is visible to everyone.</h2>
        <p className={styles.sectionExplain}>
          The pool encrypts what happens inside, but deposits and withdrawals are printed on
          the public record. If your amount is distinctive, anyone can match the number and
          link your entry to your exit.
        </p>
        <ProblemSketch />
      </section>

      <section className={styles.how} id="how">
        <p className={styles.sectionLabel}>The solution</p>
        <h2 className={`${styles.display} ${styles.sectionHead}`}>Your deposit is split into standard pieces.</h2>
        <p className={styles.sectionExplain}>
          Type 3,742 and one pool transaction deposits it as three 1,000s, seven 100s and
          four 10s. The 2 STRK remainder stays in your wallet, so no odd number ever touches
          the public record.
        </p>
        <div className={styles.splitRow} aria-label="3,742 STRK split into standard pieces">
          <span className={`${styles.display} ${styles.splitEq}`}>3,742 =</span>
          {["1000", "1000", "1000"].map((v, i) => (
            <span key={`k${i}`} className={`${styles.display} ${styles.splitChip} ${styles.splitChipK}`}>{v}</span>
          ))}
          {Array.from({ length: 7 }, (_, i) => (
            <span key={`h${i}`} className={`${styles.display} ${styles.splitChip} ${styles.splitChipH}`}>100</span>
          ))}
          {Array.from({ length: 4 }, (_, i) => (
            <span key={`t${i}`} className={`${styles.display} ${styles.splitChip} ${styles.splitChipT}`}>10</span>
          ))}
          <span className={styles.splitChange}>2 STRK stays in your wallet</span>
        </div>
        <Reveal className={styles.stepsReveal}>
          <div className={styles.stepGroups}>
            <div>
              <p className={styles.stepGroupLabel}>The privacy flow</p>
              <ol className={styles.stepGrid}>
                {FLOW_STEPS.map((s, i) => (
                  <li key={s.title} className={styles.stepCard}>
                    <span className={`${styles.display} ${styles.stepNum}`} aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className={styles.stepTitle}>{s.title}</span>
                    <span className={styles.stepDetail}>{s.detail}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className={`${styles.stepGroupLabel} ${styles.stepGroupLabelGo}`}>
                In parallel: the rewards
              </p>
              <ol className={styles.stepGrid}>
                {REWARD_STEPS.map((s, i) => (
                  <li key={s.title} className={`${styles.stepCard} ${styles.stepCardGo}`}>
                    <span className={`${styles.display} ${styles.stepNum}`} aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className={styles.stepTitle}>{s.title}</span>
                    <span className={styles.stepDetail}>{s.detail}</span>
                  </li>
                ))}
              </ol>
              <p className={styles.stepGroupNote}>
                Who pays: anyone can fund the pot on-chain; today the team seeds it. A 0.5%
                fee on every reward refills it, and the fee never touches your deposit.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className={styles.how} id="flow">
        <p className={styles.sectionLabel}>Protocol flow</p>
        <h2 className={`${styles.display} ${styles.sectionHead}`}>This is how the money moves.</h2>
        <p className={styles.sectionExplain}>
          STRK20 protects the inside. The wallet does the transfers. Himitsu protects the
          edges.
        </p>
        <ProtocolFlow />
      </section>

      <section className={styles.compare}>
        <p className={styles.sectionLabel}>Compared</p>
        <h2 className={`${styles.display} ${styles.sectionHead}`}>Other pools leave amounts exposed.</h2>
        <p className={styles.sectionExplain}>
          Every pool hides what happens inside. The difference is what shows when money
          goes in and out.
        </p>
        <Reveal>
          <div className={styles.compareScroll}>
            <div className={styles.compareTable} role="table" aria-label="Protocol comparison">
              <div className={`${styles.compareRow} ${styles.compareHead}`} role="row">
                <span role="columnheader">Protocol</span>
                <span role="columnheader">Any amount</span>
                <span role="columnheader">Standard edges</span>
                <span role="columnheader">Paid crowd</span>
                <span role="columnheader" className={styles.compareNoteHead}>
                  The record
                </span>
              </div>
              {COMPARE.map((c) => (
                <div
                  key={c.name}
                  className={`${styles.compareRow} ${c.us ? styles.compareUs : ""}`}
                  role="row"
                >
                  <span className={styles.compareName} role="cell">
                    {c.name}
                  </span>
                  {c.marks.map((m, i) => (
                    <span key={i} className={styles.compareMark} data-yes={m === "✓"} role="cell">
                      {m}
                    </span>
                  ))}
                  <span className={styles.compareNote} role="cell">
                    {c.note}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>


      <footer className={styles.footerBand}>
        <div className={styles.footerTop}>
          <div>
            <p className={styles.footerMark}>秘密 Himitsu</p>
            <p className={styles.footerTagline}>
              Shield any amount of STRK and disappear into the crowd.
            </p>
          </div>
          <div className={styles.footerCols}>
            <div className={styles.footerCol}>
              <p className={styles.footerColHead}>Product</p>
              <Link href="/app/shield">Deposit</Link>
              <Link href="/app">Earn</Link>
              <Link href="/app/claim">Withdraw</Link>
              <Link href="/app/verify">Verify</Link>
            </div>
            <div className={styles.footerCol}>
              <p className={styles.footerColHead}>Resources</p>
              <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
              <a href={`${REPO}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer">Architecture</a>
              <a href={`${REPO}/blob/main/README.md`} target="_blank" rel="noreferrer">README</a>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} Himitsu Protocol · MIT licensed</span>
          <span>Built on Starknet&apos;s STRK20 privacy pool</span>
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
