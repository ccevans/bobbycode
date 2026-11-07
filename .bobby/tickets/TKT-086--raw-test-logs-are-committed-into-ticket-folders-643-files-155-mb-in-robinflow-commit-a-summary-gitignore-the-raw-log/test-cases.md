# Test Cases — TKT-086

Fixture: the `attach.test.js` tmp project (`.bobbyrc.yml`, `.bobby/tickets/TKT-001--fix-login/ticket.md`). It is `git init`-ed, with the scaffolded `.gitignore` (rendered from `gitignore.ejs`) committed, for the ignore cases.

## TC1 — attach --log writes the raw log and a summary (AC 1, write path)
**Preconditions:** `rspec.log` = 300 lines ending with `Failed examples:`, two `rspec ./spec/models/user_spec.rb:12 # User is valid` lines, `Finished in 4.2 seconds (files took 1.1 seconds to load)`, `120 examples, 2 failures`, `EXITCODE=1`.
**Steps:** `bobby ticket attach TKT-001 rspec.log --log --cmd "bundle exec rspec"`.
**Expected:** `TKT-001--fix-login/logs/rspec.log` is byte-identical to the source, and the original is kept. `logs/rspec.log.md` contains `Command: bundle exec rspec`, a Result line with `Finished in 4.2 seconds`, `120 examples, 2 failures` and `EXITCODE=1`, both `rspec ./spec/...` lines under `## Failures`, and exactly the last 100 source lines inside the `~~~~text` fence.

## TC2 — the raw log is ignored and the summary is not (AC 1/2)
**Steps:** After TC1, `git status --porcelain`, and `git check-ignore -q` on each file.
**Expected:** `logs/rspec.log.md` shows as untracked (`??`), and `logs/rspec.log` does not appear. check-ignore: the raw exits 0 (ignored) and the summary exits 1.

## TC3 — jest log extraction (AC 5)
**Steps:** `summarizeLog` on a jest output with `FAIL test/a.test.js`, `  ● suite › does x`, `Test Suites: 1 failed, 3 passed, 4 total`, `Tests:       1 failed, 40 passed, 41 total`, plus ANSI colour codes.
**Expected:** The Result has the `Test Suites:` and `Tests:` lines, ANSI-free. Failures has the `FAIL` and `●` lines.

## TC4 — no recognisable result line
**Steps:** `summarizeLog('hello\nworld', { name: 'x.log', source: '/tmp/x' })`.
**Expected:** `Result: no rspec or jest summary line found`, `Command: not recorded (pass --cmd)`, and Failures `None found.`

## TC5 — non-.log file names get .log appended; fence safety
**Steps:** Attach `out.txt`, whose content contains a ``` fenced block, with `--log`.
**Expected:** `logs/out.txt.log` and `logs/out.txt.log.md` are written. The tail renders inside the `~~~~` fence intact (the ``` doesn't end it).

## TC6 — warns when the raw log isn't ignored (decision 5, error path)
**Preconditions:** `.gitignore` without the pattern.
**Steps:** `bobby ticket attach TKT-001 rspec.log --log`.
**Expected:** Exit 0. Stderr or stdout warns `is not gitignored` and names `bobby init --refresh`.

## TC7 — attach without --log is unchanged (regression)
**Steps:** The existing attach.test.js cases.
**Expected:** All pass unchanged. The file lands in `test-evidence/screenshots/`, and no `logs/` dir is created.

## TC8 — fresh gitignores include the pattern (AC 2, read path)
**Steps:** (a) Render `gitignore.ejs`. (b) `initStudio(tmp)` and read `.gitignore`.
**Expected:** (a) Contains `.bobby/tickets/*/**/*.log`. (b) Contains `STUDIO_TICKET_LOG_PATTERN` exactly once.

## TC9 — refresh adds the pattern once (AC 2, idempotence)
**Preconditions:** A scaffolded plain project whose `.gitignore` lacks the pattern (remove the line).
**Steps:** `bobby init --refresh` twice.
**Expected:** `.gitignore` contains `.bobby/tickets/*/**/*.log` exactly once. Other lines are untouched, and the first run prints `Added ticket-log ignore pattern`.

## TC10 — ensureGitignoreLines unit
**Steps:** Call it on a missing file, on a file without a trailing newline, and twice in a row.
**Expected:** It creates the file. It inserts a newline before appending, so it never joins onto the last line. The second call adds nothing and returns `[]`.

## TC11 — untrack-logs uses git rm --cached only (AC 3)
**Preconditions:** Git repo where `.bobby/tickets/TKT-001--fix-login/ship-rspec6.log` and `.../logs/a.log` are committed (force-added), plus a committed `notes.md` and `src/app.log` (outside the tickets dir).
**Steps:** (a) `bobby ticket untrack-logs --dry-run`. (b) `bobby ticket untrack-logs`. (c) `git status --porcelain`, `ls`, `git log --oneline | wc -l`.
**Expected:** (a) Lists the 2 ticket logs, and the index is unchanged. (b) Prints `Untracked 2 log files`. (c) The 2 logs are staged as `D ` and still exist on disk. `notes.md` and `src/app.log` are untouched. The commit count is unchanged (no commit, no history rewrite). `.gitignore` now has the pattern.

## TC12 — untrack-logs in a studio covers every project's board
**Preconditions:** A studio git repo with committed logs under `.bobby/a/tickets/A-1--x/` and `.bobby/b/tickets/B-1--y/`, and no active project.
**Steps:** `bobby ticket untrack-logs`.
**Expected:** Both are untracked, and there is no "Select a project" error.

## TC13 — untrack-logs outside git is an explicit error
**Steps:** Run it in a non-git tmp project.
**Expected:** Exit 1, `untrack-logs needs a git repo`.

## TC14 — skill text references --log (AC 4)
**Steps:** Scaffold a project, then read the generated bobby-test and bobby-ship SKILL.md.
**Expected:** Both contain `bobby ticket attach` with `--log`, and ship's merge gate 3 mentions `.log.md`.
