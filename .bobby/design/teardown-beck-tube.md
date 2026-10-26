> **SUPERSEDED for TKT-005 (Feature view).** The user asked for real, openable, live-renderable
> references instead of physical-artifact reconstructions. This teardown is retained for its
> thinking but is **not** part of the active reference set. Active set: `teardown-gitlab-pipelines.md`,
> `teardown-github-actions.md`, `teardown-statuspage.md`, `teardown-plausible-live.md`.

# Teardown — London Underground diagram (Harry Beck, 1933)

**Reference type:** physical/print specimen. Rendered from two archival images and cross-checked
against design-history sources. Values marked `cited` come from documented specs; `observed`
from the rendered image; `estimated` where neither was available.

## The four citation fields

| Field | |
|---|---|
| **Name** | Harry Beck's London Underground diagram, first public edition **1933** (and its living descendant, the current TfL Tube map). |
| **Source** | Specimen images: `Beck_Map_1933.jpg` and `London_Tube_Map.png` (Wikimedia). Design history: [English Heritage – Harry Beck](https://www.english-heritage.org.uk/visit/blue-plaques/harry-beck/) · [London Transport Museum](https://www.ltmuseum.co.uk/collections/stories/design/transforming-tube-map-harry-becks-iconic-design) · [When Topology Trumped Topography, tandfonline](https://www.tandfonline.com/doi/full/10.1080/00087041.2021.1953765). |
| **What's good (the thinking)** | It **throws away geography to show sequence and connection.** The only thing a rider needs is: which line am I on, which stations are ahead, and where do I change. Beck drew that as an electrical-circuit diagram — every line straightened to horizontal, vertical, or 45°; distances falsified so the dense centre and sparse edges read equally. The *structure carries all the information*; colour only names the lines. A whole network becomes a single glanceable object with no legend-reading required. |
| **What we take** | The **ordered-track-with-stations** spine for the pipeline, and — critically — **colour that is structural, not decorative**: the stage colour *is the line*, not a stripe stuck on a card. Plus a genuinely light, warm ground that is reference-backed rather than reflex-cream. |

## Extracted values

### Colour
- **Ground (1933 specimen):** warm parchment / ivory — `observed ≈ #F2EFE6`, biased warm-yellow, not white. `estimated hex`.
- **Ground (current TfL):** pure white `#FFFFFF` `observed` — the descendant dropped the warmth. We take the **1933 parchment**, which defuses the "reflexive cream" slop flag because it is reference-backed.
- **Frame:** a single blue keyline border boxes the whole diagram `observed`.
- **Line palette (structural):** TfL standard line colours `cited` — Bakerloo `#B36305`, Central `#E32017`, District `#00782A`, Piccadilly `#003688`, Victoria `#0098D4`, Northern `#000000`, Circle `#FFD300`, Metropolitan `#9B0056`. Each is saturated and used **only as the line itself**. No line colour ever appears as a fill, a badge, or an edge-stripe.
- **Distinct hues on the page:** ~10, each doing one job (naming a line) `observed`.

### Type
- **Face:** a variant of **Johnston / New Johnston** (Edward Johnston, 1916) `cited` — humanist sans, near-circular O, diamond tittle on the i. Never a system default.
- **Case:** station names in mixed or caps, set tight to their tick, ranged along the line direction `observed`.
- **Floor caveat:** on the physical poster, station labels are tiny relative to the sheet. **Do not inherit the size** — take the *proportion* (labels subordinate to the line) and set real UI type at/above the 16px floor.

### Shape / layout
- **Angles:** only 0°, 90°, 45° `cited`. Nothing curves except the Thames.
- **Stations:** plain stop = a **tick mark** across the line; **interchange = a ringed circle / (originally) a diamond** `cited`. The ring is the "you change here / decision point" glyph — the single most transferable convention for this screen: **the current stage / "waiting on you" gate is the interchange ring.**
- **Anchor:** the network itself; no headline, no hero. The roundel logo sits bottom-right; a boxed "REFERENCE" key bottom-centre `observed`.
- **The one geographic survivor:** the Thames, a soft blue band — a single orienting landmark kept when everything else was abstracted. (Lesson: allow exactly one concession to the literal.)

### Motion
- None — it is print. **The transferable motion idea is implied, not shown:** a marker advancing one station along a fixed line. Directed, discrete, meaningful — the opposite of a pulsing dot.

## The true feel
Quiet, exact, trustworthy. The diagram never raises its voice; it wins by being *legible in half a
second from across a platform*. The energy is entirely in the geometry and the colour discipline —
remove either and it collapses into a normal map. For the Feature view this is the argument: **let the
pipeline's shape do the work, and spend all the colour on the line, none on the chrome.**

## Inherited rules (hard constraints if this direction is chosen)
1. Stage colour appears **only** as the line/track — never as a card edge-stripe (kills the #1 slop tell by construction).
2. Straight segments only; 45° for any turn.
3. The current/blocked gate is an **interchange ring**, visually distinct from plain station ticks.
4. Warm parchment ground `#F2EFE6`-ish, reference-backed — not white, not reflex-cream.
5. Exactly one "Thames" — one allowed concession to literal chrome; everything else abstracted.
