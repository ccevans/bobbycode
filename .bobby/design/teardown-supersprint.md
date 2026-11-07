# Reference Teardown — Super Sprint (Atari Games, 1986) + F1 timing tower

Two small, precise references. Extracted 2026-08-25 from rendered screenshots, read as images.

---

## A. Super Sprint — top-down pixel circuit

**Source:** [LaunchBox Games Database gallery](https://gamesdb.launchbox-app.com/games/images/39355-super-sprint),
screenshots downloaded and read. Game record: [MobyGames](https://www.mobygames.com/game/arcade/super-sprint).

**What's good:** the *track-select screen* renders eight complete circuits as small pixel diagrams —
each one legible as a specific track at roughly 100×80px. It proves a circuit can be a compact
graphic element, not a full-bleed hero illustration. That is the format a page section needs.

**Extracted, from the render:**

| Element | Observed |
|---|---|
| Track surface | dark desaturated purple-grey ribbon, flat fill, no texture |
| Infield / outfield | mid green, dithered edge against the tarmac |
| Track edging | dashed light kerb marks following the ribbon, drawn 1px |
| Start/finish | a single white bar across the ribbon |
| Ground | black field around each diagram |
| HUD | bright saturated primaries on black, pixel type, top edge only |
| Diagram size | ~100×80px each, eight in a 3-3-2 grid |

**What we take:** the circuit-as-small-diagram format, the single white start/finish bar, and the
dashed kerb edging.

### Palettes, sampled per screen (added 2026-08-25 for the direction lineup)

| Screen | Dominant | Then | Role |
|---|---|---|---|
| Track select | `#000000` 53.3% | `#403050` 21.0%, `#70B030` grass | black surround, plum tarmac |
| **Attract / title** | **`#600070` 51.9%** | `#703070` 7.1% | a deep magenta ground for the attract loop |
| Cabinet art | `#1F1726` 45.4% | `#008A2E` 6.4% | dark ground, saturated arcade green |

The attract screen's `#600070` is the find: a committed, saturated ground that has nothing to do
with the muted plum of the track-select screen. An arcade cabinet is *loud* when it is trying to
get your attention and *legible* when you are playing. Two different jobs, two different grounds.

---

## B. F1 timing tower — sector semantics

**Source:** [The Field — How to Read the F1 Timing Screen](https://www.thefieldf1.com/charts/how-to-read-timing-screen),
rendered and read.

**What's good:** a lap is formally divided into **three sectors** (S1, S2, S3) by fixed timing
loops, and each sector is coloured against two benchmarks:

| Colour | Meaning |
|---|---|
| Purple | outright fastest of the session |
| Green | personal best, but someone else is quicker |
| Yellow | slower than that driver's own best |
| White / grey | sector not completed yet on this lap |

Plus the quoted structural point: *"the sectors are timed independently, but the lap isn't built
independently"* — carrying speed out of one sector's final corner compromises entry into the next.

**What we take:** the **three-sector division of a lap**, and that sentence, which is precisely
bobby's thesis about plan → build → ship. Three stages, timed separately, but the run isn't built
independently — a bad plan compromises the build.

**What we do NOT take: the colour set.** Purple/green/yellow is four more colours than the Sugar
Rush palette discipline allows, and purple is on the slop checklist. The sector *structure* is
inherited; the sectors are painted in the project palette.
