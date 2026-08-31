import { Anton, Inter } from "next/font/google";
import Link from "next/link";
import styles from "./home.module.css";
import HeroExplainer from "./components/home/HeroExplainer";
import ProblemSketch from "./components/home/ProblemSketch";
import ProtocolFlow from "./components/home/ProtocolFlow";
import Reveal from "./components/home/Reveal";

const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });

const REPO = "https://github.com/adipundir/himitsu-protocol";

const STEPS = [
  { title: "Deposit", detail: "Any amount, entered as standard pieces. Public by design." },
  { title: "Register", detail: "One wallet signature derives your secret. Recoverable on any device." },
  { title: "Epoch closes", detail: "Earlier deposits weigh more. The root posts on-chain for anyone to check." },
  { title: "Withdraw", detail: "Rewards land in your shielded balance. The claim is public, where it moves next is not." },
] as const;

const FEATURES = [
  {
    title: "Thin buckets pay most",
    body: "The thinner a standard bucket, the higher its multiplier, so the deposits an observer could trace most easily pay the most. Withheld fees come back as rewards for the next deposits into the same buckets.",
    href: "/app",
    link: "See the gauges",
  },
  {
    title: "Public in, private out",
    body: "Deposit any amount and it enters as standard pieces, public by protocol design. Rewards land in your shielded balance, yours to send privately or withdraw.",
    href: "/app/claim",
    link: "The withdraw flow",
  },
  {
    title: "Nothing to trust",
    body: "Epoch roots are recomputed from public chain data and posted on-chain, with the fee and every bucket earmark published beside them. Anyone can run the same computation.",
    href: "/app/verify",
    link: "Recompute a root",
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
          <Link href="/app" className={styles.launchBtn}>
            Launch app <Arrow />
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className={`${styles.display} ${styles.heroHead}`}>
            Privacy is a crowd.
            <br />
            Get paid to be in it.
          </h1>
          <p className={styles.heroSub}>
            STRK20 encrypts everything inside the pool, but its public edges leak the one thing
            that matters: the amount. Himitsu shields any amount as standard pieces that hide in
            a crowd, and pays that crowd to keep growing.
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
        <div className={styles.heroIllo}>
          <HeroExplainer />
        </div>
      </section>

      <section className={styles.problem} id="problem">
        <p className={styles.sectionLabel}>The problem</p>
        <p className={styles.sectionLead}>
          The pool&apos;s edges are public. Move a distinctive amount through and anyone can link
          entry to exit by the number alone.
        </p>
        <ProblemSketch />
      </section>

      <section className={styles.how} id="how">
        <p className={styles.sectionLabel}>The solution</p>
        <p className={styles.sectionLead}>
          Enter in standard pieces. Exit in standard pieces. The crowd is paid to exist.
        </p>
        <ProtocolFlow />
        <Reveal className={styles.stepsReveal}>
          <ol className={styles.stepGrid}>
            {STEPS.map((s, i) => (
              <li key={s.title} className={styles.stepCard}>
                <span className={`${styles.display} ${styles.stepNum}`} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={styles.stepTitle}>{s.title}</span>
                <span className={styles.stepDetail}>{s.detail}</span>
              </li>
            ))}
          </ol>
        </Reveal>
        <p className={styles.protocolNote}>
          Every arrow in the public flow is recomputable from chain data.{" "}
          <Link href="/app/verify">Recompute a root</Link>
        </p>
      </section>

      <section className={styles.featureBand}>
        <p className={`${styles.sectionLabel} ${styles.sectionLabelDark}`}>Why Himitsu</p>
        <Reveal>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => (
              <div key={f.title} className={styles.feature}>
                <h2 className={`${styles.display} ${styles.featureHead}`}>{f.title}</h2>
                <p className={styles.featureBody}>{f.body}</p>
                <Link href={f.href} className={styles.featureLink}>
                  {f.link} <Arrow size={14} />
                </Link>
              </div>
            ))}
          </div>
        </Reveal>
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
