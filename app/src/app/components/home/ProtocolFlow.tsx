import styles from "./protocolFlow.module.css";

/**
 * The system view, following ARCHITECTURE.md's overview exactly: deposit and register from
 * the wallet, sponsors fund the vault, the indexer reads public pool + vault events and the
 * epoch root is posted back (operator-signed, recomputable by anyone), claims run through
 * the pool which calls the vault's privacy_invoke, and the reward crosses the boundary into
 * the private flow. Pure inline SVG (server component); colors ride the page's CSS vars.
 *
 * Geometry notes: nodes are wallet(50..220, 80..136), sponsors(50..220, 206..262),
 * pool(310..490, 80..136), vault(310..490, 196..272), indexer(310..490, 340..402),
 * shielded(700..912, 166..238). Every edge endpoint sits on a node border.
 */

const INK_SOFT = "var(--ink-soft)";
const LINE = "var(--line)";
const CARD = "var(--card)";
const INK = "var(--ink)";
const GO = "#2e7d54";

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
        {sub.toUpperCase()}
      </text>
    </g>
  );
}

/** Plain label floating next to its edge. */
function EdgeLabel({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" fontSize="10" letterSpacing="0.6" fill={INK_SOFT}>
      {children.toUpperCase()}
    </text>
  );
}

/** Label with a background chip, for labels that sit on top of a line. */
function EdgeChip({ x, y, children }: { x: number; y: number; children: string }) {
  const w = children.length * 6.4 + 14;
  return (
    <g>
      <rect x={x - w / 2} y={y - 11} width={w} height={16} rx="8" fill="var(--cream-alt)" />
      <text x={x} y={y + 1} textAnchor="middle" fontSize="10" letterSpacing="0.6" fill={INK_SOFT}>
        {children.toUpperCase()}
      </text>
    </g>
  );
}

export default function ProtocolFlow() {
  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox="0 0 960 440"
        fill="none"
        role="img"
        aria-label="Protocol flow: deposits, registration, funding, epoch roots and events are public and verifiable; the claim crosses into the private flow as a shielded balance."
      >
        <defs>
          <marker id="pfArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0.5L7.5 4L0 7.5" stroke={INK_SOFT} strokeWidth="1.2" fill="none" />
          </marker>
          <marker id="pfArrowGo" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0.5L7.5 4L0 7.5" stroke={GO} strokeWidth="1.2" fill="none" />
          </marker>
        </defs>

        {/* Zones */}
        <rect x="16" y="34" width="606" height="390" rx="18" stroke={LINE} />
        <rect x="668" y="34" width="276" height="390" rx="18" stroke={LINE} strokeDasharray="5 6" />
        <g>
          <rect x="36" y="24" width="102" height="21" rx="10.5" fill="var(--cream-alt)" stroke={INK} />
          <text x="87" y="38" textAnchor="middle" fontSize="10" fontWeight="700" letterSpacing="0.8" fill={INK}>
            PUBLIC FLOW
          </text>
          <rect x="688" y="24" width="108" height="21" rx="10.5" fill="var(--cream-alt)" stroke={INK_SOFT} />
          <text x="742" y="38" textAnchor="middle" fontSize="10" fontWeight="700" letterSpacing="0.8" fill={INK_SOFT}>
            PRIVATE FLOW
          </text>
        </g>

        {/* Nodes */}
        <Node x={50} y={80} w={170} h={56} title="Your wallet" sub="deposits + registers" />
        <Node x={50} y={206} w={170} h={56} title="Sponsors" sub="anyone can fund the pot" />
        <Node x={310} y={80} w={180} h={56} title="STRK20 pool" sub="public edges only" />
        <Node x={310} y={196} w={180} h={76} title="HimitsuVault" sub="pot · roots · claims" />
        <Node x={290} y={340} w={220} h={66} title="Indexer" sub="gauges · thin buckets pay most" />
        <g>
          <rect x="690" y="150" width="232" height="96" rx="14" fill={CARD} stroke={LINE} />
          <text x="806" y="185" textAnchor="middle" fontSize="14" fontWeight="700" fill={INK}>
            Shielded balance
          </text>
          <text x="806" y="206" textAnchor="middle" fontSize="12" fontWeight="600" fill={GO}>
            秘密 · + your reward
          </text>
          <text x="806" y="226" textAnchor="middle" fontSize="9" letterSpacing="0.7" fill={INK_SOFT}>
            SEND PRIVATELY · WITHDRAW ANYTIME
          </text>
        </g>

        {/* 1 · deposit: wallet right edge to pool left edge */}
        <line x1="220" y1="100" x2="306" y2="100" stroke={INK_SOFT} markerEnd="url(#pfArrow)" />
        <EdgeLabel x={262} y={90}>1 · deposit</EdgeLabel>

        {/* 2 · register: wallet right edge to vault left edge */}
        <line x1="220" y1="124" x2="306" y2="216" stroke={INK_SOFT} markerEnd="url(#pfArrow)" />
        <EdgeLabel x={230} y={180}>2 · register</EdgeLabel>

        {/* 3 · fund: sponsors right edge to vault left edge */}
        <line x1="220" y1="240" x2="306" y2="240" stroke={INK_SOFT} markerEnd="url(#pfArrow)" />
        <EdgeLabel x={262} y={232}>3 · fund</EdgeLabel>

        {/* privacy_invoke: the pool calls the vault on claims; the open note returns */}
        <line
          x1="400"
          y1="136"
          x2="400"
          y2="196"
          stroke={INK_SOFT}
          markerStart="url(#pfArrow)"
          markerEnd="url(#pfArrow)"
        />
        <EdgeChip x={400} y={166}>privacy_invoke</EdgeChip>

        {/* 4 · public events: pool (around the right) and vault (straight down) to indexer */}
        <path d="M490 96 H590 V373 H516" stroke={INK_SOFT} markerEnd="url(#pfArrow)" />
        <line x1="440" y1="272" x2="440" y2="334" stroke={INK_SOFT} markerEnd="url(#pfArrow)" />
        <EdgeLabel x={478} y={310}>4 · events</EdgeLabel>

        {/* 5 · post_root: epoch root back onto the vault, write-once */}
        <line x1="360" y1="340" x2="360" y2="278" stroke={INK_SOFT} markerEnd="url(#pfArrow)" />
        <EdgeLabel x={316} y={310}>5 · post_root</EdgeLabel>

        {/* 6 · claim after cliff: through the pool, across the boundary, lands shielded */}
        <line
          x1="490"
          y1="124"
          x2="684"
          y2="192"
          stroke={GO}
          strokeDasharray="5 6"
          markerEnd="url(#pfArrowGo)"
        />
        <EdgeChip x={588} y={136}>6 · claim reward after cliff</EdgeChip>
      </svg>
    </div>
  );
}
