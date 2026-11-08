---
id: TKT-087
title: >-
  CLI friction: bad options print no help, agents lack a flag cheat sheet,
  --repos error doesn't point at the sibling project
stage: done
type: improvement
priority: low
area: null
author: CC Evans
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
found_in: null
feature: null
persona: null
size: s
created: '2026-11-07'
updated: '2026-11-08'
---

## Description

Found in the 2026-11-07 session review. Agents ran `bobby ticket create --help` at least 7 times, and guessed flags that don't exist (`ticket move --by`). A bad option prints only `error: unknown option` because bin/bobby.js sets showSuggestionAfterError but not showHelpAfterError. `--repos robin-ops` on a robinflow ticket fails with "Ticket repos not in project", although robin-ops is its own studio project.

Plan direction (approved):
- bin/bobby.js: add `program.showHelpAfterError()`, applied to subcommands too.
- templates/CLAUDE.md.ejs: a short flag cheat sheet for ticket create (--parent, --epic, --repos, -a, --size, --workflow, --found-in) and move aliases.
- commands/create.js: when a rejected repo name is a studio project, say "<name> is its own project: file it with --project <name>".

## Acceptance Criteria

- [ ] An unknown option on any subcommand prints that subcommand's help after the error
- [ ] Generated CLAUDE.md includes the ticket-create flag cheat sheet
- [ ] --repos naming a sibling studio project gets the --project hint; a truly unknown repo keeps the current error
- [ ] Tests for the create error message and a CLI help-after-error check

## Comments
- [2026-11-08] user: Re-review (orchestrator): aeb643a is the one-line env fix the review asked for (test/commands/create.test.js only). create.test.js 12/12 with BOBBY_PROJECT=bobby and 12/12 without. Approved; ship after or with TKT-084.
- [2026-11-07] system: REJECTED: Non-hermetic tests: test/commands/create.test.js:117, the studio --repos 'create' helper, spawns bin/bobby.js with the inherited env. bin/bobby.js:120 splices --project only when BOBBY_PROJECT is unset, and the studio dashboard sets BOBBY_PROJECT on every agent it launches (lib/dashboard/orchestrator.js:730; this repo is studio project 'bobby'). Repro: BOBBY_PROJECT=bobby NODE_OPTIONS=--experimental-vm-modules npx jest test/commands/create.test.js -t 'studio --repos' gives 5 failed (error: unknown option '--project'). Fix: pass env: { ...process.env, BOBBY_PROJECT: '' } (or delete the key) to that spawnSync, like test/lib/studio.test.js:23, then re-run with BOBBY_PROJECT=bobby set to prove it. Everything else is approved: all 4 ACs met, TC3 hand-verified (root help, ticket create --help and the NL front door are byte-identical to origin/main), shared-file limits respected. Details: review.md
