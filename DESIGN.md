# Himitsu — design implementation spec

Target: `app/` (Next.js, Starknet Wallet API).
Audience: whoever implements the UI. Follow this literally unless it conflicts with a contract or indexer constraint, in which case flag it rather than improvising.

---

## 1. What this product actually is

Himitsu pays people to deepen the anonymity set of the STRK20 privacy pool. A user deposits a standard denomination (100 / 1k / 10k) into the pool, registers a commitment, waits out a vest cliff, and claims a reward that lands as a shielded note.

Two things follow from that, and they drive every decision below:

**There is no balance to display.** Every crypto dashboard opens with the user's total portfolio value. Himitsu cannot and must not. The user's shielded balance is private; showing it would defeat the product. The hero number is not theirs — it is the crowd's.

**The reward is inversely proportional to bucket depth.** Thin buckets pay more. So the interface has to make depth legible at a glance and make the trade-off honest: a thin bucket pays well *and* exposes you more. Never present high multipliers as pure upside.

---

## 2. Principles, and the things we are explicitly not building

**Principles**

1. Depth is the hero. The dashboard is the landing page. There is no marketing page with a "Launch app" button.
2. Every screen states what it reveals and what it hides. This is a persistent UI element, not a docs footnote.
3. Colour encodes magnitude or nothing. No decorative per-row colour.
4. Sybil-splitting is the product. The UI should actively suggest splitting a large amount into standard denominations.
5. Honest about limits. Claims are publicly linkable to the registering address. Say so, in the interface, at the moment it matters.

**Non-goals — do not build these**

- Dark near-black canvas with a violet gradient and glass cards. This is the genre default; we are deliberately outside it.
- A giant portfolio number top-left.
- Area charts with gradient fills under the line. There is no price series here worth charting.
- Micro-sparklines in table cells.
- Fake density. If a table has four meaningful columns, it has four columns.
- Confetti, glow, neon, or any "success!" celebration on claim. The tone is quiet.

---

## 3. Tokens

Light is the default mode. Dark mode is indigo-black, never neutral black.

```css
:root {
  /* Ground — linen, not cream. Deliberately cooler and greyer than the usual off-white. */
  --paper:          #EAE8E1;
  --paper-raised:   #F5F4EF;
  --paper-sunk:     #DEDCD4;

  /* Ink */
  --sumi:           #14161C;
  --sumi-70:        #4A4E58;
  --sumi-45:        #7C818C;
  --sumi-25:        #A9AEB8;

  /* Indigo — ai-zome. The brand colour. Used for structure, links, primary action. */
  --ai-900:         #0D1726;
  --ai-700:         #1D3557;
  --ai-500:         #2E5C8A;
  --ai-300:         #7FA3C4;
  --ai-100:         #D6E2EE;

  /* Heat ramp — five stops, thin (hot) to deep (cool). ONLY used to encode bucket depth. */
  --heat-1:         #C4361F;  /* critically thin  */
  --heat-2:         #DD6B3E;  /* thin             */
  --heat-3:         #B8873A;  /* filling          */
  --heat-4:         #4A7A63;  /* healthy          */
  --heat-5:         #1D3557;  /* deep             */

  /* Heat washes — the same five as backgrounds. Text on these uses --sumi. */
  --heat-1-wash:    #F7E4E0;
  --heat-2-wash:    #FAEAE1;
  --heat-3-wash:    #F5EDDC;
  --heat-4-wash:    #E3ECE7;
  --heat-5-wash:    #DDE4EC;

  /* State */
  --danger:         #A32D2D;
  --warn:           #8A6410;

  /* Geometry */
  --r-control:       6px;
  --r-card:         12px;
  --hairline:       1px solid rgba(20,22,28,0.12);
  --hairline-strong:1px solid rgba(20,22,28,0.24);

  /* Space — 4px base */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;
}

[data-theme="dark"] {
  --paper:          #0D1726;
  --paper-raised:   #14202F;
  --paper-sunk:     #091220;
  --sumi:           #E8EAED;
  --sumi-70:        #A7AEB9;
  --sumi-45:        #737C89;
  --sumi-25:        #4A525E;
  --ai-100:         #1D3557;
  --ai-300:         #2E5C8A;
  --ai-500:         #7FA3C4;
  --ai-700:         #A8C2DA;
  --hairline:       1px solid rgba(232,234,237,0.14);
  --heat-1-wash:    #3A1712; --heat-2-wash: #40200F;
  --heat-3-wash:    #34290E; --heat-4-wash: #14261E;
  --heat-5-wash:    #16243A;
}
```

Heat is never the only channel. Every heated element also carries the depth count and the multiplier as text. Verify by taking a greyscale screenshot: the meaning must survive.

---

## 4. Typography

Three roles. Load from Fontshare and Google Fonts; both are free for commercial use.

| Role | Face | Used for |
|---|---|---|
| UI | **Switzer** (Fontshare) | Everything by default. Weights 400 and 500 only. |
| Numerals | **Geist Mono** (Google) | Every number, address, hash, multiplier, countdown. Must be `font-variant-numeric: tabular-nums`. |
| Display | **Instrument Serif** (Google) | Exactly three places, listed below. Nowhere else. |

Do not use Inter. It is the default of every shot in this category and reads as unconsidered.

**Instrument Serif appears only:**
1. The wordmark lockup — `秘密` in Noto Serif JP beside "Himitsu".
2. The single line of copy under each empty state.
3. The one-line thesis on the verify page.

**Scale**

```
display   32px / 1.15 / 400   Instrument Serif
h1        24px / 1.25 / 500
h2        18px / 1.35 / 500
body      15px / 1.6  / 400
label     13px / 1.4  / 400   --sumi-70
caption   12px / 1.4  / 400   --sumi-45
numeral-l 28px / 1.0  / 400   Geist Mono, tabular
numeral-m 15px / 1.2  / 400   Geist Mono, tabular
```

Sentence case everywhere. No terminal punctuation on labels, headings, or buttons. Helper text and empty-state body copy do take a period.

---

## 5. Motion

```css
--dur-fast: 120ms;
--dur-base: 220ms;
--dur-slow: 380ms;
--ease:     cubic-bezier(0.2, 0, 0, 1);
```

Everything respects `prefers-reduced-motion: reduce` — under reduce, transitions collapse to opacity-only at `--dur-fast`, and the noren transition becomes an instant state change.

There is exactly one orchestrated motion moment in the whole app (§6). Everything else is a 120ms hover or a 220ms enter. No ambient animation, no floating particles, no parallax.

---

## 6. Signature element: the crowd field

This is the one thing the product is remembered by. Build it carefully.

A `CrowdField` renders one dot per deposit in a bucket. Dots are 7px circles, 5px gap, wrapping left-to-right in the card. Fill colour comes from the bucket's heat stop.

**Rules**

- Each dot has a deterministic sub-pixel offset derived from its index (±0.6px on both axes) so the grid looks like a crowd rather than a matrix. Do not randomise per render — it must be stable across re-renders.
- Above 120 dots, render 120 and append a `+N` in `numeral-m` at `--sumi-45`. Do not render 4,000 DOM nodes.
- Idle: no animation.
- On new deposit arriving via poll: the new dot fades in over `--dur-slow`, at 1.6× scale settling to 1×. One dot, once. Nothing else moves.

**The moment.** After a user's own shield transaction confirms, the crowd field for that bucket plays a single sequence: the user's dot flies in from the shield panel's position, lands, and then *all* dots in the field — including theirs — fade together to a uniform fill over `--dur-slow`. There is no highlight, no "your position" marker, no persistent indicator. It is not retrievable afterward.

Caption underneath, in `caption` style:

> Your entry is in there. So is everyone else's.

This is the demo moment. It is also literally true, which is why it works. Do not add a "find my deposit" affordance later; that would break the product.

---

## 7. Components

### `DepthOverview`
Full-width treemap-style grid. Columns are tokens (USDC, USDT, ETH…), rows within a column are the three denominations. Cell **area** is proportional to bucket depth; cell **wash** is the heat stop. Each cell shows denomination, depth count, and multiplier.

This is the fastest read of "where is the anonymity set weak right now" and it should sit above the per-bucket cards on the dashboard. It is the only screen element allowed to be visually dense.

### `GaugeCard`
One denomination bucket. Contains: denomination (numeral-l), multiplier badge (numeral-m, heat-coloured), depth line ("47 in this crowd · filling"), `CrowdField`, and a one-line honest note that changes by heat stop (§11).

The heat-1 and heat-2 states take a 2px border in the heat colour. Heat-3 through heat-5 take `--hairline`. This is the only place a 2px border is permitted.

### `HeatBadge`
Multiplier pill. `numeral-m`, heat-coloured text on the matching wash. Includes a `title` and `aria-label` spelling out the relationship: `"4.2× — thin bucket, 8 depositors"`.

### `VisibilityStrip`
Two columns, present on every action screen. Left: `ti-eye` "Everyone sees". Right: `ti-eye-off` "Nobody sees". Contents change per screen — see §11. Never collapse it, never move it behind a disclosure, never make it dismissible.

### `DenominationPicker`
Three large tap targets for 100 / 1k / 10k, each showing its current multiplier and resulting depth ("you'd be 1 of 48"). A "custom amount" option exists but is visually demoted and, when selected, shows a persistent inline warning (§11) — it does not block, it warns.

### `SplitSuggestion`
Appears when the entered amount is ≥ 2× a lower standard denomination. Shows the split, the resulting multiplier, and a one-tap "split it" action that reconfigures the flow into N deposits. Uses `--heat-3-wash`.

### `SecretVault`
Hard gate after commitment generation. Shows the secret, a copy button, a download-as-file button, and a confirm checkbox reading "I've saved this. I understand it can't be recovered." The continue button stays disabled until checked. This is the one place a disabled button is justified.

Re-surfaces as a banner at the top of `/claim` whenever a cliff is within 48h.

### `CliffCountdown`
`numeral-l` countdown to cliff, with an arc that fills over the vest period. All-or-nothing — no partial progress bar suggesting partial claimability, because there isn't any.

### `NorenTransition`
Used once, on successful claim. Two indigo panels sweep in from left and right over the reward figure and part again to reveal an empty space where it was, with the caption "It's in a note now. Where it goes next is yours." Under `prefers-reduced-motion`, it is a crossfade.

### `StepFlow`
Horizontal 4-step indicator: shield → register → wait → claim. Present on `/shield` and `/claim`. Steps show completed / current / locked. This is a real sequence, so numbering is justified here — and only here.

---

## 8. Screens

### `/` — depth dashboard (home)

Land here. No splash, no wallet gate.

```
┌──────────────────────────────────────────────────────────┐
│ 秘密 Himitsu          [token switch]      epoch 4 · 2d 06h│
├──────────────────────────────────────────────────────────┤
│  DepthOverview  (treemap, all tokens × denominations)     │
├──────────────────────────────────────────────────────────┤
│  GaugeCard 100    │  GaugeCard 1,000   │ GaugeCard 10,000 │
├──────────────────────────────────────────────────────────┤
│  Shield panel  (denomination picker + split suggestion)   │
├──────────────────────────────────────────────────────────┤
│  VisibilityStrip                                          │
└──────────────────────────────────────────────────────────┘
```

**States**

- *Disconnected* (the default first view): everything renders. Depth, multipliers, treemap — all public data, no wallet needed. The shield panel shows "Connect wallet" but the picker is still interactive so users can see what a deposit would earn. **A read-only address input is also offered** — some users will not connect a wallet to a privacy app on first visit, and that is a reasonable instinct to respect.
- *Loading*: skeleton the crowd fields as `--paper-sunk` blocks. Do not spin.
- *Empty bucket (depth 0)*: crowd field renders an empty dashed outline. Copy: "Nobody here yet. First in sets the crowd." Do not hide the bucket.
- *Indexer unreachable*: banner — "Depth data is stale. Last updated {time}." Keep showing the last known values, greyed. Never show zeros as if they were real.

### `/shield`

Structure modelled on a two-panel exchange flow: left panel is the amount and denomination, right panel is the public → shielded transition with both endpoints named and a dotted arrow between them.

Required details in the left panel: valid range helper text under the amount, a Max control, the resulting bucket depth, the multiplier, and the projected reward at current gauge weights with the words "if the gauge doesn't change" attached.

**The single most important implementation rule in this document:** shield and register must be submitted as **one Starknet multicall**. A user who deposits and then wanders off without registering earns nothing and will believe they did everything right. Do not build these as two sequential buttons. If the wallet rejects multicall, fall back to sequential but block navigation away with a persistent "You're half-registered" banner and a one-tap resume.

After confirmation: `SecretVault` gate, then the crowd field moment (§6).

### `/claim`

`StepFlow` at top with steps 1–3 complete. `CliffCountdown` centred.

Pre-cliff: countdown, the leaf's allocation, and the honest note that the claim will be publicly linkable. Claim button present but disabled with `disabledReason` "Cliff opens {date}".

Post-cliff: claim button live. On success, `NorenTransition`.

Already claimed: nullifier spent — show the claim tx hash and a link. Do not show a claim button that will revert.

Nothing to claim: "No allocation for this address in epoch {n}." Followed by a link to the shield flow, not an apology.

### `/fund`

Different audience — ecosystem sponsors, not depositors. They need to see what their money buys, so the framing is causal:

> Your 10,000 STRK would raise the 1k bucket from 40 depositors to an estimated 190.

Show current pot per gauge, the depth-per-STRK curve, and a projection slider. No crowd fields here — sponsors care about the aggregate, not the texture.

### `/verify`

The trust page. One Instrument Serif line at top:

> Anyone can recompute the root. Nobody has to trust us.

Below: the epoch's on-chain root, the recomputed root, a match indicator, and the exact `make epoch-close` command with the epoch's real parameters pre-filled and copyable. Link to `strk20.json` and `deployments/`.

This page should be linked from the footer of every screen. It is the cheapest credibility in the whole app.

---

## 9. Data contract

The frontend should be buildable against this shape before the indexer is finished. Mock it.

```ts
type Denomination = 100 | 1_000 | 10_000;
type HeatStop = 1 | 2 | 3 | 4 | 5;

interface Bucket {
  token: string;          // felt address
  tokenSymbol: string;
  denomination: Denomination;
  depth: number;          // registered deposits in current epoch
  multiplier: number;     // gauge weight; round to 1dp for display
  heat: HeatStop;         // derived server-side so client and server agree
  potShare: bigint;       // STRK allocated to this gauge this epoch
}

interface Epoch {
  index: number;
  opensAt: number;        // unix seconds
  closesAt: number;
  cliffAt: number | null; // null until root posted
  rootPosted: boolean;
  root: string | null;
  operatorAddress: string;
}

interface Allocation {
  epoch: number;
  leaf: string;
  amount: bigint;
  claimable: boolean;
  claimed: boolean;
  claimTxHash: string | null;
  merkleProof: string[];
}

interface DepthSnapshot {
  epoch: Epoch;
  buckets: Bucket[];
  updatedAt: number;      // drives the staleness banner
}
```

`heat` is computed server-side from depth thresholds so the treemap, the cards, and any future email digest never disagree. Thresholds live in one place in the indexer, not in the client.

Poll `DepthSnapshot` every 15s while the tab is visible; pause on `visibilitychange`.

---

## 10. Hard UX rules

1. **Multicall the shield + register.** See §8. This is the top failure mode of the entire product.
2. **Secret custody is a seed-phrase-grade problem.** `SecretVault` is a gate, not a toast. Re-surface before every cliff.
3. **`VisibilityStrip` on every action screen.** Contents accurate per screen, including the uncomfortable parts.
4. **Never imply claim anonymity.** The claim is public and linkable to the registering address. Only the destination is private. The copy in §11 says this; do not soften it.
5. **Never imply time-in-pool is measured.** It isn't — withdrawals are unlinkable by design. The cliff is a proxy and should be described as one.
6. **No partial claims in the UI.** All-or-nothing at the cliff. A partial-claim affordance would misrepresent the contract and the remainder would be sweepable.
7. **Round every displayed number.** Multipliers to 1dp, token amounts to the token's decimals, never raw float output.

---

## 11. Copy deck

Use these strings. They are load-bearing.

**Heat notes on `GaugeCard`**

| Heat | Note |
|---|---|
| 1 | Almost nobody here. You'd stand out — and you'd be paid the most for it. |
| 2 | Thin crowd. Good rate, thinner cover. |
| 3 | Filling up. Rate is coming down as it does. |
| 4 | Decent cover here. |
| 5 | Deep crowd, low subsidy. Best place to hide, least paid for it. |

**Split suggestion**

> Split into 10 × 1,000 instead. Ten indistinguishable entries in a fuller bucket, at 2.4× the rate. Splitting isn't cheating — it's the product.

**Custom amount warning**

> Custom amounts are traceable. An observer who sees 3,412 go in and 3,412 come out doesn't need to break any cryptography.

**VisibilityStrip — dashboard**

- Everyone sees: every deposit, its amount, and who made it
- Nobody sees: which deposit funded which withdrawal

**VisibilityStrip — shield**

- Everyone sees: your address, the token, the amount, your registration
- Nobody sees: anything else you do with the pool afterward

**VisibilityStrip — claim**

- Everyone sees: that this address claimed, and which allocation it claimed
- Nobody sees: where the reward goes next

**Claim, pre-cliff**

> Rewards unlock {date}. It's one claim, all at once — there's no partial withdrawal, and the cliff stands in for time-in-pool, which the pool makes deliberately unmeasurable.

**Claim, post-transition**

> It's in a note now. Where it goes next is yours.

**Empty states**

- No allocation: "No allocation for this address in epoch {n}."
- Empty bucket: "Nobody here yet. First in sets the crowd."
- Disconnected: "Connect a wallet to shield, or paste an address to look around first."

**Errors** — state what happened and what to do. No "Error:" prefix, no apology, never a raw revert string.

- "The pool rejected the deposit. Check the token balance and try again."
- "Registration didn't land. Your deposit is in — resume registering to earn on it."
- "That secret doesn't match any allocation in this epoch."

---

## 12. Accessibility floor

- Visible focus ring on every interactive element: `0 0 0 2px var(--ai-500)`, never `outline: none` without a replacement.
- Heat is dual-encoded (colour + text) everywhere. Greyscale screenshot test must pass.
- `CrowdField` gets `role="img"` and an `aria-label`: `"1,000 USDC bucket — 47 depositors"`. Individual dots are `aria-hidden`.
- Countdown updates use `aria-live="polite"`, not `assertive`.
- Full keyboard path through shield and claim, tested without a mouse.
- `prefers-reduced-motion` honoured, including the signature moment.
- Minimum 15px body text. No 11px anywhere.

## 13. Performance floor

- Crowd fields cap at 120 rendered dots. Above that, count only.
- The treemap is a single SVG, not N divs.
- Poll pauses when the tab is hidden.
- Mobile: `DepthOverview` becomes a stacked bar list; `GaugeCard` crowd fields cap at 40 dots. Test at 380px.

---

## 14. Build order

1. Tokens, fonts, layout shell, dark mode. Verify both modes before anything else.
2. Mock `DepthSnapshot`. Build `GaugeCard` + `CrowdField` against the mock.
3. Dashboard with all four states (loading, empty bucket, disconnected, stale).
4. `DepthOverview` treemap.
5. Shield flow — **multicall first**, UI second.
6. `SecretVault`.
7. The crowd field moment.
8. Claim + `CliffCountdown` + `NorenTransition`.
9. `/verify`.
10. `/fund`.

If time runs short, cut `/fund` and the noren transition. Do not cut `SecretVault`, the multicall, or the `VisibilityStrip`.

## 15. Acceptance checklist

- [ ] It is impossible to deposit without registering in the same wallet interaction.
- [ ] The user cannot leave `SecretVault` without confirming they saved the secret.
- [ ] Every action screen shows an accurate `VisibilityStrip`.
- [ ] Claim linkability is stated in the interface, not only in the docs.
- [ ] Greyscale screenshot of the dashboard is still fully legible.
- [ ] Full keyboard path through shield and claim.
- [ ] Dashboard renders completely with no wallet connected.
- [ ] Reduced-motion path tested.
- [ ] 380px viewport tested.
- [ ] No gradient fills, no glass, no violet, no Inter.