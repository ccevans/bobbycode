# Test Cases — TKT-076

Run against the converged branch `tkt-076-converge` (build/review) and the global CLI after ship. Use temp dirs (`fs.mkdtempSync`) and real git; never a real agent CLI.

## TC1 — The merge loses no board file (AC1)
**Preconditions:** merge of `origin/main` into `tkt-076-converge` staged, conflicts resolved.
**Steps:** 1. `git status --short | grep '^D '` 2. `git diff --stat origin/main tkt-076-converge -- .bobby .bobbyrc.yml` 3. `node bin/bobby.js ticket view TKT-074` from the worktree root.
**Expected:** (1) prints nothing. (2) shows no deletions; only app-only additions such as `.bobby/design/*` may appear. (3) prints TKT-074 with `Stage: done`, which proves the repo still resolves to its own TKT board and not the studio's robinflow board.

## TC2 — Claimed ticket blocks both run paths (AC2, write + error path)
**Preconditions:** temp project; ticket TKT-001 claimed by another run (as in the BOB-120 tests).
**Steps:** 1. `bobby run workflow TKT-001` with `orchestration` unset. 2. Write `orchestration: workflow` to `.bobbyrc.yml`, run `bobby init --refresh`, then `bobby run workflow TKT-001` again.
**Expected:** both exit non-zero with the claim error, and neither prints a prompt or a Workflow call. With the claim released, run 2 prints the `bobby-default` Workflow invocation. That proves the claim check runs before the orchestration early-return.

## TC3 — `--found-in` and `--size` both persist on one ticket (AC2, write path)
**Steps:** `bobby ticket create -t "x" --size s --found-in TKT-001 -a bobby-plan`, then read the new ticket.md.
**Expected:** frontmatter has `size: s` and `found_in: TKT-001`. `bobby brief`/triage show it as agent-filed (not auto-picked). `--size huge` exits non-zero via assertSize.

## TC4 — Leaving building runs the scope check; done also reclaims the worktree (AC2)
**Steps:** in a temp git project with a plan that names one file, change an unnamed file, then `bobby ticket move TKT-001 review`. Separately, move a ticket that has `worktree_path` to `done`.
**Expected:** the move to review prints the scope-check warning and adds a `scope-check` comment. The move to done prints `worktree reclaimed` and drops `worktree_path` from frontmatter. Both already have suites (`test/commands/move.test.js`) and must stay green.

## TC5 — No SendMessage for non-claude hosts (AC3, error path)
**Steps:** build the dashboard workflow prompt (`orchestrator-continue-builder.test.js` helper) for:
- target claude-code with executor unset, `cursor-agent`, `codex`, `opencode` and `/opt/bin/claude`
- targets `codex`, `opencode`, `copilot`, `agents-md` and `cursor`

**Expected:** only claude-code with executor unset (resolves to `claude`) contains `SendMessage` / `Note the agent id`. Every other case contains no `SendMessage` and keeps the fresh-launch loop. The codex and opencode executor cases are red before resolution 13.

## TC6 — Workflow scripts only for claude-code (AC3)
**Steps:** `scaffoldProject` with `orchestration: workflow` for each of cursor, cline, codex, opencode, copilot, agents-md, and for claude-code.
**Expected:** no `.claude/workflows` for the six, and `bobby-default.js` exists for claude-code. `resolveOrchestration({target:'codex', orchestration:'workflow'})` throws, with no fallback to prompt.

## TC7 — extraPaths matches what scaffoldExtras writes (AC3, semantic conflict)
**Steps:**
1. `getTarget('claude-code').extraPaths({})` and `extraPaths({orchestration:'workflow'})`.
2. Scaffold a temp project with `orchestration: workflow` written to `.bobbyrc.yml`, then call `getBobbyPaths(tmp)`.
3. Run `test/lib/target-matrix.test.js`.

**Expected:** (1) returns `[]` and `['.claude/workflows']`. (2) includes `.claude/workflows`. (3) is green; it was red before resolution 11.

## TC8 — Refresh keeps the user's config keys (AC3, BOB-123 × TKT-073)
**Steps:** write a `.bobbyrc.yml` with `orchestration: workflow`, a `workflows:` override and a hand comment, then run `bobby init --refresh`.
**Expected:** `.bobbyrc.yml` is byte-identical afterwards, and `.claude/workflows/bobby-<each workflow>.js` exist. Then call `writeConfigCommented` directly with those keys: they round-trip (the TKT-073 config test stays green).

## TC9 — Stage agents get no model override (AC3)
**Steps:** `buildPromptFor('workflow', ['TKT-001'], …)` for a claude-code project, then read the build step.
**Expected:** the launch line names `subagent_type: "bobby-build"`, says `no \`model\` or \`effort\` override`, and ends with the "Note the agent id" sentence.

## TC10 — Merged templates carry both sides (AC3)
**Steps:** scaffold a temp project, then read the rendered bobby-build, bobby-plan, bobby-ship and bobby-freewill SKILL.md.
**Expected:**
- build has "Bring the branch up to date with origin/main", `Filed:`, "Every file must tie to the ticket", and the hand-on per task prompt.
- plan has "Contract" and "`bobby ticket move` flags any changed file".
- ship has both `## Stay in the Ticket` and `## Checkpointing`.
- freewill has 8 `## ` headings and none starting "Stay in the".

## TC11 — Full suite and lint on the converged branch (AC4)
**Steps:** `npm run lint`; `npm test > <scratch>/suite.log 2>&1`.
**Expected:** lint 0 errors; `Tests:` line shows 0 failed. The review stage repeats this run independently.

## TC12 — main contains everything; nothing was forced (AC5)
**Steps:** after ship: `git merge-base --is-ancestor <app-studio tip at merge> origin/main && git merge-base --is-ancestor 3ed455a origin/main`; `gh pr view 14 --json state`; `gh pr checks 14`.
**Expected:** both ancestry checks exit 0; PR #14 `MERGED` with a merge commit; CI green on 18/20/22; `git reflog` for `origin/integrate/app-studio` shows a fast-forward (no forced update).

## TC13 — A new shell's `bobby` runs main (AC6, read path)
**Steps (new terminal):**
1. `realpath /usr/local/bin/bobby`
2. `git -C ~/Repos/bobby/repos/bobbycode rev-parse HEAD origin/main`
3. `bobby ticket create --help | grep -E -- '--found-in|--size'`
4. `test -f ~/Repos/bobby/repos/bobbycode/lib/workflow-script.js && test -f ~/Repos/bobby/repos/bobbycode/lib/dashboard/ticket-claim.js`
5. `cd /Users/ccevans/Repos/bobby-code-studio && bobby ticket list` (robinflow board)

**Expected:** (1) is the old-studio checkout's `bin/bobby.js`. (2) prints two equal SHAs. (3) shows both flags. (4) exits 0. (5) lists RF tickets with exit 0.

## TC14 — Long-running processes and rollback (AC6, error path)
**Steps:**
1. `pgrep -fl 'bobby.js (app|dashboard|remote)'` and restart each one listed.
2. Rollback drill, only if CC asks or step 18 fails: `git -C ~/Repos/bobby/repos/bobbycode checkout integrate/app-studio`, then TC13 step 3.

**Expected:** (1) nothing left running on pre-merge code. (2) After rollback `--found-in` is absent, which proves the switch is the only lever. Run `checkout main` again afterwards.
