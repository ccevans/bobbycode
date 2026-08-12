---
id: TKT-022
title: 'Studio mode: switch projects from inside the app'
stage: backlog
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
parent: TKT-020
created: '2026-08-07'
updated: '2026-08-07'
---

## Description

`bobby app` serves the project it was launched in. The studio registry already
knows about every project on the machine (lib/studio.js), and `bobby remote
--studio` already serves them all over one tunnel — but the app itself cannot
switch.

Add a single mutable context and /api/projects/select so you can move between
projects without restarting the server.

## Acceptance Criteria

- [ ] The app lists registered projects and can switch between them
- [ ] Switching re-scopes tickets, workspaces and the brief to the new project
- [ ] A running agent in project A is not disturbed by switching to project B
- [ ] The selected project survives a page reload

## Comments
