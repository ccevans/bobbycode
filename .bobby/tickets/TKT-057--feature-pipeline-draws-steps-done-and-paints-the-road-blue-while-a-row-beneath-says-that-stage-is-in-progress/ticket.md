---
id: TKT-057
title: >-
  Feature pipeline draws steps done and paints the road blue while a row beneath
  says that stage is in progress
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

TKT-055 fixed the direction it was filed for: a step a ticket is standing on is now drawn
`now`, never `todo`. The opposite direction is still open.

`clearedSteps()` in `app/app/views/feature.js` returns the epic's own position and never
consults the children whenever the track names the epic's stage:

```js
function clearedSteps(steps, epic, children) {
  const fromEpic = stepPosition(epic.stage, steps);
  if (fromEpic !== null && fromEpic >= 0) return fromEpic;   // <- children never read
  ...
}
```

The spec (`.bobby/design/design-spec-feature-view.md`, "The pipeline (the signature)") says
the count is **steps cleared, and a step is cleared only when the LEAST advanced ticket has
left it**. When an epic's own stage runs ahead of one of its children — a send-back, or a
run that advanced the epic while a child stayed put — the count claims steps the rows say are
not cleared, and the connector is drawn from that same count.

Live repro (design workflow, epic at `design-spec`, one child still at `design-research`):

- header reads **"3 of 7"**, progress bar 43% filled, `aria-label="3 of 7 stages complete"`
- the connector is painted `--blue` from the Design Research glyph down to Design Spec
- Design Analyze and Design Mockup carry **done checks**, with no ticket on either
- the row an inch beneath reads "Still gathering — Design Research · in progress"

So the route reads current -> done -> done -> current. A route cannot go backwards, and the
blue road runs out of a glyph the page simultaneously says you are standing on. This is the
same contradiction TKT-055 exists to prevent, pointing the other way.

Fix direction: take the minimum of the epic's own position and the least advanced child's
position, rather than short-circuiting on the epic. Whichever way it resolves, the spec's two
sentences on this need to stop contradicting each other — "the least advanced ticket" and
"the epic's own stage answers whenever the track names it" cannot both be the rule.

Evidence: `.bobby/design/mockups/shots/chk-feature-behind-390.png`.

## Acceptance Criteria

- [ ] No step is drawn `done` unless every unblocked child has left it
- [ ] The count, the progress bar and the blue length of the connector all agree with the glyphs
- [ ] The connector never paints `--blue` through a glyph drawn as current
- [ ] The spec records one rule for the count, not two that disagree
- [ ] An e2e case covers an epic whose own stage is ahead of one of its children

## Steps to Reproduce (bugs only)

1. Seed an epic on the `design` workflow, moved to `design-spec`.
2. Give it two children: one at `design-research`, one at `design-spec`.
3. Open `#/feature/<epic>`.
4. Expected: the count reflects that nothing has cleared Design Research. Actual: "3 of 7",
   two done checks, and a blue road running out of the current Design Research glyph.

## Comments
