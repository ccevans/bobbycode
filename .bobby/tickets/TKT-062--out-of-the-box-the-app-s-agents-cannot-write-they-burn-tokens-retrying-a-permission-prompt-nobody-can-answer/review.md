## Review — TKT-062

### Verdict: Approved with Notes

Build commit: `47af329` — "fix(permissions): safe defaults that differ by run kind, and no-op runs stop lying".

### Files Reviewed
- `lib/config.js` — adds `worktree_permission_mode` (`bypassPermissions`) and `repo_permission_mode` (`acceptEdits`) to DEFAULTS; legacy `permission_mode` stays unset and, when set, overrides both. Verified the commented-config writer documents both keys. Sound.
- `lib/dashboard/executor.js` — `resolvePermissionMode(config, kind)` with correct precedence (per-kind → legacy single → per-kind default); `null` treated as unset. `isPermissionDenial(event)` reads the CLI's own `tool_result` with `is_error === true` against two narrow, verbatim patterns. Verified the event shape it matches is the real `type:'stdout', kind:'json'` normalized event. Claude-shaped by design; other CLIs fall back to the no-op check.
- `lib/dashboard/orchestrator.js` — `_launch` resolves posture per run kind and captures `headAtStart` (worktree only). `_notePermissionDenial` counts refusals per workspace and SIGTERM-stops at exactly `PERMISSION_DENIAL_LIMIT` (3), firing once, naming the correct config key. `_producedNothing` compares head SHA taken AFTER the checkpoint; unknown (null SHA) correctly returns false. `_onExit` threads `producedNothing` into the run record and workspace status. Verified `_terminalStatus`→`runOutcome` maps `no_op` through to the workspace, bypassing the `idle`/`awaiting_approval` promotion. Verified `_runExecutor` (line 1004) is the real production seam the launch tests capture.
- `lib/dashboard/state.js` — `no_op` added to WORKSPACE_STATUSES and RUN_STATUSES; `runOutcome` returns `no_op` only for exit 0 + `producedNothing`. Historical records lack the field and classify exactly as before. Correct.
- `lib/dashboard/worktree.js` — `headSha(cwd)` returns null on any git failure (documented as "unknown, not nothing"). Verified `commitCheckpoint` returns null without creating an empty commit when the tree is clean — this is what makes the before/after SHA comparison valid.
- `test/lib/dashboard/permissions.test.js` — 494 lines against a REAL orchestrator on a REAL git repo. Only the CLI subprocess is faked, at the legitimate `_runExecutor` seam; the resolution, refusal-counting, and no-op logic all run for real. Covers both postures, override precedence, null-as-unset, refusal recognition + rejection of non-refusals, fail-fast at the limit for both run kinds, and the full no_op matrix (nothing / wrote code / self-committed / advanced stage / repo-run-exempt).
- `.bobby/decisions.yaml` — two new decisions record the worktree-vs-repo asymmetry and the no_op verdict in full; also repairs a parse break left by TKT-061's `bobby learn` insertion. `stage-advance-is-the-success-signal` correctly superseded.
- `README.md`, `CHANGELOG.md`, `templates/dashboard/style.css` — doc/changelog updates and a minor style addition.

### Code Concerns
- None blocking. The refusal detector is narrow by design and only acts on `is_error` tool_results, so a false positive would need an errored tool_result whose text contains the exact refusal phrasing — unlikely, and the consequence (stop after 3, recoverable with a config change) is safe.

### Decision Violations
- None. The change consistent with `worktree-per-workspace`, `orchestrator-reads-tickets-from-the-shared-board`, and the two decisions it adds.

### AC Verification
- [x] A default install completes a plan stage end to end — default worktree posture is `bypassPermissions`; covered by the "posture that reaches the CLI" and default-resolution tests.
- [x] Permission decision recorded in decisions.yaml incl. worktree-vs-repo asymmetry — two TKT-062 decisions, both spelling out the asymmetry explicitly.
- [x] Agent that cannot write fails fast — `PERMISSION_DENIAL_LIMIT = 3`, SIGTERM stop, message names the key; tested for both run kinds.
- [x] A run that wrote nothing and advanced nothing is not `completed` — recorded as `no_op` on both run record and workspace; tested.
- [x] Covered by a test that does not stub the permission posture away — `permissions.test.js` runs the real orchestrator/git; the posture is resolved and asserted at the executor boundary, not mocked.

### Test/Lint Output
- Tests: PASS — 1185 passed, 46 skipped, 63 suites (full suite, fresh run).
- Lint: PASS — 0 errors, 37 warnings (all pre-existing unused-var warnings in unrelated test files; none in TKT-062's changed files).

### Notes
- Two follow-ups honestly disclosed in the commit and worth tracking as their own tickets, neither blocking:
  1. **Repo runs are exempt from the no-op check.** A repo run (ux/pm/qe write nothing by design, no branch to judge) can still burn money and land on `idle` unless it trips the refusal detector. Deliberate, but leaves a gap for repo runs whose refusals don't match the claude-shaped patterns.
  2. **The Pro UI has no styling for the new `no_op` status.** A no-op run is now recorded correctly but may not render distinctly in the app.
- Unrelated to this ticket: the working tree carries uncommitted in-flight changes to `lib/dashboard/orchestrator.js`, `lib/dashboard/worktree.js`, and `worktree.test.js` — these belong to TKT-069 (worktrees in target repo), not TKT-062, and were left untouched by this review.
