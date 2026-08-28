import { Anton, Inter } from "next/font/google";
import Link from "next/link";
import styles from "./home.module.css";
import HeroExplainer from "./components/home/HeroExplainer";
import ProtocolFlow from "./components/home/ProtocolFlow";
import Reveal from "./components/home/Reveal";

const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });

const REPO = "https://github.com/adipundir/himitsu-protocol";

const STEPS = [
  { title: "Shield", detail: "Deposit a standard amount. Public by design." },
  { title: "Register", detail: "Commit a secret only you hold." },
  { title: "Epoch closes", detail: "The root posts on-chain. Anyone can check it." },
  { title: "Claim", detail: "Rewards land privately in your shielded balance." },
] as const;

const FEATURES = [
  {
    title: "Thin buckets pay most",
    body: "Every standard bucket has a multiplier that rises as it thins. The deposits an observer could trace most easily pay the most.",
    href: "/app",
    link: "See the gauges",
  },
  {
    title: "Public in, private out",
    body: "Deposits are public by protocol design. Claims land unlinkable in your shielded balance, yours to send privately or withdraw.",
    href: "/app/claim",
    link: "The claim flow",
  },
  {
    title: "Nothing to trust",
    body: "Epoch roots are recomputed from public chain data and posted on-chain. Anyone can run the same computation.",
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
            Anonymity mining for Starknet&apos;s STRK20 pool. Shield a standard amount, deepen
            its crowd, and earn from the sponsor pot each epoch. Claims land privately.
          </p>
          <div className={styles.heroActions}>
            <Link href="/app/shield" className={styles.heroCta}>
              Shield &amp; earn <Arrow size={18} />
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

      <section className={styles.how} id="how">
        <p className={styles.sectionLabel}>How it works</p>
        <Reveal>
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
      </section>

      <section className={styles.protocol}>
        <p className={styles.sectionLabel}>Protocol flow</p>
        <ProtocolFlow />
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
