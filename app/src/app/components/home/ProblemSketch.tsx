import styles from "./protocolFlow.module.css";

/**
 * The amount-matching attack in one glance: a distinctive amount crosses the pool's public
 * edges twice, and the identical number links your wallet to the fresh address with no
 * cryptography broken. Same visual language as ProtocolFlow (card chips, micro-labels,
 * thin lines); the exposure arc rides --hot, the page's one warning colour.
 *
 * Geometry notes: nodes wallet(40..270, 40..104), pool(380..580, 40..104),
 * fresh(690..920, 40..104). The two arrows run along the nodes' vertical centre y=72 with
 * 4px clearance at each node edge; their labels sit above the node tops at y=24. The
 * exposure arc leaves the wallet's bottom centre (155,108), bottoms out near y=178 and
 * lands on the fresh address's bottom centre (805,108); its chip masks the arc at (480,179).
 */

const INK = "var(--ink)";
const INK_SOFT = "var(--ink-soft)";
const LINE = "var(--line)";
const CARD = "var(--card)";
const HOT = "var(--hot)";

function Node({
  x,
  y,
  w,
  h,
  title,
  sub,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="14" fill={CARD} stroke={LINE} />
      <text
        x={x + w / 2}
        y={y + h / 2 - 4}
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill={INK}
      >
        {title}
      </text>
      <text
        x={x + w / 2}
        y={y + h / 2 + 14}
        textAnchor="middle"
        fontSize="9.5"
        letterSpacing="0.8"
        fill={INK_SOFT}
      >
        {sub}
      </text>
    </g>
  );
}

export default function ProblemSketch() {
  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox="0 0 960 204"
        fill="none"
        role="img"
        aria-label="The amount matching attack: shield 555 STRK from your wallet, withdraw 555 STRK to a fresh address, and the identical public amount links the two. Same number, linked, no cryptography broken."
      >
        <defs>
          <marker
            id="psArrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0.5L7.5 4L0 7.5" stroke={INK_SOFT} strokeWidth="1.2" fill="none" />
          </marker>
          <marker
            id="psArrowHot"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0.5L7.5 4L0 7.5" stroke={HOT} strokeWidth="1.2" fill="none" />
          </marker>
        </defs>

        {/* Nodes */}
        <Node x={40} y={40} w={230} h={64} title="Your wallet" sub="0x7a4…9c1" />
        <Node x={380} y={40} w={200} h={64} title="STRK20 pool" sub="ENCRYPTED INSIDE" />
        <Node x={690} y={40} w={230} h={64} title="Fresh address" sub="0x3fc…a12" />

        {/* Shield: wallet right edge to pool left edge */}
        <line x1="270" y1="72" x2="376" y2="72" stroke={INK_SOFT} markerEnd="url(#psArrow)" />
        <text x="323" y="24" textAnchor="middle" fontSize="10" letterSpacing="0.6" fill={INK_SOFT}>
          SHIELD 555 STRK (PUBLIC)
        </text>

        {/* Withdraw: pool right edge to fresh address left edge */}
        <line x1="580" y1="72" x2="686" y2="72" stroke={INK_SOFT} markerEnd="url(#psArrow)" />
        <text x="633" y="24" textAnchor="middle" fontSize="10" letterSpacing="0.6" fill={INK_SOFT}>
          WITHDRAW 555 STRK (PUBLIC)
        </text>

        {/* The exposure arc: bottom centre of the wallet to bottom centre of the fresh
            address, under the whole flow. Anyone watching links the two by the number. */}
        <path
          d="M155 108 C155 202, 805 202, 805 108"
          stroke={HOT}
          strokeWidth="1.5"
          markerEnd="url(#psArrowHot)"
        />
        <g>
          <rect x="320" y="168" width="320" height="20" rx="10" fill="var(--cream-alt)" />
          <text
            x="480"
            y="182"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            letterSpacing="0.6"
            fill={HOT}
          >
            SAME NUMBER. LINKED. NO CRYPTOGRAPHY BROKEN.
          </text>
        </g>
      </svg>
    </div>
  );
}
