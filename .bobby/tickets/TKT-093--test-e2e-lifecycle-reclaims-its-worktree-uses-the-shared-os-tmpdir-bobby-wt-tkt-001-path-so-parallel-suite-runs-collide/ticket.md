---
id: TKT-093
title: >-
  test/e2e/lifecycle 'reclaims its worktree' uses the shared
  <os.tmpdir()>/bobby-wt/TKT-001-* path, so parallel suite runs collide
stage: backlog
type: bug
priority: low
area: null
author: unknown
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
found_in: TKT-084
feature: null
persona: null
size: null
created: '2026-11-08'
updated: '2026-11-08'
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
- [2026-11-08] bobby-review: Cause: test/e2e/lifecycle.test.js:70 runs 'worktree create TKT-001' in an mkdtemp project under os.tmpdir(); the default worktree_root '../bobby-wt' (lib/config.js:36) puts the worktree at <os.tmpdir()>/bobby-wt/TKT-001-add-login-page, the same path for every concurrent suite run (parallel ticket builds/reviews). TKT-084's builder hit it as 1 failure; passes alone (23/23 in TKT-084 review). Fix direction: set worktree_root inside the test's own tmpDir (e.g. write it into the fixture .bobbyrc.yml) so each run gets a unique path.
