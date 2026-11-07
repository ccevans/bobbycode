# TKT-076 — Converge integrate/app-studio and main, then point the global `bobby` at main

**Size: L** (one merge commit, 11 textual + 2 semantic conflicts, 1 real cross-branch bug, a global-link move). **Workflow: default** for this repo (`plan → build → review`, then `bobby run ship`). Not `secure`: no auth, payment or user-data surface. Phases are owned explicitly below. Build does not push to `integrate/app-studio` or `main`. Ship does that.

## Facts (verified 2026-10-25 while planning)

| | |
|---|---|
| Branch tips | `origin/main` 3ed455a · `origin/integrate/app-studio` 8bbc015 · merge-base 6e5a76f |
| Divergence | **61** commits on app-studio not on main (the ticket's "43" was the stale local checkout, 18 behind its origin) · **32** on main not on app-studio |
| Dependencies | `package.json` and `package-lock.json` are identical on main, app-studio and c60a72a (the global checkout). No `npm install` is needed anywhere. |
| PR #14 | head `integrate/app-studio` → base `main`, open, REVIEW_REQUIRED, last CI green 2026-10-23. Repo allows merge commits. `delete_branch_on_merge` is false, so merging #14 does not delete `integrate/app-studio`. |
| CI | `.github/workflows/ci.yml` runs only on push or PR to `main`. Pushing a branch runs nothing until #14's head moves. |
| Global link | `/usr/local/bin/bobby` → `/usr/local/lib/node_modules/bobbycode` → `~/Repos/bobbycode` → **`~/Repos/bobby/repos/bobbycode`**. That checkout is inside the OLD studio `~/Repos/bobby` (no commits since 2026-08-24), on `integrate/app-studio` at c60a72a, with a clean tree. Its local `main` is c37c5a3, 76 behind. No worktree has `main` checked out. Machine: Intel MBP (x86_64). `which -a bobby` lists one entry. No long-running `bobby app/dashboard/remote` process at plan time. |

### Trial merge (`git merge origin/integrate/app-studio` onto `origin/main`, scratch worktree, discarded)

There are **11 textual conflicts**, not 4: `.bobby/decisions.yaml` (modify/delete), `.bobby/tickets/.counter` (modify/delete), `commands/create.js`, `commands/move.js`, `commands/run.js`, `lib/tickets.js`, `lib/workflow.js`, `templates/skills/bobby-build/SKILL.md.ejs`, `templates/skills/bobby-plan/SKILL.md.ejs`, `templates/skills/bobby-ship/SKILL.md.ejs`, `test/lib/targets.test.js`.

**Silent-loss trap.** App-studio commit 34cae69 ("Move the bobbycode board into the bobby studio") deletes `.bobbyrc.yml` and the whole in-repo `.bobby/`. A plain merge **auto-deletes `.bobbyrc.yml` and 242 board files without reporting a conflict.** Only TKT-073..076 survive, plus the two modify/delete files. Repos/bobbycode would then resolve up to the studio, whose active project is `robinflow`, so `bobby ticket create` here would land on the RF board.

Resolutions 1–10 alone left **2 semantic failures** git did not flag (11–12 below). With all 13 resolutions applied, the trial ran the **full suite green: 1785 passed, 51 skipped, 0 failed (103/104 suites, 1 skipped)**, with lint at 0 errors (38 pre-existing warnings). The new extraPaths test in resolution 11 was not part of that run.

## Approaches considered

| # | Approach | Effort ×3 | Risk ×2 | Maint ×2 | Impact ×1 | Score |
|---|---|---|---|---|---|---|
| A | Branch `tkt-076-converge` off `origin/integrate/app-studio` and merge `origin/main` into it. After review, fast-forward `integrate/app-studio` to it, then merge **PR #14** into main with a merge commit. | 4 | 4 | 4 | 5 | **33** |
| B | Branch off `origin/main`, merge app-studio in, open a NEW PR to main, and let GitHub mark #14 merged by reachability | 4 | 3 | 3 | 5 | 29 |
| C | Rebase app-studio's 61 commits onto main | 1 | 1 | 2 | 5 | 14 |

**Selected: A.** The conflicts are identical in A and B because they come from the same two tips. A wins on three counts:
1. PR #14 stays the vehicle, and its CI is already wired: fast-forwarding its head re-runs CI on the exact converged tree.
2. #14 ends as an explicit merge, not GitHub's reachability inference, which breaks if app-studio moves meanwhile.
3. #15/#16/#17 target `integrate/app-studio`, so they pick up main's code instead of sitting on a stale base.

C rewrites shared history and needs a force-push, which is banned.

## Conflict resolutions (exact)

Resolve in the worktree on `tkt-076-converge`. "main side" means `origin/main` (theirs, in this direction). "app side" means `integrate/app-studio` (ours).

1. **Board files: take main's side for ALL of `.bobby/` and `.bobbyrc.yml`.** Run `git checkout origin/main -- .bobby .bobbyrc.yml`, then confirm `git status --short | grep '^D '` is empty. App-only additions under `.bobby/` (e.g. `.bobby/design/` from c60a72a) are untouched by that checkout and stay. This settles both modify/delete conflicts (`.bobby/decisions.yaml` and `.bobby/tickets/.counter` keep main's content). **The board stays exactly as main has it today.** The one-board decision is CC's (see below) and lands in TKT-079, not in this merge.
2. **`commands/run.js`**
   - Imports: one `../lib/workflow.js` import with the union `{ DEFAULT_WORKFLOW, buildPromptFor, resolveWorkflow, resolveWorkflowName, featureBranchName, listWorkflows, assertTicketFree, workflowNameForTicket, freewillRefusal }`, plus main's `../lib/workflow-script.js` import unchanged.
   - Body hunk: app side FIRST, then main's block. That is the BOB-120 loop `for (const id of ticketIds) assertTicketFree(...)` plus the `epicData` children loop, followed by main's `orchestration === 'workflow'` block, which ends in `return;`. **Order is load-bearing.** If the orchestration early-return comes first, `orchestration: workflow` hands out a Workflow call for a claimed ticket, bypassing BOB-120.
   - `ticketPipeline` already comes from app-studio's `workflowNameForTicket` (it auto-merged), so the workflow-script path also honours size → workflow (`xs` → `quick`). No edit is needed there.
3. **`commands/create.js`**: imports `createTicket, findTicket, listTickets` plus `import { assertSize } from '../lib/workflow.js'`. In the `createTicket` args keep both lines: `foundIn: opts.foundIn || null,` and `size: opts.size ? assertSize(opts.size) : null,`.
4. **`lib/tickets.js`**: the `createTicket` signature takes both `foundIn = null, size = null`. Nothing else conflicts.
5. **`commands/move.js`**
   - Imports are the union: config adds `findMainWorktreeRoot`; tickets is `moveTicket, findTicket, addComment, readTicket, writeTicket`; colors is `success, warn, bold, dim, error`; keep `runScopeCheck, formatScopeCheck`, `assertWalkedBeforeDone` and `computeWorktreePlacement, removeWorktree`.
   - Keep main's `SCOPE_CHECK_TARGETS` const AND app's `autoRemoveShippedWorktree` function.
   - Body: two independent `if`s in this order. First `if (fromStage === 'building' && SCOPE_CHECK_TARGETS.includes(targetStage)) { scopeCheck(...) }`, then `if (targetStage === 'done') { ...autoRemoveShippedWorktree... }`. A building→done move runs both, and the scope check runs before the worktree is reclaimed.
6. **`lib/workflow.js`** (buildSubagentSteps launch line): use app's line (`Agent tool, subagent_type: "${s.agent}", no model or effort override …`) and append main's `${noteId}` before `\n`, so it ends `…improvise:${noteId}\n`. This keeps c153b24/BOB-135 (stage agents carry no model override) and TKT-073's "note the builder's agent id".
7. **`templates/skills/bobby-build/SKILL.md.ejs`**
   - Hunk 1: app's 7-item Completing Work list (merge origin/main, commit, comment with specs, learn, hand on per task prompt). Insert main's `List anything you filed: \`Filed: <ID> — <title>\` (or \`Filed: none\`).` as item 7, so the hand-on becomes item 8.
   - Hunk 2: app's self-check list (impacted specs, not the full suite, plus the review checks and the browse step), with item 3 replaced by main's sentence: "Run `git diff --stat`. Every file must tie to the ticket in one sentence. Revert anything that doesn't, and file it (see Stay in the Ticket)."
8. **`templates/skills/bobby-plan/SKILL.md.ejs`** (both hunks, refine and feature-aware): app's list (Approach / Files / Steps / Contract), with item 2 reading "List every file that needs changes, including tests, fixtures and docs, with line ranges for large files. When the ticket leaves building, `bobby ticket move` flags any changed file this list doesn't name."
9. **`templates/skills/bobby-ship/SKILL.md.ejs`**: keep both sections, main's `## Stay in the Ticket` then app's `## Checkpointing`.
10. **`test/lib/targets.test.js`**: keep both. Main's `workflow scripts are claude-code only (TKT-073)` describe gets its closing `  });\n});\n`, then app's three identity describes follow. **Extend** main's `test.each(['cursor', 'cline'])` to `['cursor', 'cline', 'codex', 'opencode', 'copilot', 'agents-md']`. This is the leak check for the new targets, and it passed in the trial.

### Semantic conflicts git did not flag (both reproduced red in the trial)

11. **`test/lib/target-matrix.test.js` › claude-code › "extraPaths and scaffoldExtras agree"** goes red. TKT-073 gave the claude-code target `extraPaths() { return ['.claude/workflows'] }`, but scaffoldExtras only writes there under `orchestration: workflow`, and app-studio's BOB-078 contract requires every extraPath to exist after a default scaffold. Fix the code, not the contract:
    - `lib/targets/claude-code.js`: `extraPaths(config = {}) { return config.orchestration === 'workflow' ? ['.claude/workflows'] : []; }`, with a one-line comment citing the matrix contract.
    - `lib/auto-sync.js` `getBobbyPaths`: `target.extraPaths ? target.extraPaths(config) : []`. Other targets ignore the argument.
    - New test in the TKT-073 describe of `test/lib/targets.test.js`: `getTarget('claude-code').extraPaths({ orchestration: 'workflow' })` equals `['.claude/workflows']`, and `extraPaths({})` equals `[]`. Also, after `scaffoldProject` with the flag on, `getBobbyPaths(tmpDir)` includes `.claude/workflows`. Write `.bobbyrc.yml` with `orchestration: workflow` first, since getBobbyPaths reads config from disk.
12. **`test/lib/scope-rule-templates.test.js` › freewill keeps its file contract** goes red, expecting 7 `## ` headings and getting 8. App-studio rewrote the freewill skill (adding `## Checkpointing`). Recompute from the merged reality, never copy either side: `toHaveLength(8)`, plus `expect(text).not.toMatch(/^## Stay in the/im)`. That second assertion is what the test is really for: the rule is a paragraph, not a section.

### Real cross-branch bug: SendMessage leaks to codex/opencode dashboard hosts

13. Main's `lib/dashboard/orchestrator.js` `_promptContext` sets `continueBuilder: target === 'claude-code' && resolveExecutor(config).name !== 'cursor-agent'`. That is a deny-list. App-studio adds the `codex` and `opencode` executors (BOB-080/085), so a claude-code project with `dashboard.executor: codex|opencode` would get the "continue the builder with SendMessage" loop, a tool those CLIs do not have. **Reproduced: 2 red tests in the trial.** Fix it as an allow-list: `continueBuilder: (config.target || 'claude-code') === 'claude-code' && resolveExecutor(config).name === 'claude',` and rewrite the comment above it to say why it is an allow-list. A custom binary path also gets the fresh-launch loop, which matches PR #17's direction of refusing unknown executors. In `test/lib/dashboard/orchestrator-continue-builder.test.js` add `test.each(['codex','opencode'])` (executor on a claude-code target → no `SendMessage`), a custom `/opt/bin/claude` executor → no `SendMessage`, and `test.each(['codex','opencode','copilot','agents-md'])` (target → no `SendMessage`).

## TKT-073 / TKT-074 against app-studio features (checked; only #2, #11, #13 above need edits)

- **BOB-120 claims × TKT-073 orchestration:** handled by the ordering in resolution 2. `bobby sprint run` has no claim check on either branch. That predates this merge and is filed as **TKT-077**, not fixed here.
- **BOB-123 × TKT-073 config writer:** after the merge, `init --refresh` never rewrites `.bobbyrc.yml` (BOB-123 `writeConfig: false`), so `orchestration`/`workflows` survive a refresh by construction. TKT-073's round-trip inside `writeConfigCommented` now only affects first-time init and programmatic writers. **Keep it** (it is not a second mechanism at refresh, and its `test/lib/config.test.js` case stays valid), but fix its comment in `lib/config.js`, which says "init --refresh rewrites this file". Change that to "first-time init writes this file; refresh leaves it alone (BOB-123), but any writer must not drop these keys". Workflow scripts are still written on refresh: `scaffoldProject` calls `target.scaffoldExtras(rootDir, config)` whatever `writeConfig` is (merged init.js ~line 329). Also update `.claude/skills/bobby-plan/learnings.local.md` entry `workflow-tool-scripts-have-no-fs`: delete the sentence "BOB-123 fixes this on integrate/app-studio but is not on main", which goes stale with this merge.
- **BOB-135 model per stage / c153b24 no model override:** the TKT-073 runtime (`templates/workflows/runtime.js`) passes `agentType` and never `model`, so it agrees. The prose prompt follows resolution 6.
- **Workflow scripts × new targets:** `resolveOrchestration` throws for any target other than `claude-code`, and only the claude-code target's `scaffoldExtras` writes scripts. All gates are `=== 'claude-code'` equality, so codex/opencode/copilot/agents-md are excluded. Resolution 10 extends the test to all of them.
- **SendMessage on the CLI path:** `buildPromptFor` defaults `continueBuilder` to `target === 'claude-code'`, so it is off for every new target. The dashboard path is resolution 13.
- **TKT-074:** `--found-in` and `--size` coexist (resolutions 3–4). The scope check is already studio-aware (diffs `process.cwd()`, refuses at the studio root). brief/triage auto-merged and their suites pass.

## Files to modify

`commands/run.js`, `commands/create.js`, `commands/move.js`, `lib/tickets.js`, `lib/workflow.js`, `lib/config.js` (comment only), `lib/targets/claude-code.js`, `lib/auto-sync.js`, `lib/dashboard/orchestrator.js` (`_promptContext`, ~line 780), `templates/skills/bobby-build/SKILL.md.ejs`, `templates/skills/bobby-plan/SKILL.md.ejs`, `templates/skills/bobby-ship/SKILL.md.ejs`, `test/lib/targets.test.js`, `test/lib/scope-rule-templates.test.js`, `test/lib/dashboard/orchestrator-continue-builder.test.js`, `.claude/skills/bobby-plan/learnings.local.md`. `.bobby/**` and `.bobbyrc.yml` are restored to main's content (resolution 1). All of these land in the merge commit `tkt-076-converge`. TKT-076's own ticket folder gets bookkeeping commits on `main` as usual.

**Do not touch:** the BOB boards (`/Users/ccevans/Repos/bobby-code-studio/.bobby/bobby/`, `~/Repos/bobby/.bobby/bobby/`), PRs #7/#9/#13/#15/#16/#17, the M4's global install, and `bobby init --refresh` in any project.

## Step-by-step

### Phase 1 — build (bobby-build)
- [ ] 1. `git fetch origin`. Record the tips: `git rev-parse origin/main origin/integrate/app-studio`, and put them in the build comment.
- [ ] 2. Create the worktree off app-studio, without switching this checkout: `git worktree add /Users/ccevans/Repos/bobby-code-studio/worktrees/bobbycode-tkt-076 -b tkt-076-converge origin/integrate/app-studio`. Then hardlink or `npm ci` node_modules. Deps are identical, so `cp -al <this checkout>/node_modules` is fine.
- [ ] 3. In the worktree run `git merge --no-ff --no-commit origin/main`. Expect exactly the 11 conflicts listed. If the set differs, a tip moved, so re-read this plan's resolutions against the new hunks.
- [ ] 4. Apply resolution 1 (board restore). Check: `git status --short | grep '^D '` prints nothing, and `test -f .bobbyrc.yml`.
- [ ] 5. Apply resolutions 2–10. Then check with `git grep -nE '^(<<<<<<<|>>>>>>>) ' -- .` (prints nothing).
- [ ] 6. TDD the semantic fixes: run `test/lib/target-matrix.test.js`, `test/lib/scope-rule-templates.test.js` and `test/lib/dashboard/orchestrator-continue-builder.test.js` (with the resolution-13 tests added) and see them **red**. Apply resolutions 11–13 and the BOB-123 comment fix, then see them green.
- [ ] 7. `npm run lint` (0 errors) and the full suite: `npm test > /tmp-in-scratchpad/suite.log 2>&1`. Expect every suite green. Paste the `Tests:` line in the comment. This is the one place this ticket runs the full suite before ship.
- [ ] 8. Commit the merge: `TKT-076: converge integrate/app-studio with main (TKT-073/074 + BOB-120/123/135, targets/executors)`. The message lists each resolution number with one line. `git push -u origin tkt-076-converge` pushes a NEW branch only. Do not push to `integrate/app-studio` or `main`.
- [ ] 9. Make the `.claude/skills/bobby-plan/learnings.local.md` edit (BOB-123 bullet) ONLY in the merge commit on `tkt-076-converge`. Do not also make it on main, because a second copy would conflict when #14 merges.
- [ ] 10. Ticket comment: tips, resolution summary, suite line, and the branch name. Then hand on to review.

### Phase 2 — review (bobby-review)
- [ ] 11. Review the merge as two diffs: `git diff origin/integrate/app-studio tkt-076-converge` (what main brings plus the resolutions) and `git diff origin/main tkt-076-converge` (what app-studio brings). git 2.34 has no `--remerge-diff`.
- [ ] 12. Spot-check resolutions 1, 2 (order), 5 (two ifs) and 13. Run the full suite independently.

### Phase 3 — ship (bobby-ship), in this order
- [ ] 13. `git fetch origin`. If either tip moved since step 1: in the worktree, `git merge origin/main` (and/or `origin/integrate/app-studio`), resolve, re-run the full suite, then push. Never force.
- [ ] 14. Fast-forward app-studio: `git push origin tkt-076-converge:integrate/app-studio`. This must be a fast-forward. If it is rejected, go back to 13. Never force.
- [ ] 15. Wait for PR #14 CI (`gh pr checks 14 --watch`) on Node 18/20/22. If it is red, stop and go back to building with the failure.
- [ ] 16. `gh pr merge 14 --merge` (merge commit, not squash, so the 61 BOB commits keep their ids). Then `git checkout main && git pull --ff-only` in this checkout. Verify `git merge-base --is-ancestor origin/integrate/app-studio origin/main`.
- [ ] 17. **Global link (L1, unless CC picks otherwise):**
  - Record rollback: `G=/Users/ccevans/Repos/bobby/repos/bobbycode; git -C $G rev-parse HEAD` (expect c60a72a, branch integrate/app-studio).
  - Run `git -C $G status --short` and expect it empty. If it is not empty, STOP and report. Do not stash someone's work.
  - Move it: `git -C $G fetch origin && git -C $G checkout main && git -C $G merge --ff-only origin/main`.
  - Deps: `git -C $G diff c60a72a HEAD -- package.json package-lock.json` must be empty. If it is not, run `npm --prefix $G ci`.
- [ ] 18. **Verify from a NEW shell** (proves fresh invocations get the new code):
  - `realpath /usr/local/bin/bobby` is `…/Repos/bobby/repos/bobbycode/bin/bobby.js`.
  - `git -C $G rev-parse HEAD` equals `git -C $G rev-parse origin/main`.
  - `bobby ticket create --help | grep -- --found-in` (TKT-074) and `| grep -- --size` (app-studio) both hit.
  - `test -f $G/lib/workflow-script.js && test -f $G/lib/dashboard/ticket-claim.js` (TKT-073 and BOB-120 both present).
  - `cd /Users/ccevans/Repos/bobby-code-studio && bobby ticket list >/dev/null && bobby brief >/dev/null` (robinflow board still resolves, exit 0).
  - `cd /Users/ccevans/Repos/bobby-code-studio/repos/bobbycode && bobby ticket view TKT-076` (TKT board still resolves).
- [ ] 19. **Running sessions:** every `bobby` call is a new node process that reads `$G`, so open Claude Code sessions pick up the new code on their next command. No session restart is needed. Long-lived processes keep the old code in memory: run `pgrep -fl 'bobby.js (app|dashboard|remote)'` and restart each one listed (none at plan time). launchd jobs on this Intel MBP invoke `bobby` per run, so they need nothing.
- [ ] 20. Move TKT-076 to done with the evidence from step 18 in the comment.

### Rollback
- **Global CLI** (instant, no repo change): `git -C /Users/ccevans/Repos/bobby/repos/bobbycode checkout integrate/app-studio`. Its local branch is still at c60a72a. Then re-run the step-18 checks.
- **main**: `git revert -m 1 <PR #14 merge sha>` through a PR to main. No reset, no force-push. `integrate/app-studio` keeps the converged commit, so re-merging later is a plain merge.
- **Before step 14**, nothing shared has changed: delete the `tkt-076-converge` branch and worktree.

## Risk areas
- **Silent board deletion** if resolution 1 is skipped. Step 4's check is the guard.
- **Tips moving** (other sessions ship into main, or PRs #15–17 merge into app-studio) between build and ship. Step 13 re-merges. Never force.
- **The old studio checkout gains `.bobbyrc.yml` and `.bobby/tickets`** when it moves to main. Inside `~/Repos/bobby` (frozen since 2026-08-24), `bobby` run from `repos/bobbycode` then resolves to the in-repo TKT board instead of the old BOB copy. This is accepted because that studio is retired.
- **This checkout's own `.claude/`** is not re-rendered from the merged templates. That is a separate `bobby init --refresh` and is out of scope.

## Dependencies
- None to start building. Step 17 assumes L1. If CC picks L2/L3 before ship, swap step 17 only.

## Other open PRs (out of scope, conflict outlook only)
- **#16** (base app-studio; touches run.js, sprint.js, config.js, workflow.js, init.js): **will conflict** with TKT-073's run.js/sprint.js/config.js changes once app-studio contains main.
- **#17** (base app-studio; touches orchestrator.js, executor.js, config.js): likely touches `resolveExecutor` near resolution 13. Expect a small conflict. Resolution 13's `=== 'claude'` matches its "refuse unknown executor" direction.
- **#15** (base app-studio; define pipeline, `.claude/skills/bobby-plan/SKILL.md`, agents): likely conflicts in the plan skill (resolution 8).
- **#13** (base main; ci.yml git identity): probably superseded by TKT-072's fix on main. It does not touch the converged files except `orchestrator-fsm.test.js`.
- **#7, #9** (base main; pair-once, multi-harness): pre-date app-studio, which carries BOB-067 and BOB-078..089. Likely superseded, so CC can close them.
- After #14 merges, `integrate/app-studio` should be retired: retarget #15/#16/#17 to `main`. That is CC's call and is listed below.

## Board decision (CC) — not decided here; implemented in TKT-079

**How each board is configured today:**
- **TKT board**: `/Users/ccevans/Repos/bobby-code-studio/repos/bobbycode/.bobby/tickets`, created by the repo-level `.bobbyrc.yml` (`ticket_prefix: TKT`, `tickets_dir: .bobby/tickets`). That file **shadows** the studio: `findProjectRoot` stops at the first `.bobbyrc.yml`. Counter 76 before planning (now 79). It has 90 folders, including 14 duplicate ids (TKT-001..014 exist twice). **TKT-001..072 are already on the BOB board.** The 2026-08-20 fold (old-studio commit 08f7951) copied them as BOB-001..090: 68 are pure prefix swaps, and the two restarted epics plus the library ticket were renumbered (e.g. TKT-001 "define pipeline" → BOB-073, TKT-013 → BOB-090). Main has not edited any of TKT-001..072 since the fork. **Only TKT-073..079 exist nowhere else.**
- **BOB board**: `/Users/ccevans/Repos/bobby-code-studio/.bobby/bobby/tickets`. Project config `.bobby/bobby/.bobbyrc.yml` is `project: bobby, prefix: BOB, repos: [bobbycode, bobbycode-pro]`. Counter 172, 168 tickets, own `decisions.yaml` (43 entries). It covers bobbycode **and** bobbycode-pro. It is reached only from the studio with project `bobby` selected. The studio's `active-project` is `robinflow`, and there is no repo→project inference (`resolveActiveProject`: flag → `BOBBY_PROJECT` → active-project file → only project).
- **Old BOB copy**: `~/Repos/bobby/.bobby/bobby/tickets`, counter 144. It is a frozen subset of the BOB board. Ignore it.

**Options:**
1. **Fold TKT into BOB (recommended).** Move TKT-073..07N into the BOB board as BOB-173.. (next free numbers), each with `formerly: TKT-07x` in frontmatter, plus a TKT→BOB mapping table in the board README covering all 79. TKT-001..072 are not moved because they are already there, and the mapping table lists their BOB numbers. Then:
   - Add main's decisions delta to `.bobby/bobby/decisions.yaml`: `one-prompt-door` invalidated, `one-prompt-door-two-doors` added, with the ticket ref rewritten to the new BOB id.
   - Delete `repos/bobbycode/.bobbyrc.yml` and `.bobby/` in a bobbycode PR. This finishes what 34cae69 started.
   - Git history and commit messages keep saying TKT-073; `formerly:` plus the table keep them traceable. Nothing is renumbered silently.
   - **Cost:** every bobbycode `bobby` command in this studio needs `--project bobby` or `BOBBY_PROJECT=bobby`, or it silently writes to the robinflow board. TKT-079 must add repo→project inference (repo `bobbycode` → project `bobby` via the project's `repos:` list) or set an explicit guard **before** the delete lands. BOB-150 (project import, backlog) is the tool-shaped version of this move.
2. **Keep TKT as bobbycode's board and fold BOB's post-fork tickets back into it.** That renumbers ~100 BOB tickets (BOB-091..172, including all bobbycode-pro work). It breaks the BOB ids in 61 app-studio commits, branch names and PR titles (#15–17), and leaves pro without a board. Not recommended.
3. **Two boards on purpose.** TKT for bobbycode CLI work in-repo, BOB for app/pro/studio work. Archive TKT-001..072 on the TKT board as pointers to their BOB ids so no id resolves to two tickets. This is the cheapest option, but two counters persist and an agent has to guess which board a new bobbycode ticket belongs on.

**Recommendation: 1**, with repo→project inference as its first step. It is the only option that ends with one counter and one decisions file. The rename work is 7 tickets, and the risk (wrong-board writes) is closed by inference before the in-repo config is deleted.

## Other decisions for CC
- **Global link target** (step 17). Every option moves this machine only; the M4 has its own global install that this ticket does not touch.
  - **L1 (recommended):** keep the symlink chain and move `~/Repos/bobby/repos/bobbycode` to `main`. Nobody builds in that frozen checkout, so it never sits on a feature branch, but it needs a fast-forward after each merge (TKT-078).
  - **L2:** `ln -sfn /Users/ccevans/Repos/bobby-code-studio/repos/bobbycode ~/Repos/bobbycode`. This is always at the newest pull, but this checkout switches to feature branches during builds (TKT-073/074 were built on branches here for hours), so every session would run unmerged code meanwhile. That is the same failure as this ticket.
  - **L3:** `npm pack` main and `npm i -g` the tarball. That gives a frozen copy with no drift from branch switches, but it needs a reinstall per release.
- **Retire `integrate/app-studio` after #14:** retarget #15/#16/#17 to `main` and stop landing work on it (recommended), or keep it as an integration branch and re-converge periodically (that is how TKT-068 and this ticket happened).
- **Close #7 and #9** as superseded by app-studio (recommended after a glance), or keep them.

## Tickets filed (found in TKT-076)
- TKT-077 — `bobby sprint run` has no BOB-120 claim check.
- TKT-078 — nothing keeps the global checkout on current main after ship.
- TKT-079 — one board for bobbycode (waits on the board decision above).
