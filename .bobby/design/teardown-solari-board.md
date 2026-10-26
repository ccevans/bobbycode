> **SUPERSEDED for TKT-005 (Feature view).** The user asked for real, openable, live-renderable
> references instead of physical-artifact reconstructions. This teardown is retained for its
> thinking but is **not** part of the active reference set. Active set: `teardown-gitlab-pipelines.md`,
> `teardown-github-actions.md`, `teardown-statuspage.md`, `teardown-plausible-live.md`.

# Teardown — Solari split-flap departure board

**Reference type:** physical specimen. Rendered from a photograph of a working board and
cross-checked against design-history sources. `observed` = from the photo; `cited` = documented.

## The four citation fields

| Field | |
|---|---|
| **Name** | The **Solari di Udine split-flap departure board** (Gino Valle, industrial design; the letter/number "Solari board" won the Compasso d'Oro in **1956** and spread to airports and stations worldwide). Specimen photographed: the flap board at **Gare du Nord, Paris (2007)**. |
| **Source** | Specimen image: `Gare_du_Nord_Fallblattanzeiger_Departure-board.JPG` (Wikimedia). History: [Solari Spa – History](https://www.solari.it/en/history/) · [Simple Flying – History of the Solari Board](https://simpleflying.com/split-flap-airport-displays-the-history-of-the-solari-board/) · [Split-flap display, Wikipedia](https://en.wikipedia.org/wiki/Split-flap_display). |
| **What's good (the thinking)** | It is a **status surface a whole room reads at once.** Hundreds of people standing on a concourse all get their answer — is my train boarding, delayed, gone — from one high-contrast board, no interaction, no scrolling. State is **columnar and aligned** (time · destination · remarks · platform) so the eye scans down one column for the one fact it wants. And change is **physical and honest**: when a departure updates, the flaps *snap* — an unmissable, meaningful motion that says "this just changed," with a sound. Nothing animates that hasn't actually changed. |
| **What we take** | **Read-at-a-glance status** as the organizing value for "what needs me," the **aligned columnar row** per ticket, and the **flip-on-change** as the one honest motion — the direct replacement for the pulsing status dot. |

## Extracted values

### Colour
- **Field:** deep near-black, faint blue-cast — `observed ≈ #14181C`. Matte, no glow.
- **Characters:** warm amber/ochre and off-white on the black cells `observed ≈ #E8B04B` (amber) / `#EDE7D8` (bone). High luminance contrast is the whole point.
- **Live clock:** a single red seven-segment readout (`14:26` in the specimen) — the one saturated non-amber element `observed ≈ #D8352A`.
- **Distinct colours:** ~4. A board is almost monochrome by design; colour is reserved for *the exception*.

### Type
- **Character grid:** fixed-width **monospace cells** — every glyph occupies one flap module, so columns align perfectly regardless of content `cited`. This is why it reads as a *board* and not a table.
- **Case:** all-caps destinations `observed`. (For UI we keep the *monospace figure/ID treatment* but do **not** inherit all-caps body — floor + readability win.)

### Shape / layout
- **Composition:** a header band (`DÉPART · DEPARTURE · ABFAHRT`), then rigid rows; each row = one departure, split into aligned column groups `observed`.
- **Frame:** the board is a **discrete physical object mounted on the wall** — a dark instrument in a light stone concourse. It is not the whole environment; the station around it is bright. `observed` — this is the key to a *light-theme* translation.
- **Density:** high but never cramped; generous cell padding, strong row rhythm `observed`.

### Motion
- **Flip:** each changed cell riffles through intermediate glyphs and lands with a mechanical snap — roughly `estimated 300–700ms` per cell, cascading across a row. Only changed cells move.
- **Everything else:** dead still. Stillness is what makes the flip legible.

## The true feel
Institutional, honest, unhurried authority. It doesn't try to delight — it tries to be *unambiguous
from forty feet away*. The drama is entirely in the moment of change: the clatter of flaps is the
board telling the room something happened. For the Feature view: **a board you glance at, that
flips when an agent moves a ticket — no marquees, no pulses, one truthful motion.**

## Inherited rules (hard constraints if this direction is chosen)
1. One aligned row per ticket; columns are fixed and scannable top-to-bottom.
2. Monospace for IDs / stage / figures so columns lock.
3. **Flip-on-change is the only ambient motion.** Nothing moves that didn't change.
4. Colour reserved for the exception (the "needs you" row, the failure) — the board is otherwise near-neutral.
5. **Light-theme translation:** the *room* is light (warm paper); the board may be a darker enamel
   *instrument* embedded in it — an object, not "dark mode." Flag this tension with the user.
