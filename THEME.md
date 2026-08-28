# Himitsu — THEME.md

Complete colour system. This replaces every colour value in the current build and in DESIGN.md §3. Nothing here is a suggestion — if a component isn't listed, derive it from the semantic tokens in §3, never from a raw hex.

Structure, type, motion and component behaviour stay as specified in DESIGN.md. This file only governs colour.

---

## 1. The one rule everything else depends on

**Sunset Orange (`#FE4A3C`) is reserved. It means one thing: this bucket is critically thin, or this action makes you more visible than you may want.**

It never appears as a button, a link, a nav highlight, a logo tint, a chart accent, a hover state, or decoration. The moment "Connect wallet" turns orange, the thin-bucket signal stops meaning anything and the entire heat system is dead.

Everything interactive is indigo. Everything hot is orange. That's the whole system.

---

## 2. Brand anchors

```
Sunset Orange   #FE4A3C   Starknet brand
Jacarta         #28286E   Starknet brand
```

Confirm both against the Starknet Brand Book (https://www.starknet.io/media-kit/) before shipping. These values come from StarkWare's parent-brand listing. If Starknet's own book differs, swap the two endpoints and keep the ramp structure below intact.

The heat ramp runs from one brand colour to the other. It's a sunset — hot daylight for lonely buckets, night indigo for crowded ones. That's not decoration, it's the mechanic.

---

## 3. Tokens

### Light (default)

```css
:root {
  /* Neutrals — indigo-tinted, never pure grey. Even the neutrals are on-brand. */
  --canvas:        #FFFFFF;
  --canvas-alt:    #F6F6FA;
  --canvas-sunk:   #EFEFF6;
  --line:          #E3E3EC;
  --line-strong:   #C9C9D9;
  --ink:           #2A2A3D;
  --ink-soft:      #6E6E85;
  --ink-faint:     #A8A8BC;

  /* Interactive — lifted Jacarta */
  --primary:       #4646C4;
  --primary-hover: #5252D4;
  --primary-deep:  #28286E;   /* the 5px border-bottom on chunky buttons */
  --primary-wash:  #EDEDFA;

  /* Heat ramp — thin (pays most) to deep (pays least) */
  --heat-1: #FE4A3C;
  --heat-2: #F0507A;
  --heat-3: #B94C9E;
  --heat-4: #6D4A9C;
  --heat-5: #28286E;

  /* Heat washes — jar backgrounds */
  --wash-1: #FFEDEB;
  --wash-2: #FDEBF0;
  --wash-3: #F7EDF5;
  --wash-4: #EFEBF5;
  --wash-5: #E9E9F0;

  /* Semantic */
  --success:       #0E9F6E;
  --success-wash:  #E6F6F0;
  --danger:        #B02A43;   /* deliberately deeper and bluer than heat-1 */
  --danger-wash:   #FBEBEF;

  --focus:         #4646C4;
}
```

There is no separate warning colour. **Warning collapses into the exposure signal** — anything that means "you're more visible than you might want" uses `--heat-1` and `--wash-1`. A thin bucket and a custom-amount warning are the same message, so they get the same colour. This is deliberate; do not add an amber.

### Dark (opt-in)

Dark is not neutral black. It's Jacarta darkened, so the whole app stays in the brand's hue family.

```css
[data-theme="dark"] {
  --canvas:        #14142B;
  --canvas-alt:    #1C1C3A;
  --canvas-sunk:   #0F0F22;
  --line:          #2E2E52;
  --line-strong:   #46466E;
  --ink:           #E8E8F2;
  --ink-soft:      #A0A0BC;
  --ink-faint:     #6A6A88;

  --primary:       #7A7AE0;
  --primary-hover: #8A8AEA;
  --primary-deep:  #4646C4;
  --primary-wash:  #24244A;

  /* Ramp lifts — #28286E is invisible on a dark canvas */
  --heat-1: #FF6B5C;
  --heat-2: #F56E90;
  --heat-3: #C868AE;
  --heat-4: #9083D6;
  --heat-5: #6E6ECB;

  --wash-1: #3A1A16;
  --wash-2: #351926;
  --wash-3: #2F1A2C;
  --wash-4: #241C33;
  --wash-5: #1E1E3C;

  --success:       #34D399;
  --success-wash:  #15332C;
  --danger:        #F2708A;
  --danger-wash:   #3A1723;

  --focus:         #7A7AE0;
}
```

**The dark-mode failure to test for:** the deep end of the ramp. A depth-81 bucket at `--heat-5` on `--canvas` is the case that breaks. Check it explicitly.

---

## 4. Contrast rules

| Pair | Ratio | Verdict |
|---|---|---|
| `--ink` on `--canvas` | ~13:1 | fine everywhere |
| `--ink-soft` on `--canvas` | ~5.2:1 | fine for body and captions |
| `--ink-faint` on `--canvas` | ~2.4:1 | **non-text only** — dividers, disabled icons, placeholder glyphs. Never body copy. |
| white on `--primary` | ~5.0:1 | fine for button labels |
| white on `--heat-1` | ~3.3:1 | **fails AA for normal text.** Only permitted at 18px+ weight 900. Below that, use `--ink` on `--wash-1` instead. |

Never white body text on Sunset Orange. This is the most common way this palette gets broken.

Colour is never the only channel. Every heat-coloured element carries its multiplier and depth count as text. Greyscale screenshot must stay fully legible — stops 2 and 3 are close in lightness, so they especially cannot rely on hue.

---

## 5. Component colour map

### App shell

| Element | Colour |
|---|---|
| Page background | `--canvas` |
| Nav bar background | `--canvas` with `2px solid --line` bottom |
| Wordmark 秘密 + Himitsu | `--ink` |
| Nav link, resting | `--ink-soft` |
| Nav link, hover | `--ink` |
| Nav link, active | `--primary`, with a 3px `--primary` underline |
| Network pill (MAINNET) | `--primary-wash` bg, `--primary` text, no border |
| Network pill (TESTNET) | `--canvas-sunk` bg, `--ink-soft` text |
| Theme toggle icon | `--ink-soft`, hover `--ink` |
| Footer background | `--canvas-alt` |
| Footer text | `--ink-soft` |

### Buttons

| Variant | Fill | Border-bottom | Label | Hover | Active |
|---|---|---|---|---|---|
| Primary | `--primary` | 5px `--primary-deep` | white | `--primary-hover` | translateY(4px), border 1px |
| Secondary | `--canvas` | 5px `--line-strong` | `--ink` | `--canvas-alt` | same compression |
| Ghost | transparent | none | `--primary` | `--primary-wash` | — |
| Destructive | `--danger` | 5px `#8A1F33` | white | lighten 8% | same compression |

Avoid disabled buttons. The one exception is the SecretVault continue gate and the pre-cliff claim button: `--canvas-sunk` fill, `--ink-faint` label, `--line` border-bottom, `cursor: not-allowed`, always with a `disabledReason` tooltip.

### BucketJar

| Part | Colour |
|---|---|
| Card background | `--wash-{n}` for its heat stop |
| Card border | `2px solid --line`, except stops 1 and 2 |
| Stop 1 and 2 border | `2px solid --heat-{n}`, breathing pulse to `--line` and back over 2.4s |
| Denomination label | `--ink` |
| Multiplier | `--heat-{n}` |
| Mood caption | `--ink-soft` |
| Dots | `--heat-{n}` |
| "+N" overflow count | `--ink-soft` |
| Depth count | `--ink`, with the number in weight 900 |
| Empty jar outline | `2px dashed --heat-1`, `--wash-1` fill |
| `+1` float on deposit | `--heat-{n}` |

### Denomination cards (`/shield`)

| State | Fill | Border | Multiplier text |
|---|---|---|---|
| Resting | `--canvas` | `2px --line` | `--heat-{n}` |
| Hover | `--canvas-alt` | `2px --line-strong` | `--heat-{n}` |
| Selected | `--primary-wash` | `2px --primary` | `--heat-{n}` |

The multiplier keeps its heat colour in every state. Selection is indigo; heat is heat. They coexist and never swap jobs.

### Inputs

| State | Fill | Border | Text |
|---|---|---|---|
| Rest | `--canvas` | `2px --line` | `--ink` |
| Hover | `--canvas` | `2px --line-strong` | `--ink` |
| Focus | `--canvas` | `2px --primary` + `0 0 0 4px --primary-wash` | `--ink` |
| Error | `--canvas` | `2px --danger` | `--ink` |
| Disabled | `--canvas-sunk` | `2px --line` | `--ink-faint` |

Placeholder is `--ink-faint`. Helper text is `--ink-soft`. Error text is `--danger` and **always carries an icon** — this is what keeps it from being confused with the orange exposure signal.

### Custom amount warning

`--wash-1` background, `2px solid --heat-1` border, `--ink` body text, `--heat-1` icon. Same treatment as a critically thin bucket, because it's the same message.

### SplitSuggestion

`--primary-wash` background, `2px solid --primary` border, `--ink` body, `--primary` for the resulting multiplier figure. This is an opportunity, not an exposure — so it's indigo, not orange.

### VisibilityStrip

| Part | Colour |
|---|---|
| Container | `--canvas-alt`, no border, 18px radius |
| Divider between halves | `2px solid --line` |
| "Everyone sees" heading + eye icon | `--heat-1` |
| "Nobody sees" heading + eye-off icon | `--heat-5` (light) / `--heat-5` lifted (dark) |
| Body text both sides | `--ink` |

The two halves take the two poles of the ramp. Public is exposed and hot; private is deep and cool. It's the same semantics as the jars, which is the point.

### StepFlow

| State | Node fill | Node text | Connector |
|---|---|---|---|
| Complete | `--primary` | white | `--primary` |
| Current | `--canvas`, `3px --primary` ring | `--primary` | `--line` |
| Locked | `--canvas-sunk` | `--ink-faint` | `--line` |

### SecretVault

Container: `--wash-1` with `2px solid --heat-1`. This screen is an exposure risk, so it reads hot on purpose. Secret text in mono on `--canvas` with `2px --line`. Copy and download buttons are secondary. The confirm checkbox turns `--primary` when checked. Continue button stays disabled until then.

### CliffCountdown

Ring track `--line`, ring fill `--primary`, numerals `--ink`. On completion the ring snaps to `--success` with a spring. Pre-cliff caption `--ink-soft`.

### Banners and toasts

| Kind | Fill | Border | Icon + heading |
|---|---|---|---|
| Info | `--primary-wash` | `2px --primary` | `--primary` |
| Success | `--success-wash` | `2px --success` | `--success` |
| Error | `--danger-wash` | `2px --danger` | `--danger` |
| Exposure | `--wash-1` | `2px --heat-1` | `--heat-1` |
| Stale data | `--canvas-sunk` | `2px --line-strong` | `--ink-soft` |

### Tables (`/fund`, `/verify`)

Header row `--canvas-alt` with `--ink-soft` labels. Body rows `--canvas`, separated by `1px solid --line`. Row hover `--canvas-alt`. Numerals `--ink`. Addresses and hashes `--ink-soft` in mono. Root-match indicator `--success`; mismatch `--danger`.

### Links

`--primary`, underline on hover, `--primary-hover` on hover. Never orange.

### Skeletons

`--canvas-sunk` blocks. Shimmer is a solid opacity pulse between `--canvas-sunk` and `--canvas-alt` — no gradient sweep.

### Focus ring

`0 0 0 3px --focus` with `2px` offset, on every interactive element, in both modes. Never remove an outline without replacing it.

---

## 6. Screen accents

**Dashboard** — `--canvas`. The jars supply all the colour; nothing else on the page is tinted. Hero heading `--ink`, hero body `--ink-soft`, primary CTA indigo.

**Shield** — `--canvas`. Denomination cards indigo-selected, multipliers heat-coloured, VisibilityStrip at the bottom.

**Claim** — `--canvas-alt` page background to distinguish it from the dashboard. Countdown ring indigo. The linkability notice is an exposure banner (`--wash-1`), because that's exactly what it is.

**Fund** — `--canvas`. Sponsor-facing, so this is the one screen with no orange at all unless a gauge is genuinely critical. Projection figures in `--primary`.

**Verify** — `--canvas-alt`. Root match `--success`, mismatch `--danger`. The one Instrument Serif line in `--ink`.

---

## 7. Delete from the current build

- Every navy `#0D1726`-family value. Dark mode is `#14142B` and it is not the default.
- The pale-blue `#B8C4E0`-ish primary button. It reads as disabled.
- The dark red-brown treemap cells. The treemap is gone entirely.
- Any neutral grey that isn't indigo-tinted.
- Any amber or yellow. Warning collapses into the exposure signal.

## 8. Checklist

- [ ] `#FE4A3C` appears only on thin buckets and exposure warnings. Grep for it.
- [ ] Primary button is `--primary` with a `--primary-deep` border-bottom, and compresses on press.
- [ ] Light is the default; dark is opt-in.
- [ ] Deep-bucket dots are visible in dark mode.
- [ ] No white text on orange below 18px/900.
- [ ] Greyscale screenshot of the dashboard is fully legible.
- [ ] Every error carries an icon, not just colour.
- [ ] Focus rings visible in both modes.
- [ ] No pure grey, no amber, no gradients anywhere.