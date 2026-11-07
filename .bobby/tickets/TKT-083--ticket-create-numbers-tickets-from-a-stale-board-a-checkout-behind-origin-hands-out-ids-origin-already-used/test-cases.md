# Test Cases — TKT-083

Fixture for all cases: a local bare repo `origin.git` and two clones, **A** and **B**, of a plain Bobby project (`.bobbyrc.yml` with `ticket_prefix: TKT`, `.bobby/tickets/.counter` = `0`). Each clone is on `main` tracking `origin/main`. No network.

## TC1 — create refuses when the board is behind (AC 1, write path blocked)
**Preconditions:** In B, `bobby ticket create -t "From B"` (→ TKT-001), commit, push.
**Steps:** In A (not fetched or pulled), run `node bin/bobby.js ticket create -t "From A"`.
**Expected:** Exit 1. Stderr names `1 commit` and `origin/main`, and gives the `git -C <A> pull --rebase origin main` command. A's `.bobby/tickets/` holds no `TKT-*` folder, and `.counter` is still `0`.

## TC2 — after pulling, the next ID is above upstream (AC 2, write path)
**Preconditions:** TC1 state.
**Steps:** In A, `git pull`, then `bobby ticket create -t "From A"`.
**Expected:** Exit 0. Creates `TKT-002--from-a`. `.counter` = `2`.

## TC3 — nextId floor from the upstream tree without pulling (AC 2, unit)
**Preconditions:** B pushed `TKT-005--x/ticket.md`. In A, `git fetch origin` only. A's disk and counter are both at 0.
**Steps:** Call `nextId(<A>/.bobby/tickets, 'TKT', 'y')` directly (lib).
**Expected:** Returns `TKT-006`. It ran no fetch (point the remote URL at a missing path after the fetch: the call still succeeds).

## TC4 — fetch failure is an explicit error naming the remote (AC 3, error path)
**Preconditions:** In A, `git remote set-url origin /does/not/exist.git`.
**Steps:** `bobby ticket create -t "Offline"`.
**Expected:** Exit 1. Stderr contains `Could not fetch origin` and the URL. No folder is created and `.counter` is unchanged.

## TC5 — no upstream keeps today's behaviour (AC 4)
**Preconditions:** A plain `git init -b main` project with one commit and no remote. Also a non-git tmp dir (the existing create.test.js fixture).
**Steps:** `bobby ticket create -t "Local"` in each.
**Expected:** Exit 0, `TKT-001` created in both, and no fetch-related output.

## TC6 — `go "<text>"` refuses when behind (AC 1 via go)
**Preconditions:** TC1 state.
**Steps:** In A, `bobby go "add a page"`.
**Expected:** Exit 1 with the behind message. No ticket folder, and `run workflow` is never spawned (no "Now running it…" line).

## TC7 — brief shows the behind line, and nothing when current (AC 5, read path)
**Steps:** (a) In A at TC1 state, `bobby brief`. (b) `git pull`, then `bobby brief`. (c) Set the remote to a missing path, then `bobby brief`.
**Expected:** (a) Output contains `Board is 1 commit behind origin/main`, and that line comes before the project title. (b) No `behind` line at all. (c) Output contains `Board freshness unknown` plus git's reason, the rest of the brief still prints, and the exit code is 0.

## TC8 — studio board (AC 6)
**Preconditions:** The fixture's project is a studio (`studio:` key, `.bobby/app/.bobbyrc.yml` with `prefix: AP`), with boards at `.bobby/app/tickets` and `.bobby/other/tickets`. B creates `AP-001` and pushes.
**Steps:** (a) In A, `bobby ticket create -t x --project app`. (b) Separately, B pushes a commit touching only `.bobby/other/tickets`, then A (pulled for app) runs `bobby ticket create -t y --project app`.
**Expected:** (a) Exit 1, `1 commit behind origin/main`. (b) Exit 0: another project's board moving does not block this one.

## TC9 — code-only upstream commits don't block (decision 1)
**Preconditions:** B pushes a commit touching only `src/index.js`.
**Steps:** In A, `bobby ticket create -t z`.
**Expected:** Exit 0, ticket created.

## TC10 — `bobby new` is unaffected inside a stale checkout (decision 2)
**Preconditions:** cwd = A at TC1 state (behind).
**Steps:** `bobby new "tiny app" --dir tiny`.
**Expected:** Exit 0. `tiny/.bobby/tickets/TKT-001--*` exists (the new repo has no upstream).

## TC11 — upstream configured but branch not on the remote (decision 4)
**Preconditions:** In A, `git checkout -b feat` and `git config branch.feat.remote origin`, `branch.feat.merge refs/heads/feat` (never pushed).
**Steps:** `bobby ticket create -t w`.
**Expected:** Exit 0, created (nothing to be behind).
