---
id: TKT-085
title: >-
  Ticket ownership and handoffs live in memory notes: record owner session and
  machine, add bobby ticket handoff
stage: testing
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
updated: '2026-11-08'
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
- [2026-11-08] bobby-review: Approved with notes (round 2): all three round-1 blockers closed by d945e35, each with a test that fails against the pre-fix assign.js. Notes: rerun after a failed commit records 'from <to> to <to>'; gitignored-dir hint wording; handoff commits the whole ticket folder.
- [2026-11-07] system: REJECTED: 1) Handoff commit sweeps in unrelated STAGED files: commands/assign.js:104 uses autoSync, and lib/auto-sync.js:46 runs 'git commit' with no pathspec, so the whole index is committed (repro: git add src.js, then a filled handoff commits src.js under bobby: auto-sync). test/commands/assign.test.js:99 uses an UNTRACKED file, so it passes without scoping. Fix: 'git commit --only -m ... -- <paths>' in auto-sync.js:46, plus a pre-staged test in test/lib/auto-sync.test.js and in TC6 (also assert the file is still staged). 2) A failed commit is swallowed: autoSync catches everything (auto-sync.js:48), and handoff prints success with exit 0 and nothing committed (repro: .git/index.lock present). Have autoSync return whether it committed and make handoff exit 1 with an explicit 'owner updated but not committed: <git error>' message, with a test. 3) commands/assign.js:92: --machine '' is silently stored as null. Error like --session/--to do, with a test. Full detail in review.md.
- [2026-11-07] bobby-build: Built: owner on assign --session, bobby ticket handoff, brief grouping, shared skill text. Specs: test/lib/owner.test.js, test/commands/assign.test.js, test/commands/brief-owners.test.js, test/lib/brief.test.js (44 pass). Full suite 1928 pass, 51 skipped. Branch tkt-085-ownership-handoff pushed.
