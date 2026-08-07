---
id: TKT-014
title: 'createRepoRun: run freeform agents against the main checkout'
stage: backlog
type: feature
priority: high
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
updated: '2026-08-07'
---

## Description

The app can only run ticket-scoped agents — anything that creates a worktree.
The freeform agents (ux, pm, qe, docs, design-*, ship) operate on the repo
itself, not a ticket, and have no path through the app at all. Today they are
CLI-only.

Add `createRepoRun`: kind 'repo', no worktree, running against the main
checkout. The hard part is safety — a repo run and a workspace merge touching
the main checkout at the same time is a race. Guard it.

## Acceptance Criteria

- [ ] createRepoRun runs a freeform agent against the main checkout
- [ ] No worktree is created for a repo run
- [ ] A repo run and a merge cannot run concurrently; the guard is tested
- [ ] The app can launch every agent in AGENT_REGISTRY that does not require a ticket
- [ ] Repo runs stream events and appear in the workspace/run list like other runs

## Comments
