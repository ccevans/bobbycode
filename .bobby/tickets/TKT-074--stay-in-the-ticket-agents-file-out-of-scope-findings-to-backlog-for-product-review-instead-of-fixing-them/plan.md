# TKT-074 Plan: Stay in the ticket, shipped in Bobby

**Size:** L (Complex). Prose touches ten shipped templates; code touches create, move, brief and triage, plus one new module. No single piece is hard; the breadth is the risk.
**Recommended workflow:** `default` (this repo: plan → build → review). Not security-sensitive. Review is worth keeping because the review skill itself changes here.
**Line numbers** were read on `main` at `5e618a8` (equal to origin/main on 2026-10-25). `node_modules` is present.

**Reference text** (read only, do not edit the studio):
- `/Users/ccevans/Repos/bobby-code-studio/CLAUDE.md`, section "Stay in the ticket (CC, 2026-10-25)" (line 348)
- `/Users/ccevans/Repos/bobby-code-studio/.claude/skills/bobby-shared/learnings.local.md`, entry "Working outside the ticket (2026-10-25)" (line 29)

---

## 1. Approaches considered

| | A. Prose in templates + `found_in` frontmatter + warn-only scope check in `bobby ticket move` (selected) | B. Same, but the scope check blocks the move (exit 1) | C. Prose only, plus a new `bobby ticket scope <id>` command the reviewer runs |
|---|---|---|---|
| Minimal effort (x3) | 4 | 4 | 4 |
| Risk (x2) | 4: the move always succeeds; a wrong plan list costs a warning, not a stuck pipeline | 2: plans rarely list test fixtures or snapshots, so honest builds get stuck and builders learn to pad plan.md to get through | 3: depends on someone remembering to run it; AC 4 asks for it on leaving building |
| Maintainability (x2) | 4 | 3 | 3 |
| Impact (x1) | 4 | 4 | 3 |
| **Score** | **32** | **26** | **27** |

**Selected: A.** It wins by 5 or more points over both, so no escalation.

### Decisions the ticket left to the planner

1. **Warn, don't block.** The check prints and writes a ticket comment; it never fails or undoes the move. The reviewer is the gate (AC 5). Blocking would reward padding plan.md, which defeats the check.
2. **Plans that don't list files.** "Lists files" means plan.md has a markdown heading that starts with `Files` (regex `/^#{1,6}\s*Files\b/im`, which matches `## Files to modify`, `### Files to change`, `## Files`). If plan.md has no such heading, or no plan.md exists, the check prints **every** changed file as unchecked and says why. That is not a skip: the human and reviewer still see the full list.
3. **What counts as "named in plan.md".** A changed path is named when the plan's full text contains the repo-relative path as a substring (so `repos/x/src/a.js` in a studio plan still matches `src/a.js`), or when the plan contains a backticked directory ending in `/` that prefixes the path (`` `test/lib/` `` covers `test/lib/foo.test.js`). The whole file counts, not just the Files section, because plans often name files in their steps.
4. **What "changed on the branch" means.** Run in the git repo that holds the current working directory (`git rev-parse --show-toplevel`). That is the code checkout the agent is working in, including a studio repo or worktree. Changed = union of `git diff --name-only <base>...HEAD`, `git diff --name-only HEAD` (uncommitted), and `git ls-files --others --exclude-standard` (untracked). `<base>` is `detectMainBranch()` from `lib/dashboard/worktree.js`. When HEAD **is** the main branch, `<base>` is `@{upstream}`. Bobby's own bookkeeping is excluded: any path under `.bobby/`, and any file named `learnings.local.md` (`bobby learn` writes it, `commands/learn.js:82`).
5. **When the check cannot run, it says so.** The move has already succeeded, and the check prints `⚠  Scope check not run: <reason>`. Possible reasons: not a git repository; on `<main>` with no upstream to compare; the base branch is missing; the git toplevel is the studio root (config has `studio`), so run from the code repo. No substitute value or silent pass is used. This is reported, not a fallback.
6. **Which moves trigger it.** Only when the ticket's stage before the move is `building` and the target is `security`, `reviewing`, `testing`, `shipping` or `done`. `reject`, `block` and `unblock` never trigger it.
7. **Provenance marker = `found_in` only.** `--found-in <id>` writes `found_in: <id>` into frontmatter. "Filed by agents, awaiting product review" means: stage `backlog`, `found_in` set, and type not `epic`. A main-session filing with no current ticket has no `found_in`, so it is not counted. That is open question 1.
8. **Agent-filed tickets are never picked automatically.** `buildBrief`'s `pickNextAction` drops them from the backlog it chooses from, so `bobby go` and the dashboard's `/api` next-action never start one. This enforces "product decides priority" in code, not just in prose.
9. **Body text without a new flag.** `bobby ticket create` has no description option. The rule tells agents to write the details with `bobby ticket comment <newId> --by <agent> "…"`, which works today. No `--description` flag is added (it would widen scope).
10. **Command name.** The ticket says `bobby triage`; the real command is `bobby ticket triage` (`commands/ticket.js:13`). This plan changes that command.

---

## 2. Overlap with TKT-073 (PR #18, unmerged)

PR #18 touches `README.md`, `commands/init.js`, `commands/run.js`, `commands/sprint.js`, `eslint.config.js`, `lib/config.js`, `lib/dashboard/orchestrator.js`, `lib/targets/claude-code.js`, `lib/workflow.js`, `lib/workflow-script.js`, `templates/workflows/runtime.js`, and their tests.

**This plan touches none of them.** README is deliberately left alone; the new flag is documented in the CLAUDE.md template's CLI block instead. `lib/dashboard/worktree.js` is only **imported** (`detectMainBranch`), not edited. `test/commands/init.test.js` is edited, but PR #18 does not touch it. The only possible conflict is `CHANGELOG.md` `## [Unreleased]`, if #18 adds an entry before merging. Resolve that by keeping both entries. If #18 lands first, rebase; no semantic overlap is expected.

Do **not** run `bobby init --refresh` on this repo. The repo's own `.claude/` and root `CLAUDE.md` pick up the new text on the next upgrade. Regenerating them here would put dozens of unrelated files in the diff.

---

## 3. Files to modify

### Code
| File | Change |
|---|---|
| `lib/scope-check.js` | **NEW.** `changedFilesOnBranch(cwd)`, `planFileCheck(planText, files)`, `runScopeCheck({ cwd, ticketPath, studioRoot })`, `formatScopeCheck(result)` |
| `commands/move.js` | After the normal move (lines 55-67), run the scope check when leaving `building`; print it; add a `scope-check` comment when there is drift or unchecked files |
| `commands/create.js` | `--found-in <id>` option (after line 23); validate it before `createTicket` (before line 43); pass `foundIn`; print the origin line |
| `lib/tickets.js` | `createTicket` (line 197) accepts `foundIn = null` and writes `found_in: foundIn \|\| null` in frontmatter (next to `parent`, line 221) |
| `lib/brief.js` | `buildBrief` returns `agentFiled`; `backlogWork` (line 76) excludes `found_in`; `pickNextAction` gets an `agentFiled` branch before "Board is empty" (line 178) |
| `commands/brief.js` | Single-project view: after the backlog list (lines 95-107), print the awaiting-review line. Mark `found in X` on backlogTop rows. Studio view: add `N awaiting product review` to `parts` (lines 24-27) |
| `commands/triage.js` | Agent-filed first in order; header count line; `Found in: X · by <author>` on each agent-filed ticket's meta line (line 46) |

### Shipped templates (prose)
| File | Change |
|---|---|
| `templates/CLAUDE.md.ejs` | New `## Stay in the ticket` section after `## Working Style` (insert after line 113, before `## Workflows`). Two lines added to the CLI block (after line 284) |
| `templates/skills/bobby-shared/learnings.md` | New `## RULE — Every Agent` section with entry `### stay-in-the-ticket`, inserted before `## PROBLEM` (line 7) |
| `templates/skills/bobby-build/SKILL.md.ejs` | New `## Stay in the Ticket` section before `## Completing Work` (line 145); Completing Work gains a `Filed:` report step; self_check item 3 (line 165) rewritten |
| `templates/skills/bobby-debug/SKILL.md.ejs` | Scope Lock bullet (line 64) replaced by the full step; Completing Work (line 92) gains a `Filed:` step |
| `templates/skills/bobby-test/SKILL.md.ejs` | New `## Findings Outside the Ticket` section before `## Self-Check Before Verdict` (line 286); Key Principles bullet (line 320) updated |
| `templates/skills/bobby-ship/SKILL.md.ejs` | New `## Stay in the Ticket` section before `## If Something Goes Wrong` (line 139); the "If CI fails" bullet (line 141) is split by cause |
| `templates/skills/bobby-review/SKILL.md.ejs` | Section 1 cross-reference bullet (line 42) rewritten; new `## Findings Outside the Ticket` section before `## Decision` (line 155); Reject (line 172) gains the out-of-plan rule; the two "Commit any changes" lines (160, 168) are limited to files the ticket needs |
| `templates/skills/bobby-freewill/SKILL.md.ejs` | The existing **Scope lock.** paragraph (lines 68-70) is extended in place. No new section, because the file says "Do not add steps" |
| `templates/skills/bobby-plan/SKILL.md.ejs` | One bullet added to `<investigation_rules>` (before line 27); both "Files to modify" lines (183, 304) extended |
| `templates/agents/bobby-design-build.md.ejs` | Completing Work (line 27) gains the step |
| `templates/agents/bobby-design-check.md.ejs` | Completing Work (lines 42-47): the filing command gains `-a bobby-design-check --found-in {ID}`, plus the `Filed:` line and the unrelated-findings rule |
| `CHANGELOG.md` | `### Added` entry under `## [Unreleased]` (line 7) |

### Tests
| File | Change |
|---|---|
| `test/lib/scope-check.test.js` | **NEW.** Unit tests for `planFileCheck`; git-backed tests for `changedFilesOnBranch` / `runScopeCheck` |
| `test/commands/move.test.js` | **NEW.** End-to-end through `bin/bobby.js` in a temp git repo |
| `test/commands/create.test.js` | `--found-in` cases |
| `test/lib/brief.test.js` | `agentFiled` + next-action exclusion |
| `test/commands/triage.test.js` | **NEW.** Spy on `inquirer.prompt` (the pattern in `test/commands/init.test.js:307`), capture `console.log` |
| `test/lib/scope-rule-templates.test.js` | **NEW.** Scaffold a project once with `scaffoldProject` and assert that the rendered files carry the rule |
| `test/commands/init.test.js` | Fresh-init and re-scaffold (upgrade) assertions for the CLAUDE.md section |

---

## 4. The canonical rule text

Use this wording in the CLAUDE.md template and in the bobby-shared entry. It is the studio reference made generic: no "CC", no `RF-`, and "the user" or "product" instead.

```markdown
## Stay in the ticket

The ticket, or the task the user named, is the scope. This applies to every agent, to freewill, and to the main session.

- Change only what the ticket needs. Before committing, run `git diff --stat`: every file in it must tie to the ticket in one sentence. Regressions your change caused and tests it broke are in scope; nothing else is.
- Anything else you notice (a bug, a security hole, copy that reads badly, a refactor, a missing feature, a flaky test): do not fix it. Check for a duplicate (`bobby ticket list`), then file it:
  `bobby ticket create -t "<what is wrong>" --type bug|improvement -p <priority> -a <your agent name> --found-in <current ticket ID>`
  then `bobby ticket comment <new ID> --by <your agent name> "<what you saw, where (file:line or URL), how to reproduce, why it matters>"`.
  Omit `--found-in` only when there is no current ticket. The new ticket waits in backlog for product review. Never plan, move, or start a ticket you filed.
- A security finding that is exploitable in production now: file it with `-p critical`, do not fix it in this ticket, and lead your report with **Decision needed** so the user chooses whether to stop current work.
- An out-of-scope problem that blocks this ticket: file it, run `bobby ticket move <ID> block "needs <new ID>"`, and stop. Don't work around it.
- End your report with one `Filed: <ID> — <title>` line per ticket you filed.
- When a ticket leaves building, `bobby ticket move` prints a scope check: changed files that `plan.md` does not name. Review rejects out-of-plan changes the ticket does not need. The fix is to revert the change and file it, not to keep it.
```

In `templates/skills/bobby-shared/learnings.md`, the same bullets go under:

```markdown
## RULE — Every Agent

### stay-in-the-ticket
**Pattern:** Agents drift off their ticket: they reword copy nobody asked about, fix security bugs they run into, and refactor along the way. That work skips product review, bloats diffs and reviews, and the human loses track of what changed and why.
**Fix:** <the bullets above, unchanged>
```

### The per-skill step (the "scope step")

Every stage file below gets this block, adapted at the marked points: `<agent>` is the agent's own name, and `<examples>` and the placement are stage-specific. **Do not replace it with a pointer to bobby-shared.** AC 2 requires the command and the `Filed:` line in each file.

```markdown
**Out-of-scope findings.** Anything this ticket does not need (<examples>) is not yours to fix. Check `bobby ticket list` for a duplicate, then file it:
`bobby ticket create -t "<what is wrong>" --type bug -p <priority> -a <agent> --found-in {ID}`
`bobby ticket comment <new ID> --by <agent> "<what you saw, where, how to reproduce, why it matters>"`
- Exploitable in production now → `-p critical`, don't fix it here, and lead your report with **Decision needed**.
- It blocks this ticket → file it, `bobby ticket move {ID} block "needs <new ID>"`, and stop.
- End your report with `Filed: <ID> — <title>` for each one, or `Filed: none`.
```

---

## 5. Step-by-step plan

Work TDD where there is code: write the test for each code step first and watch it fail.

### Step 1 — `found_in` provenance (create)
- [ ] `test/commands/create.test.js`: add the cases from test-cases TC-01 to TC-03 (records origin; unknown id errors with exit 1 and **no ticket directory is created**, and the counter is unchanged; without the flag, `found_in` is `null`).
- [ ] `lib/tickets.js` `createTicket`: add `foundIn = null` to the destructured params and `found_in: foundIn || null,` after `parent`, with a one-line comment ("ticket this was found while working on; set by agents filing out-of-scope findings for product review").
- [ ] `commands/create.js`: `.option('--found-in <id>', 'Ticket this was found while working on (agent-filed findings await product review)')`. Before `createTicket`: `if (opts.foundIn && !findTicket(ticketsDir, opts.foundIn)) { error(\`--found-in ${opts.foundIn}: no such ticket\`); process.exit(1); }` (import `findTicket`). Pass `foundIn: opts.foundIn || null`. After the `→ path` line, when set: `console.log(\`  → Found in ${opts.foundIn} — awaiting product review\`)`. Add `foundIn` to the `tryLogEntry` payload.

### Step 2 — brief surfaces agent-filed tickets and never auto-picks them
- [ ] `test/lib/brief.test.js`: TC-04, TC-05 and TC-06.
- [ ] `lib/brief.js`:
  - `const isAgentFiled = t => t.stage === 'backlog' && t.type !== 'epic' && !!t.found_in;`
  - `const agentFiled = all.filter(isAgentFiled);` and change `backlogWork` to `backlog.filter(t => t.type !== 'epic' && !t.found_in)`.
  - Return `agentFiled` from `buildBrief` and pass it to `pickNextAction`.
  - In `pickNextAction`, after the `backlog.length > 0` branch and before "Board is empty": `if (agentFiled.length > 0) return { reason: \`${agentFiled.length} ticket(s) filed by agents await product review\`, command: 'bobby ticket triage', argv: null };`. Use `argv: null` because triage is interactive, and the dashboard executes argv headless (`lib/dashboard/actions.js`).
- [ ] `commands/brief.js`:
  - In the single-project backlog section, after the list: `if (b.agentFiled.length > 0) console.log(\`    ${b.agentFiled.length} filed by agents, awaiting product review — bobby ticket triage\`)`.
  - On each backlogTop row with `t.found_in`, append `dim(\`found in ${t.found_in}\`)`.
  - In `studioBrief`, push `\`${b.agentFiled.length} awaiting product review\`` into `parts` when it is above 0.

### Step 3 — triage shows them first
- [ ] `test/commands/triage.test.js` (new): TC-07 and TC-08. Spy on `inquirer.prompt` to resolve `{ action: 'skip' }`, spy on `console.log`, and call `registerTriage(new Command())` then `parseAsync(['node','x','triage'])` with `process.chdir(tmpDir)`. Mirror `init.test.js`'s spy setup, and restore cwd in `afterEach`.
- [ ] `commands/triage.js`:
  - After `listTickets`, stable-partition: `const agentFiled = tickets.filter(t => t.found_in); const ordered = [...agentFiled, ...tickets.filter(t => !t.found_in)];` and loop over `ordered`.
  - After the header rule line, when `agentFiled.length > 0`: `console.log(\`  ${agentFiled.length} filed by agents, awaiting product review (shown first)\`)`.
  - On the meta line, append `· Found in: ${t.found_in} by ${t.author}` when `t.found_in` is set.

### Step 4 — `lib/scope-check.js`
- [ ] `test/lib/scope-check.test.js`: TC-09 to TC-16 (unit + temp git repos via `fs.mkdtempSync` + real `git`; set `user.email`/`user.name` locally in the temp repo).
- [ ] Implement, with no new dependencies and `execFileSync('git', [...], { cwd })` (no shell string building):
  - `changedFilesOnBranch(cwd)` → `{ ok: true, base, files: string[] }` or `{ ok: false, reason }`. Steps: get the toplevel via `rev-parse --show-toplevel` (failure → `reason: 'not a git repository'`); `main = detectMainBranch(top)`; `current = rev-parse --abbrev-ref HEAD` (failure, e.g. a freshly `git init`ed repo with no commits, which is what `scaffoldProject` leaves in `test/e2e/lifecycle.test.js`, → `reason: 'no commits yet'`); `base = current === main ? '@{upstream}' : main`. Verify the base with `rev-parse --verify --quiet <base>` (failure → `reason: current === main ? \`on ${main} with no upstream to compare against\` : \`base branch ${main} not found\``). Take the union of the three name lists, dedupe, sort, and drop paths that start with `.bobby/` or whose basename is `learnings.local.md`. Paths are relative to the toplevel.
  - `planFileCheck(planText, files)` → `{ listsFiles, named, outOfPlan }`. When `planText` is null, `listsFiles` is false. The heading regex is in decision 2. Named matching is in decision 3; extract directory tokens with `` /`([^`\s]+\/)`/g ``.
  - `runScopeCheck({ cwd, ticketPath, studioRoot = null })` → `{ status, base, files, outOfPlan, reason }`, where `status ∈ 'not-run' | 'empty' | 'clean' | 'drift' | 'unlisted' | 'noplan'`. When `studioRoot` is set and the realpath of the toplevel equals the realpath of `studioRoot`, return not-run with `reason: 'run from the code repo checkout, not the studio root'`. Read `path.join(ticketPath, 'plan.md')` if it exists.
  - `formatScopeCheck(result, id)` → `{ lines: string[], comment: string|null }`:
    - `not-run`: `Scope check not run: <reason>`; comment null.
    - `empty`: `Scope check: no changed files vs <base>`; comment null.
    - `clean`: `Scope check: all N changed file(s) are named in plan.md`; comment null.
    - `drift`: `Scope check: N changed file(s) not named in plan.md:` + indented paths + `Each needs a reason tied to the ticket, or revert it and file it: bobby ticket create … --found-in <id>`; comment `Scope check: out of plan — a, b`.
    - `unlisted` / `noplan`: `Scope check: plan.md has no "Files to modify" section` (or `no plan.md`) `— N changed file(s) unchecked:` + paths; comment `Scope check: unchecked (plan lists no files) — a, b`.

### Step 5 — wire it into `bobby ticket move`
- [ ] `test/commands/move.test.js` (new): TC-17 to TC-21, driving `node bin/bobby.js` with `execSync` in a temp project that is also a git repo.
- [ ] `commands/move.js`, in the normal-move path only (after `success(...)` at line 66): `if (fromStage === 'building' && ['security','reviewing','testing','shipping','done'].includes(targetStage))`, run `runScopeCheck({ cwd: process.cwd(), ticketPath: before.path, studioRoot: config.studio ? root : null })`, then `formatScopeCheck`. Print with `success` for clean/empty and `warn` for the rest (`lib/colors.js`). If `comment` is set, `addComment(ticketsDir, id, 'scope-check', comment)`. Wrap **only** this block so an unexpected throw prints `warn(\`Scope check failed: ${e.message}\`)`; never let it reach the outer `catch` that exits 1. The move already happened.

### Step 6 — shipped prose
- [ ] `templates/CLAUDE.md.ejs`: insert section 4's canonical block after `## Working Style`. Add to the CLI block:
  `bobby ticket create -t "..." -a bobby-build --found-in TKT-001   # File an out-of-scope finding for product review`
  `bobby ticket triage                                 # Review backlog; agent-filed tickets first`
- [ ] `templates/skills/bobby-shared/learnings.md`: add the `## RULE — Every Agent` section from section 4.
- [ ] Add the scope step (section 4) to each stage file, as follows:
  - **build**: new `## Stay in the Ticket` section before `## Completing Work`. Examples: "a bug in nearby code, copy you'd word differently, a refactor, a flaky test you didn't cause". Add one extra bullet: "A file the AC needs but `plan.md` does not list: keep it, and say why: `bobby ticket comment {ID} --by bobby-build \"Outside plan: <file> — <which AC needs it>\"`. Review judges it." Replace self_check item 3 with: "Run `git diff --stat`. Every file must tie to the ticket in one sentence. Revert anything that doesn't, and file it (see Stay in the Ticket)." Add a Completing Work step after the comment step: "List anything you filed: `Filed: <ID> — <title>`."
  - **debug**: replace the Scope Lock bullet `If you discover other issues, file them: …` with the scope step (agent `bobby-debug`; examples "other bugs, messy code next to the fix, unrelated failing tests"). Completing Work gains the `Filed:` step.
  - **test**: new `## Findings Outside the Ticket` section. It says that a bug in a feature this ticket did not change is filed (scope step, agent `bobby-test`), not a rejection. A regression this ticket caused **is** a rejection. Key Principles bullet: "**Test what the ticket says** — file what you find elsewhere (`bobby ticket create … --found-in {ID}`); don't reject for it".
  - **ship**: new `## Stay in the Ticket` section. CI or rebase failures caused by this ticket's change are in scope; failures in code the ticket did not touch are filed and the ticket is blocked. Replace "If CI fails: fix and re-push" with "If CI fails because of this ticket's change: fix and re-push. If it fails on something this ticket didn't touch: file it, block, stop (see Stay in the Ticket)."
  - **review**: rewrite the section 1 bullet to: "Changed files NOT in the plan: each needs a one-sentence tie to an AC (look for the builder's `Outside plan:` comment and the `Scope check:` comment `bobby ticket move` wrote when the ticket left building). No tie → **reject**." Add a new `## Findings Outside the Ticket` section (scope step, agent `bobby-review`; pre-existing problems you spot in nearby code are filed, not fixed, and not a rejection reason). In `### Reject`, add the bullet: "Out-of-plan changes the ticket doesn't need are a rejection reason. The fix you ask for is: revert it, and file it with `bobby ticket create … --found-in {ID}`. Never 'keep it, it's an improvement'." Change both "Commit any changes you made" lines to say "(only in files this ticket already touches)".
  - **freewill**: extend the **Scope lock.** paragraph in place, adding three sentences: the create command with `-a bobby-freewill --found-in {ID}` plus the comment command; exploitable-on-prod → `-p critical` + **Decision needed**; blocker → file + block + stop; end the report with `Filed: <ID> — <title>`. Keep it a paragraph; add no heading.
  - **plan**: add an `<investigation_rules>` bullet: "Problems you find that the ACs don't need: file them (scope step, agent `bobby-plan`, `--found-in {ID}`). Don't widen the ACs or the plan to absorb them. Report `Filed:` lines." Change both "Files to modify" lines to "List every file that needs changes, including tests, fixtures and docs. When the ticket leaves building, `bobby ticket move` flags any changed file this list doesn't name."
  - **design-build** (agent file): add to Completing Work the scope step (agent `bobby-design-build`; examples "other pages, copy, components outside the spec").
  - **design-check** (agent file): change the filing command to `bobby ticket create -t "..." --type bug --area ui -a bobby-design-check --found-in {ID}`. Add: "Problems on pages or parts outside this ticket are filed the same way and are not a FAIL for this ticket. Exploitable in production → `-p critical` + **Decision needed**. End with `Filed: <ID> — <title>` lines."
- [ ] `test/lib/scope-rule-templates.test.js` (new): TC-22 and TC-23.
- [ ] `test/commands/init.test.js`: TC-24 and TC-25.

### Step 7 — changelog and verification
- [ ] `CHANGELOG.md` `## [Unreleased]` → `### Added`: one entry, "Stay in the ticket (TKT-074)". It covers the shipped rule in CLAUDE.md and bobby-shared, per-stage steps, `--found-in`, agent-filed tickets in brief/triage (never auto-picked), and the warn-only scope check on leaving building.
- [ ] `npm test > /tmp/… 2>&1` then read the summary; `npm run lint`. Both must be green.
- [ ] Run `git diff --stat main...HEAD`: every file must be in section 3. Stay in the ticket yourself.

---

## 6. Risk areas

- **Existing tests that move tickets from building inside a git repo.** `test/e2e/lifecycle.test.js` scaffolds with `scaffoldProject`, which runs `git init`, and moves `TKT-001` to review and test. With no commits, the check reports "not run: no commits yet" and writes no comment. If that test commits first, the move adds a `scope-check` comment. Check for any assertions on exact comment counts or stdout. If a test breaks, fix the test's expectation only when the new behaviour is the intended one; otherwise fix the code.
- **Frontmatter shape.** `found_in: null` now appears on every new ticket. Grep tests for exact-frontmatter `toEqual` on created tickets (`test/lib/tickets.test.js`, `test/e2e/*`) and update only those assertions.
- **`@{upstream}` on main.** A temp repo has no upstream, so cover that branch with the "not run" test, not with a real remote.
- **macOS temp paths.** `/var` vs `/private/var`: compare realpaths in the studio-root check and in tests.
- **Prose growth.** Each stage file grows by about 8 lines. Freewill must stay a paragraph, because the file's own contract forbids added steps.
- **TKT-073 rebase.** Expected to be clean (section 2). If `CHANGELOG.md` conflicts, keep both entries.

## 7. Dependencies

- None. `detectMainBranch` already exists and is exported (`lib/dashboard/worktree.js:32`).

## 8. Out of scope (do not do here)

- Regenerating this repo's own `.claude/` or root `CLAUDE.md`.
- A `--description` flag on `bobby ticket create`.
- A standalone `bobby ticket scope` command.
- Blocking moves.
- Marking tickets "reviewed" after triage.
- README changes (TKT-073 owns README right now).
- Anything under `lib/workflow.js` prompts.

## 9. Open questions for CC (none block the build)

1. **Main-session filings.** Agent-filed means `found_in` is set. A main session working without a ticket files with no `--found-in`, so its tickets don't show in "awaiting product review". Should `bobby ticket create -a <bobby-*>` also count, or is `found_in`-only right?
2. **When "awaiting product review" ends.** As planned, it ends when the ticket leaves backlog. If you triage with "Keep" or "Prioritize", the ticket stays counted. Add a `reviewed` flag later if that is noisy.
3. **Warn vs block.** As planned, it warns and the reviewer rejects. Say if you want a config switch to make it block later.
