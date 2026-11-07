---
id: TKT-083
title: >-
  ticket create numbers tickets from a stale board: a checkout behind origin
  hands out IDs origin already used
stage: backlog
type: bug
priority: high
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
size: null
created: '2026-11-07'
updated: '2026-11-07'
---

## Description

Found in the 2026-11-07 review of past sessions. The robinflow studio checkout on the M4 was 1,147 commits behind origin/studio-sync-2026-10-22: local `.counter` 1364, origin 1708. `bobby ticket create` handed out RF-1358..RF-1364, which origin had already used; they were deleted and refiled (studio commit 7124d4aa1). The bobbycode checkout was 27 commits behind origin/main on the same day, with origin holding TKT-081/082.

Cause: `lib/counter.js` `nextId()` only guards a single disk (mkdir EEXIST, highest folder on disk). `lib/auto-sync.js` commits and never fetches, and `bobby sync --push` is opt-in. Nothing ever compares the board against origin.

Plan direction (CC approved 2026-11-07):
- `bobby ticket create`, `bobby go` and `bobby new` fetch the board's upstream branch first. When the board is behind, refuse with the count and the pull command. No silent continue. When the fetch fails (offline, no remote access), error out: no `--offline` flag, per the no-fallbacks rule. A repo with no upstream configured is not an error, because there is nothing to be behind.
- `nextId()` also reads the highest ID on the upstream tree (`git ls-tree` of the tickets dir) and never allocates at or below it.
- `bobby brief` leads with a line when the board is N commits behind.
- Out of scope: reserving numbers by pushing on create. CC deferred that until a collision happens between two up-to-date machines.

## Acceptance Criteria

- [ ] `bobby ticket create` in a checkout whose upstream is ahead refuses, names the commit count and the upstream branch, and creates nothing (no folder, no counter change)
- [ ] When upstream holds a higher ticket ID than the local counter or disk, the next ID is above upstream's highest
- [ ] A fetch failure is an explicit error naming the remote, never a silent local allocation
- [ ] A repo with no upstream branch keeps today's behaviour
- [ ] `bobby brief` shows 'board is N commits behind <upstream>' when behind and nothing when current
- [ ] Works for both a plain repo board (.bobby/tickets) and a studio board (.bobby/<project>/tickets)
- [ ] Unit tests use a local bare repo as origin; no network

## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]

## Comments
