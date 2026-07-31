---
id: TKT-001
title: 'Multi-harness support: Bobby works first-class beyond Claude Code'
stage: backlog
type: epic
priority: high
area: null
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
created: '2026-07-31'
updated: '2026-07-31'
---

## Description

Bobby supports three harnesses (Claude Code, Cursor, Cline). The next users
arrive from Codex CLI and the AGENTS.md ecosystem; today they get nothing, and
every new target risks repeating the CLAUDE.md-class bug because target
behavior has no shared contract tests. Full scoring, spec, and dependency
order in plan.md.

## Acceptance Criteria

- [ ] TKT-002 through TKT-006 are done
- [ ] A Codex CLI user can `bobby init`, pick Codex, and run the loop with
      skills and dashboard parity with Cursor
- [ ] Any AGENTS.md-reading tool gets working rules + skills via `agents-md`
- [ ] Every registered target passes one shared invariant suite; adding a
      target requires no new hand-written contract tests
- [ ] No shipped claim about any harness lacks cited verification


## Comments
- [2026-07-31] bobby-plan: Extended with tier-2 tickets TKT-007..TKT-012 (Copilot, OpenCode target+executor, Windsurf/Zed spikes, Gemini/Antigravity dated hold). Epic out-of-scope narrowed accordingly; dependency tiers in plan.md.
- [2026-07-31] bobby-plan: Broke down into 5 tickets: TKT-002 (matrix suite, foundation), TKT-003 (codex target), TKT-004 (codex executor), TKT-005 (agents-md generic), TKT-006 (support matrix docs). Approach A (foundation-first) selected 36 vs 29 vs 19 — scoring and spec in plan.md.
