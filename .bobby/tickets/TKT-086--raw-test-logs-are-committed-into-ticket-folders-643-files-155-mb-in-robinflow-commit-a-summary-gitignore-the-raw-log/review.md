## Review — TKT-086

### Verdict: Approved with Notes

Reviewed branch `tkt-086-ticket-logs` @ `3cf3954` in `/Users/ccevans/Repos/bobby/worktrees/tkt-086`, diff `origin/main...HEAD` (12 files, +460/-4). Worktree clean.

### Files Reviewed
- `lib/ticket-logs.js` (new) — pattern helpers, `ensureGitignoreLines` (same algorithm as studio `ensureGitignore`), ANSI strip, result/failure extraction, `summarizeLog`. Matches plan step 1 exactly.
- `commands/attach.js` — `--log`/`--cmd` branch returns before the screenshot path, so non-log attach is byte-for-byte unchanged. `untrack-logs` registered inside `registerAttach`, which `commands/ticket.js:28` mounts under `bobby ticket` (verified by running `bobby ticket untrack-logs`). All git calls use `execFileSync`/`spawnSync` argv, no shell strings. Deviation from plan: pathspec built relative to the project root and git run with cwd = root, instead of computing it from `--show-toplevel`. Equivalent (git pathspecs are cwd-relative) and simpler; verified with a project in a subdirectory of the git top (below).
- `commands/init.js` — refresh branch calls `ensureGitignoreLines(rootDir, [ticketLogPattern(existingConfig)])` after `scaffoldProject`. Studio root: `readConfig` keeps `studio` truthy after the cascade, so the studio pattern lands; no `resolveTicketsDir` call.
- `lib/studio.js` — only the `needed` array line plus one comment line above it (line 100). No import. Within the shared-file limit (TKT-084 owns line 9 and 135–142).
- `templates/WORKFLOW.md.ejs` — one row after line 40 (`View files`). Within the shared-file limit (TKT-085 owns rows after 53).
- `templates/gitignore.ejs` — plain-board pattern after the run.lock block.
- `templates/skills/bobby-test/SKILL.md.ejs`, `templates/skills/bobby-ship/SKILL.md.ejs` — appended sentences only, no renumbering; Merge gate 3 now cites the `.log.md`.
- Tests: `test/lib/ticket-logs.test.js` (new), `test/commands/attach.test.js`, `test/commands/init.test.js`, `test/lib/studio.test.js`.
- `commands/ticket.js` — not touched, as planned.

### Code Concerns
None block the ticket. Two filed, two notes:

1. **Filed TKT-089 — `--move` onto itself deletes the file.** `commands/attach.js:91` copies the source to `logs/<name>` and `:97` unlinks the source. When the source already is `logs/<name>.log` (re-summarising an attached log with `--log --move`), it copies onto itself and the unlink deletes the only copy, exit 0. Reproduced: after `attach TKT-001 .bobby/tickets/TKT-001--a/logs/x.log --log --move`, only `x.log.md` remains. The same bug already exists in the screenshot path (`:47-48`, pre-existing), which is why it is filed as one fix for both rather than rejected here. It matters more for `--log` because the raw file is gitignored and git cannot restore it.
2. **Filed TKT-090 — fresh `bobby init` on an existing repo gets no ignore lines.** `commands/init.js:856` renders `gitignore.ejs` only for `projectType === 'new' && !hasGitignore`. AC 2 is met as planned (template, studio, refresh), but an init into an existing repo has neither run.lock (pre-existing) nor the new log pattern until `init --refresh`. `attach --log` warns in that state, so it is visible, not silent.
3. Note: the `~~~~` fence (`lib/ticket-logs.js:75-77`) is safe against ``` but a log line that is itself `~~~~` (or longer) closes it early; reproduced, the lines after it render outside the block. Rare in test output. A fence one tilde longer than the longest tilde run in the tail would close it.
4. Note: `FAILURE_PATTERNS` (`lib/ticket-logs.js:49`) `/^\s*● /` also matches jest's `● Console` blocks, and jest repeats every failure under "Summary of all failing tests" in multi-file runs, so a jest Failures list can hold duplicates and non-failures and reach the 50 cap at half the real count. The Result line (`Tests:`) stays correct. The plan's patterns were followed as written.
5. Note: `- Source:` (`lib/ticket-logs.js:66`) writes the absolute local path (e.g. `/Users/<name>/...`) into a committed file. Specified by the plan; harmless but machine-specific.

### Decision Violations
- None. Checked `decisions-log-has-one-writer` (no decisions.yaml edits), `tickets-resolve-to-main-worktree` (attach still uses `findTicket` on `resolveTicketsDir`; `untrack-logs` deliberately uses the config pattern from the project root, as planned, to cover every studio board), `overlay-shipped-vs-local` (only shipped templates edited).

### AC Verification
- [x] AC 1: `attach --log` writes raw to `<ticket>/logs/<name>.log` and `<name>.log.md` with Command, Result, Failures, last 100 lines (`commands/attach.js:80-108`, `lib/ticket-logs.js:58-80`). Test asserts byte-identical raw, summary content, raw ignored and summary untracked via `git status`. Non-`.log` names get `.log` appended.
- [x] AC 2: `templates/gitignore.ejs` (`.bobby/tickets/*/**/*.log`), `lib/studio.js:101` (`.bobby/*/tickets/*/**/*.log`), `init --refresh` via `ensureGitignoreLines`. Idempotence tested for `ensureGitignoreLines`, a second `initStudio`, and `init --refresh` twice. Pattern semantics probed with `git check-ignore`: `T/root.log` and `T/logs/x.log` ignored, `T/logs/x.log.md` and a log outside tickets not ignored, studio pattern likewise (`.bobby/rf/tickets/.counter.log` not ignored).
- [x] AC 3: `untrack-logs` runs only `git ls-files` and `git rm --cached --quiet` in chunks of 200; no commit, no history change. Test asserts staged `D` entries, files on disk, `notes.md`/`src/app.log` untouched, commit count unchanged.
- [x] AC 4: bobby-test Evidence Storage and bobby-ship step 6 + Merge gate 3 reference `--log` / `.log.md`; asserted in `test/lib/ticket-logs.test.js`.
- [x] AC 5: rspec `Finished in` / `N examples, N failures`, jest `Tests:` / `Test Suites:`, ANSI strip, 100-line tail, fence, 50 cap, and gitignore idempotence are tested.

test-cases.md: TC1–TC14 each have a corresponding test, except TC8(a)/TC14 run against the template source rather than a rendered scaffold (acceptable; the strings are literal).

### Test/Lint Output
- Impacted specs: `NODE_OPTIONS=--experimental-vm-modules npx jest test/lib/ticket-logs.test.js test/commands/attach.test.js test/commands/init.test.js test/lib/studio.test.js` → `Test Suites: 4 passed, 4 total`, `Tests: 89 passed, 89 total`.
- Template consumers: `test/lib/compaction-hooks.test.js test/lib/dashboard/ticket-claim.test.js test/lib/models.test.js test/lib/scope-rule-templates.test.js test/lib/template.test.js test/lib/workflow.test.js` → `Test Suites: 6 passed`, `Tests: 306 passed`.
- Lint: `npm run lint` → 0 errors, 38 warnings repo-wide. In changed files: 3 warnings, all pre-existing (`commands/init.js:5,10` unused imports; `test/commands/attach.test.js:86` outside the new block).

### Manual probes
- Project in a subdirectory of the git top, including a filename with a space: `untrack-logs --dry-run` listed 3, the real run staged 3 `D` entries (spaced name intact), wrote `sub/.gitignore`, and left the files on disk.
- Read-only dry run on the real robinflow studio (`/Users/ccevans/Repos/bobby-code-studio`): `759 tracked log files would be untracked`, equal to `git ls-files -- '*.log' | wc -l` (759), so nothing outside ticket folders is caught. `git status` was unchanged afterwards. (The ticket's 643 figure is stale; it is 759 today.)

### Notes
- Operator step after ship (out of scope here): run `bobby ticket untrack-logs` in the robinflow studio, then commit. It will stage 759 removals.
- Filed: TKT-089, TKT-090.
