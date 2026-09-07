import styles from "./protocolFlow.module.css";

/**
 * The privacy story, stage by stage: a deposit is split into standard pieces (or passes
 * through untouched if it already is one), the pieces sit indistinguishable among everyone
 * else's inside the encrypted pool, withdrawals leave as standard pieces spread over time
 * to fresh wallets, and the bottom strip states why the two public edges cannot be joined.
 * Pure inline SVG (server component); colors ride the page's CSS vars.
 */

const INK = "var(--ink)";
const INK_SOFT = "var(--ink-soft)";
const INK_FAINT = "var(--ink-faint)";
const LINE = "var(--line)";
const CARD = "var(--card)";
const CREAM = "var(--cream)";

/** A standard-piece chip: identical rectangles are the whole point. */
function Chip({ x, y, w, h, label, dark }: { x: number; y: number; w: number; h: number; label?: string; dark?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4" fill={dark ? CREAM : CARD} stroke={dark ? "none" : INK} strokeWidth="1.2" />
      {label && (
        <text x={x + w / 2} y={y + h / 2 + 3.5} textAnchor="middle" fontSize={h > 28 ? 12 : 9} fontWeight="700" fill={INK}>
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
        viewBox="0 0 960 560"
        fill="none"
        role="img"
        aria-label="Flow: a deposit is split into standard pieces at the public entry, the pieces sit encrypted and indistinguishable among everyone else's inside STRK20, withdrawals leave as standard pieces spread over time to fresh wallets, and every exit matches every piece of its size, so the public edges cannot be joined."
      >
        <defs>
          <marker id="pfA" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0.5L7.5 4L0 7.5" stroke={INK_SOFT} strokeWidth="1.2" fill="none" />
          </marker>
        </defs>

        <ZoneLabel cx={140} x1={16} x2={264}>1 · your deposit · public</ZoneLabel>
        <ZoneLabel cx={470} x1={300} x2={640}>2 · inside strk20 · encrypted</ZoneLabel>
        <ZoneLabel cx={808} x1={672} x2={944}>3 · withdrawals · public, spread</ZoneLabel>

        {/* ── 1 · deposit side ── */}
        <rect x="16" y="52" width="248" height="44" rx="10" fill={CARD} stroke={INK} strokeWidth="1.2" />
        <text x="140" y="71" textAnchor="middle" fontSize="12.5" fontWeight="700" fill={INK}>Your wallet</text>
        <text x="140" y="87" textAnchor="middle" fontSize="11" fill={INK_SOFT}>4,444.44 STRK</text>

        <text x="16" y="122" fontSize="9.5" letterSpacing="1" fill={INK_SOFT}>SPLIT INTO STANDARD PIECES</text>
        <Chip x={16} y={132} w={56} h={32} label="1000" />
        <Chip x={78} y={132} w={56} h={32} label="1000" />
        <Chip x={140} y={132} w={56} h={32} label="1000" />
        <Chip x={202} y={132} w={56} h={32} label="1000" />
        <Chip x={16} y={172} w={42} h={24} label="100" />
        <Chip x={64} y={172} w={42} h={24} label="100" />
        <Chip x={112} y={172} w={42} h={24} label="100" />
        <Chip x={160} y={172} w={42} h={24} label="100" />
        <Chip x={16} y={204} w={32} h={19} label="10" />
        <Chip x={54} y={204} w={32} h={19} label="10" />
        <Chip x={92} y={204} w={32} h={19} label="10" />
        <Chip x={130} y={204} w={32} h={19} label="10" />

        <rect x="16" y="238" width="242" height="22" rx="5" stroke={INK_FAINT} strokeDasharray="4 4" />
        <text x="137" y="253" textAnchor="middle" fontSize="9.5" fill={INK_SOFT}>4.44 stays in your wallet, never deposited</text>

        <text x="16" y="284" fontSize="9.5" fill={INK_SOFT}>Already a standard amount? It enters unchanged.</text>
        <text x="16" y="300" fontSize="9.5" fill={INK_SOFT}>One batch, one pool fee. Address and pieces visible.</text>

        {/* deposit arrow */}
        <line x1="264" y1="160" x2="296" y2="160" stroke={INK_SOFT} strokeWidth="1.4" markerEnd="url(#pfA)" />

        {/* ── 2 · inside the pool ── */}
        <rect x="300" y="52" width="340" height="330" rx="16" fill={INK} />
        <text x="470" y="80" textAnchor="middle" fontSize="13" fontWeight="700" fill={CREAM}>秘密 · encrypted notes</text>

        <text x="322" y="108" fontSize="8.5" letterSpacing="1.2" fill={INK_FAINT}>THE 1,000 BUCKET · YOURS AND EVERYONE ELSE&apos;S</text>
        {Array.from({ length: 9 }, (_, i) => (
          <Chip key={`kb${i}`} x={322 + i * 33} y={116} w={28} h={20} dark />
        ))}
        <text x="322" y="156" fontSize="9" fill={INK_FAINT}>yours are in here somewhere, marked by nothing</text>

        <text x="322" y="184" fontSize="8.5" letterSpacing="1.2" fill={INK_FAINT}>THE 100 BUCKET</text>
        {Array.from({ length: 11 }, (_, i) => (
          <Chip key={`hb${i}`} x={322 + i * 27} y={192} w={22} h={15} dark />
        ))}

        <line x1="322" y1="234" x2="618" y2="234" stroke="rgba(245,244,239,0.18)" />
        <text x="322" y="262" fontSize="11" fill={CREAM}>Notes are encrypted. Balances are hidden.</text>
        <text x="322" y="284" fontSize="11" fill={CREAM}>Private transfers move value with no public record,</text>
        <text x="322" y="306" fontSize="11" fill={CREAM}>so pieces change owners without leaving a trace.</text>
        <text x="322" y="342" fontSize="10" fill={INK_FAINT}>The longer pieces sit and circulate, the less the</text>
        <text x="322" y="358" fontSize="10" fill={INK_FAINT}>entry record says about who holds what now.</text>

        {/* ── 3 · withdrawals ── */}
        {[
          { y: 60, amt: "1,000", addr: "0x9a…e4", when: "day 3 · fresh wallet" },
          { y: 148, amt: "1,000", addr: "0x51…c8", when: "day 9 · fresh wallet" },
          { y: 236, amt: "100", addr: "0x3f…b7", when: "day 16 · fresh wallet" },
        ].map((e) => (
          <g key={e.y}>
            <line x1="640" y1={e.y + 27} x2="666" y2={e.y + 27} stroke={INK_SOFT} strokeWidth="1.2" markerEnd="url(#pfA)" />
            <rect x="670" y={e.y} width="274" height="54" rx="10" fill={CARD} stroke={INK} strokeWidth="1.2" />
            <text x="688" y={e.y + 23} fontSize="12.5" fontWeight="700" fill={INK}>
              {e.amt} <tspan fontWeight="400" fill={INK_SOFT}>→ {e.addr}</tspan>
            </text>
            <text x="688" y={e.y + 41} fontSize="9.5" fill={INK_SOFT}>{e.when}</text>
          </g>
        ))}
        <text x="672" y="322" fontSize="9.5" fill={INK_SOFT}>Standard sizes. Spread in time. Different wallets.</text>
        <text x="672" y="338" fontSize="9.5" fill={INK_SOFT}>Never the full total in one move.</text>

        {/* unlink fan: the first exit could be any 1,000 in the bucket */}
        {[355, 421, 487, 553, 611].map((x) => (
          <line key={x} x1={x} y1="136" x2="668" y2="84" stroke={INK_FAINT} strokeWidth="1" strokeDasharray="3 4" opacity="0.8" />
        ))}
        <text x="672" y="128" fontSize="9.5" fontWeight="700" fill={INK}>this exit matches every 1,000 inside</text>

        {/* ── 4 · why it unlinks ── */}
        <line x1="16" y1="430" x2="944" y2="430" stroke={LINE} />
        <text x="16" y="458" fontSize="10" fontWeight="700" letterSpacing="1.4" fill={INK}>4 · WHY THE EDGES CANNOT BE JOINED</text>
        <text x="16" y="484" fontSize="12" fill={INK_SOFT}>The observer sees both edges: your pieces going in, standard pieces coming out. But every exit of a size matches</text>
        <text x="16" y="504" fontSize="12" fill={INK_SOFT}>every piece of that size inside, and private transfers reshuffle who holds what. The sum that would identify you</text>
        <text x="16" y="524" fontSize="12" fill={INK_SOFT}>has thousands of equally valid explanations. A link needs a unique match, and the crowd leaves none.</text>
      </svg>
    </div>
  );
}
