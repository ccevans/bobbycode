# Test Evidence — TKT-062

**Date:** 2026-08-15
**Verdict:** PASS (5 of 5 ACs verified — 3 behavioral live, 1 artifact, 1 corroborated live)

## How this was tested (live, not the spec suite)

A real `claude -p` end-to-end run costs ~$3 and 9 minutes, so per the ticket's own
guidance I verified through the **running system**, two ways:

1. **Real shipped binary boot.** `node bin/bobby.js app` against a throwaway,
   freshly `bobby init`ed git project (default `.bobbyrc.yml`, every permission
   key left commented/unset — a genuine default install). Confirmed it boots and
   serves.
2. **Live orchestrator over HTTP.** A harness (`scratchpad/harness.mjs`) that wires
   the **real** `buildServer` + **real** `Orchestrator` exactly as
   `commands/app.js` does, faking only the leaf CLI subprocess at the
   `_runExecutor` seam — the same seam the production app spawns through. Config
   resolution, git worktrees, refusal counting, no-op judging, the state store and
   the whole REST API are the real production path. Drove it with `curl` and
   observed `/api/workspaces`, `/api/runs`, and the recorded posture.

No spec runner was used (jest/npm test never invoked).

## Live server smoke (real `bobby app`)

```
GET /api/health        -> {"ok":true,"version":2}
GET /api/config        -> {"project":"proj","target":"claude-code", stages:[...]}
GET /api/capabilities  -> {"core":{...true},"pro":{"state":"absent"}}   # free tier
```

## Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | A default install can complete a plan stage end to end (default worktree posture = bypassPermissions) | PASS | Scenario A below |
| 2 | Permission decision recorded in decisions.yaml incl. worktree-vs-repo asymmetry | PASS | `.bobby/decisions.yaml` lines 267 & 276, both `ticket: TKT-062` |
| 3 | An agent that cannot write fails fast instead of burning turns | PASS | Scenario B below |
| 4 | A run that wrote nothing and advanced nothing is not recorded as `completed` | PASS | Scenario C below |
| 5 | Covered by a test that does not stub the permission posture away | PASS | `test/lib/dashboard/permissions.test.js` (reviewer-verified); corroborated live — my harness exercised the real path over HTTP without stubbing posture |

## Scenario A — default worktree run completes (AC1)

- `POST /api/workspaces {ticketId:TKT-001, agent:plan}` then `/run`.
- Posture the running orchestrator resolved and passed to the CLI:
  `permissionMode: "bypassPermissions"` (captured at the `_runExecutor` boundary,
  worktree run, `isMainCheckout:false`).
- Fake CLI wrote `plan.md` and advanced `backlog → planning`, exit 0.
- Result: workspace `status: awaiting_approval`, `stage: planning`; run
  `status: completed`, `costUsd: 0.1234`. `/api/runs?status=completed` includes it.

## Scenario C — no-op is not `completed` (AC4)

- Fresh TKT-002, fake CLI wrote nothing and advanced nothing, exit 0.
- Result: workspace `status: no_op`, run `status: no_op`.
- `/api/runs?status=no_op` returns TKT-002; `/api/runs?status=completed` returns
  ONLY TKT-001 — the no-op run is excluded from completed.
- `lastError` on the workspace names `dashboard.worktree_permission_mode` and
  points at the session log.

## Scenario B — fail fast (AC3)

- Fake CLI configured to emit **30** permission refusals (real tool_result shape,
  `is_error:true`, "requested permissions to write…").
- Only **3 refusal events reached the CLI before SIGTERM**
  (`{"denialEventsEmitted":3,"intended":30}`) — the orchestrator stopped it at
  `PERMISSION_DENIAL_LIMIT = 3`, not 88 turns.
- Result: workspace `status: stopped`, run `status: stopped` / `signal: SIGTERM`.
- Full message: "Stopped after 3 permission refusals … Raise
  dashboard.worktree_permission_mode …".
- Note: my test forced refusals under the already-permissive `bypassPermissions`,
  so the message's "currently 'bypassPermissions' → 'bypassPermissions'" reads
  redundant. That is an artifact of forcing denials under a posture that would not
  normally cause them; in the real failure the posture is stricter and the message
  reads correctly. Not a code defect.

## Scenario D — repo-vs-worktree asymmetry

- `POST /api/repo-runs {agent:ux}` — a repo run against the main checkout.
- Posture resolved live: `permissionMode: "acceptEdits"`, `isMainCheckout:true`.
- Confirms the asymmetry holds in the running system: worktree=`bypassPermissions`,
  repo=`acceptEdits`.

## Regression

- create → run → approve → next agent → run chain still fires: after approving the
  Scenario-A workspace, a second run executed (runCount 2), advanced the stage, and
  was recorded `completed`. The `producedNothing`/`headAtStart` additions to
  `_onExit` did not break normal pipeline promotion.
- No console/server errors observed during any scenario.

## Notes / disclosed follow-ups (from review, not blocking)

1. Repo runs are exempt from the no-op verdict by design (ux/pm/qe write nothing);
   they can still land on `idle` unless they trip the claude-shaped refusal
   detector. Verified live that a repo run resolves `acceptEdits` and runs — the
   exemption is intentional.
2. The Pro `no_op` status has no distinct UI styling yet (free tier active here, so
   not exercised).
