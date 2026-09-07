"use client";
import { useEffect, useRef } from "react";
import { Caveat } from "next/font/google";
import rough from "roughjs";
import styles from "./protocolFlow.module.css";

/**
 * Excalidraw-style flow: rough.js draws the boxes and arrows with a hand sketch stroke,
 * Caveat carries the labels, and every caption is literal (counts and sizes, no metaphors).
 * The example is 1,234 STRK: each digit maps to a bucket, the 4 never leaves the wallet.
 * Shapes are appended on mount; the text layer renders server-side.
 */

const caveat = Caveat({ subsets: ["latin"], weight: ["500", "700"] });

const INK = "#14140f";
const SOFT = "#6b6a62";
const FAINT = "#a9a79b";
const CREAM = "#f5f4ef";

export default function ProtocolFlow() {
  const shapesRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const g = shapesRef.current;
    if (!svg || !g) return;
    g.innerHTML = "";
    const rc = rough.svg(svg);
    const add = (node: SVGGElement) => g.appendChild(node);
    const box = (x: number, y: number, w: number, h: number, opts: object = {}) =>
      add(rc.rectangle(x, y, w, h, { stroke: INK, strokeWidth: 1.4, roughness: 1.4, bowing: 1.2, ...opts }));
    const line = (x1: number, y1: number, x2: number, y2: number, opts: object = {}) =>
      add(rc.line(x1, y1, x2, y2, { stroke: SOFT, strokeWidth: 1.3, roughness: 1.2, ...opts }));
    const arrowHead = (x: number, y: number, dx: number, dy: number) => {
      // two short strokes make a sketchy arrowhead pointing along (dx, dy)
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const px = -uy, py = ux;
      line(x, y, x - 9 * ux + 5 * px, y - 9 * uy + 5 * py);
      line(x, y, x - 9 * ux - 5 * px, y - 9 * uy - 5 * py);
    };

    // 1 · deposit
    box(16, 56, 248, 46);
    line(140, 102, 140, 122);
    arrowHead(140, 124, 0, 1);
    box(16, 132, 72, 36);
    box(16, 180, 54, 30);
    box(78, 180, 54, 30);
    box(16, 222, 42, 26);
    box(66, 222, 42, 26);
    box(116, 222, 42, 26);
    box(16, 262, 160, 26, { strokeLineDash: [6, 5], stroke: FAINT });
    line(264, 180, 294, 180);
    arrowHead(296, 180, 1, 0);

    // 2 · the pool
    box(300, 52, 340, 270, {
      fill: "rgba(20, 20, 15, 0.05)",
      fillStyle: "hachure",
      hachureGap: 9,
      hachureAngle: -40,
      strokeWidth: 1.7,
    });
    for (let i = 0; i < 8; i++) box(322 + i * 37, 170, 31, 22, { strokeWidth: 1.1 });

    // 3 · exits
    const exits = [60, 150, 240];
    for (const y of exits) {
      line(640, y + 27, 664, y + 27);
      arrowHead(666, y + 27, 1, 0);
      box(670, y, 274, 54);
    }

    // the fan: exit one could be any of the eight
    for (const x of [338, 412, 486, 560, 624]) {
      line(x, 168, 668, 87, { stroke: FAINT, strokeLineDash: [4, 6], strokeWidth: 1 });
    }

    line(16, 380, 944, 380, { stroke: FAINT, strokeWidth: 1 });
  }, []);

  return (
    <div className={styles.wrap}>
      <svg
        ref={svgRef}
        className={`${styles.svg} ${caveat.className}`}
        viewBox="0 0 960 470"
        fill="none"
        role="img"
        aria-label="Example: 1,234 STRK enters as one 1000, two 100s and three 10s while 4 stays in the wallet; inside the pool the pieces sit among everyone else's; withdrawals leave on different days to different wallets; an exit of 1,000 matches all pieces of that size, so there is no unique match and no link."
      >
        <g ref={shapesRef} />

        <text x="140" y="30" textAnchor="middle" fontSize="19" fontWeight="700" fill={INK}>1. Deposit (public)</text>
        <text x="470" y="30" textAnchor="middle" fontSize="19" fontWeight="700" fill={INK}>2. Inside (encrypted)</text>
        <text x="808" y="30" textAnchor="middle" fontSize="19" fontWeight="700" fill={INK}>3. Withdraw (spread out)</text>

        <text x="140" y="86" textAnchor="middle" fontSize="21" fontWeight="700" fill={INK}>1,234 STRK</text>
        <text x="52" y="156" textAnchor="middle" fontSize="17" fontWeight="700" fill={INK}>1000</text>
        <text x="43" y="201" textAnchor="middle" fontSize="15" fontWeight="700" fill={INK}>100</text>
        <text x="105" y="201" textAnchor="middle" fontSize="15" fontWeight="700" fill={INK}>100</text>
        <text x="37" y="240" textAnchor="middle" fontSize="14" fontWeight="700" fill={INK}>10</text>
        <text x="87" y="240" textAnchor="middle" fontSize="14" fontWeight="700" fill={INK}>10</text>
        <text x="137" y="240" textAnchor="middle" fontSize="14" fontWeight="700" fill={INK}>10</text>
        <text x="96" y="280" textAnchor="middle" fontSize="15" fill={SOFT}>4 stays in your wallet</text>

        <text x="470" y="100" textAnchor="middle" fontSize="20" fontWeight="700" fill={INK}>STRK20 pool</text>
        <text x="470" y="150" textAnchor="middle" fontSize="16" fill={SOFT}>the 1,000 bucket: 8 pieces</text>
        <text x="470" y="230" textAnchor="middle" fontSize="16" fill={SOFT}>1 is yours, 7 are other people&apos;s</text>
        <text x="470" y="296" textAnchor="middle" fontSize="16" fill={SOFT}>all 8 look identical</text>

        {[
          { y: 60, amt: "1,000", addr: "0x9a…e4", when: "day 3" },
          { y: 150, amt: "100", addr: "0x51…c8", when: "day 9" },
          { y: 240, amt: "10", addr: "0x3f…b7", when: "day 16" },
        ].map((e) => (
          <g key={e.y}>
            <text x="688" y={e.y + 25} fontSize="18" fontWeight="700" fill={INK}>
              {e.amt} <tspan fontWeight="500" fill={SOFT}>→ {e.addr}</tspan>
            </text>
            <text x="688" y={e.y + 44} fontSize="14" fill={SOFT}>{e.when} · new wallet</text>
          </g>
        ))}
        <text x="700" y="130" fontSize="16" fontWeight="700" fill={INK}>1 of 8</text>

        <text x="16" y="416" fontSize="19" fill={INK}>
          <tspan fontWeight="700">The 1,000 that left matches all 8 pieces inside.</tspan>
          <tspan fill={SOFT}> No unique match, no link.</tspan>
        </text>
      </svg>
    </div>
  );
}
