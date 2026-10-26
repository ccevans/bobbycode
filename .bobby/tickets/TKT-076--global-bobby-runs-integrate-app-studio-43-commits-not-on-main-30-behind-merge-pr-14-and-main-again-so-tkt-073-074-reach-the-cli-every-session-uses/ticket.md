---
id: TKT-076
title: >-
  Global bobby runs integrate/app-studio (43 commits not on main, 30 behind):
  merge PR #14 and main again so TKT-073/074 reach the CLI every session uses
stage: planning
type: bug
priority: high
area: null
author: claude-main
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
found_in: TKT-074
feature: null
persona: null
created: '2026-10-26'
updated: '2026-10-26'
---

## Description

[What is this ticket about? Provide enough context for an engineer to understand the problem or feature.]

## Acceptance Criteria

- [ ] [First criterion]
- [ ] [Second criterion]
- [ ] [Third criterion]

## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]

## Comments
- [2026-10-26] user: Found 2026-10-25 while making TKT-073/074 live. /usr/local/bin/bobby -> /usr/local/lib/node_modules/bobbycode -> ~/Repos/bobbycode, checked out on integrate/app-studio (PR #14, open). That branch has 43 commits not on main (BOB-120 claims, BOB-123 init --refresh key preservation, BOB-024/067 studio projects, BOB-078..089 targets/executors, BOB-130/133/135) and lacks 30 on main (TKT-073 workflow scripts, TKT-074 scope rule, TKT-072). The local checkout is also 18 behind origin/integrate/app-studio. A trial 'git merge origin/main' there conflicted in .bobby/decisions.yaml, .bobby/tickets/.counter (BOB- vs TKT- boards), commands/run.js, test/lib/targets.test.js; aborted, nothing changed. TKT-068 converged the branches once; they drifted again. Needs: converge, run full suite, point the global link at main (or publish), and decide one ticket board/prefix.
