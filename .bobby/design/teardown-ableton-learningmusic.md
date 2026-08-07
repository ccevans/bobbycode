# Teardown — Ableton "Learning Music" (Make Beats step sequencer)

- **Name:** Ableton — Learning Music, "Make beats" chapter (interactive step sequencer)
- **Source URL:** <https://learningmusic.ableton.com/make-beats/make-beats.html> (site root <https://learningmusic.ableton.com>)
- **Rendered:** 2026-08-02, 1440×900, `colorScheme: light`, Playwright. Screenshots: `shots/ableton-beats.png`, `shots/ableton-music.png`. Palette also cross-checked against the sibling **Learning Synths** playground (`shots/ableton-synths.png`), which shares the type + ink system.

## What's good — the *thinking*
This is the single closest real-world artifact to "a live thing moving through an ordered set of
stages." A musical bar is drawn as a **row of equal cells, numbered 1→16 left to right**. A cell is
**on** (filled, saturated) or **off** (empty, hairline). Above the cells runs a **playhead** — a
scrubber that **sweeps left→right in real time as the loop plays**, lighting each column as it
passes. There is no status text, no percentage, no dot: *position of the playhead IS the current
state, and the pattern of filled cells IS what's done.* That is exactly the Feature view's job —
show where the run is now and which stages are armed — expressed as a physical, moving thing a
five-year-old can read. The controls are radically quiet: one **▶ play**, a **Clear**, an
**Export** link. The interface trusts the moving playhead to carry all the "live"-ness, so nothing
else has to pulse.

## What we take
The **sweeping-playhead-over-ordered-cells** as the live indicator, and the **on/off cell** as the
per-stage state — *not* the palette (see below). Four stages = four (or four grouped) cells;
the playhead sits at the running stage; a filled cell = done, an outlined cell = waiting, and the
cell under the playhead is the one live now. Motion communicates progression instead of decorating.

## Extraction confidence
- **Structure / signature move:** `observed` — high confidence, clearly visible in the render.
- **Palette:** **low / not taken.** The site ground computes to **`rgb(102,102,102)` (#666, a mid
  grey)**, not a light theme. We inherit the *pattern*, render it on our own light ground. This is a
  "take the pattern, not the tokens" reference, like the order-tracking stepper.

## Exact tokens
| Token | Value | Confidence |
|---|---|---|
| Page ground | `#666666` mid-grey (**rejected** — we go light) | extracted (computed body bg) |
| Display face | **Futura PT Bold**, H1 48px / H2 30px, weight 700 | extracted (computed) |
| Body / ink face | **AbletonSans**, deep navy ink **`#00004C`** (rgb 0,0,76) | extracted (Learning Synths computed) |
| Active cell fill | warm saturated yellow ≈ **`#FFC92E`** | observed (from render) |
| Inactive cell | grey fill + 1px darker gridline, no fill on empty | observed |
| Step numbers | muted, 1–16, small, low-contrast under the grid | observed |
| Playhead | white scrubber dot on a thin track above the grid | observed |
| Accent set (Synths) | blue / green `#2ECC8F`-ish / yellow / red — one hue per module | observed |
| Controls | single ▶ play, "Clear", "Export to Live" — text links, no chrome | observed |

## The signature move
**A playhead sweeps across a row of numbered cells; each cell is simply on or off.** The moving
head is the only animated element and it means "here, now." Everything else is still.
