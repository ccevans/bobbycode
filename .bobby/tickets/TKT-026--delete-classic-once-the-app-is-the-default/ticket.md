---
id: TKT-026
title: Delete /classic once the App is the default
stage: backlog
type: task
priority: low
area: ui
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-020
created: '2026-08-07'
updated: '2026-08-09'
---

## Description

The classic dashboard is frozen at /classic/ for one release, per the promise
made when the App shipped. Once the App is the default and proven, delete it —
the free tier keeps the classic dashboard, so check the tiering rules before
removing anything.

Do NOT do this until the App has shipped a release and the light redesign
(TKT-006) is done.

## Acceptance Criteria

- [ ] The /classic route and its templates are removed
- [ ] The free-tier promise is honoured or explicitly renegotiated and documented
- [ ] No dead references remain in docs, commands/app.js, or the plugin seam

## Comments
- [2026-08-09] claude: Scope amended per bobby-review on TKT-023: this ticket also owns retiring hq/web (the duplicate phone frontend in bobbycode-pro). The App over RelayTransport replaces it — verified live — so when /classic goes, hq/web goes with it: relay keeps serving app/app via WEB_DIR, hq/PUSH.md's privacy model moves to the app (PRO-005). TKT-023's AC4 points here.
