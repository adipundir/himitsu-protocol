"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheckIcon,
  CoinsIcon,
  HandCoinsIcon,
  LayoutDashboardIcon,
  MenuIcon,
  ShieldIcon,
  TableIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetPopup, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  // Mobile only — the desktop sidebar is always visible, so this stays unused (and the Sheet
  // unmounted) on desktop.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItem = (item: (typeof NAV_PRIMARY | typeof NAV_SECONDARY)[number], onNavigate?: () => void) => {
    const active =
      item.href === "/app" ? pathname === "/app" : pathname?.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
      >
        <item.Icon aria-hidden="true" />
        {item.label}
      </Link>
    );
  };

  // Shared between the desktop sidebar and the mobile Sheet — onNavigate closes the Sheet
  // after a nav click (a no-op on desktop, where nothing ever opens it).
  const navAndAccount = (onNavigate?: () => void) => (
    <>
      <nav className={styles.nav} aria-label="App">
        {NAV_PRIMARY.map((item) => navItem(item, onNavigate))}
        <div className={styles.navSep} aria-hidden="true" />
        {NAV_SECONDARY.map((item) => navItem(item, onNavigate))}
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
    </>
  );

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.wordmark}>
          <span className={styles.wordmarkKanji}>秘密</span>
          <span>Himitsu</span>
        </Link>
        {navAndAccount()}
      </aside>

      <div className={styles.mobileBar}>
        <Link href="/" className={styles.wordmark}>
          <span className={styles.wordmarkKanji}>秘密</span>
          <span>Himitsu</span>
        </Link>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger
            render={
              <Button variant="outline" size="icon" aria-label="Open menu">
                <MenuIcon />
              </Button>
            }
          />
          <SheetPopup side="left" className={styles.mobileSheet}>
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            {navAndAccount(() => setMobileNavOpen(false))}
          </SheetPopup>
        </Sheet>
      </div>

      <div className={styles.panel}>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
