"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  ShieldIcon,
  DownloadIcon,
  CirclePlusIcon,
  TableIcon,
  BadgeCheckIcon,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import SelectWallet from "../client/WalletHandle/SelectWallet";
import { useStoreWallet } from "../Wallet/walletContext";
import { useFrontendProvider } from "../client/provider/providerContext";
import { Strk20Networks } from "@/utils/constants";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/app/shield", label: "Shield", icon: ShieldIcon },
  { href: "/app/claim", label: "Claim", icon: DownloadIcon },
  { href: "/app/fund", label: "Fund", icon: CirclePlusIcon },
] as const;

const SECONDARY_NAV = [
  { href: "/app/non-standard", label: "Non-standard", icon: TableIcon },
  { href: "/app/verify", label: "Verify", icon: BadgeCheckIcon },
] as const;

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const network = Strk20Networks[providerIndex];
  const isMainnet = network === "MAINNET";
  // Claim and Verify read as a distinct, canvas-alt "different mode" screen — THEME.md §6.
  const altBg = pathname?.startsWith("/app/claim") || pathname?.startsWith("/app/verify");

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link
            href="/app"
            className="flex items-center gap-2 px-2 py-1.5 text-sidebar-foreground hover:text-sidebar-accent-foreground"
          >
            <span className="text-lg leading-none">秘密</span>
            <span className="font-heading text-base group-data-[collapsible=icon]:hidden">Himitsu</span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu className="px-2">
            {NAV.map((item) => {
              const active = item.href === "/app" ? pathname === "/app" : pathname?.startsWith(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton render={<Link href={item.href} />} isActive={active} tooltip={item.label}>
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>

          <SidebarSeparator />

          <SidebarMenu className="px-2">
            {SECONDARY_NAV.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton render={<Link href={item.href} />} isActive={active} tooltip={item.label}>
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="gap-3 group-data-[collapsible=icon]:items-center">
          {network && (
            <Badge
              variant={isMainnet ? "info" : "secondary"}
              className="w-fit group-data-[collapsible=icon]:hidden"
            >
              {network}
            </Badge>
          )}
          {isConnected && network === undefined && (
            <Badge variant="warning" className="w-fit group-data-[collapsible=icon]:hidden">
              No STRK20 pool on this network
            </Badge>
          )}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SelectWallet variant="nav" />
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        {/* Only visible below md — desktop keeps the sidebar always on-screen, but the
            mobile Sheet drawer (from collapsible="icon") has no other way to open. */}
        <div className="flex items-center gap-2 border-border border-b px-4 py-2 md:hidden">
          <SidebarTrigger />
          <span className="font-heading text-sm text-foreground">秘密 Himitsu</span>
        </div>

        {/* Dashboard/Shield/Fund sit on --canvas; Claim/Verify get --canvas-alt to read as a
            distinct "mode" — THEME.md §6. Neither is shadcn's own --background (mapped to
            --canvas-alt, the page's outer backdrop) — this is the more specific per-screen
            surface, so it's set directly. Plain <div>, not <main> — SidebarInset already
            renders the page's one <main> landmark. */}
        <div className={altBg ? "mx-auto w-full max-w-[1160px] flex-1 bg-[var(--canvas-alt)] p-8 max-md:p-4" : "mx-auto w-full max-w-[1160px] flex-1 bg-[var(--canvas)] p-8 max-md:p-4"}>
          {children}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-border border-t px-8 py-6">
          <p className="caption max-w-[640px]">
            Deposits and registrations are public by protocol design; what stays private is where a
            claimed reward moves next.
          </p>
          <Link href="/app/verify" className="whitespace-nowrap text-primary text-sm hover:underline">
            Verify the math →
          </Link>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
