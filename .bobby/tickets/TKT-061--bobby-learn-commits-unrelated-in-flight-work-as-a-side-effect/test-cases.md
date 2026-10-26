# Test Cases — TKT-061

## Test Case 1: autoSync commits only specified paths

**Preconditions:** Git repo initialized with `.bobby/` and `.bobbyrc.yml` committed.
**Steps:**
1. Create two files: `.bobby/tickets/TKT-001--test/ticket.md` and `.bobby/skills/bobby-build/learnings.local.md`.
2. Stage and commit both to establish a clean baseline.
3. Modify both files (append content to each).
4. Call `autoSync(root, ['.bobby/skills/bobby-build/learnings.local.md'])` — only the learnings file.
5. Run `git log -1 --name-only` to inspect the commit.
6. Run `git status --porcelain` to check remaining dirty state.

**Expected Result:**
- The commit contains ONLY `.bobby/skills/bobby-build/learnings.local.md`.
- `.bobby/tickets/TKT-001--test/ticket.md` remains modified (unstaged) in `git status`.

## Test Case 2: Unrelated dirty Bobby path survives bobby learn

**Preconditions:** Bobby project initialized. A file under `.bobby/design/` has uncommitted edits.
**Steps:**
1. Create `.bobby/design/spec.md` with content "original" and commit it.
2. Modify `.bobby/design/spec.md` to "modified by another agent" — do not stage or commit.
3. Run `bobby learn bobby-build "test-pattern" "test description"`.
4. Check `git log -1 --name-only` for what was committed.
5. Check `git status --porcelain` for remaining dirty files.

**Expected Result:**
- The auto-sync commit contains only the learnings file that `bobby learn` wrote.
- `.bobby/design/spec.md` remains modified and uncommitted with content "modified by another agent".

## Test Case 3: autoSync with empty paths does nothing

**Preconditions:** Git repo with Bobby project. Some Bobby files are dirty.
**Steps:**
1. Modify `.bobby/tickets/TKT-001--test/ticket.md`.
2. Call `autoSync(root, [])`.
3. Run `git log --oneline` to count commits.

**Expected Result:**
- No new commit is created.
- The dirty file remains uncommitted.

## Test Case 4: autoSync with non-existent paths does nothing

**Preconditions:** Git repo with Bobby project, clean state.
**Steps:**
1. Call `autoSync(root, ['does/not/exist.md'])`.
2. Run `git log --oneline` to count commits.

**Expected Result:**
- No new commit is created (no error thrown either — silent like today).

## Test Case 5: Triage commits only modified ticket files

**Preconditions:** Bobby project with 2 tickets in backlog. A third, unrelated file under `.bobby/sessions/` has uncommitted edits.
**Steps:**
1. Create TKT-001 and TKT-002 in backlog. Create `.bobby/sessions/dirty.jsonl` with uncommitted content.
2. Run triage, reprioritize TKT-001 to "high" and move TKT-002 to planning.
3. Check `git log -1 --name-only`.
4. Check `git status --porcelain`.

**Expected Result:**
- The auto-sync commit contains only the two modified ticket.md files.
- `.bobby/sessions/dirty.jsonl` remains uncommitted.

## Test Case 6: Retro (ticket mode) commits only retro file and counter

**Preconditions:** Bobby project initialized. An unrelated ticket file has uncommitted edits.
**Steps:**
1. Modify `.bobby/tickets/TKT-001--test/ticket.md` without committing.
2. Run `bobby retro TKT-001 "test pattern"`.
3. Check `git log -1 --name-only`.
4. Check `git status --porcelain`.

**Expected Result:**
- The commit contains only the new retrospective file and `.retro-counter`.
- The dirty ticket file remains uncommitted.

## Test Case 7: Retro (weekly mode) commits only the weekly report

**Preconditions:** Bobby project with sessions data. An unrelated learnings file has uncommitted edits.
**Steps:**
1. Modify `.claude/skills/bobby-build/learnings.local.md` without committing.
2. Run `bobby retro --weekly`.
3. Check `git log -1 --name-only`.
4. Check `git status --porcelain`.

**Expected Result:**
- The commit contains only `weekly-{date}.md`.
- The dirty learnings file remains uncommitted.
