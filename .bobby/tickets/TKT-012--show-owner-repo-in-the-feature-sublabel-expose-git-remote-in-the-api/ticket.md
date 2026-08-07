---
id: TKT-012
title: Show owner/repo in the Feature sublabel (expose git remote in the API)
stage: backlog
type: improvement
priority: low
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
updated: '2026-08-07'
---

## Description

The Feature view's sublabel reads `featdemo · TKT-001` — the project name from
`/api/config`. The design (and the Devin reference it came from) shows
`owner/repo`, e.g. `ccevans/bobbycode`.

The API exposes a project name but no git remote, so the UI cannot render it.
Add the remote to `/api/config` (parsed from `git remote get-url origin`,
degrading gracefully when there is no remote) and use it in the sublabel.

## Acceptance Criteria

- [ ] /api/config returns the origin owner/repo when a remote exists
- [ ] Absent or unparseable remote degrades to the project name, no error
- [ ] Feature view sublabel shows owner/repo when available
- [ ] Covered by a server-api test

## Comments
