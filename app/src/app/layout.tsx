import type { Metadata } from "next";
import { Anton, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

// Inter loads once and covers both the UI font (--font-inter, used everywhere) and coss's
// --font-heading token (aliased to it in globals.css) — no need for a second Inter instance.
// Replaces Nunito, whose rounded letterforms read as too playful/"kidish" for this product.
// Geist Mono (coss's default) replaced IBM Plex Mono; named --font-geist-mono rather than
// the bare --font-mono coss's own docs suggest, since that name collides with our existing
// semantic --font-mono token (addresses/hashes/tx ids only, never display numbers) — the
// semantic token aliases to this one explicitly in globals.css instead.
// Anton is the display face (--font-display in globals.css): h1/.display page titles, the
// same face the homepage's headlines use — next/font dedupes its duplicate load there.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-inter" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton" });

export const metadata: Metadata = {
  metadataBase: new URL("https://himitsu-protocol.vercel.app"),
  title: "Himitsu Protocol",
  description: "Anonymity mining for the STRK20 pool. Privacy that pays.",
  openGraph: {
    title: "Himitsu Protocol",
    description:
      "Get paid to deepen Starknet's anonymity set. Shield round denominations into the STRK20 pool, register, and claim rewards straight into your shielded balance.",
    siteName: "Himitsu Protocol",
    type: "website",
  },
};

export const viewport = { themeColor: "#f5f4ef" };

// Sets data-theme before paint so there's no flash of the wrong theme. Light is the hard
// default — system prefers-color-scheme is never consulted, only an explicit saved choice.
const THEME_INIT = `(function(){try{var t=localStorage.getItem("himitsu.theme")==="dark"?"dark":"light";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // next/font's variable classes go on <html>, not <body>: globals.css's --font-ui (in
    // :root) references var(--font-inter), and a custom property's var() resolves against
    // the cascade at its OWN declaration point, not lazily wherever it's later used — so if
    // --font-inter were only defined on <body>, --font-ui would already be invalid by the
    // time it's computed at :root, and body would just inherit that broken value.
    <html
      lang="en"
      data-theme="light"
      // The init script below sets the real data-theme before hydration when a "dark" choice
      // was saved, so the client's attribute intentionally differs from this server-rendered
      // default — suppress the one-time React warning for that specific, expected mismatch.
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} ${anton.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      {/* No SiteShell here — the marketing homepage (/) has its own chrome. /app/* gets
          SiteShell from its own nested layout (src/app/app/layout.tsx). */}
      <body style={{ fontFamily: "var(--font-ui)" }}>{children}</body>
    </html>
  );
}
