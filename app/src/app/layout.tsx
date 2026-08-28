import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Zen_Kaku_Gothic_New({ weight: ["700", "900"], subsets: ["latin"], variable: "--font-display" });
const body = IBM_Plex_Sans({ weight: ["400", "600"], subsets: ["latin"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-mono" });

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

export const viewport = { themeColor: "#101319" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
