---
id: TKT-052
title: >-
  Agent prompts use a relative tickets path that does not resolve inside a
  worktree
stage: backlog
type: bug
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
created: '2026-08-08'
updated: '2026-08-08'
---

## Description

Residual gap left open by TKT-051, deliberately, because closing it is a
design decision rather than a patch.

TKT-051 made the orchestrator read and write tickets through the resolved
(main-rooted) tickets dir, so a run now STARTS for a ticket that only exists on
a feature branch. But `buildPromptFor` still receives `ticketsRelDir` as the
RELATIVE `.bobby/tickets`, so the generated prompt tells the agent:

    Read `.bobby/tickets/TKT-013*/ticket.md` to load context.

The agent's cwd is its worktree. For an unmerged ticket that path does not
exist there — the worktree forked from main, which does not have the ticket.
Confirmed in the live run during TKT-051's verification: the prompt was built
with exactly that relative path.

What still works, and why the run no longer hard-fails:
- `bobby ticket move` / `assign` / `comment` all redirect to the main root via
  resolveTicketsDir, so stage transitions land correctly.
- The orchestrator's own reads are main-rooted after TKT-051.

What is broken:
- Any step where the agent reads the ticket FILE directly — which is step 1 of
  every agent prompt ("Read the ticket to load context"). The agent starts
  blind on an unmerged ticket.

THE DECISION: putting an absolute main-rooted path in the prompt asks a
worktree-confined agent to read outside its worktree, and it diverges from the
CLI path, where the relative path is correct because cwd IS the main checkout.
Options worth weighing:

(a) Absolute main-rooted path in the prompt. Simplest. Agent reads shared
    state directly; the sandbox boundary becomes advisory rather than real.
(b) Copy the ticket folder into the worktree at run start, and treat it as
    read-only context while writes go through the CLI. Keeps the agent inside
    its worktree; costs a copy that can go stale mid-run.
(c) Have the prompt instruct `bobby ticket view {ID}` instead of a file read,
    so resolution is always the CLI's job. Most consistent with the rest of
    Bobby; requires the agent files to stop naming file paths.

(c) looks strongest — it is the same shape as the TKT-048 fix (stop hardcoding
what the CLI already resolves) — but it touches every agent definition, so it
wants its own pass.

## Acceptance Criteria

- [ ] An agent working an unmerged ticket can read that ticket's content
- [ ] The chosen approach is recorded in decisions.yaml with its trade-off
- [ ] The CLI path keeps working unchanged
- [ ] Covered by a test asserting the prompt resolves to a readable path from
      the worktree's cwd

## Steps to Reproduce

1. Create and commit a ticket on a feature branch (not merged to main).
2. Start the app and run that ticket through it.
3. Inspect the `run_start` prompt: it says `Read .bobby/tickets/<ID>*/ticket.md`.
4. From the worktree's cwd that path does not exist — the worktree forked from
   main, which has no such ticket.

## Comments
