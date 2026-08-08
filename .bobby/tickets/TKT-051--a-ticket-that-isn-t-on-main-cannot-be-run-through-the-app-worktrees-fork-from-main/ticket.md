---
id: TKT-051
title: >-
  A ticket that isn't on main cannot be run through the app — worktrees fork
  from main
stage: backlog
type: bug
priority: critical
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

Found by dogfooding: started a real run on TKT-012 through the app's own API
and got `{"error":"Ticket TKT-012 not found"}` for a ticket that plainly
exists and had just been moved to planning by the CLI.

THE CHAIN:
1. `createWorktree` forks from main/master, never the current branch
   (`detectMainBranch`, no baseBranch passed).
2. Every ticket created on a feature branch therefore does NOT exist inside
   the new worktree. This session's tickets live on `feat/workspace-projects`;
   the worktree's .bobby/tickets contained only README.md and WORKFLOW.md.
3. `Orchestrator.runAgent` handles this correctly for its OWN check:

       const ticket = findTicket(worktreeTicketsDir, ws.ticketId)
         || findTicket(this.ticketsDir, ws.ticketId);      // falls back, passes

4. ...and then passes ONLY the worktree dir to the prompt builder:

       const built = buildPromptFor(agent, [ws.ticketId], {
         ticketsDir: worktreeTicketsDir,                   // no fallback
         ...

   `buildPromptFor` calls `findTicket(ticketsDir, id)` (lib/workflow.js:524,
   571, 576, 610) and throws `Ticket ${id} not found`.

IMPACT: **any ticket not yet merged to main cannot be run through the app.**
That is every ticket created on a feature branch — i.e. the normal way anyone
works. The CLI path is unaffected (it runs in the current checkout), which is
why this has survived.

The error message makes it look like the ticket is missing, so the natural
reaction is to go looking for a typo rather than at branch topology.

THE FIX IS A DESIGN CHOICE, not a one-liner. Three candidates, each with a
real cost:

(a) Fork worktrees from the CURRENT branch instead of main. Most intuitive and
    fixes it at the root, but changes isolation semantics — work would build on
    unmerged work, and `mergeToMain` assumes a main-based branch.
(b) Seed the ticket folder into the worktree when it is missing. Keeps main-
    based isolation, but now two copies of the ticket exist and the orchestrator
    already re-reads stage FROM the worktree, so it needs care.
(c) Fall back to the main checkout's tickets dir for prompt building. Smallest
    change, but the prompt would then reference a path outside the worktree the
    agent is confined to, so the agent may not be able to read it.

Whichever is chosen, the error message should name the real cause
("TKT-012 exists on feat/x but worktrees fork from main") rather than
"not found".

Recorded as a pitfall in .bobby/architecture.md — the doc predicted the cause
("new worktrees fork from main, not your branch; unmerged work is invisible")
but not that it hard-fails the run.

## Acceptance Criteria

- [ ] A ticket created on a feature branch can be run through the app
- [ ] The chosen approach is recorded in decisions.yaml with its trade-off
- [ ] The error, when a ticket genuinely is missing, names branch topology as a
      possible cause rather than only "not found"
- [ ] Covered by a test where the ticket exists on the current branch but not
      on main

## Steps to Reproduce

1. On a feature branch, `bobby ticket create -t "Anything"` and commit it.
2. Start the app: `bobby app --port 7900`.
3. POST /api/workspaces {ticketId, agent:"plan"} — succeeds, worktree created.
4. POST /api/workspaces/{id}/run
5. Expected: the agent starts. Actual: `{"error":"Ticket <ID> not found"}`,
   and the worktree's .bobby/tickets contains no tickets at all.

## Comments
