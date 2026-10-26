# Teardown — Order-tracking stepper (live, light)

**Openable:** <https://www.bootdey.com/snippets/view/Shop-Order-Tracking> — public, no login; the component
renders live on the page. Rendered live 2026-08-02, `colorScheme: light`. Screenshot:
`.bobby/design/shots/ordertrack.png`. **Extraction:** `extracted` = live computed styles / `:root`; `observed` = screenshot.

## The four citation fields

| Field | |
|---|---|
| **Name** | Shop order-tracking stepper (the universal "delivery status" progress pattern). |
| **Source** | <https://www.bootdey.com/snippets/view/Shop-Order-Tracking> (a representative live specimen of the pattern) |
| **What's good (the thinking)** | It is the **warmest, most universally-understood ordered-progress UI there is**: a horizontal row of **icon nodes joined by a filling line** — `Confirmed → Processing → Quality Check → Dispatched → Delivered`. Completed steps are **filled + connected in the accent colour**; the current step is emphasised; upcoming steps are **grey and disconnected**. A one-line status ("Status: Checking Quality") and an expected date sit above. Anyone who has bought anything online reads it instantly — no legend, no training. Each node uses a **drawn icon** that names its phase (cart, gear, badge, van, house). |
| **What we take** | The **friendly icon-stepper** as a warm register of the pipeline (plan→build→review→test with drawn phase icons + a filling connector); the **done / current / upcoming** three-state line; a plain-language **status line + expected time** header. |

## Extracted values

### Colour — `extracted` (Bootstrap 4 defaults — take the *pattern*, not these tokens)
- **Page:** ground `#F2F6F8` (cool light), ink `rgba(24,35,89,0.85)` ≈ `#182359`.
- **Semantic set (`:root`):** primary/blue `#007BFF`, success `#28A745`, warning `#FFC107`, danger `#DC3545`, teal `#20C997`. **Note:** these are stock Bootstrap — inherit the **stepper structure**, but use our own tonal palette (GitLab's), not Bootstrap blue.
- **Stepper (`observed`):** done nodes = filled **blue** circles, white icon, joined by a **blue** line; upcoming = **grey** circles + grey line. State is entirely in the node fill + the connector colour — **no stripe.**

### Type — `extracted`
- **Body:** system sans 14px; the **tracking number uses `source-code-pro` (mono)** — figures/IDs in mono again, echoing the departure-board and Statuspage pattern. Raise body to 16px floor.

### Surface — `extracted` / `observed`
- **Radii:** buttons `4px`; nodes are full circles (`50%`) `observed`.
- **Header band:** a dark title bar ("TRACKING ORDER NO — …") over a light status row `observed` — one small dark accent for the ID, everything else light.
- **Icons:** one drawn glyph per node, sized to the circle `observed`.

## The true feel
Reassuring and effortless. It never asks you to interpret — the filled line *is* the progress, the grey nodes
*are* the future, and the current status is written in a sentence. For a solo dev, this is the "even my
non-technical brain gets it at a glance" register: the feature's four stages as a friendly, iconographic track.
`observed`. **Caveat:** this is a generic Bootstrap snippet, so it's a strong reference for the **pattern** and a weak one for **craft tokens** — take the structure, bring our own palette/type.

## Inherited rules (if this anchors/reinforces a direction)
1. Pipeline = a **horizontal icon-stepper**: filled+connected (done) → emphasised (current) → grey+disconnected (upcoming).
2. Each stage node carries a **drawn phase icon** (plan / build / review / test) sized to the node.
3. A **plain-language status line + expected time** sits above the track.
4. **Mono for IDs/figures**; body ≥16px.
5. Bring **our own tonal palette** (GitLab's) — do not inherit Bootstrap blue; keep only the pattern.
