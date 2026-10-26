---
id: TKT-019
title: Per-run cost from claude total_cost_usd
stage: done
type: feature
priority: medium
area: orchestrator
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

Agents spend real money and the app never says how much. The claude CLI reports
`total_cost_usd` on completion; capture it per run and surface it.

This is the honest counterpart to the confirm sheet: the sheet warns before
spending, this reports after.

## Acceptance Criteria

- [ ] total_cost_usd is captured per run when the executor reports it
- [ ] Cost is shown per run, and totalled per ticket/feature
- [ ] Executors that do not report cost degrade gracefully (no zeros presented as fact)

## Comments
