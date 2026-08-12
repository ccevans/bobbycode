---
id: TKT-069
title: >-
  The app orchestrator worktrees a ticket in its TARGET repo, not always the
  launch repo
stage: reviewing
type: feature
priority: high
area: null
author: unknown
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-020
feature: null
persona: null
created: '2026-08-12'
updated: '2026-08-12'
---

## Description

Depends on TKT-068 (there is no single branch to build this on until the merge).

The orchestrator is single-repo by construction. `Orchestrator` takes one
`repoRoot` at construction (`commands/app.js` passes `findProjectRoot()`), and
every worktree, lock, diff and branch is computed against that one root
(`lib/dashboard/orchestrator.js`, `createWorktree(this.repoRoot, …)`). There is
no code path that reads a ticket's target repo — grep for `.repos` in
`lib/dashboard/` returns nothing on either branch.

The studio already models the answer: a ticket carries `repos:` frontmatter,
the project declares a repo group, and `resolveRepoPath(studioRoot, config,
name)` turns a repo name into a path. The CLI's `repoTargetingClause` already
tells a `bobby run` agent to work in the right repo's directory. The app just
does not use any of it.

What this ticket builds: the orchestrator resolves a run's target repo from the
ticket's `repos` field (falling back to the project's repos), and creates the
worktree, lock, branch and diff against THAT repo — not always the launch repo.
A ticket that names `bobbycode-pro` gets a worktree in bobbycode-pro; the
Workspace view's diff reads from there; the ship branch is pushed there.

Open design points to settle at planning:
- A ticket that touches TWO repos (some genuinely do). One workspace, two
  worktrees? Or is that out of scope for v1 — one repo per ticket, split the
  ticket otherwise?
- The main-checkout lock is per-repo; the studio has many. The lock keys off
  `repoRoot` today (TKT-014/015) — it must key off the resolved repo.
- Where the board lives vs where the code lives: the board is the studio's, the
  code is the target repo's. The agent prompt already handles this via
  `resolveTicketsDir` naming absolute paths (TKT-052).

This is the ticket that would have made TKT-023 ship correctly: its board entry
is the studio's, its code is in bobbycode-pro, and the orchestrator would have
worktreed and shipped in bobbycode-pro instead of manufacturing a dead
`bobby/tkt-023-ship` branch in the wrong repo.

## Acceptance Criteria

- [ ] A run resolves its target repo from the ticket's `repos` (then project's)
- [ ] Worktree, branch, lock and diff are all against the resolved repo
- [ ] A ticket targeting bobbycode-pro ships in bobbycode-pro, verified live
- [ ] The single-repo case is unchanged — a v1 project with one repo behaves
      exactly as today
- [ ] The two-repo-per-ticket question is decided and recorded, in or out of v1
- [ ] Covered by a test that runs a ticket against a non-launch repo

## Comments
- [2026-08-12] claude: Unblocked: TKT-068 merged integrate/app-studio, so the orchestrator, repo group config, and resolveRepoPath now live on one trunk. This is buildable now — the seam (resolveRepoPath, ticket .repos frontmatter, repoTargetingClause) exists and has no orchestrator caller yet, which is exactly what this ticket wires.
