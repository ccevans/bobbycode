---
id: TKT-085
title: >-
  Ticket ownership and handoffs live in memory notes: record owner session and
  machine, add bobby ticket handoff
stage: building
type: feature
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

Found in the 2026-11-07 session review. Who owns which ticket across sessions and machines lived in memory notes (rf-956-owner.md, rf-1206-owner.md, onboarding-session-ownership.md) and hand-written handoff files (RF-1206 HANDOFF-intel.md, RF-1256 handoff-luxury.md). `assigned:` is static, and run.lock (BOB-120) is a per-machine live claim that is gitignored, so neither answers "which session on which machine owns this".

Plan direction (approved):
- Ticket frontmatter gains `owner: {session, machine, since}`. Set it with `bobby ticket assign <id> <name> --session <session-name>`. Machine comes from the OS computer name (`scutil --get ComputerName` on macOS, hostname elsewhere).
- New `bobby ticket handoff <id> --to <session>` writes a standard progress.md (Where it stopped / Branch and commit / Unpushed patches / Resources held / Open decisions for the human / Next step), sets the owner to the new session, and auto-syncs the ticket. Refuse if any section is left as a placeholder.
- `bobby brief` groups owned, in-flight tickets by machine and session.
- Update the shared skill text so agents hand off with this command instead of writing memory notes.

## Acceptance Criteria

- [ ] `bobby ticket assign --session` writes owner.session, owner.machine and owner.since without disturbing `assigned`
- [ ] `bobby ticket handoff` writes progress.md with all six sections, refuses unfilled placeholders, and updates the owner
- [ ] `bobby brief` lists in-flight tickets grouped by machine and session
- [ ] bobby-shared skill/learnings text points agents at the handoff command
- [ ] Tests cover assign --session, handoff happy path and placeholder refusal, and brief grouping

## Comments
