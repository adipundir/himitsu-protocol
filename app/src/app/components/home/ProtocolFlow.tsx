import styles from "./protocolFlow.module.css";

/**
 * The privacy story with a minimal example: 1,234 STRK splits so each digit maps to a
 * bucket (1×1000, 2×100, 3×10, 4 stays home). Inside, the pieces sit unmarked among
 * everyone else's; exits leave spread out in standard sizes; the dotted fan plus the one
 * closing line carry the unlinking argument. Pure inline SVG (server component).
 */

const INK = "var(--ink)";
const INK_SOFT = "var(--ink-soft)";
const INK_FAINT = "var(--ink-faint)";
const LINE = "var(--line)";
const CARD = "var(--card)";
const CREAM = "var(--cream)";

function Chip({ x, y, w, h, label, dark }: { x: number; y: number; w: number; h: number; label?: string; dark?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4" fill={dark ? CREAM : CARD} stroke={dark ? "none" : INK} strokeWidth="1.2" />
      {label && (
        <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={h > 28 ? 13 : 10} fontWeight="700" fill={INK}>
          {label}
        </text>
      )}
    </g>
  );
}

function ZoneLabel({ cx, children, x1, x2 }: { cx: number; children: string; x1: number; x2: number }) {
  return (
    <g>
      <text x={cx} y="24" textAnchor="middle" fontSize="10.5" fontWeight="700" letterSpacing="1.4" fill={INK}>
        {children.toUpperCase()}
      </text>
      <line x1={x1} y1="34" x2={x2} y2="34" stroke={INK} strokeWidth="1.5" />
    </g>
  );
}

export default function ProtocolFlow() {
  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox="0 0 960 470"
        fill="none"
        role="img"
        aria-label="Example: 1,234 STRK enters as one 1000, two 100s and three 10s while 4 stays in the wallet; inside STRK20 the pieces sit unmarked among everyone else's; withdrawals leave spread out in standard sizes; every exit matches every piece of its size, so the edges cannot be joined."
      >
        <defs>
          <marker id="pfA" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0.5L7.5 4L0 7.5" stroke={INK_SOFT} strokeWidth="1.2" fill="none" />
          </marker>
        </defs>

        <ZoneLabel cx={140} x1={16} x2={264}>1 · deposit · public</ZoneLabel>
        <ZoneLabel cx={470} x1={300} x2={640}>2 · inside · encrypted</ZoneLabel>
        <ZoneLabel cx={808} x1={672} x2={944}>3 · withdraw · spread out</ZoneLabel>

        {/* ── 1 · the split, digit by digit ── */}
        <rect x="16" y="56" width="248" height="46" rx="10" fill={CARD} stroke={INK} strokeWidth="1.2" />
        <text x="140" y="84" textAnchor="middle" fontSize="15" fontWeight="700" fill={INK}>1,234 STRK</text>

        <line x1="140" y1="102" x2="140" y2="124" stroke={INK_SOFT} strokeWidth="1.2" markerEnd="url(#pfA)" />

        <Chip x={16} y={132} w={72} h={36} label="1000" />
        <Chip x={16} y={180} w={54} h={30} label="100" />
        <Chip x={78} y={180} w={54} h={30} label="100" />
        <Chip x={16} y={222} w={42} h={26} label="10" />
        <Chip x={66} y={222} w={42} h={26} label="10" />
        <Chip x={116} y={222} w={42} h={26} label="10" />
        <rect x="16" y="262" width="150" height="26" rx="6" stroke={INK_FAINT} strokeDasharray="4 4" />
        <text x="91" y="279" textAnchor="middle" fontSize="10" fill={INK_SOFT}>4 stays in your wallet</text>

        <line x1="264" y1="180" x2="296" y2="180" stroke={INK_SOFT} strokeWidth="1.4" markerEnd="url(#pfA)" />

        {/* ── 2 · inside the pool ── */}
        <rect x="300" y="52" width="340" height="270" rx="16" fill={INK} />
        <text x="470" y="84" textAnchor="middle" fontSize="13" fontWeight="700" fill={CREAM}>秘密 encrypted notes</text>

        <text x="322" y="122" fontSize="9" letterSpacing="1.2" fill={INK_FAINT}>THE 1,000 BUCKET</text>
        {Array.from({ length: 8 }, (_, i) => (
          <Chip key={i} x={322 + i * 37} y={132} w={31} h={22} dark />
        ))}
        <text x="322" y="176" fontSize="10" fill={INK_FAINT}>yours is in here, marked by nothing</text>

        <text x="322" y="224" fontSize="11.5" fill={CREAM}>Balances hidden.</text>
        <text x="322" y="246" fontSize="11.5" fill={CREAM}>Transfers leave no public record.</text>
        <text x="322" y="290" fontSize="10" fill={INK_FAINT}>Pieces change owners invisibly.</text>

        {/* ── 3 · exits ── */}
        {[
          { y: 60, amt: "1,000", addr: "0x9a…e4", when: "day 3" },
          { y: 150, amt: "100", addr: "0x51…c8", when: "day 9" },
          { y: 240, amt: "10", addr: "0x3f…b7", when: "day 16" },
        ].map((e) => (
          <g key={e.y}>
            <line x1="640" y1={e.y + 27} x2="666" y2={e.y + 27} stroke={INK_SOFT} strokeWidth="1.2" markerEnd="url(#pfA)" />
            <rect x="670" y={e.y} width="274" height="54" rx="10" fill={CARD} stroke={INK} strokeWidth="1.2" />
            <text x="688" y={e.y + 24} fontSize="13" fontWeight="700" fill={INK}>
              {e.amt} <tspan fontWeight="400" fill={INK_SOFT}>→ {e.addr}</tspan>
            </text>
            <text x="688" y={e.y + 42} fontSize="10" fill={INK_SOFT}>{e.when} · fresh wallet</text>
          </g>
        ))}

        {/* the fan: one exit, many candidates */}
        {[340, 414, 488, 562, 625].map((x) => (
          <line key={x} x1={x} y1="152" x2="668" y2="87" stroke={INK_FAINT} strokeWidth="1" strokeDasharray="3 4" opacity="0.8" />
        ))}
        <text x="672" y="128" fontSize="10" fontWeight="700" fill={INK}>could be any of them</text>

        {/* ── the one-line why ── */}
        <line x1="16" y1="380" x2="944" y2="380" stroke={LINE} />
        <text x="16" y="414" fontSize="13" fill={INK}>
          <tspan fontWeight="700">Why the edges never join: </tspan>
          <tspan fill={INK_SOFT}>every exit matches every piece of its size. A link needs a unique match.</tspan>
        </text>
        <text x="16" y="438" fontSize="13" fill={INK_SOFT}>The crowd leaves none.</text>
      </svg>
    </div>
  );
}
