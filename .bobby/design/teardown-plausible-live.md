# Teardown — Plausible Analytics live demo (light)

**Openable:** <https://plausible.io/plausible.io> — public live demo, no login. Rendered live 2026-08-02,
`colorScheme: light`. Screenshot: `.bobby/design/shots/plausible.png`.
**Extraction:** `extracted` = live computed styles (oklch, with hex approximations noted); `observed` = screenshot.

## The four citation fields

| Field | |
|---|---|
| **Name** | Plausible Analytics public dashboard (live demo). |
| **Source** | <https://plausible.io/plausible.io> |
| **What's good (the thinking)** | It is a **calm instrument, not a control room.** A row of **big-figure stat tiles** (tiny uppercase label + large 800-weight number + a small green/red % delta with an up/down arrow) tells you the state before any chart. Ranked rows use a **subtle in-row tint bar** behind the text to show magnitude — data *is* the decoration, nothing extra. Enormous whitespace, hairline separators, near-white ground, exactly one accent. It refuses density and wins on legibility. |
| **What we take** | **Big-figure readouts** for feature progress (e.g. "3 / 4 past review", elapsed); the **in-row tint-bar** as a quiet per-ticket progress fill; **whitespace-forward restraint**; a near-white designed ground. **We do NOT take its indigo accent** (leans to the purple tell — see below). |

## Extracted values

### Colour — `extracted` (oklch live values, hex ≈ noted)
- **Page ground:** `oklch(0.985 0 0)` ≈ **`#FAFAFA`** — a designed near-white, neutral.
- **Ink (headings):** `oklch(0.21 0.006 285.885)` ≈ **`#27272A`** (near zinc-900). Body ink `oklch(0.274 0.006 286.033)` ≈ `#3F3F46`. Muted `oklch(0.552 …)` ≈ `#71717A`.
- **Accent (DROP):** `oklch(0.511 0.262 276.966)` ≈ **`#4F46E5` indigo-600** — hue ~277 sits in the **purple/violet zone the slop checklist flags**. Take Plausible's *restraint*, not this hue; substitute the existing brand blue `#005FC6`.
- **Deltas:** green up / red down arrows on the % change `observed` — colour reserved for direction-of-change only.

### Type — `extracted`
- **Face:** `ui-sans-serif` system stack (the demo ships system sans; Plausible's own site uses a geometric sans). Body 16px.
- **Stat figures:** 36px / **weight 800** `extracted` — strong step contrast against 12px uppercase labels `observed`.
- **Labels:** ~12px uppercase, muted `observed`. **For our build, raise to ≥13px floor and keep the step contrast.**

### Surface & motion — `extracted` / `observed`
- **Radii:** buttons/tiles `6px`; small tabs `2–4px` `extracted`.
- **Separators:** hairlines and generous padding do the work — **no card shadows stacked with borders** `observed`.
- **In-row data bar:** a pale proportional tint fills the row behind ranked items `observed` — a magnitude cue with zero extra chrome.
- **Motion:** chart draws once; UI is otherwise still `observed`. No pulse.

## The true feel
Unhurried confidence. The page trusts a few big numbers and a lot of empty space to carry everything, and
reads as *considered* precisely because it leaves so much out. Applied to the Feature view, this is the
risk move: **state the pipeline's progress as a few large, legible readings — not a graph, not a table —
and let whitespace and one accent do the rest.** `observed`.

## Inherited rules (if this anchors the direction)
1. Feature progress = **big-figure readouts** (weight 800, 36px+) with tiny uppercase labels and a coloured delta.
2. Per-ticket progress = a **subtle in-row tint bar**, no extra chrome.
3. Ground `#FAFAFA`, ink `#27272A`; hairlines + whitespace instead of shadows.
4. **One accent, and it is not indigo/violet** — substitute brand blue `#005FC6`; colour otherwise reserved for deltas/state.
5. Raise labels to the 13px floor; keep the big-figure step contrast.
