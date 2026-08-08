---
id: TKT-050
title: >-
  Design tickets vanish from the app board — BOARD_ORDER omits the design-*
  stages
stage: backlog
type: bug
priority: medium
area: ui
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
created: '2026-08-08'
updated: '2026-08-08'
---

## Description

`views/board.js` in the Pro app builds its lanes by filtering tickets against
a hardcoded `BOARD_ORDER`. A ticket whose stage is not in that list matches no
lane, is not an epic and is not blocked — so it renders nowhere. It does not
appear in a fallback lane or an "other" bucket. It is simply gone from the
board.

`BOARD_ORDER` omits all four design-pipeline stages:
`design-research`, `design-analyze`, `design-mockup`, `design-spec`.

So any ticket running the built-in `design` workflow disappears from the app
board for four of its six stages. The stages themselves are real and valid —
they are in `lib/stages.js` and the CLI board renders them.

Found while fixing TKT-049, which had the same shape: a new stage (`security`)
would have vanished the same way. That one was fixed in the same pass because
it was the ticket's own stage; these four were pre-existing and out of scope.

The real fix is structural rather than adding four strings: the board should
derive its lanes from the stage list rather than restating it, so a stage
added to `lib/stages.js` cannot silently fall out of the UI again. The API
already exposes what is needed — `/api/workflows` returns resolved stages, and
tickets carry their stage — so the lane set can be computed rather than
hardcoded.

Note the app is a separate repo: /Users/ccevans/Desktop/bobbycode-pro/app/app/
It is governed by .bobby/design/design-spec-feature-view.md — light only, no
new colours outside the spec's tokens.

## Acceptance Criteria

- [ ] A ticket in any valid stage appears somewhere on the app board
- [ ] Lanes derive from the stage list rather than a hardcoded copy of it
- [ ] Adding a stage to lib/stages.js does not require an edit in board.js
- [ ] Design-workflow tickets render through all six of their stages
- [ ] A test proves an unknown/new stage does not silently disappear

## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]

## Comments
