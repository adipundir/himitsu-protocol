"use client";
import { useState } from "react";
import styles from "./page.module.css";
import SelectWallet from "./components/client/WalletHandle/SelectWallet";
import { useStoreWallet } from "./components/Wallet/walletContext";
import { useFrontendProvider } from "./components/client/provider/providerContext";
import { Strk20Networks } from "@/utils/constants";
import Earn from "./components/himitsu/Earn";
import Claim from "./components/himitsu/Claim";
import Fund from "./components/himitsu/Fund";
import Depth from "./components/himitsu/Depth";

const TABS = ["Earn", "Claim", "Fund", "Depth"] as const;

export default function Home() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Earn");
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const network = Strk20Networks[providerIndex];

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.kanji}>秘密</span>
          <div>
            <h1 className={styles.title}>Himitsu Protocol</h1>
            <p className={styles.tagline}>Anonymity mining for the STRK20 pool. Privacy that pays.</p>
          </div>
        </div>
        <div className={styles.headRight}>
          {network && <span className={styles.net}>{network}</span>}
          <SelectWallet variant="nav" />
        </div>
      </header>

      {!network && isConnected && (
        <div className={styles.banner}>This network has no STRK20 pool — switch your wallet to Starknet mainnet.</div>
      )}

      <nav className={styles.tabs} aria-label="Sections">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? styles.tabOn : styles.tab} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <section className={styles.panel}>
        {tab === "Earn" && <Earn />}
        {tab === "Claim" && <Claim />}
        {tab === "Fund" && <Fund />}
        {tab === "Depth" && <Depth />}
      </section>

      <footer className={styles.footer}>
        <span>Deposits and claims are public by protocol design; what stays private is where a claimed reward moves next. Read the <a href="https://github.com/adipundir/himitsu-protocol/blob/main/ARCHITECTURE.md" target="_blank" rel="noreferrer">honest privacy accounting</a>.</span>
      </footer>
    </main>
  );
}
