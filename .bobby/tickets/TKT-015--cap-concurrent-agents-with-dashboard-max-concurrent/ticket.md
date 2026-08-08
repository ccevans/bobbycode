---
id: TKT-015
title: Cap concurrent agents with dashboard.max_concurrent
stage: done
type: feature
priority: high
area: orchestrator
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
created: '2026-08-07'
updated: '2026-08-08'
---

## Description

Nothing stops the app launching an unbounded number of concurrent agents. Each
one is a claude subprocess spending real tokens on the user's subscription. A
mis-click on a large epic could start ten.

Honour `dashboard.max_concurrent` from config: refuse (or queue) new runs past
the cap, and say so plainly in the UI rather than failing silently.

## Acceptance Criteria

- [ ] dashboard.max_concurrent is read from config with a sane default
- [ ] Starting a run past the cap is refused with a clear, plain-language message
- [ ] The cap counts running agents across workspaces and repo runs
- [ ] Covered by an orchestrator test

## Comments
