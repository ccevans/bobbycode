# Design Spec — bobbycode homepage

**Locked:** 2026-07-26 · **Direction:** R1 "Stage" · **Status:** approved

Built from teardowns of two user-supplied references. Every value below is either extracted
from a reference or listed under Deviations with a reason.

---

## Decided

| Field | Value |
|---|---|
| **Direction** | R1 "Stage" — fixed 3-column stage, terminal as centre anchor |
| **Headline** | `A full software team. Production-ready by default.` |
| **Layout** | `grid-template-columns: 20% 55% 25%` · `height: 100dvh` · `padding: 52px 48px` |
| **Anchor** | Device frame, centre column, holding a terminal (replaces reference's phone) |
| **Text placement** | Left column, vertically centred, `justify-content: space-between` around it |
| **Empty space** | Right column deliberately near-empty — one ghost link, bottom-aligned |

### Colour

| Token | Light | Dark | Role |
|---|---|---|---|
| `--page` | `#F5F4F1` | `#131211` | Page ground |
| `--surface` | `#FFFFFF` | `#1D1B19` | Raised surfaces |
| `--ink` | `#1A1A1A` | `#F1EFEC` | Primary text |
| `--mut` | `#63615B` | `#A5A099` | Muted text |
| `--subtle` | `#C9C6BE` | `#4A4640` | Inactive dashes |
| `--rule` | `#E3E1DB` | `#2A2724` | Hairlines |
| `--accent` | `#005FC6` | `#6BAEFF` | Single accent |
| `--frame` | `#0D0D0D` | `#0D0D0D` | Device bezel |

### Type

- **Families:** `"Geist","GeistSans"` + system sans fallback · `ui-monospace` stack for accents
- **Base:** `17px` body · line-height `1.55`
- **Floor:** `--min: .82rem` (13.1px). **Nothing on the page goes below this.**
- **Display:** `clamp(1.45rem, 1.05rem + 1.05vw, 2rem)` · weight 600 · tracking `-.035em`
- **Figures:** `1.85rem` · weight 600 · tracking `-.04em`

### Surface & motion

- **Radius:** `--r-hair: 1px` (dashes) · `--r-inner: 24px` · `--r-md: 30px` · `--r-lg: 40px` · `--r-pill: 50px`
- **Colour notation:** 6-digit hex, uppercase. No 3-digit shorthand — it produces false diffs.
- **Cross-fade:** `opacity 500ms ease, transform 500ms ease` with `--rise: 12px`
- **Dashes:** `6px → 20px` wide, `2px` tall, `350ms ease`
- **No autoplay.** Scenes change only on user input.

### Structure

- Desktop ≥1000px: fixed stage, 5 states, changed via dashes / arrow keys / wheel
- Below 1000px: snap deck, `scroll-snap-type: y mandatory`, sections `100dvh`
- Below 560px height: snap disabled so short viewports can't trap

---

## Vetted — from the user

**Keep**
- Snap panels / full-height sections *(structure)*
- Warm off-white ground *(rfeasley)*
- Pure white surfaces, very round corners, sans + mono mixed *(Portal)*
- 3-column stage with terminal replacing the phone *(rfeasley layout)*
- 500ms cross-fade + 12px rise; stretching dash pagination *(rfeasley motion)*

**Drop**
- rfeasley's 5-colour limit, its one-typeface-no-mono rule, its dark frame as a page element
- Portal's tight 10/12/14px type scale
- Autoplaying video loop in the anchor

---

## Deviations

Each is a deliberate departure from a reference value, with its reason.

1. **`--mut: #63615B` instead of rfeasley's `#999`** — `#999` on `#F5F4F1` fails WCAG AA for body text. Accessibility outranks fidelity.
2. **Type scaled up; Portal's 10/12/14px scale not inherited** — violates the 16px body / 13px absolute floor. Proportions kept, sizes raised. Per skill rule: the floor beats reference fidelity.
3. **Snap disabled below 560px viewport height** — mandatory snap on a short screen can trap the user mid-panel.
4. **`Geist` declared as primary face** — reference-backed (rfeasley uses it), not a default reach. Artifact CSP blocks the webfont, so previews render in system fallback; a real deploy loads it.
5. **Terminal replaces the phone in the device frame** — Bobby has no mobile app; the anchor shows the product actually running, which is the transferable idea.

---

## Changelog

- **2026-07-26** — First conformance diff run. Two findings, both fixed: `#FFF` shorthand
  normalised to `#FFFFFF`, and the dash `1px` radius promoted to a `--r-hair` token and added
  to the radius scale. Added an interaction affordance ("scroll or ↓ to continue") that fades
  on first navigation — the fixed stage gave no signal that it was navigable.
- **2026-07-26** — Spec created. Direction R1 approved; headline changed from the README-spliced
  "A full engineering team. Headcount of one." to "A full software team. Production-ready by
  default." at user's request. Type floors applied, raising all labels off 10–11px.

---

## Provenance

- `teardown-rfeasley.md` — layout, motion, ground, device frame
- `teardown-useportal.md` — radii, accent, sans+mono pairing, white surface
