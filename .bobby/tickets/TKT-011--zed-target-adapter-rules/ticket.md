---
id: TKT-011
title: Zed target adapter (.rules)
stage: backlog
type: feature
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

Zed dedicated target. Same shape as Windsurf (TKT-010): Zed reads
AGENTS.md natively plus its own `.rules` file at the worktree root. Spike
first — verify what Zed's agent panel reads in mid-2026 (rules files, any
command/skill convention), then either ship a paths-only adapter or close as
covered-by-generic with the evidence in the support matrix.

Zed is open source: hold verification to source-reading, like OpenCode.

## Acceptance Criteria

- [ ] Spike documented with Zed source citations
- [ ] Decision recorded: dedicated adapter OR wontfix with agents-md declared
      sufficient in the support matrix
- [ ] If shipped: matrix suite passes, wizard/registry/docs updated per the
      standard checklist

## Comments
