---
id: TKT-077
title: >-
  bobby sprint run hands out a prompt for tickets another run has claimed (no
  BOB-120 assertTicketFree on the sprint path)
stage: backlog
type: bug
priority: medium
area: null
author: bobby-plan
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
found_in: TKT-076
feature: null
persona: null
created: '2026-10-26'
updated: '2026-10-26'
---

## Description

[What is this ticket about? Provide enough context for an engineer to understand the problem or feature.]

## Acceptance Criteria

- [ ] [First criterion]
- [ ] [Second criterion]
- [ ] [Third criterion]

## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]

## Comments
- [2026-10-26] bobby-plan: Seen while planning TKT-076. commands/run.js calls assertTicketFree for every ticket id and every epic child before building a prompt (BOB-120, on integrate/app-studio). commands/sprint.js 'run <id>' (line ~205-282 on app-studio; main adds a workflow-orchestration branch at ~261) never calls it, so 'bobby sprint run S' prints a prompt that drives tickets an app run or another CLI run already holds. Pre-existing on integrate/app-studio, not introduced by the TKT-076 merge. Fix: loop assertTicketFree(ticketsDir, t.id) over sprintTickets before both the orchestration early-return and buildSprintPrompt; test with a claimed ticket in a sprint (mirror test/commands/run claim tests).
