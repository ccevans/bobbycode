---
id: TKT-012
title: 'Gemini CLI / Antigravity target: re-evaluate after rename settles'
stage: backlog
type: feature
priority: low
area: null
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-001
created: '2026-07-31'
updated: '2026-07-31'
---

## Description

Gemini CLI is mid-transition to "Antigravity CLI": the individual free tier
ended June 18, 2026 and the tool/conventions are being renamed. Building
against a convention being renamed is how sonnet-4-thinking happened — so
this ticket exists to make the hold explicit and time-boxed, not to build.

When picked up (target: next quarter, ~October 2026), the evaluation is:
1. Has the Antigravity CLI rename landed and stabilized? (installer name,
   context file name — GEMINI.md vs AGENTS.md vs new — headless mode flags)
2. Does it read AGENTS.md natively (several sources say Gemini did)? If yes,
   generic tier may already cover rules and the dedicated delta is
   commands/headless only.
3. What is the real user demand signal since July? (issues, questions)

Then either: spec a dedicated target + executor as siblings shaped like
TKT-003/TKT-004, or extend the hold with a new re-check date. Do not build
from pre-rename documentation under any circumstances.

## Acceptance Criteria

- [ ] Not started before the rename is verifiably settled (release notes or
      shipped binary, not announcements)
- [ ] Evaluation of the three questions above documented in this ticket
- [ ] Outcome: follow-up build tickets created OR hold extended with a
      dated re-check
- [ ] Support matrix (TKT-006) lists Gemini/Antigravity as "held" with the
      reason while this remains open

## Comments
