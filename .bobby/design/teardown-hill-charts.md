# Teardown — Basecamp Hill Charts (live, light)

**Openable:** <https://basecamp.com/hill-charts> — public, no login (the actual interactive hill renders on
the page). Supporting: <https://basecamp.com/shapeup/3.4-chapter-13> ("Show Progress" — the thinking, with
figures). Rendered live 2026-08-02, `colorScheme: light`. Screenshots: `.bobby/design/shots/hillchart-real.png`,
`.bobby/design/shots/shapeup-hill.png`. **Extraction:** `extracted` = live computed styles / `:root` oklch; `observed` = screenshot.

## The four citation fields

| Field | |
|---|---|
| **Name** | Basecamp Hill Charts — progress as position on a hill. |
| **Source** | <https://basecamp.com/hill-charts> · <https://basecamp.com/shapeup/3.4-chapter-13> |
| **What's good (the thinking)** | It replaces the progress *bar* with a **progress metaphor that encodes confidence, not percentage.** Every piece of work climbs an **uphill** side ("figuring things out") and then rolls **downhill** ("making it happen"). A dot near the crest means "we've solved the unknowns"; a dot stuck on the upslope means "still risky." One glance at a handful of dots on a curve tells you *what's moving and what's stuck* — which a 60%-bar can never say, because 60%-uphill and 60%-downhill mean opposite things. |
| **What we take** | The **hill as the pipeline spine** — plan/build = uphill, the **crest = the review gate**, review→test→merge = downhill; a **child ticket = a labelled dot** whose position is its phase-and-confidence; and the calm Basecamp light palette (oklch pastels + a restrained ink ramp). |

## Extracted values

### Colour — `extracted` from live `:root` (oklch, hex ≈ noted)
- **Canvas themes (six pastels, `--oklch-theme-1…6`):** e.g. `theme-4` blue `oklch(0.9808 0.0091 258.34)` ≈ **`#EDF0F7`**; `theme-3` warm `oklch(0.9856 0.0084 56.32)` ≈ **`#F6F2EC`**; `theme-1` green `oklch(0.9802 0.0074 151.89)` ≈ `#ECF3EE`. All are **designed pale tints, not white** — a whole family of light grounds to pick from.
- **Ink ramp:** `--oklch-ink-1 0.1891 0.0191 235.5` ≈ `#1B2C33` → body ink `oklch(0.3209 0.0204 233.83)` ≈ **`#33434B`** (dark slate-teal, not pure black).
- **Accents:** `--oklch-blue 0.5687 0.1602 254.08` ≈ **`#2E6FD6`**; `--oklch-green 0.5506 0.1301 154.06` ≈ **`#2E9E5B`**; highlight = yellow.
- **Hill dots (`observed`):** green (crested/confident), orange (mid-downhill), blue (upslope / just added) — colour marks phase, and it lives **in the dot**, never a stripe.

### Type — `extracted`
- **Face:** **Graphik** (600 for headings) on `/hill-charts`; the Shape Up book uses **FF Meta Serif Web Pro** (a warm editorial serif) — a genuinely different, calm reading register. Neither is a slop face.
- **Sizes:** H1 ~42px/600, body ~15–16px `extracted`.

### Surface & motion — `observed`
- **The chart:** a single smooth bell curve, a dashed vertical **crest line** splitting "FIGURING THINGS OUT" / "MAKING IT HAPPEN", dots with trailing text labels, a `Save this update` (green outline) / `Cancel` control.
- **Interaction:** dots are **draggable**; history is **cycled with arrows** ("click the arrows to see what moved") — progress is a *sequence of saved snapshots*, not a live wiggle. Directed, deliberate, no ambient motion.

## The true feel
Calm, humane, honest about uncertainty. It is the anti-dashboard: no numbers, no bars, no lamps — just a
few dots on a hill and the immediate human read of "are we past the hard part yet?" For a solo dev watching
agents, that maps perfectly onto "has this ticket cleared review, or is it still risky?" `observed`.

## Inherited rules (if this anchors a direction)
1. Progress = **position on a hill** (uphill=figuring out, crest=the gate, downhill=executing) — not a bar or %.
2. A child ticket = a **labelled dot**; colour marks phase and lives in the dot.
3. Ground = one of Basecamp's **oklch pastel tints** (blue `#EDF0F7` / warm `#F6F2EC`), ink `#33434B` — never white, never pure grey.
4. State changes as **saved snapshots you can step through**, not ambient motion.
5. Face: a warm humane sans/serif (Graphik / an editorial serif), body ≥16px.
