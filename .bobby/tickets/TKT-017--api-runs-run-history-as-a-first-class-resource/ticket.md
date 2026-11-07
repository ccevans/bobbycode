---
id: TKT-017
title: /api/runs — run history as a first-class resource
stage: done
type: feature
priority: medium
area: api
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

Run history exists only inside workspace records. There is no way to ask 'what
has run, when, for how long, and at what cost' across the project.

Add /api/runs as a first-class resource. This is the backing data for cost
reporting (TKT-019) and for any future analytics.

## Acceptance Criteria

- [ ] GET /api/runs lists runs across workspaces with agent, timing and outcome
- [ ] Supports filtering by ticket and by status
- [ ] Covered by a server-api test

## Comments
