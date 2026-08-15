---
id: TKT-021
title: 'Vet chat: conversational planning with executor --resume'
stage: building
type: feature
priority: medium
area: orchestrator
author: unknown
assigned: bobby-build
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-020
created: '2026-08-07'
updated: '2026-08-12'
---

## Description

Planning happens in one shot today: an agent runs, writes plan.md, exits. There
is no way to talk to it — to push back on an assumption or redirect before it
commits.

Add conversational planning: executor `--resume` for continuity, a ChatManager
holding sessions, plan permission mode so it cannot write while you are still
arguing, and `.bobby/chats.json` for persistence.

## Acceptance Criteria

- [ ] A planning conversation can be continued across turns via executor --resume
- [ ] Chat sessions persist and survive an app restart
- [ ] The agent cannot write files while in plan permission mode
- [ ] The resulting plan can be committed to the ticket in one action

## Comments
