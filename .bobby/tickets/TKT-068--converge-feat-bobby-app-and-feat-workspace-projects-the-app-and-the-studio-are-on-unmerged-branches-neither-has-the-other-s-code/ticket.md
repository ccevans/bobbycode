---
id: TKT-068
title: >-
  Converge feat/bobby-app and feat/workspace-projects — the app and the studio
  are on unmerged branches, neither has the other's code
stage: done
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

## Comments
- [2026-08-12] claude: APPROVED by bobby-review (verified all 5 risk areas against both parents, re-ran the gate independently: 1146 pass). Live test passed. integrate/app-studio is now the converged trunk — the app orchestrator, the full API, and the studio (repo groups, per-repo targeting, decisions, freewill) on one branch. TKT-069 (per-ticket repo targeting) is now buildable. Follow-ups filed: TKT-070 (delete orphaned commands/dashboard.js). Reviewer's other notes non-blocking: no hasServices+hasProduct combined test (correct by construction), resolveRepoPath has no caller yet (that's the seam TKT-069 consumes).
- [2026-08-12] bobby-review: APPROVED. Reviewed merge 95d4570 (first parent 444dffd=studio HEAD, second 47af329=app) — Approach A as planned, studio is HEAD. Verified all 5 high-risk resolutions against BOTH parents, not just for absence of conflict markers, plus independently re-ran the gate (1146 pass / 46 skip / 60 suites — matches the build claim).

1) lib/workflow.js signature + call sites — CORRECT. buildSingleAgentPrompt is 7-param (agent, ticketId, ticketsDir, agentsPath, hasServices, hasProduct, nextStage). Grepped every call site and checked positions: line 374 (inside buildNextStepPrompt) passes (..., false, false, nextStageForAgent(...)) — this is the exact call the coordinator flagged, and it is fixed: the app-side original passed nextStage where hasProduct now sits, which the 7-param signature would have silently mis-slotted (nextStage lands in hasProduct, truthy string → phantom product step; real nextStage lost). Now hasProduct=false explicit, nextStage in slot 7. Lines 623 & 663 (buildPromptFor) pass (..., hasServices, hasProduct, nextStageForAgent(...)) with both vars destructured-with-default in buildPromptFor — position-correct. Confirmed studio's buildNextStepPrompt also defaulted hasProduct=false, so no slow-mode behavior regressed. STAGE_MAP carries BOTH security:'security' (app) and freewill:'building' (studio). Step numbering: step starts at 3, each of serviceHint/productHint does its own step++, so Follow/move/verify renumber correctly for any hint combo; workflow.test.js pins the hasProduct-alone case (4./3. Follow) and passes.

2) lib/dashboard/orchestrator.js — CORRECT. git diff feat/bobby-app..95d4570 on this file is EXACTLY one hunk: the hasProduct line re-threaded into _promptContext. Byte-identical to app otherwise, so app's structure (_promptContext/_launch/_runInMainCheckout/lock) is intact and nothing studio-needed was lost — app already carried the ticketsDir=main-checkout resolution (TKT-051/052), and resolveRepoPath has zero callers on the studio branch too, so taking app dropped no wired studio logic. fs and path are both imported (lines 43-44), this.repoRoot set, config.bobby_dir referenced — the rethread will not ReferenceError on a product ticket (the path tests don't exercise). hasProduct flows end-to-end: _promptContext → buildPromptFor (destructured) → buildSingleAgentPrompt slot 6.

3) Stage maps — CORRECT and consistent. tickets.js STAGE_ORDER has a rank for all 18 STAGES (verified programmatically: 18 keys, zero missing) — the invariant test 'every stage has a STAGE_ORDER rank' is present and green, the guardrail the plan relies on. brief.js STAGE_RANK/IN_FLIGHT_STAGES/NEXT_AGENT correctly spliced security in and kept studio's design entries; confirmed against studio parent that define stages were never in these two maps, so none were dropped. security's position is consistent everywhere (further-along=lower): tickets.js reviewing3<security4<building5, brief.js reviewing2<security3<building4, matching stages.js order building→security→reviewing. NEXT_AGENT security:'review'. ✓

4) .bobby/decisions.yaml — CORRECT. Parses to a bare list of 31 entries; ids are the EXACT disjoint union of both parents (2 studio + 29 app), zero duplicates, zero null ids, none in merged that were in neither parent, none in either parent missing from merged.

5) test/lib/stages.test.js — CORRECT. STAGES length assertion is 18 (the real merged count, verified) and the hardcoded toEqual array matches the merged STAGES element-for-element in order.

ACs: (1) one trunk with studio helpers + latest app orchestrator ✓; (2) full API surface — lib/dashboard/server.js is byte-identical to the app parent, all routes present (tickets/:id, config, ideas, events, brief, go, workspaces, runs, health) — no 404 regression ✓; (3) per-repo targeting present — lib/skills.js exports repoTargetingClause, lib/config.js exports resolveRepoPath, and the CLI call site (commands/run.js appending repoTargetingClause+overlayPromptClause) survived ✓; (4) npm test green — re-ran, 1146 pass ✓; (5) app/dashboard both resolve (registerApp with .alias('dashboard'), verified at runtime) ✓.

Non-blocking notes: (a) commands/dashboard.js is now orphaned — nothing imports it; app.js's .alias('dashboard') serves the old name. Dead file, safe to delete in a follow-up. (b) Test gap, not a code bug: no test exercises hasServices=true AND hasProduct=true together (the two-hint step-numbering interaction); the code is correct by construction but the interaction isn't pinned — worth one assertion. (c) resolveRepoPath is exported with no caller yet — same as studio pre-merge, it is the seam TKT-069 consumes; expected, not a merge loss. None of these block. Ready to become the trunk.
- [2026-08-12] bobby-test: Live test of the merged trunk (integrate/app-studio, real App UI, WebKit 390px, studio root with BOBBY_PROJECT=pro): app boots from the studio root serving the App; every API route 200 including /api/ideas and /api/tickets/:id (the two that 404'd on the split branches); Home renders, presence online, Board shows 25 real PRO tickets, a ticket detail opens with 2355 chars of real content (not 'not found'), Ideas view renders; ZERO page errors across the walk. This is the exact failure class from the phone session — ticket details vanishing, ideas blank — now fixed by having one trunk with the full API. Test stage substantiated; holding the stage move until review returns.
- [2026-08-12] bobby-build: Merge done on branch integrate/app-studio (commit 95d4570), isolated — feat/bobby-app and feat/workspace-projects both untouched. 11 conflicts resolved per plan.md. Gate all green: npm test 1146 pass/60 suites; every API route present (tickets/:id, config, ideas, events, go, brief); repoTargetingClause + resolveRepoPath survive; STAGES=18 (measured, not copied); app boots from studio root and reads the pro board (25 tickets). The one subtle catch: the 7-param buildSingleAgentPrompt signature silently broke an auto-merged buildNextStepPrompt call — caught and fixed. Ready for review before this becomes the trunk.
