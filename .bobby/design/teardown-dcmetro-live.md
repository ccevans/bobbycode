# Teardown — DC Metro Live Map (real-time transit map)

- **Name:** DC Metro Map — Live Map (real-time train positions on the Washington Metro)
- **Source URL:** <https://dcmetromap.com/live-map/>
- **Rendered:** 2026-08-02, 1440×900, `colorScheme: light`, Playwright. Screenshot: `shots/dcmetro-live.png`. CSS pulled from `assets/index-DFRLB8Ks.css`; line colours are drawn on map tiles (`observed`).

## What's good — the *thinking*
A transit map is the canonical "ordered journey with live position." A **line** is one coloured
stroke; **stations** are nodes strung along it in fixed order; a **transfer/interchange** is a
bolder ringed node where lines meet — a decision point. This app adds the live layer: **the train
is a dot that moves along the line in real time**, so you read "where is it now" as *position on a
route*, never as a status word. Crucially the map is **light** — a near-white ground with a few
**highly saturated line colours** doing all the semantic work, and a calm off-white control panel
docked left. It proves a live, coloured, legible progress display with **zero** left-stripes, zero
pulsing dots, zero purple-by-default (purple here is a *real* line, earned). The interchange-as-node
is the exact shape of our gate: the point on the route where something has to happen.

## What we take
The **single-line-as-pipeline**: draw the four stages (plan→build→review→test) as **four stations on
one horizontal line**, the running feature as **a train dot moving between them**, and the gate as a
**bolder interchange node** where the morphing action lives. Colour lives in the line + node, never a
card edge. The off-white docked panel is a good model for the quiet "controls/legend" register.

## Extraction confidence
- **Ground / surface / panel:** `extracted` (from bundle CSS).
- **Line colours:** `observed` (rendered on tiles, not in CSS).
- **Type:** the app uses CSS vars (`--font-display`, `--font-mono`, serif `Georgia`) — pattern, not a face to copy.

## Exact tokens
| Token | Value | Confidence |
|---|---|---|
| Map ground | near-white / off-white | observed |
| Control panel ground | **`#F5F5F7`** (cool neutral) | extracted |
| Surface / cards | **`#FFFFFF`** | extracted |
| Warm callout ground | **`#FFEDD5`** (the "buy me a coffee" note) | extracted |
| Red-tint ground | **`#FEE2E2`** | extracted |
| Mono stack | **`ui-monospace, SFMono-Regular, Menlo, Consolas`** | extracted |
| Serif | `Georgia, "Times New Roman", serif` | extracted |
| Line: red | ≈ `#D8232A` | observed |
| Line: blue | ≈ `#0072C6` | observed |
| Line: orange | ≈ `#F7941E` | observed |
| Line: yellow | ≈ `#FFD200` | observed |
| Line: green | ≈ `#00A94F` | observed |
| Station node | white-filled dot, coloured stroke | observed |
| Interchange node | bolder **ringed** node (purple ring), sits over the line | observed |

## The signature move
**One coloured line, ordered station nodes, a moving train dot, and a bolder ringed interchange as
the decision point** — the whole state read as *position on a route*, on a light ground.
