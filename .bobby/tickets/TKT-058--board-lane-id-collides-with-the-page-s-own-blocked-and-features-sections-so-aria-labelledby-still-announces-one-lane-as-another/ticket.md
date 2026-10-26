---
id: TKT-058
title: >-
  Board lane id collides with the page's own Blocked and Features sections, so
  aria-labelledby still announces one lane as another
stage: done
type: bug
priority: high
area: ui
author: unknown
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
feature: null
persona: null
created: '2026-08-08'
updated: '2026-08-08'
---

## Description

Found in the independent design check on TKT-055 / TKT-054 / TKT-056.

TKT-054 made lane ids unique **among lanes**. The Board also draws two sections whose ids are
hard-coded and which `laneLabels()` never sees:

- `featuresSection` -> `features-head`
- `blockedSection`  -> `lane-blocked-head`

`laneLabels()` in `app/app/views/board.js` starts its `used` set empty, so a lane can still
mint an id that one of those two already owns. Stage strings come off disk and a hand-edited
frontmatter can hold anything — which is the same class of input the spec's own example uses
(`design-spec` beside a hand-typed `Design Spec`).

Live repro, on a board that also has an epic and a blocked ticket:

- a ticket whose stage is `Blocked` (one capital) slugs to `blocked`, so its lane takes
  `id="lane-blocked-head"` — a **duplicate id on the page**
- that lane's `<section aria-labelledby="lane-blocked-head">` resolves to the **Blocked
  section's** heading, so the lane is announced as the Blocked section. One lane announced as
  another: exactly the failure TKT-054 was filed for
- a ticket whose stage is `Features` produces a second visible `<h2>Features</h2>`, so the
  heading is not unique in words either — the spec's rule is "unique in words and in `id`"

Measured: `duplicateIds: ["lane-blocked-head"]`, and one section whose `aria-labelledby`
resolves to a heading that is not its own.

The new e2e suite cannot catch this: `seedAwkwardBoard` seeds four plain tickets and no epic
and no blocked ticket, so the two hard-coded ids are never on the page at the same time as
the lanes (`expect(ids).toHaveLength(4)`).

Fix direction: seed `used` with every id the page will draw (`features-head`,
`lane-blocked-head`, and any other fixed section id) before the lanes are labelled, and apply
the twin-word fallback across the drawn set including those two sections.

Evidence: `.bobby/design/mockups/shots/chk-board-1440.png` — two `Blocked` headings and two
`Features` headings on one board.

## Acceptance Criteria

- [ ] No duplicate `id` anywhere in `#app` on a board carrying a hand-edited `Blocked` or `Features` stage
- [ ] Every `aria-labelledby` resolves to its own section's heading, with an epic and a blocked ticket also on the page
- [ ] No two visible section headings on the Board read the same words
- [ ] The e2e case seeds an epic and a blocked ticket alongside the awkward stages

## Steps to Reproduce (bugs only)

1. Seed a board with an epic, a blocked ticket, and two hand-edited stages: `Blocked` and `Features`.
2. Open `#/board`.
3. Expected: every lane has its own id and its own words. Actual: `lane-blocked-head` appears
   twice, the second lane is announced as the Blocked section, and `Features` is drawn twice.

## Comments
