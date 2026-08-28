# Brand — Himitsu Protocol

_Status: set — source of truth is [DESIGN.md](./DESIGN.md), not this file._

DESIGN.md is a complete, deliberate design implementation spec (tokens, type, motion,
components, screens, copy deck, accessibility/performance floors, build order). This file
exists only so brand-aware tooling that looks for `brand.md` finds something. Read DESIGN.md
directly for anything beyond this summary — it is authoritative; this file is not.

## Palette (light default, indigo-black dark — never neutral black)

- Ground: `--paper #EAE8E1` (raised `#F5F4EF`, sunk `#DEDCD4`) — cooler/greyer than off-white
- Ink: `--sumi #14161C` down to `--sumi-25 #A9AEB8`
- Brand indigo (ai-zome): `--ai-900 #0D1726` → `--ai-100 #D6E2EE`
- Heat ramp (depth encoding ONLY, never decorative): `--heat-1 #C4361F` (thin) → `--heat-5 #1D3557` (deep), each with a `-wash` background variant
- State: `--danger #A32D2D`, `--warn #8A6410`

Full stop list, dark-mode overrides, geometry, and spacing scale: DESIGN.md §3.

## Typography

- UI: **Switzer** (Fontshare), weights 400/500
- Numerals: **Geist Mono**, tabular, for every number/address/hash/multiplier
- Display: **Instrument Serif** — exactly three places (wordmark, empty-state lines, /verify thesis). Never elsewhere.
- Never Inter.

## Voice

Quiet, honest, specific. No celebration UI (no confetti/glow on claim). States what's true
plainly, including the uncomfortable parts (claims are publicly linkable; the cliff is a proxy,
not measured time). See DESIGN.md §11 for the load-bearing copy deck — use those strings
verbatim, don't paraphrase them.

## Non-negotiables

No dark-near-black-with-violet-gradient genre default, no giant portfolio number, no gradient
area charts, no sparklines, no fake density, no Inter. Full list: DESIGN.md §2.
