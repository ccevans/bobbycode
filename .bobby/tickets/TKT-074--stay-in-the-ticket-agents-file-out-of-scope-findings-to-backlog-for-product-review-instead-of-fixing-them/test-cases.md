# Test Cases — TKT-074 Stay in the ticket

All cases are automated jest tests. Use temp dirs (`fs.mkdtempSync`) and real `git`, and run the CLI as `node bin/bobby.js`. Never launch a real agent. Temp git repos set `user.email` and `user.name` locally.

Coverage map: AC1 → TC-22..25 · AC2 → TC-23 · AC3 → TC-01..08 · AC4 → TC-09..21 · AC5 → TC-23 (review text) · AC6 → full `npm test` + `npm run lint`.

---

## Provenance: `--found-in` (write path, error path)

### TC-01 — Filing a finding records its origin
**Preconditions:** Temp project; `TKT-001` exists (created via CLI).
**Steps:** `bobby ticket create -t "Login 500s on empty email" --type bug -p high -a bobby-build --found-in TKT-001`
**Expected:** Exit 0. stdout contains `Found in TKT-001`. The new ticket's frontmatter has `found_in: TKT-001`, `author: bobby-build`, `stage: backlog`.

### TC-02 — Unknown origin is an explicit error, nothing is written
**Preconditions:** Temp project with no tickets; `.counter` is `0`.
**Steps:** `bobby ticket create -t "X" --found-in TKT-999`
**Expected:** Exit 1. stderr contains `TKT-999` and `no such ticket`. No `TKT-*` directory exists. `.counter` is still `0`.

### TC-03 — Without the flag the field is null
**Steps:** `bobby ticket create -t "Plain"`
**Expected:** Frontmatter has `found_in: null`. Existing create behaviour is unchanged (the other create tests still pass).

---

## Brief and triage (read path)

### TC-04 — Brief counts agent-filed backlog tickets
**Preconditions:** `TKT-001` (backlog, human); `TKT-002` created with `--found-in TKT-001`; `TKT-003` with `--found-in TKT-001` and then moved to `planning`.
**Steps:** `buildBrief(ticketsDir, sprintsDir)`; also run `bobby brief` from the CLI.
**Expected:** `agentFiled` has ids `[TKT-002]` only, because TKT-003 left backlog. CLI stdout contains `1 filed by agents, awaiting product review` and `found in TKT-001` on the TKT-002 row.

### TC-05 — Next action never starts an agent-filed ticket
**Preconditions:** `TKT-001` is created at `-p low` and moved to `done`. `TKT-002` is created `-p critical --found-in TKT-001`. `TKT-003` is created `-p low` (human).
**Steps:** `buildBrief(...)`
**Expected:** `nextAction.argv` is `['run','workflow','TKT-003']`. It is not TKT-002, even though that ticket's priority is higher.

### TC-06 — Only agent-filed tickets left → the next action is product review, not "Board is empty"
**Preconditions:** `TKT-001` is `done`; `TKT-002` is in backlog with `found_in`.
**Steps:** `buildBrief(...)`
**Expected:** `nextAction.reason` contains `filed by agents await product review`. `command` is `bobby ticket triage`. `argv` is `null`.

### TC-07 — Triage shows agent-filed tickets first, with origin
**Preconditions:** `TKT-001` (human, oldest) and `TKT-002` with `--found-in TKT-001 -a bobby-review`, both in backlog. `inquirer.prompt` is spied to resolve `{ action: 'skip' }`. `console.log` is spied.
**Steps:** Run triage via `registerTriage` + `parseAsync(['node','x','triage'])` with cwd set to the temp project.
**Expected:** Output contains `1 filed by agents, awaiting product review (shown first)`. The first ticket header printed is `TKT-002`, before `TKT-001`. TKT-002's meta line contains `Found in: TKT-001 by bobby-review`.

### TC-08 — Triage with no agent-filed tickets prints no review line
**Preconditions:** Only human backlog tickets exist.
**Expected:** No `awaiting product review` line. Order is unchanged (oldest first).

---

## Scope check (unit: `lib/scope-check.js`)

### TC-09 — Plan with a file list: all changed files named → clean
**Steps:** `planFileCheck("## Files to modify\n- `lib/a.js`\n- `test/a.test.js`", ['lib/a.js','test/a.test.js'])`
**Expected:** `listsFiles: true`, `outOfPlan: []`.

### TC-10 — Plan with a file list: drift detected
**Steps:** `planFileCheck(<same plan>, ['lib/a.js','README.md'])`
**Expected:** `outOfPlan: ['README.md']`.

### TC-11 — A backticked directory covers files under it; a path inside a longer studio path matches
**Steps:** The plan has `## Files` and a `` `test/lib/` `` line, and mentions `repos/app/src/x.js` in a step. Files are `['test/lib/new.test.js','src/x.js','src/y.js']`.
**Expected:** `outOfPlan: ['src/y.js']`.

### TC-12 — Plan without a Files heading
**Steps:** `planFileCheck("## Approach\nDo it.", ['lib/a.js'])`
**Expected:** `listsFiles: false`. `runScopeCheck` on such a plan returns status `unlisted` with files `['lib/a.js']`.

### TC-13 — Branch diff includes committed, uncommitted and untracked, and excludes bookkeeping
**Preconditions:** Temp git repo; commit `base.txt` on `main`. Then `git checkout -b feat`; commit `lib/a.js`; modify `base.txt` without committing; create untracked `lib/b.js`, `.bobby/tickets/x/plan.md`, and `.claude/skills/bobby-build/learnings.local.md`.
**Steps:** `changedFilesOnBranch(repo)`
**Expected:** `ok: true`, `base: 'main'`, `files` equals `['base.txt','lib/a.js','lib/b.js']`, sorted, with no `.bobby/` path and no `learnings.local.md`.

### TC-14 — Not run: not a git repository
**Steps:** `changedFilesOnBranch(<plain temp dir>)`
**Expected:** `ok: false`, `reason` is `not a git repository`.

### TC-15 — Not run: on main with no upstream
**Preconditions:** Temp repo with one commit on `main`, no remote.
**Expected:** `ok: false`, `reason` contains `no upstream`.

### TC-16 — Not run: studio root
**Preconditions:** Temp repo; `runScopeCheck({ cwd: repo, ticketPath, studioRoot: repo })`.
**Expected:** `status: 'not-run'`, `reason` contains `code repo`.

---

## Scope check through `bobby ticket move` (end to end)

Shared setup: a temp dir that is both a Bobby project (`.bobbyrc.yml`, `.bobby/tickets/.counter` = 0) and a git repo. Make an initial commit on `main` (include `.bobbyrc.yml`). `git checkout -b tkt-001`. Create `TKT-001` via CLI and move it to `build`.

### TC-17 — Leaving building with drift: warning printed and a comment recorded
**Preconditions:** plan.md in the ticket folder has `## Files to modify` naming `` `lib/a.js` ``. Commit `lib/a.js` and `README.md` on the branch.
**Steps:** `bobby ticket move TKT-001 review`
**Expected:** Exit 0; the stage is `reviewing`. stdout contains `not named in plan.md`, `README.md` and `--found-in`. ticket.md `## Comments` contains `scope-check: Scope check: out of plan — README.md`.

### TC-18 — Leaving building with a clean diff
**Preconditions:** As TC-17, but only `lib/a.js` is committed.
**Expected:** Exit 0. stdout contains `all 1 changed file(s) are named in plan.md`. **No** `scope-check` comment is added.

### TC-19 — Leaving building with a plan that lists no files
**Preconditions:** plan.md is `## Approach\n…` with no Files heading. `lib/a.js` is committed.
**Expected:** Exit 0. stdout contains `plan.md has no "Files to modify" section` and `lib/a.js`. The comment `Scope check: unchecked (plan lists no files) — lib/a.js` is present.

### TC-20 — Other moves don't trigger it
**Steps:** From `building`: `move TKT-001 block "x"`, then `unblock`. From `reviewing`: `move TKT-001 reject "y"`. From `planning` (a second ticket): `move TKT-002 build`.
**Expected:** None of these outputs contains `Scope check`. No `scope-check` comments.

### TC-21 — Check can't run: the move still succeeds and says why
**Preconditions:** A Bobby project in a temp dir that is **not** a git repo; the ticket is in `building`.
**Steps:** `bobby ticket move TKT-001 review`
**Expected:** Exit 0; the stage is `reviewing`. stdout contains `Scope check not run: not a git repository`.

---

## Shipped rule text (rendered templates)

### TC-22 — Fresh init carries the rule above `bobby:end`
**Steps:** `scaffoldProject(tmpDir, {...})`; read `CLAUDE.md`.
**Expected:** `## Stay in the ticket` appears, and its index is less than the index of `<!-- bobby:end -->`. The section contains `bobby ticket create`, `--found-in`, `Filed:`, `-p critical`, `Decision needed`, `block`, and `git diff --stat`. The rendered `.claude/skills/bobby-shared/learnings.md` contains `### stay-in-the-ticket` with the same command, `Filed:` and `Decision needed`.

### TC-23 — Every stage file carries its own scope step
**Steps:** Scaffold once. For each rendered file — `.claude/skills/{bobby-build,bobby-debug,bobby-test,bobby-ship,bobby-review,bobby-freewill,bobby-plan}/SKILL.md` and `.claude/agents/{bobby-design-build,bobby-design-check}.md` — read its content.
**Expected:** Each contains `bobby ticket create`, `--found-in {ID}`, `-a <that agent's name>`, and `Filed:`. `bobby-review/SKILL.md` additionally contains the out-of-plan rejection text (`revert` and `rejection reason`) and `Scope check:`. `bobby-freewill/SKILL.md` has no new `##` heading: the count of `## ` headings equals the count before the change (assert the exact number).

### TC-24 — Upgrade (re-scaffold) adds the rule and keeps the user's part
**Preconditions:** `CLAUDE.md` = `# Mine\n\n<!-- bobby:start -->\n# Old Bobby\n<!-- bobby:end -->\n\n## My rules\nkeep me`.
**Steps:** `scaffoldProject(tmpDir, {...})`
**Expected:** `## Stay in the ticket` is between the `bobby:start` and `bobby:end` markers. `# Mine`, `## My rules` and `keep me` are unchanged. `# Old Bobby` is gone.

### TC-25 — `.local` files are not touched
**Preconditions:** Before re-scaffolding, write `.claude/skills/bobby-shared/learnings.local.md` and `.claude/skills/bobby-build/SKILL.local.md` with sentinel text.
**Steps:** `scaffoldProject` again.
**Expected:** Both files are byte-identical to the sentinel text.

---

## Regression

### TC-26 — Full suite and lint
**Steps:** `npm test`; `npm run lint`.
**Expected:** Both are green. Any changed expectation in an existing test is listed in the build comment, with the reason it was intended.
