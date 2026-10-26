---
id: TKT-080
title: >-
  e2e: pin BOB-120 claim check before the orchestration: workflow early return
  in bobby run
stage: backlog
type: chore
priority: low
area: null
author: bobby-review
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

## Comments
- [2026-10-26] bobby-review: TKT-076 merged the BOB-120 claim loop (commands/run.js:173-176) ahead of TKT-073's orchestration: workflow early return (run.js:181-222). The order is load-bearing: swapped, a claimed ticket gets a Workflow call. Reviewer verified it by hand (claimed -> exit 1, no bobby-default call; released -> exit 0 with the call), but no test pins it. test/e2e/ticket-claim-cli.e2e.test.js only scaffolds without orchestration. Add a case there: scaffold with orchestration: workflow, claim TKT-001 under another token, assert run workflow TKT-001 exits non-zero and prints no bobby-default invocation; feature mode with a claimed child likewise.
