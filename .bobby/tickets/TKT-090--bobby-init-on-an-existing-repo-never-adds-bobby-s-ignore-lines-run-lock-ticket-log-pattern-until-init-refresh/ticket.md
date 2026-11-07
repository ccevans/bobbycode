---
id: TKT-090
title: >-
  bobby init on an existing repo never adds Bobby's ignore lines (run.lock,
  ticket-log pattern) until init --refresh
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
found_in: TKT-086
feature: null
persona: null
size: null
created: '2026-11-07'
updated: '2026-11-07'
---

## Description

Found in TKT-086 review. `commands/init.js` (~line 856) writes `.gitignore` from `gitignore.ejs` only when `projectType === 'new' && !detected.hasGitignore`. A fresh `bobby init` into an existing repo therefore never gets Bobby's ignore lines: `.bobby/tickets/*/run.lock` (pre-existing gap) and, since TKT-086, `.bobby/tickets/*/**/*.log`. They arrive only on `bobby init --refresh`. Until then `bobby ticket attach --log` warns that the raw log is not gitignored, and a `git add -A` commits run.lock and raw logs. Most installs are existing repos.

## Acceptance Criteria

- [ ] A fresh `bobby init` on an existing repo appends Bobby's ignore lines (run.lock, ticket-log pattern for the configured tickets_dir) to its .gitignore, creating it if missing, without duplicating lines or touching the rest
- [ ] A test covers init into an existing repo with and without a .gitignore

## Comments
