---
id: TKT-016
title: Commit the Playwright e2e suite for the app
stage: backlog
type: feature
priority: high
area: test
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

The app has been verified repeatedly with ad-hoc Playwright scripts —
19 checks on the feature view, full-app renders at 375/390/768/1440, contrast
and tap-target measurement — none of which is committed. Every verification has
been thrown away.

Commit a real e2e suite so regressions are caught by CI rather than by eye.

## Acceptance Criteria

- [ ] An e2e suite drives the real server against a fixture project
- [ ] Covers: board -> feature -> ticket navigation, the confirm sheet, and the
- [ ] approve/send-back/merge action wiring with a stubbed orchestrator
- [ ] Asserts no horizontal scroll and the 13px floor at 390 and 1440
- [ ] Runs in CI without a real claude subprocess

## Comments
