---
id: TKT-008
title: 'OpenCode target adapter (AGENTS.md, .opencode/command)'
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

Dedicated OpenCode target. Philosophically Bobby's own crowd — provider-
agnostic, MIT, 165k+ stars, heavy solo-dev overlap. Reads AGENTS.md natively,
so generic (TKT-005) covers rules; dedicated adds:

- commands -> `.opencode/command/` (OpenCode's custom command convention —
  verify format against a real install: frontmatter dialect, invocation name
  rules)
- agents -> OpenCode has an agent concept (`.opencode/agent/`?) — verify
  whether it is a real registry (subagents true) or config-only before
  setting supportsSubagents; shipped-code reading acceptable (it's open
  source, easiest verification target of all harnesses)
- skills -> verify whether OpenCode reads .agents/skills/ or an own path;
  fall back to prompt-referenced files if neither

OpenCode being MIT means every convention here can be verified by reading the
actual source rather than probing a binary — hold this adapter to that higher
evidence bar.

## Acceptance Criteria

- [ ] Target registered in lib/targets/index.js, init --custom wizard, config
      comments, and lib/detect.js
- [ ] Target-matrix suite (TKT-002) passes with zero per-target test edits
- [ ] Every path/convention claim cites its verification (real tool run or
      shipped-code reading) in the PR — docs alone are insufficient
- [ ] README support matrix (TKT-006) row added with verification status
- [ ] All conventions cited to OpenCode source files (repo permalinks), not
      docs pages

## Comments
