---
id: TKT-089
title: >-
  bobby ticket attach --move deletes the file when the source is already the
  destination (unrecoverable for gitignored --log raw logs)
stage: backlog
type: bug
priority: medium
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

Found in TKT-086 review. `commands/attach.js` copies the source to its destination and then, with `--move`, unlinks the source. When the source path already IS the destination (e.g. re-summarising `<ticket>/logs/x.log` with `--log --move`, or attaching a file already in `test-evidence/screenshots/`), `copyFileSync` copies the file onto itself and the unlink deletes the only copy, while the command prints success. Both the `--log` path (attachLogs, commands/attach.js ~line 92) and the pre-existing screenshot path (~line 48) have it. For `--log` the raw log is gitignored, so git cannot restore it.

## Acceptance Criteria

- [ ] attach with --move whose resolved source equals the destination keeps the file (skip the copy and the unlink, or refuse with an explicit error)
- [ ] Covered for both the --log and the default test-evidence path

## Steps to Reproduce

1. `bobby ticket attach TKT-001 .bobby/tickets/TKT-001--x/logs/x.log --log --move`
2. `ls .bobby/tickets/TKT-001--x/logs/`
3. Expected: x.log and x.log.md. Actual: only x.log.md; the raw log is gone, exit 0 (reproduced on tkt-086-ticket-logs @ 3cf3954).

## Comments
