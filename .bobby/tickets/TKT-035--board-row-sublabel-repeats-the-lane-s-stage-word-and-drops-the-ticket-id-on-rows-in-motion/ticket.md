---
id: TKT-035
title: >-
  Board row sublabel repeats the lane's stage word and drops the ticket ID on
  rows in motion
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

`ticketState()` in `app/app/views/board.js` builds every row's sublabel as
`"<Stage> · <detail>"`. Two consequences, both visible at 390px on the populated
fixture:

1. **Redundancy.** The lane already has an h2 that names the stage and a count
   beside it. Inside the Backlog lane the word "Backlog" then appears six times
   in one section — once in the head, once in each of five rows. The acceptance
   criterion "stage legible without relying on colour alone" is already met by
   the lane heading, which is text; the row-level repeat buys nothing and is the
   one unexempted hit on the slop checklist (§6, "the same text repeated in
   multiple slots" / "redundant UX writing").

2. **The ID disappears from exactly the rows that matter.** The detail slot holds
   the ticket ID only on settled and backlog rows. On a row in motion the ID is
   replaced by the elapsed time — `Testing · waiting 8m` — and on a blocked row
   by the reason — `Blocked · waiting on the ops key rotation window`. Looking an
   ID up is what a board is for, and it is present on the rows nobody is chasing
   and absent on the rows they are.

Home and Feature are not affected: their rows describe workspaces, which have no
lane heading above them, so the leading word there is load-bearing.

## Acceptance Criteria

- [ ] A row inside a lane does not repeat the lane heading's own stage word
- [ ] The ticket ID is present on every row, in motion or not
- [ ] Stage remains legible without relying on colour alone (the lane heading carries it)
- [ ] Home and the Feature view's row sublabels are unchanged

## Steps to Reproduce (bugs only)

1. Open the populated board fixture at 390px (`#/board`)
2. Read the Backlog lane: the head says "Backlog · 5 tickets" and each of the
   five rows below opens "Backlog · TKT-xxx"
3. Read the Testing lane: the row reads "Testing · waiting 8m" — the stage word
   is repeated from the head and TKT-010 is nowhere on the row

## Comments
