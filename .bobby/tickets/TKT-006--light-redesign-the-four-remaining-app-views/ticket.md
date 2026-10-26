---
id: TKT-006
title: 'Light redesign: the four remaining app views'
stage: done
type: epic
priority: high
area: ui
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

The Feature view was redesigned to the "Track to finish" spec and the app-wide
tokens were converted to light (bobbycode-pro 5aba430). The other four views —
Home, Board, Ticket, Workspace — were designed for the old dark control-room
theme. They now *inherit* the light tokens and are readable, but none of them
has been designed for light.

That leaves the app looking half-converted: one screen with a point of view and
four that merely survived a palette swap. This epic finishes the conversion.

The spec is `.bobby/design/design-spec-feature-view.md`. It is binding — copy values from it,
never retype from memory. The rule that governs all four: cards are for
CHOOSING between things, never for displaying status; status lives in bare rows
on the ground.

## Acceptance Criteria

- [ ] Home, Board, Ticket and Workspace each redesigned to the spec
- [ ] No card-around-status anywhere; no tinted row fills; no left-border stripes
- [ ] All four pass the slop checklist and an independent bobby-design-check
- [ ] Type floor 13px, text AA, meaningful graphics >=3:1, tap targets >=44px
- [ ] No horizontal scroll at 375/390/768/1440 on any view

## Comments
