---
id: TKT-055
title: Feature view pipeline cannot represent the four design-* stages
stage: backlog
type: bug
priority: medium
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

Found in the TKT-050 design review.

TKT-050 made tickets in the four `design-*` stages reachable on the Board, which is correct.
Following one of those rows up to its epic now lands on a Feature view that cannot describe
where the work is.

The Feature view's Pipeline is the spec's five fixed steps — Plan / Build / Review / Test /
Merge (`.bobby/design/design-spec-feature-view.md`, "The pipeline (the signature)"). With an
epic whose four children sit in `design-research`, `design-analyze`, `design-mockup` and
`design-spec`, the Pipeline renders **"0 of 5" with every glyph hollow** and the connector
entirely `--hairline`, while the Tickets list directly beneath it reads "Design Research ·
in progress", "Design Analyze · in progress", and so on.

So the page says two contradictory things about the same feature in one column: nothing has
started, and four things are in progress. The rows are right; the Pipeline is the part that
has no vocabulary for these stages.

This is not a regression from TKT-050 — the mismatch was always in the code — but TKT-050 is
what makes it reachable, because before it these tickets were drawn nowhere at all.

Note this is a spec question before it is a code one: the five-step pipeline with the
chequered finish is the design's signature move, so adding four glyphs to it is a change to
the locked spec, not a bug fix. Options worth weighing: map the design stages onto Plan, show
a second pipeline for design-workflow epics, or have the Pipeline read its steps from the
epic's own workflow the way the Board now reads its lanes from `lib/stages.js`.

## Acceptance Criteria

- [ ] An epic whose children are in `design-*` stages shows progress that matches its own Tickets list
- [ ] The Pipeline never reads "0 of 5, nothing started" while the rows beneath it read "in progress"
- [ ] Whichever resolution is chosen is recorded in `.bobby/design/design-spec-feature-view.md`, since the five-step pipeline is a locked spec value
- [ ] The chequered finish at Merge survives the change

## Steps to Reproduce (bugs only)

1. Seed an epic with four children, one in each of `design-research`, `design-analyze`, `design-mockup`, `design-spec`.
2. Open `#/board`, click the feature row.
3. Expected: the Pipeline reflects that four children are underway. Actual: "Pipeline — 0 of 5", all five glyphs hollow, above four rows that each say "in progress".

## Comments
