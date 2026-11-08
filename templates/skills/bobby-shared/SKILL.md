---
name: bobby-shared
description: Cross-agent shared patterns and learnings loaded by all Bobby agents.
---

# Bobby Shared — Cross-Agent Reference

> This skill holds patterns and learnings that apply across all agents. All agents load `bobby-shared/learnings.md` alongside their own skill learnings before starting work.

There are no procedural steps in this skill — its value is in `learnings.md`.

## Handing off a ticket

Ownership lives on the ticket, not in memory notes or ad-hoc HANDOFF files.

- Taking a ticket: `bobby ticket assign <ID> <agent> --session "<session name>"` records owner.session, this machine and the time.
- Handing it on: `bobby ticket handoff <ID> --to "<session>" [--machine <computer>]`. The first run writes the six-section template into the ticket's progress.md. Fill every section (Where it stopped, Branch and commit, Unpushed patches, Resources held, Open decisions for the human, Next step; write "none" where nothing applies) and run it again. It refuses placeholders, sets the owner and commits the ticket.
- `bobby brief` shows in-flight tickets grouped by machine and session.

## Project overrides

Agents load `bobby-shared/learnings.local.md` alongside `learnings.md`. The first is yours and
survives upgrades; the second is shipped and is replaced. Where they disagree, yours wins.
