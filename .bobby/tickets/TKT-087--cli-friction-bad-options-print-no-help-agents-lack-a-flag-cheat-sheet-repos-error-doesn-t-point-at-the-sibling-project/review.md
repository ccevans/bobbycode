## Review — TKT-087

### Verdict: Rejected

One test-hermeticity defect: the five new `studio --repos` tests fail whenever `BOBBY_PROJECT` is set in the runner's environment, and the studio dashboard sets that variable for every agent it launches. The product code and the ACs are fine. The fix is one line.

Reviewed: branch `tkt-087-cli-friction`, commit 9445271, worktree `/Users/ccevans/Repos/bobby/worktrees/tkt-087`, `git diff origin/main...HEAD` (merge-base = origin/main d37b30b).

### Files Reviewed
- `bin/bobby.js:15-18` — `.showHelpAfterError()` added to the root chain before any `register*` call. Verified in commander 12.1.0: `.command()` copies `_showHelpAfterError` into each child. No `addCommand` / `new Command(` anywhere in `commands/`, `lib/`, `bin/` apart from the root, so the whole tree inherits it. No `cmd.error(...)`, `exitOverride`, `argParser` or `InvalidArgumentError` use in the code, so no action-level error path suddenly dumps help. Stays inside the plan's limit (lines 11–15 chain only). Line 141 `showSuggestionAfterError` is untouched.
- `commands/create.js:3,42-51` — `listStudioProjects` import and the sibling/unknown split. This is inside the `config.studio` branch, and `root` there is the studio root (`findProjectRoot`), which is what `listStudioProjects` expects. The unknown-repo message is verbatim, but it now lists only the unknown names. Stays inside the plan's limit (line 3 and the 37–45 block).
- `templates/CLAUDE.md.ejs:129-135` — the new `## Ticket command flags` section, between `## Stay in the ticket` and `## Workflows`. TKT-084's insertion point (Working Style, around line 112) is untouched. The `typeof studio` guard is real. I scaffolded a studio fixture through `readConfig` + `scaffoldProject` (`BOBBY_PROJECT=robinflow`), and `config.studio` is the studio name, so the `--project <name>` clause does render in a real studio CLAUDE.md, not only in the test's injected `studio: 'S'`. Move aliases match `commands/move.js:95`. `comment <id> <note...>` + `--by` matches `commands/comment.js:10-12`.
- `test/commands/cli-help.test.js` (new) — covers a nested unknown option, a top-level unknown option, a missing argument, and `--help` exiting 0. Mutation check: the origin/main `bin/bobby.js` prints only `error: unknown option '--bogus'` with no `Usage:`, so tests 1–3 fail without the change.
- `test/commands/create.test.js:111-165` — studio `--repos` cases (TC7–TC11). **See Code Concerns 1.**
- `test/lib/template.test.js:39-89` — cheat-sheet content, section order, drift guard (it builds real `create`/`move`/`comment` commanders and fails on a fabricated `--bogus`), and studio vs. plain render.

### Code Concerns
1. **Non-hermetic studio tests (reject reason)** — `test/commands/create.test.js:117`: the `create` helper calls `spawnSync('node', [bobby, '--project', project, ...], { cwd: studio, encoding: 'utf8' })`, which inherits `process.env`. `bin/bobby.js:120` splices `--project` only when `!process.env.BOBBY_PROJECT`. When the variable is set, `--project` stays in argv and commander rejects it. The studio dashboard sets `BOBBY_PROJECT: ws.project` on every agent it spawns (`lib/dashboard/orchestrator.js:730`), and this repo runs as studio project `bobby` (`/Users/ccevans/Repos/bobby/.bobbyrc.yml: studio: bobby`). So a dashboard-launched build, review or ship agent running this suite gets 5 red tests.
   Reproduced: `BOBBY_PROJECT=bobby NODE_OPTIONS=--experimental-vm-modules npx jest test/commands/create.test.js -t "studio --repos"` gives **5 failed, 7 skipped**. The same command without the variable: all pass.
   Fix: give the spawn a clean env, e.g. `{ cwd: studio, encoding: 'utf8', env: { ...process.env, BOBBY_PROJECT: '' } }`. An empty string is falsy for both `bin/bobby.js:120` and `resolveActiveProject` (`lib/config.js:149`). Deleting the key also works. The precedent is `test/lib/studio.test.js:23,30`, which deletes `BOBBY_PROJECT` for the same reason.
2. **Hint vs. env-pinned agents (note, not a fix for this ticket)** — the new hint says `file it with --project <name>`. Before TKT-084 lands, an agent with `BOBBY_PROJECT` already set that follows the hint gets `error: unknown option '--project'` (verified on the studio fixture, with `--project` both before and after `ticket create`). TKT-084's plan (step "`--project` must beat `BOBBY_PROJECT`", AC 4) removes the `!process.env.BOBBY_PROJECT` condition and fixes this. So the plan's "No ordering constraint" with 084 is not quite true: ship TKT-084 with or before TKT-087. Not filed, because 084 already owns it.
3. **Minor** — a name that is both a studio repo (outside this project's subset) and a studio project gets the `--project` hint and not the not-in-project error. Debatable, but arguably right, and rare. No action.

### Decision Violations
- None. Checked against `bobby decision list`. Nothing in the diff touches the dashboard, worktrees, the decisions log or the prompt builders.

### AC Verification
- [x] AC 1: an unknown option on any subcommand prints that subcommand's help. Hand-run on the branch: `ticket create --bogus` → `Usage: bobby ticket create [options]`. `brief --bogus` → `Usage: bobby brief [options]`. `studio workspace --bogus` → `Usage: bobby studio workspace [options]`. `projects --bogus` → `Usage: bobby projects [options]`. `ticket move TKT-001` → missing `alias` + `Usage: bobby ticket move ...`. All exit 1 with empty stdout.
- [x] AC 2: the generated CLAUDE.md has the cheat sheet. Confirmed by the template test and by a real `scaffoldProject` on a studio fixture (line 102 of the rendered file, `--project` clause present).
- [x] AC 3: a sibling project gets the `--project` hint and a truly unknown repo keeps the current error. Implemented and tested, but the tests are not hermetic (Concern 1).
- [x] AC 4: tests for the create error message and a CLI help-after-error check exist and pass in a clean env.
- **TC3 (the builder did not hand-run it), verified here:** I ran the origin/main `bin/bobby.js` (scratch copy, same commands/lib) against the branch's. `bobby` with no args: stdout and stderr byte-identical, exit 0. `bobby ticket create --help`: identical, exit 0. `bobby "add a health check"`: identical, exit 0, and it routes to `do` ("Bobby, do: add a health check" + routing prompt).

### Test/Lint Output
- Tests: `NODE_OPTIONS=--experimental-vm-modules npx jest test/commands/cli-help.test.js test/commands/create.test.js test/lib/template.test.js test/commands/do.test.js test/commands/move.test.js test/commands/comment.test.js` gives 5 suites passed, 36 tests passed, in a clean env (no `comment.test.js` exists, so 5 suites). With `BOBBY_PROJECT=bobby`, `create.test.js` `studio --repos` gives 5 failed.
- Lint: `npm run lint` gives 0 errors, 38 warnings. None of the warnings are in lines this diff adds. `commands/create.js:2` unused `path` is pre-existing.

### Notes
- After the fix, re-run the five studio tests with `BOBBY_PROJECT=bobby` set to prove they are hermetic.
- Ship ordering: TKT-084 with or before TKT-087 (Concern 2).
