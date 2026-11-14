---
id: TKT-105
title: >-
  Context hygiene in stage skills: contact-sheet screenshot review, fresh
  restart after 60 min idle, one ticket per lane session, Conductor dispatches
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

Context caps hit fast (13, 24, 29, 35 and 55 minutes). Drivers: one full-size screenshot per Read (18-25 in a row), whole-file cat or git show of docs, resuming a full old context after 2 h to 2.5 days, and Conductors doing the work themselves. There were also idle foreground inbox loops (1h46m while a prod crash was live).

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] Stage skills review screenshots as a contact sheet, or through a subagent that returns a defect list
- [ ] A lane idle more than 60 min restarts from its handoff file instead of resuming
- [ ] A lane brief names one ticket
- [ ] The Conductor skill dispatches any question needing more than 3 tool calls
- [ ] While waiting on CC, a lane takes the next queued ticket

## Comments
