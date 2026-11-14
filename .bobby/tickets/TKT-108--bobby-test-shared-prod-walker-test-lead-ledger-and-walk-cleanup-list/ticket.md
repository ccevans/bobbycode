---
id: TKT-108
title: 'bobby-test shared prod walker, test-lead ledger and walk cleanup list'
stage: backlog
type: feature
priority: medium
area: null
author: Intel Conductor (evals 2026-11-14)
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
found_in: null
feature: null
persona: null
size: null
created: '2026-11-14'
updated: '2026-11-14'
---

## Description

Prod walks leave residue: dana-rennick ×2, 'Dana Whitfield' now refused at signup, and hidden test pages. They also burn the shared test-lead budget without a record. Four lanes each wrote their own walker script (drv.mjs, shot.mjs, walk.cjs, build.mjs), and one looped. Two lanes killed other lanes' processes by name.

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] One committed walker takes a stop-at argument, screenshots every stop, uses a unique name per run, and never loops
- [ ] A lane reserves a test lead before a walk; the command refuses at zero and records who spent it on which ticket
- [ ] Every walk ends with a list of the rows it created, each flagged test_tenant
- [ ] Walk helpers stop only the pids they started

## Comments
