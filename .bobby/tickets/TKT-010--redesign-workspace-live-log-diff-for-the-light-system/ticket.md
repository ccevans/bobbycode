---
id: TKT-010
title: Redesign Workspace (live log + diff) for the light system
stage: done
type: feature
priority: medium
area: ui
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-006
created: '2026-08-07'
updated: '2026-08-07'
---

## Description

The Workspace view carries the live log pane and the diff viewer — both were
built as dark surfaces (near-black panes with syntax tints). On a light ground
they are the most visually broken part of the app.

This one needs real thought: a terminal log and a diff are the two places where
a dark surface is arguably correct even inside a light app. Decide deliberately
whether they stay dark as *instruments* embedded in a light page, or convert.

## Acceptance Criteria

- [ ] A recorded decision on dark-instrument vs full light for the log and diff
- [ ] Log pane legible, with tool/error lines distinguishable without a pulse
- [ ] Diff add/remove colours pass contrast on whichever ground is chosen
- [ ] The decision buttons (approve/merge/send back/stop) match the spec

## Comments
