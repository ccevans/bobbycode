---
id: TKT-013
title: Merge timestamps on child tickets so rows can say "merged 2h ago"
stage: backlog
type: improvement
priority: low
area: api
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
created: '2026-08-07'
updated: '2026-08-07'
---

## Description

Ticket rows in the Feature view show `Done · merged` where the design calls for
`Done · merged 2h ago`. Child tickets carry a date-only `updated` field in
frontmatter, so there is no time to render.

Record a merge timestamp when a workspace merges, and surface it so rows can
show a relative time.

## Acceptance Criteria

- [ ] A merge timestamp is recorded when a workspace merges
- [ ] Feature ticket rows render a relative time for merged children
- [ ] Tickets merged before this change degrade gracefully (no 'Invalid Date')

## Comments
