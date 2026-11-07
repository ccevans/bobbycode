# Plan — TKT-061: bobby learn commits unrelated in-flight work as a side effect

## Approaches Considered

### Approach A: Scope autoSync to caller-declared paths

Change `autoSync(rootDir)` → `autoSync(rootDir, changedPaths)`. Each caller passes the
specific files it wrote. `autoSync` only stages and commits those files.

| Dimension | Score | Notes |
|-----------|-------|-------|
| Minimal effort | 4 | 3 callers + autoSync itself; changes are small and mechanical |
| Risk | 4 | Narrows behavior precisely; no user-visible feature removal |
| Maintainability | 4 | Callers self-document what they write; new callers must declare paths |
| Impact | 5 | Directly fixes the bug while preserving auto-commit for intended files |

**Weighted: (4x3) + (4x2) + (4x2) + (5x1) = 33**

### Approach B: Gate autoSync — refuse when unrelated files are dirty

Keep the blanket `git add` but before committing, diff the staged set against what the caller
expected. If extra files are dirty, log a warning and skip the commit entirely.

| Dimension | Score | Notes |
|-----------|-------|-------|
| Minimal effort | 3 | Need detection logic for "unrelated" — fuzzy boundary |
| Risk | 3 | Noisy in repos that are usually dirty; may block legitimate commits |
| Maintainability | 3 | Gating logic is implicit, not self-documenting |
| Impact | 4 | Prevents the bug but also prevents wanted auto-sync |

**Weighted: (3x3) + (3x2) + (3x2) + (4x1) = 25**

### Approach C: Remove autoSync from non-sync callers entirely

Delete the `autoSync()` call from learn, triage, and retro. Files are written but not
committed. The user runs `bobby sync` when ready.

| Dimension | Score | Notes |
|-----------|-------|-------|
| Minimal effort | 5 | Delete 4 call sites — simplest possible change |
| Risk | 2 | Removes a feature; uncommitted learnings lost on branch switch |
| Maintainability | 5 | Less code, cleaner separation |
| Impact | 4 | Fixes the bug but changes user-visible behavior |

**Weighted: (5x3) + (2x2) + (5x2) + (4x1) = 33**

## Decision

**Selected: Approach A — Scoped paths.** Tied with C on score (33), but A wins because:

1. The ticket description itself says approach (a) "looks right."
2. A preserves the auto-commit behavior users rely on — `bobby learn` still commits the
   learning immediately, which matters when branch-switching or when multiple agents are
   running.
3. A follows the same narrowing pattern used elsewhere in the codebase: stop doing the
   broad thing and name the narrow one.

## Files to Modify

| File | Change |
|------|--------|
| `lib/auto-sync.js` | Add `changedPaths` parameter; stage only those paths instead of `getBobbyPaths()` |
| `commands/learn.js` | Pass `[relative path to learnings.local.md]` to `autoSync` |
| `commands/triage.js` | Collect modified ticket paths during loop; pass to `autoSync` |
| `commands/retro.js` | Pass written file paths (weekly: report file; ticket: retro file + counter) |
| `test/lib/auto-sync.test.js` | **New file.** Test that unrelated dirty Bobby paths survive a scoped autoSync |
| `.bobby/decisions.yaml` | Record the scoping decision with trade-off |

### Files NOT changed (and why)

- **`commands/sync.js`** — Does not call `autoSync()`. Uses `getBobbyPaths()` directly.
  Its purpose IS to bulk-commit all Bobby data, so the broad staging is intentional.
  The AC "The same holds for ... sync" is satisfied because sync is the explicit commit
  command — it does not commit as a side effect.
- **`lib/targets/cursor.js`** — Listed as a caller in the ticket description, but grep
  confirms it does not call `autoSync()` or `getBobbyPaths()`. No change needed.

## Step-by-Step Plan

- [ ] **Step 1: Change `autoSync` signature.**
  In `lib/auto-sync.js`, change `autoSync(rootDir)` to `autoSync(rootDir, changedPaths)`.
  Replace the `getBobbyPaths()` call with the passed-in `changedPaths` array. Filter to
  paths that exist (as today). Stage only those paths. Keep the commit message as
  `"bobby: auto-sync"`. Keep the silent-catch behavior.

- [ ] **Step 2: Update `commands/learn.js`.**
  After `fs.writeFileSync(learningsFile, ...)`, compute the relative path from `root`
  and pass `[relativePath]` to `autoSync(root, [relativePath])`.

- [ ] **Step 3: Update `commands/triage.js`.**
  Before the triage loop, initialize `const modifiedPaths = []`. Inside the loop, when
  `updateTicket` or `addComment` is called, push the relative ticket.md path. After the
  loop, pass `modifiedPaths` to `autoSync(root, modifiedPaths)`. Use
  `path.relative(root, path.join(found.path, 'ticket.md'))` — note that `updateTicket`
  returns `{ path }` (the ticket dir), and `addComment` modifies the same file.
  Deduplicate since both functions touch the same file for a given ticket.

- [ ] **Step 4: Update `commands/retro.js`.**
  - Weekly mode (line ~253): pass `[path.relative(root, retroFile)]`.
  - Ticket mode (line ~322): pass `[path.relative(root, retroFile), path.relative(root, counterFile)]`.

- [ ] **Step 5: Write test — `test/lib/auto-sync.test.js`.**
  Create a test file with these cases:
  1. `autoSync` with specific paths commits only those paths.
  2. An unrelated dirty file under `.bobby/` survives the commit uncommitted.
  3. `autoSync` with empty `changedPaths` does nothing (no empty commit).
  4. `autoSync` with non-existent paths does nothing.
  Follow the test patterns in `test/commands/sync.test.js` (temp git repo, gitEnv, cleanup).

- [ ] **Step 6: Record decision in `.bobby/decisions.yaml`.**
  Create the file (doesn't exist yet) with the scoping decision:
  ```yaml
  - id: auto-sync-scoped-paths
    date: 2026-08-08
    decision: autoSync stages only caller-declared paths, not all Bobby-managed paths
    trade-off: >
      New callers must declare which files they wrote. Forgetting to pass a path
      means that file won't be auto-committed. This is preferable to the alternative
      of silently committing unrelated in-flight work.
    ticket: TKT-061
  ```

- [ ] **Step 7: Run tests and verify.**
  `npm test` passes. `git status` is clean after committing plan artifacts.

## Risk Areas

- **Triage path collection**: `triage.js` modifies a variable number of ticket files in
  a loop. The path-collection logic must handle deduplication (both `updateTicket` and
  `addComment` touch the same ticket.md for a given ticket).
- **Future callers**: Any new code that calls `autoSync` without passing paths would get
  a runtime error (undefined is not iterable), which is the desired failure mode — it
  forces the caller to be explicit.
- **`getBobbyPaths` still exported**: It remains available for `sync.js` and any future
  use case that genuinely needs the full list. No dead-code concern.

## Dependencies

None. This is a self-contained bug fix.

## Complexity

**Medium** — Multiple files, but changes are mechanical and follow a single pattern.
