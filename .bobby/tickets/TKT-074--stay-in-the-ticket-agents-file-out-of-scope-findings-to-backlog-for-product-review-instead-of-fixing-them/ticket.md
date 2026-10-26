---
id: TKT-074
title: >-
  Stay in the ticket: agents file out-of-scope findings to backlog for product
  review instead of fixing them
stage: shipping
type: feature
priority: high
area: null
author: CC
assigned: bobby-review
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
feature: null
persona: null
created: '2026-10-25'
updated: '2026-10-25'
---

## Description

CC, 2026-10-25: "Sessions are getting off track, improving copy, fixing security bugs… we need agents to stay in scope of ticket and file bugs or tickets for product to review and prioritize." Then: "make it more permanent."

Today the scope rule exists only in pieces: freewill has a "Scope lock" paragraph, bobby-review asks "is this scope creep?" and says to file should-fix notes, bobby-test says "don't scope-creep". bobby-build, bobby-debug, bobby-ship, the design/define stages and the main session have nothing, and nothing in the CLI helps product see what agents filed. The robinflow studio wrote the rule into its own `CLAUDE.md` (below `bobby:end`) and `bobby-shared/learnings.local.md` (studio commit 71b281ae, section "Working outside the ticket"); that copy is the reference text. It only covers one project, and only as prose.

Make it part of Bobby so every project gets it and `bobby upgrade` keeps it:

1. **Shipped rule.** A "Stay in the ticket" section in the CLAUDE.md template (above `bobby:end`) and in shipped `bobby-shared`, covering: change only what the ticket needs (every file in `git diff --stat` ties to the ticket in one sentence; regressions you caused are in scope); anything else noticed is filed with `bobby ticket create` after a duplicate check, never fixed; exploitable-on-prod security is filed critical and leads the report as Decision needed; an out-of-scope blocker means file + block + stop; reports end with `Filed: <id> — <title>`.
2. **Every stage skill** that edits or judges code (build, debug, test, ship, design-build, design-check, review, freewill, plan where relevant) carries the same step at the point it applies, not just a pointer.
3. **Provenance for product review.** Agent-filed tickets must be visible as such: e.g. `bobby ticket create --found-in <ticketId>` recording where it came from (frontmatter), and `bobby brief` / `bobby triage` show "N filed by agents, awaiting product review". Product (CC) decides priority; agents never plan or move a ticket they filed.
4. **A mechanical check, not only prose.** Moving a ticket out of building (to review/test) prints the files changed on the branch that are not named in plan.md, so the reviewer and the human see drift. Planner decides warn vs block, and how to handle plans that don't list files.
5. **Review gate.** Changes outside the plan are a rejection reason in bobby-review; fix is revert + file.

Must not: change behaviour for projects' `.local` files; add a fallback; touch TKT-073's files beyond what this needs (TKT-073 is in PR #18, unmerged).

## Acceptance Criteria

- [ ] A freshly `bobby init`ed project and an upgraded one both carry the rule in CLAUDE.md (above `bobby:end`) and shipped bobby-shared; text matches the studio reference in substance
- [ ] Each stage skill listed above has an explicit scope step with the `bobby ticket create` command and the `Filed:` report line
- [ ] `bobby ticket create --found-in <id>` records the origin; unknown id is an explicit error; `bobby brief` and `bobby triage` surface agent-filed backlog tickets
- [ ] Leaving building prints out-of-plan changed files (tests cover a plan with a file list, without one, and a clean diff)
- [ ] bobby-review treats out-of-plan changes as a rejection reason
- [ ] Full test suite and lint pass; existing prompt snapshots change only where intended

## Comments
- [2026-10-25] bobby-review: Approved with notes: all 6 ACs met; 1317 tests pass, lint 0 errors; scope check verified on a scratch project for every plan shape plus fresh repo/studio root. Notes: scope-check whole-file substring matching passes files a plan names only as out-of-scope (filed TKT-075); design-check now parks its own conformance failures as awaiting product review; triage counts agent-filed epics, brief does not. Global bobby is symlinked to /Users/ccevans/Repos/bobbycode, a different checkout, which is why it printed no scope check. Filed: TKT-075.
- [2026-10-25] bobby-build: Built: --found-in on ticket create; brief/triage show agent-filed tickets (never auto-picked); lib/scope-check.js + warn-only check in ticket move; rule in CLAUDE.md template, bobby-shared and 9 stage files; CHANGELOG. Deviation: Files heading regex also accepts numbered headings (## 3. Files to modify) so planner-style plans are recognised. No existing test expectations changed. Filed: none.
