---
id: TKT-062
title: >-
  Out of the box the app's agents cannot write — they burn tokens retrying a
  permission prompt nobody can answer
stage: reviewing
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
updated: '2026-08-09'
---

## Description

Found by the first real end-to-end run of the app — a genuine `claude`
subprocess on a genuine ticket, not a stub.

`lib/config.js` leaves `dashboard.permission_mode` unset by default, with the
comment: "left undefined it leaves each CLI in its own default permission
posture." For `claude -p` (headless, non-interactive) that posture is: ask
before writing. There is nobody to ask. The subprocess has no terminal and the
app never surfaces a prompt.

MEASURED on TKT-061, plan stage:
  - 88 turns
  - 554 seconds (9m14s)
  - $2.97 of real spend
  - 0 files written, ticket never moved
  - exit code 0, `is_error: false`

The agent's own closing words, from .bobby/sessions/ses-20260808-192056.jsonl:

    "I've been blocked on writes for many attempts. I'll stop retrying the
     same thing. To unblock this, you need to approve the file write
     permission when prompted. You should see a permission dialog asking to
     allow writes to .bobby/tickets/TKT-061--..."

So the app, in its default configuration, cannot do the one thing it exists
for. It looks like it is working — the run streams turns, the live log fills,
the cost meter climbs — and then it lands on `idle` having achieved nothing.

WHY IT HID SO LONG: exit 0 with is_error false is indistinguishable from
success at the orchestrator boundary. TKT-051 made `awaiting_approval` reachable
by fixing stage detection; this is the reason a real run STILL does not reach
it. Every test in the suite stubs the executor, so no test can see this — the
stub always "writes" the file.

THE FIX IS A REAL DECISION, not a default flip:

(a) Default `permission_mode: 'acceptEdits'`. The worktree is the sandbox and
    that is the whole point of worktree-per-workspace isolation. But it grants
    an autonomous agent write access with no per-action consent, and repo runs
    (TKT-014) work in the MAIN checkout, where that reasoning does not hold.
(b) Keep the default and REFUSE to start, with a message naming the config key.
    Safe and honest; makes first-run a two-step.
(c) Detect the blocked-write pattern and stop early rather than burning 88
    turns. Complements either of the above; does not fix it alone.

Whatever is chosen, (c) matters on its own: an agent that cannot write should
fail in seconds, not in dollars. And a run that wrote nothing and moved nothing
should not be recorded as `completed`.

Note the asymmetry worth deciding explicitly: worktree runs are sandboxed by
construction, repo runs are not. The permission posture arguably should differ
between them.

## Acceptance Criteria

- [ ] A default `bobby app` install can complete a plan stage end to end
- [ ] The permission decision is recorded in decisions.yaml, including the
      worktree-vs-repo-run asymmetry
- [ ] An agent that cannot write fails fast instead of burning turns
- [ ] A run that wrote nothing and advanced nothing is not recorded as
      `completed`
- [ ] Covered by a test that does not stub the permission posture away

## Steps to Reproduce

1. Fresh Bobby project, no `dashboard.permission_mode` in .bobbyrc.yml.
2. `bobby app`, then start any ticket-scoped agent from the UI.
3. Watch the live log: the agent reasons, tries to write, is refused, retries.
4. After several minutes it exits 0. Nothing was written, the ticket did not
   move, the workspace lands on `idle`, and the cost is real.

## Comments
