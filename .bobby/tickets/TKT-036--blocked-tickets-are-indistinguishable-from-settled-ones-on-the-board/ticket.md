---
id: TKT-036
title: Blocked tickets are indistinguishable from settled ones on the Board
stage: done
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
created: '2026-08-07'
updated: '2026-08-07'
---

## Description

A blocked ticket sits inside the lane for its stage and renders with
`rdot settled` — the same filled `--dot-muted` grey as every other settled row.
Nothing but the sublabel's first word separates it, and that word also replaces
the stage word, so a blocked row is the only row on the board that names neither
its stage nor its ID.

This is not a spec violation: `--bad` is deliberately kept out of `.appview`, and
the stage lamps are binary by design. But the redesign left blocked with no
channel at all, and the board is the surface whose job is surfacing what is
stuck. In the populated fixture TKT-011 is blocked and is only findable by
scrolling to the Building lane and reading a grey row — the page-head status line
does not mention it either, because `statusOf()` only reports blocked counts when
nothing is running and nothing waits on the user.

The dot vocabulary already has three shapes (blue filled / grey filled / hollow
ring). A fourth channel that is not colour — a grouped "Blocked" section, or the
count surfaced in the head — would fit the system without reintroducing a hue.

Related: `BOARD_ORDER` in `views/board.js` contains `'blocked'` as if it were a
stage, but blocked is a boolean flag on the ticket and no ticket's `stage` is
ever `'blocked'`, so that lane can never render. Dead entry.

## Acceptance Criteria

- [ ] A blocked ticket is distinguishable from a settled one without reading the sublabel
- [ ] The distinction is not carried by colour alone
- [ ] No new hue enters `.appview` (`--bad` stays out)
- [ ] The dead `'blocked'` entry in `BOARD_ORDER` is removed or made real

## Steps to Reproduce (bugs only)

1. Open the populated board fixture at 390px (`#/board`)
2. Scroll to the Building lane — TKT-004 and TKT-011 sit side by side
3. TKT-011 is blocked; its dot is identical to TKT-004's, and the page head says
   "Waiting on you · 2 decisions" with no mention of the block

## Comments
