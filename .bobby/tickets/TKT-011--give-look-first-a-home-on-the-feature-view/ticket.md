---
id: TKT-011
title: Give "Look first" a home on the Feature view
stage: backlog
type: improvement
priority: medium
area: ui
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

When the Feature view was built to the spec, the awaiting-approval action row
had three buttons (Approve, Send back, Look first). At 390px three buttons wrap
and break the row, so "Look first" was dropped.

Consequence: the live log is no longer reachable from the Feature view. It is
still reachable from Home, but the natural place to look before approving is
the screen where you approve.

Likely answer: put it on the active ticket row rather than in the action row.

## Acceptance Criteria

- [ ] The live log is reachable from the Feature view
- [ ] The two-button action row is preserved at 390px
- [ ] Whatever control is added is >=44px and has a visible focus state

## Comments
