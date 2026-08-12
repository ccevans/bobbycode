---
id: TKT-068
title: >-
  Converge feat/bobby-app and feat/workspace-projects — the app and the studio
  are on unmerged branches, neither has the other's code
stage: planning
type: task
priority: critical
area: null
author: unknown
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-020
feature: null
persona: null
created: '2026-08-12'
updated: '2026-08-12'
---

## Description

The prerequisite nobody filed. Two lines of work forked and never merged, and
the divergence is now load-bearing:

- **feat/workspace-projects** — the studio: repo groups, projects, per-repo
  targeting (`lib/skills.js` `repoTargetingClause`, `resolveRepoPath`),
  `lib/decisions.js`, and the pro board. This is the branch that knows about
  more than one repo.
- **feat/bobby-app** — the app the user actually runs: the newer orchestrator
  (`lib/dashboard/actions.js`, `main-checkout-lock.js`), the full API
  (`/api/tickets/:id`, `/api/config`, `/api/ideas`), the design work. This is
  the branch that knows how to drive agents from a phone.

Verified 2026-08-12: `feat/bobby-app` has NO `lib/skills.js` (no studio code at
all); `feat/workspace-projects` HAS the orchestrator but its orchestrator
resolves zero repos. So neither branch can do what the user asked — the studio
brain and the app body are on different branches.

Every symptom this session traces here:
- TKT-023's ship confusion — ticket on the bobbycode board, code in
  bobbycode-pro, orchestrator single-repo.
- `/api/config`, `/api/ideas`, `/api/tickets/:id` 404ing depending on which
  branch hosted the phone — those routes exist on one branch, not the other.

This is a real merge with real conflicts (both touched `lib/dashboard/*`,
`commands/app.js`, `.bobby/`), so it is its own ticket, done carefully, before
TKT-069 can build on a single trunk. It gates the whole "app works on all repos"
goal — there is no one place to build it until this lands.

## Acceptance Criteria

- [ ] One branch carries both the studio helpers and the latest app orchestrator
- [ ] The full API surface survives the merge (no route regresses to 404)
- [ ] The studio's per-repo targeting is present in the merged tree
- [ ] `npm test` green on the merged branch
- [ ] The app launched from the studio root reads the studio board
