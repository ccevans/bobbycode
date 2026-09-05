# Reference Teardown — Goodwood Revival entry list

Extracted 2026-08-25. Method: downloaded the official PDF, rendered page 1 to an image, read it,
then sampled the palette per-region from the render. Not from memory of what a programme looks like.

**Source:** [Goodwood Revival 2025 public entry list (PDF, 38pp)](https://www.goodwood.com/globalassets/.road--racing/event-coverage/revival/2025/09-sept/entry-list/entry-list-10.9.2025.pdf)
· context: [2025 Revival entry list](https://www.goodwood.com/grr/event-coverage/goodwood-revival/2025-revival-entry-list/)

---

## What's good

A race meeting publishes a document whose entire job is *"here is everything that is running,
and who is responsible for each one."* That is exactly what a board of tickets is. The form is
already solved, has been for a century, and nobody has to be taught how to read it.

## Palette — sampled per region

| Value | Share | Role |
|---|---|---|
| `#FFFFFF` | 87.7% | ground |
| `#0C5645` | masthead 15.4%, header row 1.8% | **British racing green** — masthead, column headers, all rules, footer |
| `#2F2F2F` | body rows | row text |
| `#C0C0C0` | — | hairline rules between rows |
| `#52877A` / `#3B7769` | — | green at partial coverage (antialiasing, not separate tokens) |

Two colours doing everything: green for structure and authority, near-black for data. White
carries 88% of the page.

## Structure — read off the render

```
Entry List – Public                                    Goodwood Revival 2025     ← masthead, italic bold, green
Race(s): 1  Freddie March Memorial Trophy – For cars in the spirit of …          ← race title, italic bold, small
──────────────────────────────────────────────────────────────────────────────   ← rule
Car No.  Shelter No.  Year   Make and Model    Entrant        Confirmed Driver(s) ← headers, ITALIC, green
──────────────────────────────────────────────────────────────────────────────
     1        141     1953   Alfa Romeo 6C 3000PR 'Disco Volante'   Mann, Christopher   …
     2        130     1951   Frazer Nash Mille Miglia               Champion, Philip    …
──────────────────────────────────────────────────────────────────────────────
10 September 2025 - 10:17                                          Page 1 of 38  ← footer, italic green
```

- **Car numbers right-aligned** in a narrow first column. Numbers are the index, so they lead.
- **Column headers are italic**, the same italic as the masthead. The italic *is* the system.
- Rules only above and below the header band, and one closing the table. Rows are separated by
  space, not by lines.
- A row that wraps (two drivers) simply takes two lines; the grid does not fight it.
- Footer carries a timestamp. The document knows it is a snapshot of a live thing.

## What we take

The **entry-list form itself**: an index number, a class, a thing, and who is responsible for it.
Green italic headers over a white ground, hairlines only where the table starts and stops, and a
timestamped footer. Mapped onto bobby: ticket number, sector, what it does, which agent has it.

## What we do not take

The typeface (unidentified in the PDF and not licensable from a scan), the Goodwood name, and
the exact column set. `unknown` — the specific face; a characterful italic serif stands in.
