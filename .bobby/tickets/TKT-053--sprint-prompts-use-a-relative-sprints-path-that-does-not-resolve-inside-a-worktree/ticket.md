---
id: TKT-053
title: >-
  Sprint prompts use a relative sprints path that does not resolve inside a
  worktree
stage: backlog
type: bug
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
created: '2026-08-08'
updated: '2026-08-08'
---

## Description

Same bug class as TKT-052, different directory. Found while fixing that one.

`commands/sprint.js:253` builds `sprintPlanPath` from the RELATIVE
`config.sprints_dir`, then hands it to `buildSprintPrompt`. Sprints run in
isolated worktrees — the prompt itself says so — so that relative path does not
resolve from the agent's cwd for any sprint plan not present on the worktree's
base branch.

`resolveSprintsDir` already exists in lib/config.js and resolves to the main
worktree root, exactly like `resolveTicketsDir`. It just is not used here.

TKT-052 fixed the same shape for tickets: prompts now carry the resolved
absolute tickets dir, recorded in decisions.yaml as
`prompts-name-the-tickets-dir-absolutely`. This should follow that decision
rather than re-deciding it.

Not covered by any test today, which is why it survived.

## Acceptance Criteria

- [ ] Sprint prompts carry the resolved absolute sprints path
- [ ] A sprint plan not on the worktree's base branch is readable by the agent
- [ ] Covered by a test that resolves the emitted path from an unrelated cwd,
      the way TKT-052's tests do
- [ ] Audit for any other relative path handed to a worktree-confined agent

## Steps to Reproduce

1. Create a sprint whose plan file exists only on a feature branch.
2. Run it — sprints execute in an isolated worktree forked from main.
3. The prompt tells the agent to read `.bobby/sprints/...`, which does not
   resolve from the worktree's cwd.

## Comments
