## Review — TKT-074

### Verdict: Approved with Notes

### Files Reviewed
- `lib/scope-check.js` (new): read in full. `execFileSync` with arg arrays (no shell). Takes the union of committed (`base...HEAD`), uncommitted and untracked files, and drops `.bobby/` and `learnings.local.md`. Every can't-run path returns an explicit reason: not a git repo, no commits yet, on main with no upstream, base branch missing, studio root. Nothing passes silently.
- `commands/move.js`: the check runs only on the normal-move path, only when `fromStage === 'building'` and the target is security/reviewing/testing/shipping/done. It runs after `moveTicket` succeeds, inside its own try/catch, so it can never reach the outer `process.exit(1)`. reject/block/unblock return before it runs.
- `commands/create.js`: `--found-in` is validated with `findTicket` before `createTicket`. An unknown id gives exit 1, creates no directory, and leaves `.counter` unchanged. No fallback.
- `lib/tickets.js`: adds `found_in: foundIn || null` to frontmatter. All callers of `createTicket` pass an object, so the new defaulted key is backwards-compatible.
- `lib/brief.js`, `commands/brief.js`: `agentFiled` means backlog, not an epic, and `found_in` set. It is removed from `backlogWork`, so `pickNextAction` never selects it. The new triage branch returns `argv: null`. `commands/go.js:75` and `lib/dashboard/actions.js:42` both already handle a null argv.
- `commands/triage.js`: puts agent-filed tickets first (stable order), adds a count line, and shows `Found in: X by author` on the meta line.
- Templates: CLAUDE.md.ejs, bobby-shared/learnings.md, build, debug, test, ship, review, freewill, plan, design-build, design-check.
- Tests: scope-check, move (end to end through `bin/bobby.js`), create, brief, triage, scope-rule-templates, init.

### Verification on a scratch project (`node bin/bobby.js`)
Each case below ran in a temp git repo and printed the expected message with exit 0:
- Fresh repo, no commits: `⚠ Scope check not run: no commits yet`
- Clean branch: `✓ no changed files vs main`
- No plan.md: `no plan.md — 2 changed file(s) unchecked`, plus a comment
- Plan with no Files heading: `plan.md has no "Files to modify" section`, plus a comment
- Drift: README.md listed, the `--found-in TKT-001` hint, plus a comment
- Clean plan: `all 2 changed file(s) are named in plan.md`, with no comment

`--found-in TKT-999` exits 1 and writes nothing. A studio-root cwd returns not-run ("run from the code repo checkout"). The scope check on this branch itself reports all 26 files named.

**Why the global `bobby` printed no scope check:** `/usr/local/bin/bobby` → `/usr/local/lib/node_modules/bobbycode` → symlink to `/Users/ccevans/Repos/bobbycode`. That is a different checkout, and it has no `lib/scope-check.js`. It is not this repo or this branch, so the code is fine. Use `node bin/bobby.js` until the link points here or the change ships.

### Rule text vs studio reference
The CLAUDE.md template and bobby-shared match the studio's `CLAUDE.md` "Stay in the ticket" and `learnings.local.md` "Working outside the ticket" in substance. Every point is present:
- Scope is the ticket or the task the user named; this covers every agent, freewill and the main session.
- One-sentence `git diff --stat` tie; regressions you caused are in scope.
- Duplicate check, then file with what/where/repro/why.
- Never plan, move or start a ticket you filed.
- `Filed:` line in the report.
- Exploitable-on-prod: `-p critical` and **Decision needed**.
- Blocker: file, block, stop.
- Review: out-of-plan is a rejection; the fix is revert and file.

The text is made generic (no CC, no RF-). It adds `--found-in` and a `ticket comment` for the body.

### Code Concerns
- **Medium: scope check false negatives (filed as TKT-075, not a rejection).** `planFileCheck` (`lib/scope-check.js:62-72`) counts a file as named when its path appears anywhere in plan.md. That is plan decision 3, and the builder implemented it faithfully.
  - Plans name files in "Out of scope" and "Overlap" sections. On this ticket's own plan, `README.md`, `commands/init.js` and `lib/workflow.js` all come back as named, although the plan forbids touching them.
  - Basename substrings also match: `a.js` is matched by `lib/a.js`.
  - The check is warn-only, so the pipeline never breaks. But it prints a green "all named" and writes no comment, which reviewers are told to look at.
- **Low: design-check now parks its own conformance failures.** `templates/agents/bobby-design-check.md.ejs:47` adds `--found-in {ID}` to the filing of conformance and slop failures. These are this ticket's own defects, not out-of-scope findings. With the flag they become "awaiting product review", and `bobby go` no longer picks them up. The plan specified this, but it mixes in-scope defects with out-of-scope findings. Worth a product call.
- **Low: triage and brief count differently.** `commands/triage.js:28` counts agent-filed epics; `lib/brief.js:77` excludes them. This only matters if an agent files `--epic --found-in`.
- **Low: bobby-security has no full scope step.** It still has only its older "critical vulnerability in existing code" create line (`templates/skills/bobby-security/SKILL.md.ejs:141`), with no `-a`, `--found-in` or `Filed:`. The ticket's list of stages did not include security, so this is not an AC gap.

### Decision Violations
- None. No agent file names a forward stage. The `.local` overlay is untouched: `commands/init.js` and the upgrade path are not in the diff, and an init test asserts that `.local` files stay byte-identical across a re-scaffold. Nothing edits `.bobby/decisions.yaml`.

### AC Verification
- [x] AC1: the rule is in CLAUDE.md above `bobby:end` and in shipped bobby-shared. The fresh-scaffold and re-scaffold (upgrade) tests assert placement and that the user section is preserved. The text matches the reference in substance.
- [x] AC2: build, debug, test, ship, review, freewill (paragraph, heading count pinned at 7), plan, design-build and design-check each carry `bobby ticket create`, `-a <agent>`, `--found-in {ID}` and `Filed:`. `scope-rule-templates.test.js` checks this with `test.each`.
- [x] AC3: `--found-in` records the origin. An unknown id is an explicit error with nothing written. brief and triage surface agent-filed tickets, and `bobby go` never auto-picks them (brief test TC-05/06).
- [x] AC4: leaving building prints out-of-plan files. Tests cover a plan with a file list, one without, no plan, a clean diff, no commits, no upstream, the studio root and not-a-repo. The move never fails.
- [x] AC5: the review skill's section 1 bullet, the Reject step 4, and the new Findings Outside the Ticket section.
- [x] AC6: suite and lint are green. No existing test expectations changed.

### Overlap with TKT-073 (PR #18, `tkt-073-workflow-orchestration`)
I intersected the file lists. Outside this ticket's own folder there is no overlap at all; PR #18 does not touch CHANGELOG either.

### Test/Lint Output
- Tests: `Test Suites: 1 skipped, 74 passed, 74 of 75 total` · `Tests: 46 skipped, 1317 passed, 1363 total` · exit 0. No new skips were added.
- Lint: `✖ 37 problems (0 errors, 37 warnings)`, exit 0. The warnings in the changed files (`commands/{move,create,triage}.js`) also exist on main.

### Notes
- Filed: TKT-075 — Scope check counts files a plan names only as out of scope or do-not-touch as in plan
