---
id: TKT-078
title: >-
  Nothing keeps the global bobby checkout on current main: ship merges but never
  fast-forwards the checkout the npm link serves, so every session drifts onto
  stale or branch code
stage: backlog
type: improvement
priority: medium
area: null
author: bobby-plan
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
found_in: TKT-076
feature: null
persona: null
created: '2026-10-26'
updated: '2026-10-26'
---

## Description

[What is this ticket about? Provide enough context for an engineer to understand the problem or feature.]

## Acceptance Criteria

- [ ] [First criterion]
- [ ] [Second criterion]
- [ ] [Third criterion]

## Comments
- [2026-10-26] bobby-plan: Seen while planning TKT-076. /usr/local/bin/bobby -> /usr/local/lib/node_modules/bobbycode -> ~/Repos/bobbycode -> ~/Repos/bobby/repos/bobbycode, a checkout parked on integrate/app-studio and 18 behind its own origin; its local main is 76 behind. TKT-076 moves it to main once by hand. Nothing keeps it there: bobby-ship merges PRs but never fast-forwards the checkout backing the global link, and BOB-154 (lib/self-link.js inspectGlobalLink) only warns when a repo add would move it. Proposal: after a merge to main, bobby-ship (or a 'bobby doctor'-style check using inspectGlobalLink) reports when the linked checkout is not on main or is behind origin/main, and prints the exact git -C <dir> checkout main && git -C <dir> merge --ff-only origin/main. Report only; no auto-checkout of a checkout someone may be using. Also the M4 has its own global install that TKT-076 does not touch.
