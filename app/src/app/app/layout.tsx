import SiteShell from "../components/shell/SiteShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
