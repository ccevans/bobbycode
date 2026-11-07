# Test Cases — TKT-084

Fixture: a tmp studio (`initStudio`) with projects `robinflow` (prefix `RF`) and `bobby` (prefix `BOB`), one ticket on each board (`RF-001`, `BOB-001`), **no** `.bobby/active-project` file, and `BOBBY_PROJECT` unset in the child env. CLI cases run `node bin/bobby.js` in a child process.

## TC1 — a ticket ID picks its project from the studio root (AC 1, read path)
**Steps:** cwd = studio root. `bobby ticket view RF-001`.
**Expected:** Exit 0, and the output shows the RF-001 title. There is no "Select a project" error.

## TC2 — the same from a subdirectory (AC 1)
**Steps:** `mkdir -p <studio>/repos/app` (a plain dir, no `.bobbyrc.yml`), then from cwd = that dir, `bobby ticket view BOB-001`.
**Expected:** Exit 0, and the output shows the BOB-001 title.

## TC3 — a write resolves the right board (write path)
**Steps:** cwd = studio root. `bobby ticket move RF-001 plan`, then `bobby ticket view RF-001`.
**Expected:** The move succeeds, `.bobby/robinflow/tickets/RF-001--*/ticket.md` has `stage: planning`, and BOB-001 is untouched.

## TC4 — `--found-in` on create infers the project
**Steps:** `bobby ticket create -t "finding" --found-in RF-001`.
**Expected:** The new ticket is `RF-002` under `.bobby/robinflow/tickets/`.

## TC5 — a studio git worktree sees the main checkout's active-project (AC 2)
**Preconditions:** The studio is a git repo with one commit. `git worktree add <studio>/wt-x -b x`. Main's `.bobby/active-project` = `bobby`. No file in `wt-x`.
**Steps:** (lib) `resolveActiveProject('<studio>/wt-x')`. (CLI) cwd = `wt-x`, `bobby ticket list`.
**Expected:** The lib call returns `bobby`. The CLI exits 0 and lists BOB tickets, with no "Select a project".

## TC6 — `bobby project use` inside a worktree writes the main file
**Steps:** cwd = `wt-x`, `bobby project use robinflow`.
**Expected:** Main's `.bobby/active-project` = `robinflow`, and no `wt-x/.bobby/active-project` is created.

## TC7 — cwd under worktrees/<project>/ selects that project (AC 3)
**Preconditions:** `mkdir -p <studio>/worktrees/robinflow/RF-001-ui`. Main active-project = `bobby`.
**Steps:** (lib) `resolveActiveProject(studio, undefined, { cwd: '<studio>/worktrees/robinflow/RF-001-ui' })`. (CLI) from that cwd, `bobby ticket list`.
**Expected:** `robinflow` both times. The cwd rung beats the active-project file.

## TC8 — --project and BOBBY_PROJECT beat inference, and --project beats the env (AC 4)
**Steps:** (a) `BOBBY_PROJECT=bobby bobby ticket view RF-001`. (b) `BOBBY_PROJECT=bobby bobby --project robinflow ticket view RF-001`. (c) `bobby --project bobby ticket view RF-001`.
**Expected:** (a) Exit 1, "Ticket RF-001 not found" (it looked on bobby's board; env won). (b) Exit 0, and it shows RF-001 (`--project` won over env). (c) Exit 1, not found (`--project` won over the ID).

## TC9 — unknown prefix is an explicit error naming the projects (AC 5, error path)
**Steps:** `bobby ticket view XX-9`.
**Expected:** Exit 1. Stderr contains `no project in this studio uses prefix XX`, `robinflow (RF)` and `bobby (BOB)`.

## TC10 — ambiguous prefix and mixed IDs are explicit errors (AC 5, unit)
**Steps:** (a) Add project `rf2` with prefix `RF`, then `inferProjectFromIds(studio, ['RF-1'])`. (b) Without rf2, `inferProjectFromIds(studio, ['RF-1', 'BOB-1'])`.
**Expected:** (a) Throws `/Prefix RF is used by more than one project \(rf2, robinflow\)|\(robinflow, rf2\)/`. (b) Throws, naming both projects and `--project`.

## TC11 — free text and non-ticket IDs are never read (false-positive guard)
**Steps:** (unit) `ticketIdsFromCommand` for `go fix utf-8 parsing`, `sprint run SPR-001`, `pack info react-18`, and `go RF-1`.
**Expected:** `[]`, `[]`, `[]`, `['RF-1']`. (CLI) `bobby go fix utf-8 parsing` in the studio does NOT print a prefix error. It may fail later for its own reasons (no active project).

## TC12 — the precedence chain, rung by rung (AC 7, unit)
**Steps:** Extend the existing `active-project selection precedence` test in `test/lib/studio.test.js`: explicit > env > cwd(worktrees/<p>) > main-root file > sole > null, each rung asserted by removing the one above it.
**Expected:** Each assertion returns the rung's project.

## TC13 — the shipped CLAUDE.md teaches inference, not `project use` (AC 6)
**Steps:** Render `CLAUDE.md.ejs` with `{ ...minimal config, studio: 'S' }` and with no `studio`.
**Expected:** The studio render contains `picks its project from the ticket ID` and contains no `bobby project use` anywhere. The non-studio render does not contain `picks its project from the ticket ID`.
