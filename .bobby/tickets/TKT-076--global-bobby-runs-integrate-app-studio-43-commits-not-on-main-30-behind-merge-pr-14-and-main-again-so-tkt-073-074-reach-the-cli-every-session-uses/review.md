## Review — TKT-076

### Verdict: Approved with Notes

Reviewed `tkt-076-converge` at 8f8abc3 (= origin/tkt-076-converge), worktree `/Users/ccevans/Repos/bobby-code-studio/worktrees/bobbycode-tkt-076`. Merge parents: 8bbc015 (origin/integrate/app-studio) and 23e8a77 (main at build time). origin/main is now cc91cf1, which adds only the TKT-076 build bookkeeping commit on top of 23e8a77.

### Method

git 2.34 has no `--remerge-diff`. So I re-ran `git merge --no-commit 23e8a77` on 8bbc015 in a scratch worktree, then diffed that raw automerge (with conflict markers) against the committed tree. That isolates every hand-made line in the merge. The raw merge reproduced exactly the 11 conflicts in the plan. It also auto-deleted 242 board files and `.bobbyrc.yml`, which confirms the silent-loss trap. The diff between the raw merge and the committed tree touches 16 non-board files. Every hunk maps to plan resolutions 1–13 or to the BOB-123 comment/learnings edit. Nothing else was edited by hand. I removed the scratch worktree afterwards.

I also checked one-sided files mechanically:
- Each file changed only on app-studio (merge-base 6e5a76f..8bbc015) is byte-identical to app-studio's version in the merge.
- Each file changed only on main is byte-identical to main's version, except the three planned edits: `.claude/skills/bobby-plan/learnings.local.md`, `test/lib/dashboard/orchestrator-continue-builder.test.js` and `test/lib/scope-rule-templates.test.js`.

### Files Reviewed (conflict resolutions)
- `.bobby/**`, `.bobbyrc.yml`: compared with main (23e8a77), 9 files were added, all under `.bobby/design/` from app-studio, with 0 modified and 0 deleted. Compared with origin/main, the only other difference is TKT-076's own ticket.md (the post-merge bookkeeping commit). `.bobbyrc.yml` exists, and `node bin/bobby.js ticket view TKT-074` from the worktree root prints `Stage: done` from the TKT board.
- `commands/run.js:7-10,159-222`: the imports are the union. The claim loop (`assertTicketFree` for every id, plus the epic's children, lines 173/176) runs before the `orchestration === 'workflow'` early return (181-222). freewillRefusal (120-123) and `workflowNameForTicket` (117) run before both paths.
- `commands/create.js`, `lib/tickets.js:197-229`: `--found-in` (with its no-such-ticket check) and `--size` (assertSize) both reach the frontmatter (`found_in`, `size`).
- `commands/move.js`: the imports are the union. `SCOPE_CHECK_TARGETS` and `autoRemoveShippedWorktree` are both kept. They run as two independent `if`s, scope check first and done-reclaim second (lines ~108-115).
- `lib/workflow.js:273`: the launch line keeps app-studio's `subagent_type` and "no `model` or `effort` override" text, plus main's `${noteId}`. `templates/workflows/runtime.js` passes `agentType` and never `model`.
- `templates/skills/bobby-build|plan|ship/SKILL.md.ejs`: the unions follow resolutions 7–9. Build keeps the forward move as "hand on per task prompt" rather than main's literal `bobby ticket move {ID} review`, which complies with `forward-stage-comes-from-the-workflow-not-the-agent-file`.
- `test/lib/targets.test.js`: main's TKT-073 describe is closed properly, and app-studio's three identity describes follow it. The leak check is extended to codex, opencode, copilot and agents-md. There are new extraPaths and getBobbyPaths cases.
- Semantic fixes:
  - `lib/targets/claude-code.js:57-61`, `lib/auto-sync.js:20`: extraPaths is now config-aware. auto-sync is its only non-test caller, and it passes config.
  - `test/lib/scope-rule-templates.test.js:72-76`: the freewill test now expects 8 `## ` headings and no `## Stay in the` heading.
  - `lib/dashboard/orchestrator.js:780-786`: `continueBuilder` is now an allow-list on `resolveExecutor(config).name === 'claude'`.

### Independent verification (beyond the suite)
- **Mutation check**: I reverted the orchestrator allow-list to main's deny-list and auto-sync to `extraPaths()`. 4 tests failed: codex host, opencode host, custom `/opt/bin/claude`, and getBobbyPaths with the flag on. With the code restored, 143/143 passed. I restored the files with `git checkout --`, and the tree is clean. Logs: `/private/tmp/claude-501/-Users-ccevans-Repos-bobby-code-studio/d0f623a9-4424-4430-9115-922ab0c10578/scratchpad/review076/{red,green}.log`.
- **TC2, real CLI with `orchestration: workflow`**: with TKT-001 claimed under another token, `run workflow TKT-001` exits 1 with "already has a run in progress" and prints no `bobby-default` call. With the claim released, it exits 0 and prints the Workflow call.
- **TC3**: `--size s --found-in TKT-001` persists both fields. `--size huge` exits 1. `--found-in TKT-999` exits 1.
- **TC4, building→done run from inside the ticket's worktree**: the scope-check warning and comment are written, then the worktree is reclaimed and `worktree_path` is dropped.
- **TC10, rendered templates**: build has the merge-origin/main step, `Filed:`, the tie-to-ticket sentence, the hand-on and `## Stay in the Ticket`, and has no "Move to review" literal and no full-suite line in its self-check. Plan has Contract and the move-time flag sentence in both lists. Ship has Stay in the Ticket before Checkpointing. Freewill has 8 headings, with the found-in rule as a paragraph under Invariants.
- `node bin/bobby.js ticket create --help` shows both `--found-in` and `--size`. No conflict markers remain.

### Code Concerns
- **Low, intended by plan (resolution 13)**: `lib/dashboard/orchestrator.js:785-786`. A custom binary (`dashboard.executor: /path/to/claude`) now gets the fresh-launch loop. resolveExecutor documents that form as "is claude with claude flags" (`lib/dashboard/executor.js:237-250`), and on main it got SendMessage. This fails safe, because the fresh-launch loop still works. It matches PR #17's refuse-unknown direction. No action needed.
- **Low, test gap**: the ordering in `commands/run.js:173-182` is load-bearing and verified by hand, but no test pins it. `test/e2e/ticket-claim-cli.e2e.test.js` never scaffolds with `orchestration: workflow`. Filed as TKT-080 (found in TKT-076) instead of extending the merge commit.
- **Info**: the target-matrix contract (`test/lib/target-matrix.test.js:79,160`) still scaffolds only the default config, so it never exercises claude-code's flag-on extraPaths. The new targets.test cases cover that path.

### Decision Violations
- None. The merge removes one pre-existing violation from main: main's build template used the literal `bobby ticket move {ID} review`. The count of hard-coded forward moves across templates is 11, the same as app-studio, so the merge introduces none.

### AC Verification
- [x] AC1: board and `.bobbyrc.yml` match main, with nothing deleted, and TKT-074 resolves from the repo root (checked above).
- [x] AC2: claims block both run paths (TC2 by hand), `--found-in` and `--size` persist (TC3), and the scope check plus worktree reclaim both run (TC4, and the move.test.js and lifecycle e2e suites).
- [x] AC3: SendMessage requires target claude-code and executor `claude` (mutation-checked). Workflow scripts are claude-code only (targets.test leak check across 6 targets, and resolveOrchestration throws for any other target). There is no model override in stage prompts, and the template unions are confirmed in rendered output.
- [x] AC4: full suite and lint are green (below).
- [ ] AC5: ship phase (fast-forward app-studio, merge PR #14). Not in review scope.
- [ ] AC6: ship phase (global link). Not in review scope.

### Test/Lint Output
- Tests (`npm test` in the worktree): `Test Suites: 1 skipped, 103 passed, 103 of 104 total`. `Tests: 51 skipped, 1787 passed, 1838 total`. `EXITCODE=0`. Log: `/private/tmp/claude-501/-Users-ccevans-Repos-bobby-code-studio/d0f623a9-4424-4430-9115-922ab0c10578/scratchpad/review076/suite.log`.
- Lint: `✖ 38 problems (0 errors, 38 warnings)`. These are pre-existing, as the plan states. `EXITCODE=0`. Log: `.../review076/lint.log`.

### Notes
- For ship: origin/main moved to cc91cf1 after the merge, but only with TKT-076 bookkeeping. Step 13 will need a trivial `git merge origin/main` (one ticket.md, with no code changes), plus whatever else lands before then. Re-run the suite only if code moved.
- Filed: TKT-080 — e2e: pin BOB-120 claim check before the orchestration: workflow early return in bobby run.
