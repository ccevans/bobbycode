---
id: TKT-083
title: >-
  ticket create numbers tickets from a stale board: a checkout behind origin
  hands out IDs origin already used
stage: done
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
size: m
created: '2026-11-07'
updated: '2026-11-08'
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

- [ ] `bobby ticket create` in a checkout whose upstream is ahead refuses, names the commit count and the upstream branch, and creates nothing (no folder, no counter change). "Ahead" counts upstream commits that touch the board directory; code-only commits don't block (plan.md decision 1)
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
- [2026-11-08] user: Re-review blocker fixed by orchestrator in 8e75dfa: refusal now says tickets probably moved to the merged-into branch and gives 'git branch -u <remote>/<branch> && git pull --rebase' with <branch> literal; --unset-upstream and re-point-at-deleted suggestions removed; both tests now assert the new text and the absence of the old. Reviewer had already run this recovery (re-point -> 1 behind -> pull -> TKT-006). board-upstream+create 25/25; npm test 1923 passed, 51 skipped, 0 failed. Live test to follow the message literally.
- [2026-11-08] system: REJECTED: Fix for deleted upstream works (refuses, keeps tracking ref, brief shows unknown; never-pushed still no upstream; LC_ALL=C fine). BLOCKING: the refusal message at lib/board-upstream.js:111 prints a way out that loops or recreates the incident. (1) 'git branch -u origin/feat' re-points at the deleted branch: git accepts it (tracking ref exists), retry fails identically. (2) 'git branch --unset-upstream' then retry -> 'Created TKT-001' while origin/main holds TKT-001..005, the exact duplicate. Fix (message + tests only): say the tickets likely moved to another branch (often the merge target) and to point the board there and pull: 'git branch -u <remote>/<branch> && git pull --rebase', with <branch> a literal placeholder (do not interpolate up.remoteBranch); drop the --unset-upstream suggestion. Update create.test.js and board-upstream.test.js to assert the new text and that it contains neither 'git branch -u origin/feat' nor '--unset-upstream'. Details: review.md Re-review section.
- [2026-11-07] system: REJECTED: Blocking: lib/board-upstream.js:105-108 treats 'couldn't find remote ref' as no upstream AND runs update-ref -d on the local tracking ref (not in the plan). Never-pushed (no tracking ref) is fine. But for a DELETED remote branch (tracking ref present, e.g. feat merged into main then deleted) this silently disables the guard and erases the nextId floor. Reproduced: A on feat with refs/remotes/origin/feat holding TKT-001..005 (also on origin/main), origin/feat deleted -> 'bobby ticket create' prints Created TKT-001, exit 0, and the tracking ref is gone. That is the exact duplicate-ID incident, and per CC's no-fallbacks rule it is a silent substitute. brief also deletes the ref via boardFreshness. Fix: when the remote ref is missing and a tracking ref exists, throw an explicit error naming the label/remote and the way out (git branch -u <remote>/<branch> or --unset-upstream), without deleting the ref (brief shows it as 'unknown'). Keep never-pushed = no upstream. Add a test: tracking ref exists + remote branch deleted -> create exits 1 and the ref survives. Non-blocking: set LC_ALL=C in git()'s env so the English stderr regexes (couldn't find remote ref, LOCK_RE) work under translated git. Everything else passed: ACs 1-3 and 5-7, shared-file limits, 176/176 impacted specs, lint clean. Full review in review.md.
