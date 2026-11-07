---
id: TKT-070
title: >-
  Delete the orphaned commands/dashboard.js — superseded by commands/app.js
  after the app+studio merge
stage: done
type: task
priority: low
area: null
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
created: '2026-08-12'
updated: '2026-08-16'
---

## Description

[What is this ticket about? Provide enough context for an engineer to understand the problem or feature.]

## Acceptance Criteria

- [ ] [First criterion]
- [ ] [Second criterion]
- [ ] [Third criterion]

## Comments
- [2026-08-16] system: Deleted in TKT-022 b823e54 — the orphan is what the studio wiring landed in
- [2026-08-16] user: Done as part of TKT-022 (commit b823e54). commands/dashboard.js is deleted. It was not merely dead — TKT-022's ProjectContext wiring landed in it instead of commands/app.js, so the studio feature shipped unreachable and every unit test stayed green. Verified before deleting: nothing imports it (grep for 'commands/dashboard' and 'registerDashboard' across the repo hits only docs and ticket history), bin/bobby.js imports registerApp only, and commands/app.js:68 carries .alias('dashboard') so the old command name still works. CLI loads and 'bobby app --help' still prints 'Usage: bobby app|dashboard'. Note: TKT-026's plan (plan.md:81, TC-6) also lists this deletion — that line is now already satisfied; whoever picks up TKT-026 should reconcile its plan rather than expect the file to be there.
