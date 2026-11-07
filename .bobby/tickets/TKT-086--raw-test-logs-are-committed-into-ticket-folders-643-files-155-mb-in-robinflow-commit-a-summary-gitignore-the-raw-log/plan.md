# TKT-086 plan — commit a log summary, gitignore the raw log

Planned against origin/main `8cc1ddb`. Size: **m**.

## Approaches considered

| # | Approach | Effort (x3) | Risk (x2) | Maint. (x2) | Impact (x1) | Score |
|---|---|---|---|---|---|---|
| A | `attach --log` (raw → `<ticket>/logs/`, summary `.log.md` beside it), a `**/*.log` ticket ignore pattern added on init/studio/refresh, a one-time `bobby ticket untrack-logs` that uses `git rm --cached` only, and updated skill text | 4 | 4 | 4 | 5 | 32 |
| B | The same, but the untracking is a doc step (a `git rm --cached` one-liner in the docs) instead of a command | 5 | 3 | 3 | 3 | 30 |
| C | Git LFS for ticket logs | 1 | 2 | 2 | 4 | 15 |

**Selected: A.** B is close on score, but each studio would then type a glob pathspec by hand, which is easy to get wrong in a way that untracks too much. A command can be tested and is identical everywhere. CC's direction allows either.

## Decisions made while planning

1. **Layout:** the raw log goes to `<ticket>/logs/<name>.log` and the summary to `<ticket>/logs/<name>.log.md`. A raw file whose name doesn't end in `.log` gets `.log` appended (`rspec.txt` → `rspec.txt.log`), so the ignore pattern always covers it.
2. **Ignore pattern:** studio `.bobby/*/tickets/*/**/*.log`. Plain board: `<tickets_dir>/*/**/*.log` (the template uses `.bobby/tickets/*/**/*.log`, matching its existing `run.lock` line). `**/` matches zero or more directories, so this covers both `RF-1/x.log` and `RF-1/logs/x.log`. Summaries end in `.md`, so they are never ignored.
3. **"Command if known":** a new optional `--cmd "<command>"` on attach. Without it, the summary says `Command: not recorded (pass --cmd)`, stated rather than guessed.
4. **No summary line found** → `Result: no rspec or jest summary line found`, stated explicitly.
5. **attach --log warns when the raw file is not ignored** (`git check-ignore -q` exit 1 → `warn('… is not gitignored — run bobby init --refresh')`). Not a git repo (exit 128) → no warning.
6. **`untrack-logs` does not commit.** It stages the removals, prints the count and the commit command, and leaves the files on disk. One-time and reviewable. It never rewrites history.

## Files to modify

- `lib/ticket-logs.js` — **new**. `STUDIO_TICKET_LOG_PATTERN`, `ticketLogPattern(config)`, `ensureGitignoreLines(root, lines)`, `summarizeLog(text, { name, source, command })`, `extractResult(lines)`, `extractFailures(lines)`.
- `commands/attach.js` (54 lines) — `--log` and `--cmd` options. Also registers the new `untrack-logs` command inside `registerAttach(program)`, which keeps `commands/ticket.js` untouched (TKT-085 adds a command too).
- `lib/studio.js` — **one line**: add `'.bobby/*/tickets/*/**/*.log'` to the `needed` array (line 100), plus a comment line above it.
- `templates/gitignore.ejs` — add the plain-board pattern after the `run.lock` block (after line 6).
- `commands/init.js` — in the `--refresh` branch, after `scaffoldProject(rootDir, existingConfig, { writeConfig: false });` (around line 394), call `ensureGitignoreLines(rootDir, [ticketLogPattern(existingConfig)])`.
- `templates/skills/bobby-test/SKILL.md.ejs` — the Evidence Storage section (lines 78–89).
- `templates/skills/bobby-ship/SKILL.md.ejs` — the end of step 6 (line 86) and Merge gate 3 (line 163). Append sentences only; no step renumbering.
- `templates/WORKFLOW.md.ejs` — one table row after line 40.
- Tests: `test/lib/ticket-logs.test.js` (new), `test/commands/attach.test.js` (extend), `test/lib/studio.test.js` (one assertion), `test/commands/init.test.js` (refresh idempotence).

## Shared files (parallel build — keep edits additive and in these exact spots)

- `lib/studio.js` — also edited by **TKT-084** (line 9 import, and `setActiveProject`/`getActiveProject` at lines 135–142). TKT-086 changes **only the `needed` array on line 100** (plus a comment line directly above it). It adds no import: the pattern is an inline string literal, and `test/lib/ticket-logs.test.js` asserts that `initStudio`'s `.gitignore` contains `STUDIO_TICKET_LOG_PATTERN`, so the two copies can't drift.
- `templates/WORKFLOW.md.ejs` — also edited by **TKT-085** (rows after line 53). TKT-086 inserts only after line 40 (`| View files | ...`).
- `commands/ticket.js` — deliberately NOT edited.
- Dependencies: none.

## Step-by-step plan

### 1. `lib/ticket-logs.js` (new)

- [ ] `export const STUDIO_TICKET_LOG_PATTERN = '.bobby/*/tickets/*/**/*.log';`
- [ ] `ticketLogPattern(config)` → `config.studio ? STUDIO_TICKET_LOG_PATTERN : \`${config.tickets_dir}/*/**/*.log\``.
- [ ] `ensureGitignoreLines(root, lines)`: the same algorithm as `lib/studio.js ensureGitignore` (read or `''`, append each line not already present as a trimmed exact line, write only if changed). Returns the lines it added.
- [ ] `stripAnsi(s)` → `s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')`.
- [ ] `extractResult(lines)` → the ordered matches of:
  - rspec: `/^Finished in /`, `/^\d+ examples?, \d+ failures?/`;
  - jest: `/^Tests:\s+/`, `/^Test Suites:\s+/`;
  - `/^EXITCODE=\d+/` (the ship skill's convention).
  Trim the lines before matching.
- [ ] `extractFailures(lines)` → lines matching rspec `/^rspec \.\/\S+/` (the Failed examples list), jest `/^\s*● /` and `/^FAIL\s/`, capped at 50, with `… and N more` when the cap is hit.
- [ ] `summarizeLog(text, { name, source, command })` → markdown:
  ```
  # <name>

  - Source: <source>
  - Command: <command | 'not recorded (pass --cmd)'>
  - Result: <result lines joined ' · ' | 'no rspec or jest summary line found'>
  - Raw log: logs/<name> (gitignored, kept on this machine only)

  ## Failures
  <lines, or 'None found.'>

  ## Last 100 lines
  ~~~~text
  <tail>
  ~~~~
  ```
  Use a `~~~~` fence so a log that contains ``` fences can't break the markdown. Strip ANSI before everything.

### 2. `commands/attach.js`

- [ ] Options: `.option('--log', 'Treat files as logs: raw copy to the gitignored logs/ folder, plus a committed <name>.log.md summary')`, `.option('--cmd <command>', 'With --log: the command that produced the log, recorded in the summary')`.
- [ ] With `--log`, per file: `destDir = path.join(found.path, 'logs')` (mkdir -p). `rawName = basename.endsWith('.log') ? basename : basename + '.log'`. Copy to `destDir/rawName`. Write `destDir/<rawName>.md` = `summarizeLog(readFileSync(resolved,'utf8'), { name: rawName, source: resolved, command: opts.cmd })`. Then `--move` unlink as today. Then the check-ignore warning (decision 5): `git check-ignore -q <raw>` with cwd `found.path`.
- [ ] Success line: `Attached N log(s) to <id>: summaries in logs/*.log.md (commit these), raw logs gitignored`. Without `--log`, behaviour is byte-for-byte unchanged.
- [ ] Register `untrack-logs` in the same function:
  ```
  program.command('untrack-logs')
    .description('One-time: stop tracking raw .log files under ticket folders (git rm --cached; files stay on disk; history untouched)')
    .option('--dry-run', 'List what would be untracked')
  ```
  Action: `root = findProjectRoot()`, `config = readConfig(root)` (don't call `resolveTicketsDir`: in a studio this covers every project's board and needs no `--project`). Get `top = git rev-parse --show-toplevel` (cwd root); a non-zero exit is an explicit error: `untrack-logs needs a git repo`. Build the pattern relative to `top` (`path.relative(realpath(top), realpath(root))` joined with `ticketLogPattern(config)`). Run `git ls-files -z -- ':(glob)<pattern>'` and split on `\0`. None → `success('No tracked ticket logs')`. `--dry-run` → print them and the count. Otherwise call `ensureGitignoreLines(root, [ticketLogPattern(config)])` first, then `git rm --cached --quiet -- <files>` in chunks of 200 (argv limits on 643 files), then print `Untracked N log files (still on disk). Review and commit: git commit -m "Untrack raw ticket logs"`. Use `execFileSync('git', [...])` everywhere, never a shell string.

### 3. Gitignore sources

- [ ] `lib/studio.js:100` → add the studio pattern to `needed`, with a comment line above it: `// Raw test/ship logs stay local; the committed record is the .log.md summary (TKT-086).`
- [ ] `templates/gitignore.ejs`, after line 6:
  ```
  # Bobby — raw test/ship logs stay local; `bobby ticket attach --log` commits a .log.md summary
  .bobby/tickets/*/**/*.log
  ```
- [ ] `commands/init.js` refresh branch: call `ensureGitignoreLines(rootDir, [ticketLogPattern(existingConfig)])`. If it added a line, print `  ${dim('Added ticket-log ignore pattern to .gitignore')}`. Import from `../lib/ticket-logs.js`.

### 4. Skill text

- [ ] bobby-test `## Evidence Storage`: add `    ├── logs/               # test-run logs via bobby ticket attach {ID} <file> --log` to the tree, and a sentence after line 89: `Attach every test-run log (rspec, jest, Playwright) with \`bobby ticket attach {ID} <file> --log\`: the raw log stays gitignored in \`logs/\`, and you cite the committed \`logs/<name>.log.md\` in results.md.`
- [ ] bobby-ship step 6 (line 86): append `Then attach it: \`bobby ticket attach {ID} <log> --log --cmd "<the command>"\`. The raw log stays gitignored, and the committed \`logs/<log>.md\` summary is the evidence.` Merge gate 3 (line 163): change `cite its path, summary line and \`EXITCODE=0\`` → `cite its \`.log.md\` summary (from \`bobby ticket attach --log\`), its result line and \`EXITCODE=0\``.
- [ ] `templates/WORKFLOW.md.ejs` after line 40: `| Attach a test/ship log | \`bobby ticket attach TKT-001 out.log --log\` |`

### 5. Tests (see test-cases.md)

- [ ] Unit: extraction on real-shaped rspec and jest fixtures (inline strings in the test), the ANSI strip, the 100-line tail, the fence safety, and the cap.
- [ ] Gitignore idempotence: `ensureGitignoreLines` twice → the line appears once. A file without a trailing newline gets a newline inserted. `initStudio` twice → the pattern appears once. `bobby init --refresh` twice on a plain scaffold → the pattern appears once.
- [ ] `git check-ignore` on a scaffolded project proves the pattern actually ignores `logs/x.log` and not `logs/x.log.md`.
- [ ] Full suite to a log and read the summary.

## Risk areas

- **The refresh path runs in studios too.** `existingConfig.studio` is truthy there, so the studio pattern lands. Verify that `readConfig` at a studio root with no active project still reaches the refresh branch. It does today (the robinflow studio was refreshed this way), and the refresh call must not call `resolveTicketsDir`.
- **Pathspec magic** `:(glob)` needs git ≥ 1.8.3 (fine). With `-z`, file names with spaces survive.
- **A big log** (155 MB across 643 files, the largest maybe 5–10 MB): `summarizeLog` reads the whole file into memory once. That's acceptable for a CLI, and the attach is per file.
- **Existing tracked logs keep showing as tracked** until `untrack-logs` runs. `.gitignore` doesn't affect tracked files, which is expected. Say so in the untrack output.

## Out of scope

- Running `untrack-logs` on the robinflow studio. That is an operator step after this ships (report it).
- Rewriting history or shrinking the existing pack.
