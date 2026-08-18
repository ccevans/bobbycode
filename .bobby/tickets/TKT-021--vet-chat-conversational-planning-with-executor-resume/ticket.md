---
id: TKT-021
title: 'Vet chat: conversational planning with executor --resume'
stage: done
type: feature
priority: medium
area: orchestrator
author: unknown
assigned: bobby-build
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-020
created: '2026-08-07'
updated: '2026-08-18'
---

## Description

Planning happens in one shot today: an agent runs, writes plan.md, exits. There
is no way to talk to it — to push back on an assumption or redirect before it
commits.

Add conversational planning: executor `--resume` for continuity, a ChatManager
holding sessions, plan permission mode so it cannot write while you are still
arguing, and `.bobby/chats.json` for persistence.

## Acceptance Criteria

- [ ] A planning conversation can be continued across turns via executor --resume
- [ ] Chat sessions persist and survive an app restart
- [ ] The agent cannot write files while in plan permission mode
- [ ] The resulting plan can be committed to the ticket in one action

## Comments
- [2026-08-18] bobby-ship: Merged to main in d482401 via PR #12 (https://github.com/ccevans/bobbycode/pull/12). CI green on Node 18/20/22.
- [2026-08-17] bobby-ship: PR created: https://github.com/ccevans/bobbycode/pull/12 (with TKT-022). Awaiting manual merge. NOT moved to done: CI is red on the PR — 3 failures in test/lib/project.test.js, pre-existing on main since a3fe211 and unrelated to this ticket. Filed as TKT-072.
- [2026-08-15] bobby-test: Passed: all 4 ACs verified through the live running server (curl + PATH-shimmed fake executor capturing real spawn args) — evidence in test-evidence/results.md. Live: 5 chat endpoints + sane shapes/501-vs-404; plan-mode turns spawn with --permission-mode plan and write no plan.md (AC#3); --resume threads the captured session id on turn 2 (AC#1); chat survives a real server restart via .bobby/chats.json (AC#2); commit drops plan mode, --resume continues, plan.md lands (AC#4). Confirmed reviewer concern #3 live (commit reports idle/success even when the agent wrote no plan.md — non-blocking, worth a v1 follow-up). Long-turn POST blocks for the full turn (~4.2s) and returns the updated chat.
- [2026-08-15] bobby-review: Approved with notes: resume capture/threading, plan-mode wiring, .bobby/chats.json persistence, and one-action commit all correct and well-tested (1233 pass, lint clean). Custom chat exit handler verified to not leak registry/denial-counter/lock state. Notes for tester: verify plan mode truly blocks writes live (AC#3), multi-turn --resume context, and long-turn behavior over the blocking POST on bobby remote.
- [2026-08-15] bobby-build: Built: ChatManager + executor --resume + plan permission mode + .bobby/chats.json + /api/chats routes. All 4 ACs covered; full suite green (1233 passed), lint clean.
