"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheckIcon,
  CoinsIcon,
  HandCoinsIcon,
  LayoutDashboardIcon,
  ShieldIcon,
  TableIcon,
} from "lucide-react";
import SelectWallet from "../client/WalletHandle/SelectWallet";
import ThemeToggle from "./ThemeToggle";
import { useStoreWallet } from "../Wallet/walletContext";
import { useFrontendProvider } from "../client/provider/providerContext";
import { Strk20Networks } from "@/utils/constants";
import styles from "./shell.module.css";

const NAV_PRIMARY = [
  { href: "/app", label: "Dashboard", Icon: LayoutDashboardIcon },
  { href: "/app/shield", label: "Shield", Icon: ShieldIcon },
  { href: "/app/claim", label: "Claim", Icon: HandCoinsIcon },
  { href: "/app/fund", label: "Fund", Icon: CoinsIcon },
] as const;

const NAV_SECONDARY = [
  { href: "/app/non-standard", label: "Non-standard", Icon: TableIcon },
  { href: "/app/verify", label: "Verify", Icon: BadgeCheckIcon },
] as const;

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const network = Strk20Networks[providerIndex];

  const navItem = (item: (typeof NAV_PRIMARY | typeof NAV_SECONDARY)[number]) => {
    const active =
      item.href === "/app" ? pathname === "/app" : pathname?.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
        aria-current={active ? "page" : undefined}
      >
        <item.Icon aria-hidden="true" />
        {item.label}
      </Link>
    );
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.wordmark}>
          <span className={styles.wordmarkKanji}>秘密</span>
          <span>Himitsu</span>
        </Link>

        <nav className={styles.nav} aria-label="App">
          {NAV_PRIMARY.map(navItem)}
          <div className={styles.navSep} aria-hidden="true" />
          {NAV_SECONDARY.map(navItem)}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.metaRow}>
            {network && <span className={styles.networkNote}>{network}</span>}
            {isConnected && network === undefined && (
              <span className={styles.networkNote}>No pool on this network</span>
            )}
            <ThemeToggle />
          </div>
          <div className={styles.walletSlot}>
            <SelectWallet variant="nav" />
          </div>
        </div>
      </aside>

      <div className={styles.panel}>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
