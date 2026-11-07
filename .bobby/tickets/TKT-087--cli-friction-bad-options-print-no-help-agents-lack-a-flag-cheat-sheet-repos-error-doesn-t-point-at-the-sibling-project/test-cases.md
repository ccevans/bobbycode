# Test Cases — TKT-087

## TC1 — unknown option prints that subcommand's help (AC 1, error path)
**Steps:** `node bin/bobby.js ticket create --bogus -t x`.
**Expected:** Exit 1. Stderr has `error: unknown option '--bogus'`, followed by `Usage: bobby ticket create [options]` and the option list (e.g. `--found-in <id>`). No ticket is created.

## TC2 — every depth, not just ticket (AC 1)
**Steps:** (a) `bobby brief --bogus`. (b) `bobby ticket move TKT-001` (missing `<alias>`). (c) `bobby project use` (missing `<name>`, studio command group).
**Expected:** Each exits 1, and stderr shows that command's `Usage: bobby <path> ...` after the error.

## TC3 — help on success paths is unchanged
**Steps:** `bobby` (no args), `bobby ticket create --help`, and `bobby "add a health check"` (front door).
**Expected:** Root help is the same as before (the ESSENTIAL list plus the footer). `--help` exits 0. The front door still routes to `do` (the output shows routing, not an unknown-command error).

## TC4 — generated CLAUDE.md has the cheat sheet (AC 2, read path)
**Steps:** Scaffold a project (`scaffoldProject`) and read CLAUDE.md.
**Expected:** It contains `## Ticket command flags`, `--parent`, `--epic`, `--repos`, `-a <your agent name>`, `--size xs|s|m|l|xl`, `--workflow`, `--found-in`, and the move aliases including `reject` and `unblock`. The section sits between `## Stay in the ticket` and `## Workflows`.

## TC5 — the cheat sheet only names real flags (drift guard)
**Steps:** Collect the flags from the rendered section and compare them with the commander options of `ticket create`, `ticket move` and `ticket comment` (built in-test via `registerCreate`/`registerMove`/`registerComment`).
**Expected:** Every flag in the cheat sheet exists on its command. Rename a flag in a scratch copy of the test's expectations to prove the assertion fails.

## TC6 — studio render adds --project, plain render doesn't
**Steps:** Render with `studio: 'S'`, then without it.
**Expected:** The studio render has `--project <name>` in the create bullet. The plain render has no `--project`.

## TC7 — --repos naming a sibling project gets the hint (AC 3, error path)
**Preconditions:** A tmp studio with repo `app` and projects `robinflow` (repos `[app]`, prefix RF) and `robin-ops` (prefix RO).
**Steps:** `bobby --project robinflow ticket create -t "ops job" --repos robin-ops`.
**Expected:** Exit 1. Stderr has `robin-ops is its own project: file it with --project robin-ops` and does not have `Ticket repos not in project`. `.bobby/robinflow/tickets/` holds no new folder.

## TC8 — a truly unknown repo keeps the current error (AC 3)
**Steps:** `bobby --project robinflow ticket create -t x --repos nope`.
**Expected:** Exit 1. Stderr is `Ticket repos not in project 'robinflow' (app): nope`, with no `--project` hint.

## TC9 — mixed sibling and unknown
**Steps:** `--repos robin-ops,nope`.
**Expected:** Exit 1. Both lines print: the `robin-ops` hint, and the not-in-project error listing only `nope`.

## TC10 — a valid repo still files (write path)
**Steps:** `bobby --project robinflow ticket create -t ok --repos app`.
**Expected:** Exit 0, and the new ticket's frontmatter has `repos: [app]`.

## TC11 — following the hint works end to end
**Steps:** After TC7, `bobby --project robin-ops ticket create -t "ops job"`.
**Expected:** Exit 0, and `RO-001--ops-job` is created under `.bobby/robin-ops/tickets/`.
