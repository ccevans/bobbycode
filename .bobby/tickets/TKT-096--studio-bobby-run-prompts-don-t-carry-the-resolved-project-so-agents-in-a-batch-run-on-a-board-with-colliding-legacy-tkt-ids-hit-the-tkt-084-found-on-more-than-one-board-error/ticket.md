---
id: TKT-096
title: >-
  Studio: bobby run prompts don't carry the resolved project, so agents in a
  batch run on a board with colliding legacy TKT- IDs hit the TKT-084 'found on
  more than one board' error
stage: backlog
type: improvement
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
found_in: null
feature: null
persona: null
size: null
created: '2026-11-08'
updated: '2026-11-08'
---

## Description

Found in the TKT-084 review (2026-11-08). TKT-084 resolves a legacy `TKT-` ID (prefix no project owns) by exact-ID lookup across studio boards; when the ID is on several boards it errors with "pass --project" and, per CC's decision, never falls through to cwd or active-project.

`bobby run <agent>` (CLI) only prints a prompt with `export BOBBY_SESSION_ID=...`; it does not carry the project it resolved. A batch run (no ticket IDs, project from active-project) on a board whose legacy IDs collide therefore hands agents tickets whose own `bobby ticket move TKT-010 ...` now exits 1. Real studio, 2026-11-08: 101 open legacy tickets collide (robinoffer 65/65, listrobin 19/46, sam 11/11, bobbycode-site 5/5, chuvaldevans 1/1). Robinflow's 79 resolve. The last update to any of those colliding tickets was 2026-09-08, so this is low priority today.

Direction: in a studio, `withSession` (commands/run.js) also emits `export BOBBY_PROJECT=<config._project>`, the way the dashboard orchestrator pins app-spawned runs (lib/dashboard/orchestrator.js ~721). That also keeps a run's agents on its project when another session runs `bobby project use`.

## Acceptance Criteria

- [ ] In a studio, every `bobby run` prompt exports BOBBY_PROJECT set to the project the run resolved
- [ ] A batch run on a board with a colliding legacy ID: the agent's `bobby ticket move <ID> ...` succeeds with no --project
- [ ] Non-studio prompts are unchanged

## Comments
