---
id: TKT-067
title: >-
  Pair-once addressing over RelayTransport: one pairing reaches every project
  bobby remote --studio serves
stage: building
type: feature
priority: medium
area: app
author: unknown
assigned: bobby-plan
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-020
feature: null
persona: null
created: '2026-08-09'
updated: '2026-08-12'
---

## Description

`bobby remote` creates one pairing per project (keyed on project path hash).
A studio serves multiple projects, but a phone paired with project A cannot
reach project B — a new pairing code is needed for each. This breaks the
"run your team from your phone" pitch in a multi-project studio.

With TKT-022 adding project switching and TKT-023 proving RelayTransport
works, the relay should support studio-level pairing: one code, one channel,
every project the studio serves reachable from that single pairing.

The tunnel protocol needs a `project` field in request frames so the server
knows which project context to route each request to.

## Acceptance Criteria

- [ ] One pairing code (one scan/paste) reaches every project the studio serves
- [ ] Request frames include a project identifier; the server routes to the right project context
- [ ] The phone can switch projects using the same pairing (no re-pair)
- [ ] Non-studio (single-project) `bobby remote` works exactly as before

## Comments
