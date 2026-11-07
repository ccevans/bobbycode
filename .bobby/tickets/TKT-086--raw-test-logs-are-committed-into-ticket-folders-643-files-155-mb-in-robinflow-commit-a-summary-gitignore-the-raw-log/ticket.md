---
id: TKT-086
title: >-
  Raw test logs are committed into ticket folders (643 files, 155 MB in
  robinflow): commit a summary, gitignore the raw log
stage: building
type: improvement
priority: medium
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
size: m
created: '2026-11-07'
updated: '2026-11-07'
---

## Description

Found in the 2026-11-07 session review. The robinflow studio git tracks 643 `.log` files (155 MB) under `.bobby/robinflow/tickets/`: full rspec and ship logs such as RF-1321 ship-rspec6.log. Every machine clones them and every status shows them.

Plan direction (approved):
- `bobby ticket attach --log <file>` keeps the raw log in a gitignored `logs/` folder inside the ticket and commits a `<name>.log.md` summary: command if known, result line, failure lines, and the last 100 lines.
- Studio and `bobby init` gitignore gain `.bobby/*/tickets/*/**/*.log` (studio) and the equivalent for a plain board.
- A one-time `bobby ticket untrack-logs` (or doc step) runs `git rm --cached` on tracked logs. Never rewrite history.
- Update the test/ship skill text: attach logs with `--log`, cite the .log.md as evidence.

## Acceptance Criteria

- [ ] `bobby ticket attach --log` writes the raw file to the ignored logs/ dir and a committed .log.md summary with result, failures and tail
- [ ] Fresh studio and init .gitignore include the ticket-log pattern; existing .gitignore files gain it on refresh without duplicating it
- [ ] Untracking existing logs uses git rm --cached only; no history rewrite
- [ ] bobby-test and bobby-ship skill text reference --log
- [ ] Tests cover the summary extraction (rspec 'Finished in'/'examples, failures' and jest 'Tests:' lines) and gitignore idempotence

## Comments
