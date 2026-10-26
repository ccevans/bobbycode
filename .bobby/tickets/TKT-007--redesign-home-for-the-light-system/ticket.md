---
id: TKT-007
title: Redesign Home for the light system
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

Home is the screen the app opens on: needs-you queue, the one "do this next"
action, and what the team is doing. It still carries dark-theme structure —
notably a three-button action row that wraps awkwardly at 390px and the
`.attn-card` treatment that lost its amber gradient in the conversion.

Redesign it in the light system so the needs-you moment reads as clearly as the
Feature view's does.

## Acceptance Criteria

- [ ] Needs-you queue redesigned; the waiting item is unmistakable at a glance
- [ ] The three-button action row works at 390px without wrapping
- [ ] Running agents show live state without a pulsing dot (retired by the spec)
- [ ] Matches the spec's tokens, radii and type scale

## Comments
