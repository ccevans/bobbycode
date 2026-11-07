---
id: TKT-075
title: >-
  Scope check counts files a plan names only as out of scope or do-not-touch as
  in plan
stage: backlog
type: improvement
priority: medium
area: null
author: bobby-review
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
found_in: TKT-074
feature: null
persona: null
created: '2026-10-25'
updated: '2026-10-25'
---

## Description

[What is this ticket about? Provide enough context for an engineer to understand the problem or feature.]

## Acceptance Criteria

- [ ] [First criterion]
- [ ] [Second criterion]
- [ ] [Third criterion]

## Comments
- [2026-10-25] bobby-review: lib/scope-check.js planFileCheck (line ~70) treats a changed file as named when its path appears ANYWHERE in plan.md (plan TKT-074 decision 3, by design). Plans routinely name files in Out of scope / overlap / do-not-touch sections, so exactly the drift the check exists for reads as clean. Repro: run planFileCheck on TKT-074's own plan.md with ['README.md','commands/init.js','lib/workflow.js'] — all three come back named, outOfPlan [], though the plan says not to touch them. Also a basename substring hit: changed 'a.js' counts as named by 'lib/a.js'. Warn-only, so no pipeline breaks, but the check prints a green 'all N changed file(s) are named in plan.md' and writes no comment, which the review skill tells reviewers to rely on. Options for product: match only inside the Files section plus step checklists, or exclude sections headed Out of scope/Overlap, or require a path boundary before the match.
