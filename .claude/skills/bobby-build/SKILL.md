---
name: build-ticket
description: "Build Skill: Implements tickets using TDD methodology. Commits code to the current branch. MANDATORY TRIGGERS: build, implement, code, develop, work ticket, TDD, red green refactor, fix bug, write code."
argument-hint: "<ticket ID to build>"
---

# Bobby Build Skill

> This skill handles implementation using TDD methodology. Commits code to the current branch.

## Before Starting

1. **Check learnings** — Read `.claude/skills/bobby-build/learnings.md` + `.claude/skills/bobby-build/learnings.local.md`
2. **Health check** — Verify dev environment:



## Worktree Isolation (Recommended for Concurrent Sessions)

If multiple bobby sessions may run at once, work inside a per-ticket git worktree so concurrent sessions can't flip each other's branches mid-build.

1. Check if the ticket already has a worktree: read the ticket frontmatter for `worktree_path`
2. If not, create one: `bobby worktree create {ID}`
3. `cd` into it: `` cd "$(bobby worktree path {ID})" ``
4. All subsequent git/test/build commands run inside that worktree

The worktree is on its own branch (`bobby/tkt-{id}-ticket` by default) branched off origin/main. Other sessions in the main checkout or other worktrees cannot affect it.

If you skip worktree isolation, fall through to Branch Guard below.

## Branch Guard

Before writing any code, check your branch — commits to main bypass review and can break CI:

1. Run `git branch --show-current`
2. If on `main` or `master`: create a feature branch first:
   - `git checkout -b tkt-{ID}` (e.g., `tkt-042-add-login`)
   - Use the ticket ID and a short slug from the ticket title
3. If already on a feature branch: continue on the current branch

NEVER commit directly to main/master.

## Safety Rules

<safety_rules>
- Never run destructive commands: `rm -rf`, `DROP TABLE`, `git push --force`, `git reset --hard`, `git clean -fd`
- Only modify files related to this ticket. Check `git diff --stat` before committing.
- Do not edit .env files, CI configs, or credentials unless the plan explicitly requires it.
- Do not install global packages or modify system-level configuration.
</safety_rules>

## Picking Up Work

1. Run `git log --oneline -10` — understand recent commits, critical on retries to know what's already been built
2. Read the ticket's `ticket.md`, `plan.md`, and `test-cases.md` in parallel
3. Check for rejection comments — if this is a retry, read the rejection feedback first

## Investigation First

<investigation_rules>
Before writing any code:
- Read every file referenced in `plan.md` before modifying it — so you implement what was planned, not your own interpretation
- If the ticket references a specific function, class, or component, open and read that file first
- When fixing a bug, reproduce it first and read the relevant code path end-to-end
- Read multiple related files in parallel when possible to minimize round-trips
- If you are unsure how an existing module works, read it rather than guessing
</investigation_rules>


## Which Tests To Run

The full suite runs **once per ticket, at ship**. Build runs only the specs the change touches — a full run here, multiplied by every ticket building at once, is what runs the machine out of memory.

- **While coding (RED/GREEN):** run only the spec file you are writing.
- **Before committing:** run the impacted specs — every changed spec file plus the spec of every changed source file in `git diff --name-only origin/main...HEAD`. Read the diff to find them; "I don't know which specs are impacted" is not a reason to run everything.
- **Never here:** the full suite. Ship owns it.


- Impacted specs: `NODE_OPTIONS=--experimental-vm-modules npx jest {files}`
- Full suite (ship only): `npm test`


`{files}` is whatever the runner addresses: spec files for rspec / pytest / node, the changed source files for jest `--findRelatedTests`, package dirs for go. Name the files you ran in the ticket comment.

## Development Process (TDD)

### For Feature Tickets


1. **RED** — Write a failing test first
   - Run only that spec file: `NODE_OPTIONS=--experimental-vm-modules npx jest {files}` with `{files}` = the spec you just wrote
   - Confirm the test fails for the right reason
2. **GREEN** — Write the minimum code to make the test pass
   - Run that spec file again — should pass
3. **REFACTOR** — Clean up while tests stay green
   - Run: `npm run lint`
4. Repeat for each acceptance criterion


<example label="TDD cycle for an AC">
**AC:** "User can filter leads by status"

**RED:** Write test: `it('filters leads by active status', () => { ... })`. Run that spec file. Test fails — filter function doesn't exist yet.

**GREEN:** Add `filterByStatus()` to leads service. Add status dropdown to UI. Run that spec file — passes.

**REFACTOR:** Extract dropdown into reusable `<StatusFilter>` component (only if plan.md calls for it). Run the impacted specs — still pass. Run lint — clean.

**Commit:** `TKT-042: Add lead status filtering with dropdown UI`
</example>

### For Bug Tickets

1. **Reproduce** — Confirm the bug exists
2. **Write a failing test** that captures the bug
3. **Fix** — Write the minimum fix
4. **Verify** — Test passes, bug no longer reproduces
5. **Regression check** — Run the impacted specs (see Which Tests To Run); the full suite runs at ship

## Staying Lean

<avoid_overengineering>
- Implement exactly what `plan.md` specifies — nothing more, nothing less.
- Prefer modifying existing files over creating new ones.
- Do not create wrapper classes, utility modules, or abstraction layers unless the plan explicitly calls for them.
- If you find yourself creating more than 2 new files not listed in the plan, stop and re-read `plan.md`.
- Write code that handles the general case correctly — if a test uses "John" as input, your code should handle any name, not just "John".
- Do not add error handling, fallbacks, or validation for scenarios that can't happen. Only validate at system boundaries (user input, external APIs).
</avoid_overengineering>

## Completing Work


1. Run the impacted specs (see Which Tests To Run) — not the full suite
2. Run the linter: `npm run lint`

3. **Commit ALL changed files** — `git add` all source files you touched, then `git commit` with message format: `TKT-{ID}: {summary}`. Do NOT leave uncommitted changes behind.
4. Add comment: `bobby ticket comment {ID} --by bobby-build "Built: {summary}"`
5. If you discovered anything non-obvious or a pattern future builds should avoid: `bobby learn bobby-build "pattern" "description"`
6. Move to review: `bobby ticket move {ID} review`

## Self-Check Before Completing

<self_check>
Before committing and moving the ticket forward, pause and verify:

1. Re-read each acceptance criterion from `ticket.md`. For each one, identify the specific test that covers it. If any AC lacks a test, write one now.
2. Confirm every file listed in `plan.md` was addressed. If you skipped a file, explain why in your commit message.
3. Run `git diff --stat` and review what you changed. Are there files you modified that are not in the plan? Consider whether they are necessary.
4. Run the impacted specs and lint — show the output as evidence, naming the spec files you ran. Assertions without proof are not accepted. Do not run the full suite here; ship does, once.
</self_check>

## Checkpointing

Compaction can happen at any moment, so do not wait for a warning. Update `progress.md` in the ticket folder (the directory holding `ticket.md`) each time you commit an acceptance criterion's work. It costs a few lines; losing a half-built ticket costs the stage. After a compaction a hook hands you this file back, so write it for a reader who remembers nothing:

```markdown
## Progress Checkpoint — {ID}

**Branch:** tkt-{ID}-{slug}
**Last completed step:** [step N from plan.md]
**Done:**
- `path/to/file.ext` — [what was done]

**Remaining:**
- [step N+1 from plan.md]
- [step N+2 from plan.md]

**Tests:** [spec files run and result — or not yet run]
**Next action:** [the exact next command or edit]
**Blockers:** [anything unexpected]
```

On resume, read `progress.md` first and pick up from the last completed step. Delete it after `bobby ticket move {ID} review`.

## If Something Goes Wrong

- If tests fail: fix them before moving on
- If the ticket is unclear: `bobby ticket move {ID} block "Need clarification"`
- If you discover a systemic issue: `bobby retro {ID} "pattern"` and `bobby learn bobby-build "pattern" "description"`

---

## Project overrides

If `.claude/skills/bobby-build/SKILL.local.md` exists, read it and follow it. It holds this
project's own instructions for this skill and **wins** wherever it conflicts with anything
above.

`SKILL.md` is shipped by Bobby and is replaced on every upgrade — edits here are lost.
`SKILL.local.md` is yours and is never overwritten.
