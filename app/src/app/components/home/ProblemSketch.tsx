"use client";
import { useEffect, useRef } from "react";
import { Caveat } from "next/font/google";
import rough from "roughjs";
import styles from "./protocolFlow.module.css";

/**
 * The amount-matching attack, drawn in the same Excalidraw style as ProtocolFlow:
 * rough.js sketch strokes, Caveat labels, literal captions. 555 goes in from your wallet,
 * 555 comes out to a fresh address, and the red arc carries the match: 555 = 555.
 */

const caveat = Caveat({ subsets: ["latin"], weight: ["500", "700"] });

const INK = "#14140f";
const SOFT = "#6b6a62";
const HOT = "#fe4a3c";

export default function ProblemSketch() {
  const shapesRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const g = shapesRef.current;
    if (!svg || !g) return;
    g.innerHTML = "";
    const rc = rough.svg(svg);
    const add = (node: SVGGElement) => g.appendChild(node);
    const line = (x1: number, y1: number, x2: number, y2: number, opts: object = {}) =>
      add(rc.line(x1, y1, x2, y2, { stroke: SOFT, strokeWidth: 1.3, roughness: 1.2, ...opts }));
    const arrowHead = (x: number, y: number, dx: number, dy: number, opts: object = {}) => {
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const px = -uy, py = ux;
      line(x, y, x - 9 * ux + 5 * px, y - 9 * uy + 5 * py, opts);
      line(x, y, x - 9 * ux - 5 * px, y - 9 * uy - 5 * py, opts);
    };

    // three nodes
    add(rc.rectangle(40, 40, 230, 64, { stroke: INK, strokeWidth: 1.4, roughness: 1.4, bowing: 1.2 }));
    add(rc.rectangle(380, 40, 200, 64, { stroke: INK, strokeWidth: 1.4, roughness: 1.4, bowing: 1.2 }));
    add(rc.rectangle(690, 40, 230, 64, { stroke: INK, strokeWidth: 1.4, roughness: 1.4, bowing: 1.2 }));

    // deposit and withdrawal arrows
    line(270, 72, 374, 72);
    arrowHead(376, 72, 1, 0);
    line(580, 72, 684, 72);
    arrowHead(686, 72, 1, 0);

    // the match arc, in the warning colour
    add(rc.path("M155 108 C155 202, 805 202, 805 108", { stroke: HOT, strokeWidth: 1.6, roughness: 1.3 }));
    arrowHead(805, 112, 0, -1, { stroke: HOT });
  }, []);

  return (
    <div className={styles.wrap}>
      <svg
        ref={svgRef}
        className={`${styles.svg} ${caveat.className}`}
        viewBox="0 0 960 265"
        fill="none"
        role="img"
        aria-label="Deposit 555 STRK from your wallet, withdraw 555 STRK to a fresh address. Both events are public, and matching the number connects your wallet to the new address."
      >
        <g ref={shapesRef} />

        <text x="155" y="68" textAnchor="middle" fontSize="18" fontWeight="700" fill={INK}>Your wallet</text>
        <text x="155" y="90" textAnchor="middle" fontSize="13" fill={SOFT}>0x7a4…9c1</text>
        <text x="480" y="68" textAnchor="middle" fontSize="18" fontWeight="700" fill={INK}>STRK20 pool</text>
        <text x="480" y="90" textAnchor="middle" fontSize="13" fill={SOFT}>encrypted inside</text>
        <text x="805" y="68" textAnchor="middle" fontSize="18" fontWeight="700" fill={INK}>Fresh address</text>
        <text x="805" y="90" textAnchor="middle" fontSize="13" fill={SOFT}>0x3fc…a12</text>

        <text x="323" y="28" textAnchor="middle" fontSize="15" fill={SOFT}>deposits 555 STRK · public</text>
        <text x="633" y="28" textAnchor="middle" fontSize="15" fill={SOFT}>555 STRK arrives · public</text>

        <text x="480" y="168" textAnchor="middle" fontSize="21" fontWeight="700" fill={HOT}>555 = 555</text>
        <text x="480" y="242" textAnchor="middle" fontSize="15" fill={SOFT}>
          Both events are public. Matching the number connects your wallet to the new address.
        </text>
      </svg>
    </div>
  );
}
