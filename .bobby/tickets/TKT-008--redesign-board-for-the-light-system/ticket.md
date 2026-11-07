---
id: TKT-008
title: Redesign Board for the light system
stage: done
type: feature
priority: high
area: ui
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-006
created: '2026-08-07'
updated: '2026-08-07'
---

## Description

The Board inherits light tokens and is readable, but its cards, lane headers
and the Features section were composed for the dark theme. Stage lamps went
binary (blue = in motion, grey = settled) in the conversion, so the lane colour
language needs rethinking rather than just re-tinting.

## Acceptance Criteria

- [ ] Lanes and cards redesigned for light; no per-card status stripe
- [ ] The Features section reads as distinct from plain ticket lanes
- [ ] Stage is legible without relying on colour alone
- [x] Single 440px column at every width. The >=900px kanban grid is DELETED:
      the spec binds the app column to 440px centred at any width, and a lane is
      now one container of bare rows (a vertical register, not a kanban). Cost
      recorded: at 1440 the page is ~1568px tall in a 440px column, so most of
      the board sits below the fold.

## Comments
