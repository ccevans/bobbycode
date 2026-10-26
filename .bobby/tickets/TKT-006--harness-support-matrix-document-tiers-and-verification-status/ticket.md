---
id: TKT-006
title: 'Harness support matrix: document tiers and verification status'
stage: backlog
type: task
priority: low
area: null
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-001
created: '2026-07-31'
updated: '2026-07-31'
---

## Description

Add a harness support matrix to the README (and a pointer from
docs/CUSTOMIZING.md) that states, per target: what scaffolds where, whether
subagents are native, whether the dashboard can drive it, and — critically —
the verification status of each claim (verified against real CLI / verified
against shipped code / expected per published convention).

The three-incident history from the Cursor work (CLAUDE.md references,
composer-1, sonnet-4-thinking, the subagent-registry reversal) is the reason
verification status is a first-class column: users burned by a wrong model
name lose trust in every other row.

Include: the tier explanation (dedicated target vs agents-md generic vs
unsupported), the Gemini/Antigravity hold and why, and how to request or
contribute a new target (pointing at the matrix suite as the contract).

## Acceptance Criteria

- [ ] README has a per-target support matrix with a verification-status
      column; every "verified" cell names its evidence
- [ ] agents-md tier scope stated precisely (rules + skills; no dashboard
      derivation; no subagent claim)
- [ ] Contributing-a-target section points at lib/targets/cursor.js as the
      template and the matrix suite as the acceptance bar
- [ ] No claim in the matrix contradicts shipped behavior at time of merge

## Comments
