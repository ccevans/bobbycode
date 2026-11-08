## Review — TKT-085

### Verdict: Rejected

Reviewed branch `tkt-085-ownership-handoff` @ 4733b26 against origin/main (`git diff origin/main...HEAD`), worktree `/Users/ccevans/Repos/bobby/worktrees/tkt-085`. Round 1.

### Files Reviewed
- `lib/owner.js` (new): `machineName` (scutil on darwin, `os.hostname()` elsewhere, explicit throw on error or empty; no env override), `HANDOFF_SECTIONS`, `parseHandoff`, `unfilledSections`, `renderHandoffTemplate`. Matches plan steps 1 and decisions 2–4.
- `commands/assign.js`: `--session` option and the new `handoff` subcommand. Registered through `registerAssign(cmd)` from `commands/ticket.js:27`, so it is `bobby ticket handoff` and `commands/ticket.js` is untouched, as planned.
- `lib/brief.js`: new pure `groupInFlightByOwner`. `buildBrief` is unchanged, and `listTickets` carries `owner` through to `inFlight` (the CLI test proves it end to end).
- `commands/brief.js`: import on line 3, `ticketLine` helper directly above `registerBrief`, and the In flight block replaced. Inside the plan's shared-file limits for TKT-083 (lines 4–66 untouched, nothing added at the bottom of the file).
- `templates/WORKFLOW.md.ejs`: two rows right after the `Assign` row (line 53). Inside the TKT-086 limits.
- `templates/skills/bobby-shared/SKILL.md`: new "Handing off a ticket" section.
- Tests: `test/lib/owner.test.js`, `test/commands/assign.test.js`, `test/commands/brief-owners.test.js`.

### Code Concerns

**Blockers**

1. **The handoff commit sweeps in unrelated staged work.** `commands/assign.js:104` commits through `autoSync()`. `lib/auto-sync.js:45-46` scopes `git add -- <paths>` (TKT-061) but then runs `git commit -m "bobby: auto-sync"` with no pathspec, so the whole index gets committed. Plan decision 6 assumed "a local commit of only the ticket folder", and that assumption is wrong. Reproduced on 4733b26 in a tmp repo: `echo x > src.js && git add src.js`, fill the template, then `bobby ticket handoff TKT-001 --to a` gives a `bobby: auto-sync` commit containing `progress.md`, `ticket.md` **and `src.js`**. A handoff happens mid-work, on a board other agents write to, which is exactly when unrelated files are staged. That is TKT-061's bug coming back through a new caller.
   - The test that is supposed to guard this (`test/commands/assign.test.js:99`, "commits the ticket only") writes an *untracked* `unrelated.txt`. `git commit` never takes untracked files, so the test passes without any scoping. It needs a **staged** unrelated file, and it should also assert that the file is still staged afterwards.
   - Fix (verified in a scratch repo): `git commit --only -m "bobby: auto-sync" -- <paths>` in `lib/auto-sync.js:46` commits only those paths and leaves other staged entries staged. Add a pre-staged case to `test/lib/auto-sync.test.js`. If the fix lands in autoSync here, it also closes TKT-091 (filed below for the other callers).

2. **A failed handoff commit is swallowed, and the command still says it succeeded.** `autoSync` catches every error (`lib/auto-sync.js:48`). The handoff then prints `✓ TKT-001 handed off to b` and exits 0 when nothing was committed. Reproduced with `.git/index.lock` present: exit 0, success line, ticket.md and progress.md left modified and uncommitted. The handoff exists to move ownership *across machines*, which only happens through git, and the shipped skill text promises "sets the owner and commits the ticket" (`templates/skills/bobby-shared/SKILL.md:17`). index.lock contention is routine on this board. Under the no-fallbacks rule a swallowed failure needs CC's approval. The plan's risk note only kept the success line from saying "committed". Fix: have `autoSync` return whether it committed (existing callers ignore the return value), and have handoff exit non-zero with an explicit "owner updated in <path> but not committed: <git error>; rerun once the lock clears" when the commit doesn't land. Add a test for that case.

3. **`--machine ""` (or whitespace) is silently recorded as `machine: null`.** `commands/assign.js:92`: an explicit but empty value turns into "machine not recorded" without any message, while `--session ""` (line 35) and `--to ""` (line 73) both error. Under the no-fallbacks rule invalid input is an explicit error. Fix: `--machine needs a computer name` and exit 1, with a test.

**Notes (non-blocking)**
- `withHandoffLine` (`commands/assign.js:15,19`) removes every line starting with `> Handed off ` anywhere in the file, including under `## Earlier notes`. It also collapses every run of 3+ newlines in the whole document, which can reflow user content such as fenced code in the notes. A low-impact edge case, but scoping both to the title area would be safer.
- `parseHandoff` matches headings exactly. `## Next Step` (different case) counts as missing, so the next run appends a second `## Next step` section and the author's content goes unvalidated. An acceptable limitation.
- The plan's step 6 called for a grouping case in `test/lib/brief.test.js`. It isn't there: `groupInFlightByOwner` has no unit test and is covered only through `test/commands/brief-owners.test.js` (TC10, the null-machine case, TC11). The build comment lists `test/lib/brief.test.js` among the specs that "pass", but the branch didn't change it.

### Decision Violations
- No literal violation. Finding 1 does undercut `auto-sync-scoped-paths` (TKT-061): "autoSync stages only caller-declared paths" is true of `git add` but not of the commit, and the handoff relies on the commit.

### AC Verification
- [x] AC 1 — `assign --session` writes owner.session/machine/since without touching `assigned` (`commands/assign.js:41-44`). `since` round-trips as a string (TC1). Assigning without `--session` keeps the owner (TC2). An empty session errors (TC3).
- [ ] AC 2 — handoff writes all six sections, refuses placeholders (TC4, TC5, TC8) and updates the owner (TC6, TC7). **But "auto-syncs the ticket" is not met safely**: the sync commits unrelated staged files (finding 1) and reports success when the commit fails (finding 2).
- [x] AC 3 — brief groups in-flight tickets by machine and then session. Machines are sorted with `null` last and rendered as the explicit label "machine not recorded". Machine is never guessed: handoff without `--machine` stores `null` (decision 1) and brief only labels it. Unowned tickets go under `No owner`. With no owners the flat format is unchanged.
- [x] AC 4 — the shared skill template points at `bobby ticket handoff` and `--session`. The scaffolded copy is checked by the TC13 test.
- [ ] AC 5 — the tests cover everything listed, but the "commits the ticket only" assertion passes without the guarantee (untracked file, finding 1).

### Test/Lint Output
- Tests (impacted only): `NODE_OPTIONS='--experimental-vm-modules' npx jest test/lib/owner.test.js test/commands/assign.test.js test/commands/brief-owners.test.js test/lib/brief.test.js test/lib/auto-sync.test.js`: **5 suites, 49 tests passed.**
- Lint: `npx eslint` on the 4 changed source files and 3 new test files: **clean (exit 0).**
- Manual repros (scratch repo, branch build): staged `src.js` swept into the handoff commit, and a held `.git/index.lock` gives exit 0 with a success line and no commit.

### Notes
- Filed: **TKT-091**: autoSync commits pre-staged unrelated files (affects learn/triage/retro/decision too). If finding 1 is fixed inside autoSync on this branch, TKT-091 can be closed as done in TKT-085.

---

## Re-review — TKT-085 (round 2)

### Verdict: Approved with Notes

Reviewed fix commit `d945e35` on `tkt-085-ownership-handoff` (worktree `/Users/ccevans/Repos/bobby/worktrees/tkt-085`). Merge-base with origin/main is still `d37b30b`. `git diff --stat 4733b26 d945e35` shows only `commands/assign.js` and `test/commands/assign.test.js` changed, so the other 7 files in `origin/main...HEAD` are byte-identical to what round 1 reviewed. Working tree clean.

### Files Reviewed
- `commands/assign.js` — handoff no longer calls `autoSync`. It runs `git add -- <ticketdir>` and then `git commit --only -m "<ID>: handoff to <to>" -- <ticketdir>` through `execFileSync` (no shell), with stderr captured. If either step fails, the error says "owner and progress.md were written in <dir> but NOT committed: <git stderr>", the command exits 1 and prints no success line. An explicit `--machine` that is empty or only whitespace now errors out before anything is written.
- `test/commands/assign.test.js` — TC6 asserts the new commit subject. Three new tests: TC6b (tracked file modified and staged, plus a new file staged), TC6c (`.git/index.lock` held), TC6d (`--machine ""` and `"   "`).
- `lib/auto-sync.js` is untouched, as intended (TKT-091 covers the other callers).

### Blockers from round 1
1. **Unrelated staged files swept into the commit: closed.** I reproduced this on d945e35 in a scratch repo: modified and staged a tracked `src.js`, staged a new `other.js`, ran the template handoff, filled it, added an untracked `notes.md` to the ticket folder, then ran the filled handoff. The commit `TKT-001: handoff to a` holds only `progress.md` (A, untracked before the handoff), `notes.md` (A) and `ticket.md` (M). `src.js` and `other.js` are still staged afterwards. TC6b fails without the fix in two ways: against 4733b26's `assign.js` the commit holds `unrelated.txt` and `newfile.txt`, and against d945e35 with only the pathspec and `--only` removed TC6b alone fails.
2. **Failed commit reported as success: closed.** Repro with `.git/index.lock` gives exit 1, no success line, git's own message in the error, and HEAD unchanged. After the lock is removed, the same command commits, and progress.md still has exactly one `> Handed off` line. A merge in progress ("cannot do a partial commit during a merge") and a gitignored tickets dir also exit 1 with the git reason. TC6c fails against 4733b26's `assign.js` (exit 0).
3. **Empty `--machine` silently null: closed.** TC6d covers `""` and `"   "`: exit 1, the message is shown, ticket.md and progress.md are unchanged. It fails against 4733b26's `assign.js`.

### Other checks
- Paths with spaces: repo root `repo with space/`, `tickets_dir: "my tickets/board one"`, run from a subdirectory, `--to "intel 2"`. The commit holds exactly the two ticket files and the staged `src.js` stays staged. `execFileSync` with argv avoids the quoting that `autoSync` does by hand.
- New untracked files in the ticket folder (progress.md on the first handoff) are committed. `git add` runs before `commit --only`, so the pathspec matches tracked entries.
- The commit subject changed from `bobby: auto-sync` to `<ID>: handoff to <to>`. Grepping `lib/ commands/ bin/` finds nothing that keys on the old subject.

### Code Concerns (non-blocking)
- After a failed commit, rerunning "the same command" (as the error suggests) writes `> Handed off ... from <to> to <to>`, because the failed run already set `owner` to the receiver. The line no longer shows the real previous owner. The previous owner is still in git history from its own commit. One way to fix it: on rerun, keep the prior line when `owner.session === to` and the tree is uncommitted.
- For a gitignored tickets dir the hint "Rerun the same command once git is free" is misleading. Git's own "paths are ignored" text is shown right above it, so the user is not left without the reason.
- `git add -- <ticketdir>` commits everything in the ticket folder, test-evidence and scratch notes included. That fits "commits the ticket", but it is broader than the two files handoff itself writes.
- The inner `const rel` (relative to the repo top) shadows the outer `rel` (relative to cwd). Lint passes and the behaviour is correct, so this is cosmetic.
- The round-1 notes (scope of `withHandoffLine`, case-sensitive headings, no `groupInFlightByOwner` unit test in `test/lib/brief.test.js`) still stand and are unchanged.

### Decision Violations
- None. Handoff no longer depends on `autoSync`, so the `auto-sync-scoped-paths` gap no longer reaches this caller. Failures are explicit, which satisfies no-fallbacks.

### AC Verification
- [x] AC 1: unchanged since round 1 (TC1–TC3).
- [x] AC 2: handoff now commits only the ticket folder and fails loudly when it cannot (TC6, TC6b, TC6c, plus the manual repros above).
- [x] AC 3: unchanged since round 1 (brief-owners tests).
- [x] AC 4: unchanged since round 1 (template/skill test).
- [x] AC 5: the "commits the ticket only" assertion now uses staged unrelated files and checks they stay staged (TC6b).

### Test/Lint Output
- Tests (impacted): `NODE_OPTIONS='--experimental-vm-modules' npx jest test/lib/owner.test.js test/commands/assign.test.js test/commands/brief-owners.test.js test/lib/brief.test.js test/lib/auto-sync.test.js`: **5 suites, 52 tests passed.**
- Mutation runs (scratch copy of d945e35 via `git archive`): with 4733b26's `assign.js`, 4 failed (TC6, TC6b, TC6c, TC6d). With only the commit pathspec removed, TC6b failed.
- Lint: `npx eslint` on the 4 changed source files and 3 changed test files: **exit 0.**
