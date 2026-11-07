---
id: TKT-087
title: >-
  CLI friction: bad options print no help, agents lack a flag cheat sheet,
  --repos error doesn't point at the sibling project
stage: building
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
updated: '2026-11-07'
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
