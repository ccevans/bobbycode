---
id: TKT-056
title: Board rows repeat the lane heading in every sublabel
stage: done
type: bug
priority: low
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

Found in the TKT-050 design review — scored against
`.claude/skills/bobby-design/references/slop_checklist.md` §6, "Redundant UX writing".

Inside a stage lane, every row's sublabel opens with the stage word that the lane's own
heading has just said. A "Design Research" lane contains rows reading "Design Research ·
TKT-002"; a "Shipping" lane contains "Shipping · TKT-010". With one ticket per lane the
sublabel is 60% heading echo.

`ticketState()` has a stated reason for it — the stage must not be carried by the lane
heading alone, so that nothing on the board depends on position or colour. That reasoning is
sound and should not be discarded. What changed is the scale: TKT-050 took the board from
around five lanes to twelve, so the page now repeats a heading beneath itself twelve times
instead of five, and the sublabel's genuinely useful content (the id, and any exception) is
pushed behind a word already on screen an inch above.

The two sections where the stage word is *not* redundant should keep it:

- **Blocked** — "Testing · TKT-011 · waiting on the hosting account". The heading says
  "Blocked", so the stage is new information.
- **Features** — the heading says "Features", not a stage.

Not a spec conformance failure: no token, size, radius or motion value is wrong. It is a
content finding, and it is the only unexempted slop pattern on the page (score 1 of 64 —
"clean" on the checklist's own calibration).

## Acceptance Criteria

- [ ] Inside a stage lane, a row's sublabel does not restate the lane's heading
- [ ] The Blocked section's rows still name the stage the ticket was stuck at
- [ ] The Features section is unchanged
- [ ] Stage is still recoverable without relying on colour or position alone (the lane heading plus the ticket page both still name it)
- [ ] Ticket ids stay first-class in the sublabel — looking one up is what the board is for

## Steps to Reproduce (bugs only)

1. Open `#/board` with tickets spread across several stages.
2. Read any lane: the `<h2>` says the stage, and every row beneath opens with the same word.
3. Expected: the sublabel adds information. Actual: it repeats the heading before reaching the id.

## Comments
