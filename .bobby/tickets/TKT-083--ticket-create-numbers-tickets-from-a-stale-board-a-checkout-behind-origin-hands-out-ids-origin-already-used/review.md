## Review — TKT-083

### Verdict: Rejected

One blocking finding. The "upstream configured but missing on the remote" branch of `fetchUpstream` is two cases, and the code handles both the same way. A branch that was never pushed is genuinely the same as having no upstream. A branch that was deleted on the remote is not: the builder's `update-ref -d` (which the plan did not call for) deletes the local tracking ref, which is the evidence that the upstream existed and held IDs. The guard then silently turns itself off and `nextId` loses its floor. I reproduced the exact incident this ticket exists to stop.

Branch `tkt-083-stale-board`: 587135e and 170234b, diffed against origin/main.

### Files Reviewed
- `lib/board-upstream.js` (new, 192 lines). Read in full. It uses `execFileSync` with no shell and `GIT_TERMINAL_PROMPT=0`, and retries only on lock errors. Spawn failures are rethrown. Realpath is applied on both sides of `relDir`.
- `lib/counter.js`. The floor is added after the `highestOnDisk` block, exactly where the plan put it. It is offline (no fetch).
- `commands/create.js`. The import is on new line 8 and the guard on new line 53. Lines 3 and 33–45 are untouched (TKT-087 shared-file limits respected). The guard runs after the local validations and before `createTicket`, so a refusal writes nothing.
- `commands/go.js`. The guard covers only the `what.length > 0` branch, inside the existing try/catch, before `exec(['run', ...])`.
- `commands/brief.js`. The import is on new line 7, the call on new line 64 (directly after `buildBrief`), and `printFreshness` sits at the bottom of the file. Lines 3 and 64–125 of the original are untouched (TKT-085 limits respected).
- The tests (`test/lib/board-upstream.test.js`, `test/commands/brief-freshness.test.js`, and the additions to `create`/`go`/`new`) use local bare repos with no network. TC1–TC11 each map to a test.

### Code Concerns

**1. BLOCKING: a deleted upstream branch silently disables the guard and erases the ID floor (`lib/board-upstream.js:105-108`).**

```js
if (typeof e.status === 'number' && /couldn't find remote ref/.test(stderr)) {
  if (trackingExists(up)) git(['update-ref', '-d', up.trackingRef], up.repoRoot);
  return;
}
```

Plan decision 4 groups "set up with -u before its first push" with "a remote branch that was deleted" and treats both as having no upstream. They are not equivalent:
- **Never pushed, no local tracking ref.** Nothing upstream ever held IDs, so treating it as no upstream is correct. That matches AC 4 and is not a fallback.
- **Deleted on the remote, local tracking ref still present.** The branch existed and held tickets. Typically it was merged into main and deleted, and its tickets now live on main. The code deletes the tracking ref, returns as if all is well, then `commitsBehind` returns 0 and `upstreamHighestId` returns 0. CC's no-fallbacks rule calls this a silent substitute: missing input (the configured upstream is gone) turns into "proceed". The ref deletion was also not in the plan.

Reproduced in scratch repos with the branch's own `bin/bobby.js`:
- A is on `feat`, tracking `origin/feat`.
- B creates TKT-001..005 on `feat` and pushes. `feat` is pushed to `main`, then `origin/feat` is deleted.
- A has fetched, so `refs/remotes/origin/feat` holds TKT-001..005.
- In A, `bobby ticket create -t "from A"` prints `Created TKT-001`, exit 0. Afterwards `refs/remotes/origin/feat` is gone and `origin/main` holds TKT-001..005.

That is a duplicate ID, created silently, and the run destroyed the tracking ref that would have floored `nextId` at TKT-006. `bobby brief` runs the same `fetchUpstream`, so a read-only command also deletes the ref.

**Fix:**
- When the remote ref is missing and a local tracking ref exists, throw an explicit error that does not delete the ref. Suggested wording: `<label> no longer exists on <remote> (deleted or renamed); this board may be behind wherever its tickets went. Set the board's upstream (git branch -u <remote>/<branch>) or unset it (git branch --unset-upstream), then retry.`
- In `boardFreshness` that error becomes the visible `unknown` state.
- Keep "never pushed, no tracking ref" as no upstream.
- Add a test for the deleted case: the tracking ref exists, the remote branch is deleted, create exits 1, and the tracking ref is still there afterwards.

**2. Note: locale.** The `couldn't find remote ref` and `LOCK_RE` matches only work on git's English stderr. Under a translated git (`LANG=de_DE` etc.), the never-pushed case hard-errors instead of passing, and lock contention is not retried. Both fail closed, so this is not a fallback, but TC11 would fail for those users. Setting `LC_ALL: 'C'` in `git()`'s env alongside `GIT_TERMINAL_PROMPT` fixes it.

**3. Note: SSH prompts.** `GIT_TERMINAL_PROMPT=0` does not stop ssh from asking for a passphrase or host key on `/dev/tty`. An interactive user can get prompted by `ticket create`/`brief`. Headless agents have no tty, so they get an explicit error. This is acceptable as-is. Mention it if it comes up.

**4. Note: missing git binary.** `nextId` now throws `spawnSync git ENOENT` when git is not installed, even for a non-git board. I checked whether that breaks a path that worked before. `bobby init`/`scaffoldProject` already needs git: `commands/init.js:122` runs `ensureGitRepo` → `execSync('git init')`, which throws without git. `bobby new` → `createProject` → `git init` needs it too, and the dashboard runs inside a git repo with worktrees. No supported path ran without git before, so this is not a regression. The raw ENOENT message is unfriendly but explicit.

**Callers of `nextId` / `createTicket`, checked one by one:**
- `lib/tickets.js:199` and `lib/sprint.js:107` (sprints get the floor for their own prefix, which is harmless).
- `lib/project.js:145` (`bobby new`: fresh `git init`, no upstream; pinned by new.test.js).
- `lib/dashboard/server.js:374,497` and `lib/dashboard/onboard.js:111`. These get the offline floor only, as the plan intended. No network call is added to the request path.
- `commands/idea.js:110` (`idea promote`), `commands/audit.js:127` (`audit --tickets`) and `commands/pack.js:161`. These are CLI ticket creators with no `assertBoardCurrent`, so on a never-fetched stale board they still hand out IDs origin already used. They are outside this ticket's ACs and plan (the ACs name `ticket create`/`go`), so this is filed as a follow-up, not a rejection reason.

### Decision Violations
- None. `ticket-ids-claimed-by-mkdir` still holds: the floor only raises the starting candidate, and the mkdir/EEXIST claim is unchanged.

### AC Verification
- [x] AC 1: `create` refuses when upstream is ahead, names the count and branch, and creates nothing. `assertBoardCurrent` runs before `createTicket`, and the board-path-scoped `rev-list --count HEAD..ref -- relDir` count implements decision 1. Covered by the create.test.js "refuses…creates nothing" test and the code-only test.
- [x] AC 2: the next ID is above upstream's highest. Covered by `counter.js:37-39` and the lib "nextId floors… with no network" test, which breaks the remote URL after the fetch. Gap: this is defeated by Concern 1 when the tracking ref is deleted.
- [x] AC 3: a fetch failure is an explicit error naming the remote and URL (`fetchUpstream`'s final throw). Covered by create and lib tests.
- [~] AC 4: no upstream keeps today's behaviour, for a git repo with no remote and for a non-git dir. But the "configured but deleted" case is folded into it wrongly (Concern 1).
- [x] AC 5: brief shows the behind line before the title and nothing when current. brief-freshness.test.js asserts the order and the absence.
- [x] AC 6: plain and studio boards both work. Covered by the studio tests in the lib and create suites, including "another project's board moving does not block".
- [x] AC 7: local bare repos only, no network.

**Builder call 2 (brief prints "Board freshness unknown: <reason>" on fetch failure and continues): acceptable.** It is a visible, explicit lead line, not a substitute value. Brief is read-only and allocates nothing, `create`/`go` still hard-error, and the planner chose it in plan decision 3. Spawn failures still throw.

### Test/Lint Output
- Tests (impacted specs: `test/lib/board-upstream.test.js test/commands/brief-freshness.test.js test/commands/create.test.js test/commands/go.test.js test/commands/new.test.js test/lib/counter.test.js test/lib/tickets.test.js test/lib/sprint.test.js`): 8 suites, 176 passed, 0 failed.
- Lint: `npm run lint` gives 0 errors and 38 warnings, all pre-existing. The changed files have 1 warning, the unused `path` import at `commands/create.js:2`, which is already on origin/main.

### Notes
- Filed: TKT-092, for `idea promote` / `audit --tickets` / `pack` creating tickets with no stale-board check.
- I made no changes to the worktree.

---

## Re-review — TKT-083 (after rejection 1)

### Verdict: Rejected

The fix for concern 1 works: a deleted upstream now refuses, keeps the tracking ref, and brief shows "Board freshness unknown". LC_ALL=C is applied correctly. One blocking finding is left, and it is the same incident reached through the error message. The two commands the refusal prints as the way out are a no-op and the original bug. Following the second one hands out TKT-001 again. I suggested this wording in review 1 with `<remote>/<branch>` as placeholders, and the builder filled them in with the deleted branch. That gap is partly on my first review.

Reviewed commit 8613a88 on `tkt-083-stale-board`, against origin/main `d37b30b`. origin/main has not moved since review 1.

### Files Reviewed
- `lib/board-upstream.js`. Read in full again.
  - `fetchUpstream` lines 109-112: a missing remote ref with no local tracking ref still returns (never pushed). A missing remote ref with the tracking ref present now throws `fetchFailure` and no longer runs `update-ref -d`.
  - `git()` line 25: `LC_ALL: 'C'` is set in the one `execFileSync` call. Every git invocation in the file goes through `git()`/`gitOrNull()` (grep: one `execFileSync`, no other spawn). `lib/counter.js` spawns no git of its own.
- `test/commands/create.test.js` and `test/lib/board-upstream.test.js`: new deleted-upstream tests. The branch is deleted in the bare origin, so A's tracking ref survives as it would in real life. Each test asserts exit 1, the message, no folder created, and the ref still present.
- Rest of the diff: `git diff --stat 170234b 8613a88` shows only the 3 files above plus the auto-sync `learnings.local.md`. `commands/*.js`, `lib/counter.js`, brief-freshness, go and new tests are byte-identical to what review 1 approved.

### Reproduction (branch CLI, `node <worktree>/bin/bobby.js`, scratch repos)
- A is on `feat` tracking `origin/feat`. B creates TKT-001..005 on `feat` and pushes. A fetches, so `refs/remotes/origin/feat` holds TKT-001..005. B pushes `feat:main` and deletes `origin/feat`.
- `ticket create` in A exits 1 with `origin/feat no longer exists on origin (deleted or renamed); ... Set the board's upstream (git branch -u origin/feat) or unset it (git branch --unset-upstream), then retry.` No folder is created and the tracking ref survives (same sha before and after).
- `brief` exits 0, its first line is `⚠ Board freshness unknown: origin/feat no longer exists ...`, and the ref survives.
- `go "something"` exits 1 with the same error.
- With `fetch.prune=true` in A's config, the result is the same refusal and the ref survives.
- Never pushed: a branch with `branch.X.remote/merge` set and no tracking ref creates normally (TKT-007), and brief prints no freshness line. That is still "no upstream". Correct.
- Locale: this machine's git ships German (`LC_ALL=de_DE.UTF-8 git fetch origin nosuch` prints `fatal: Konnte Remote-Referenz nosuch nicht finden.`). A never-pushed create under `LANG/LC_ALL=de_DE.UTF-8 LANGUAGE=de` succeeds, so the English stderr match holds. LC_ALL=C also overrides LANGUAGE.
- After `git branch -u origin/main` the guard says `Board is 1 commit behind origin/main ... Pull first: ...`. After the pull, create hands out TKT-006. That is the correct recovery, but the message never names it.

### Code Concerns

**1. BLOCKING: the refusal's printed way out loops or recreates the duplicate-ID incident (`lib/board-upstream.js:111`).**

```js
throw fetchFailure(`${up.label} no longer exists on ${up.remote} (deleted or renamed); this board may be behind wherever its tickets went. Set the board's upstream (git branch -u ${up.remote}/${up.remoteBranch}) or unset it (git branch --unset-upstream), then retry.`);
```

- `git branch -u ${up.remote}/${up.remoteBranch}` points the branch back at the deleted branch. Git accepts it because the tracking ref still exists ("Branch 'feat' set up to track remote branch 'feat' from 'origin'"), and the retry fails with the same error. Reproduced.
- `git branch --unset-upstream`, then retry, gives `✓ Created TKT-001 — after unset`, exit 0, while origin/main holds TKT-001..005. Reproduced. That is the exact duplicate this ticket exists to stop. Unattended agents are told to take reversible actions that follow from an error, so a headless agent following the message literally lands here. The literal command is the only one of the two that "works", so an agent is the most likely to pick it.
- The test pins the wrong text: `create.test.js` expects `/git branch -u origin\/feat/` and the lib test expects `/git branch -u origin\/feat.*--unset-upstream/s`.

**Fix (message and tests only, no logic change):**
- Name the real recovery: point the board at the branch its tickets went to, then pull. Suggested text: `${label} no longer exists on ${remote} (deleted or renamed), and its last fetched copy holds this board's tickets, so they likely moved to another branch (often the one it merged into). Point the board at that branch and pull it: git branch -u ${remote}/<branch> && git pull --rebase. Then retry.`
- Keep `<branch>` as a literal placeholder. Do not interpolate `up.remoteBranch`.
- Drop the `--unset-upstream` suggestion. Re-pointing to the merge target already covers every legitimate case, because the guard passes once the board is current. Unsetting only switches the guard off.
- Update both tests to assert the new text, and assert that the message does not contain `git branch -u origin/feat` or `--unset-upstream`.

**2. Note: LC_ALL=C does not break any parser.** The parsed outputs are `rev-parse --show-toplevel`, `symbolic-ref --short`, `config --get`, `remote get-url`, `rev-list --count` and `ls-tree --name-only`. These are paths, refs, config values and integers, and none of them is localized. ls-tree path quoting is controlled by `core.quotePath`, not the locale. Full suite and impacted suites are green with it.

**3. Note: a user-side prune still erases the evidence.** If the user runs `git fetch --prune` or `git pull` with `fetch.prune` before Bobby runs, git deletes the tracking ref. The deleted branch then looks like never pushed, and the guard and floor turn off. Bobby cannot tell those two cases apart once the ref is gone, and Bobby's own fetch with `fetch.prune=true` does not prune it (verified). This is outside the code's control, and the commits-behind check against any re-pointed upstream still applies. Not blocking.

### Decision Violations
- None. `ticket-ids-claimed-by-mkdir` is unchanged.

### AC Verification
- [x] AC 1-3, 5-7: unchanged since review 1 and still covered. The tests pass.
- [~] AC 4: never pushed is correctly no upstream, and deleted is now an explicit error that keeps the ref. But the explicit error's instructions lead back to a silent duplicate (concern 1).

### Test/Lint Output
- Impacted: `npm test -- test/lib/board-upstream.test.js test/commands/brief-freshness.test.js test/commands/create.test.js test/commands/go.test.js test/commands/new.test.js test/lib/counter.test.js test/lib/tickets.test.js test/lib/sprint.test.js` gives 8 suites, 178 passed, 0 failed.
- Full: `npm test` gives 105 suites passed and 1 skipped; 1923 tests passed, 51 skipped, 0 failed. The lifecycle e2e passed in this run.
- Lint on the changed files: 0 errors and 1 warning, the pre-existing unused `path` at `commands/create.js:2`.

### Notes
- I made no code changes. TKT-092 (idea promote / audit --tickets / pack) is still separate and not required here.
