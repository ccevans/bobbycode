# Design Spec — Bobby App, Feature view

**Locked:** 2026-08-06 · **Direction:** "Track to finish" · **Status:** approved by CC
**Scope:** the Feature view (an epic + its child tickets moving through a workflow).
This spec does **not** govern the marketing homepage — that is `design-spec.md`
(direction R1 "Stage"), a separate surface with its own tokens.

Source of truth for the build: `.bobby/design/mockups/devin-white-fin-2.html`.
**Values are copied from this file, never retyped from memory.**

---

## Decided

| Field | Value |
|---|---|
| **Direction** | "Track to finish" — Devin's white mobile register, pipeline drawn as a route |
| **Reference** | app.devin.ai on iPhone, photographed by CC (4 screenshots, see Provenance) |
| **Canvas** | Phone-first at 390px; app column `max-width: 440px` centred on the ground at any width |
| **Signature move** | A hairline connector runs down through the step glyphs and **terminates in a chequered finish** at Merge. The pipeline is a route, not a checklist. |
| **Structure** | Top bar → title + repo sublabel → status line → Pipeline → note → decision buttons → Tickets |

### Colour — every value pixel-sampled from the reference photos

| Token | Value | Sampled from |
|---|---|---|
| `--ground` | `#F8F8F8` | IMG_5805, ground behind the list container |
| `--surface` | `#FFFFFF` | IMG_5805 list container; IMG_5808 composer |
| `--hairline` | `#E2E2E2` | IMG_5807 card border + chip border |
| `--fill-active` | `#F5F5F5` | IMG_5805 selected session row |
| `--fill-track` | `#EDEDED` | IMG_5808 progress track |
| `--fill-hover` | `#FAFAFA` | derived |
| `--ink` | `#191919` | IMG_5805/5807/5808 primary text |
| `--ink-2` | `#6E6E6E` | **deviation** — sampled `#7D7D7D`, darkened for AA |
| `--blue` | `#467AF6` | IMG_5808 check circle + progress fill; IMG_5805 status dots |
| `--btn` | `#363636` | IMG_5807 "Create automation" fill |
| `--dot-muted` | `#8F8F8F` | **deviation** — sampled `#E2E2E2` ring, lifted to ≥3:1 |

The greys are **pure neutral (R=G=B)**, not warm. Verified by sampling; do not
"warm them up" — that was an earlier wrong assumption taken from the marketing site.

Blue is the only accent. It means *live / needs attention*. Black (`--btn`) is for
primary buttons and ink. **The blue is never a button fill.**

### Type

- Family: system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`). One face for the whole page — reference-backed.
- Body 15px / 1.35 · H1 **22px/600** · row title 14px · sublabel 13px · section heads 14px/600
- **Floor: 13px.** Nothing smaller anywhere. (Reference runs 12px; our floor wins.)
- `font-variant-numeric: tabular-nums` on all counts, times and IDs.

### Shape & surface

- Radii: container `12px` · row `8px` · button `8px` · pill `999px`
- Border: `1px solid var(--hairline)`
- **No shadows anywhere.** No gradients. No tinted status fills.
- **No dividers between ticket rows** — verified by pixel scan of the reference.
  Rows are separated by space; the active row carries a `--fill-active` inset fill.

### The pipeline (the signature)

- Five steps: Plan · Build · Review · Test · **Merge**
- Glyphs, 18px box, 34px row pitch:
  - done → filled `--blue` circle, white check
  - current → `--blue` ring with `--blue` centre dot
  - not started → hollow `--dot-muted` ring, 1.5px
  - **finish (Merge) → 20×20 chequer, 5×5 grid at 4px cells, `--btn` `#363636`**
- **Connector:** hairline running down the glyph column, terminating at the chequer.
  Completed segments `--blue` (3.68:1); segments ahead `--hairline` (decorative
  connective tissue — the glyphs carry state, so it is not a state carrier).
  Requires `z-index: 0` on segments, `z-index: 1` on rows, and ground-coloured ring
  fills, or the line paints through the glyphs.
- Grid parity matters: **odd grids only.** 5×5 has filled corners and reads as a
  flag; 6×6 leaves opposite corners empty and serrates into a diamond.
- Cells on whole-pixel boundaries, `shape-rendering="crispEdges"`.

### Motion

Near-none. One `background-color` transition at 120ms linear on row hover.
No transforms. No pulsing status dots — retired by construction
(see `references-feature-view.md`; five teardowns record "no pulse").

---

## Vetted — from the user

**Keep**
- White theme, simple layout (CC: *"I like the white theme and simple layout"*)
- The chequered flag as the one racing grace note (CC: *"let's do subtle check flags"*)
- The connector-line treatment (CC chose "Track version" over the bolder flag)

**Drop**
- Dark mode entirely (CC: *"I hate dark mode"*) — this surface is light-only
- The circuit-line drawing, car dot, sector labels, lap counter, livery stripe (CC: *"little too much"*)
- Cards around status; tinted row fills; left-border stripes

---

## Deviations (each needs a reason)

- `--ink-2 #6E6E6E` instead of sampled `#7D7D7D` — reference is **4.12:1**, fails AA.
- Not-started ring `#8F8F8F` @1.5px instead of `#E2E2E2` — reference is **1.30:1** and
  is the sole carrier of "not started".
- Sublabels 13px instead of reference 12px — below our floor.
- Ticket rows ~57px instead of reference ~44px — consequence of the 13px floor plus
  the ≥44px tap-target rule.
- Current-step glyph (blue ring + centre dot) is **invented** — Devin's checklist has
  only done and not-started. This is the one glyph without provenance.

---

## Accessibility floor (verified, not asserted)

- All text AA. Worst case `--ink-2` at **5.10:1** on white.
- Meaningful non-text graphics ≥3:1: blue graphics 3.91 vs white; muted dot 3.23;
  chequer 11.38 on ground.
- Tap targets ≥44px. Visible `:focus-visible` on every interactive element.
- `scrollWidth == clientWidth` at 375 / 390 / 768 / 1440.
- Renders fully with **JavaScript disabled**. `prefers-reduced-motion` honoured.

---

## Provenance

Reference photos (app.devin.ai, mobile Safari, CC's own repo — the app is behind
auth, so these could not be captured by tooling):
`b1bb4042-IMG_5805.png` (sessions list) · `5c242cb7-IMG_5806.png` (nav drawer +
recent) · `89c3732e-IMG_5807.png` (Automations empty state) · `df06d338-IMG_5808.png`
(composer + "Get started" checklist — the source of the pipeline pattern).

Supporting: 76 Devin captures in `.bobby/design/inspiration/devin/`, gallery notes in
`.bobby/design/inspiration/README.md`, round history in `references-feature-view.md`.

**The rule that made this work, learned the hard way:** cards are for *choosing*
between things, never for displaying status. Status lives in bare rows on the ground.
Eight earlier mockups put status in a bordered card with a tinted stripe; that was the
"looks AI / looks amateur" tell, and it was structural, not cosmetic.

---

## Changelog

- 2026-08-06 — Spec created and locked. Direction "Track to finish" chosen by CC over
  the bolder no-connector variant.
