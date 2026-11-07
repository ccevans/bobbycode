---
id: TKT-010
title: Windsurf target adapter (.windsurf/rules)
stage: backlog
type: feature
priority: low
area: null
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-001
created: '2026-07-31'
updated: '2026-07-31'
---

## Description

Windsurf dedicated target. Windsurf reads AGENTS.md, so generic (TKT-005)
covers rules; the dedicated delta is small:

- rules -> verify whether `.windsurf/rules/` (directory of rule files) offers
  anything AGENTS.md doesn't for Bobby's use (glob scoping?); if not, this
  adapter may legitimately collapse to paths-only differences
- commands/skills -> verify what Windsurf actually reads in mid-2026 (its
  conventions have churned); no scaffold without verification

Honest framing: this ticket's first task is a spike that may conclude
"agents-md is sufficient, close as wontfix with the evidence documented in
the support matrix." That outcome is a success, not a failure — the epic's
rule is no unverified claims, and 'covered by generic tier' is a verified
claim worth publishing.

## Acceptance Criteria

- [ ] Spike documented: what Windsurf reads today, with evidence (real
      install or shipped code)
- [ ] Decision recorded: dedicated adapter shipped OR wontfix with agents-md
      declared sufficient in the support matrix
- [ ] If shipped: matrix suite passes, wizard/registry/docs updated per the
      standard checklist

## Comments
