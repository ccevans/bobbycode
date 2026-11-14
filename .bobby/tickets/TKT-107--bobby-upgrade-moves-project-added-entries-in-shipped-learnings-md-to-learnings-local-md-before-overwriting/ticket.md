---
id: TKT-107
title: >-
  bobby upgrade moves project-added entries in shipped learnings.md to
  learnings.local.md before overwriting
stage: backlog
type: feature
priority: medium
area: null
author: Intel Conductor (evals 2026-11-14)
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
found_in: null
feature: null
persona: null
size: null
created: '2026-11-14'
updated: '2026-11-14'
---

## Description

`bobby upgrade` overwrote a shipped learnings.md and dropped a project-added entry ("restored 2026-11-14; lost from the shipped learnings.md on upgrade"). It was re-added by hand with `cat >>`. Other projects may have lost learnings the same way.

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] Before overwriting a shipped learnings.md, upgrade moves any entries not in the old shipped version into learnings.local.md
- [ ] Upgrade reports how many entries it moved

## Comments
