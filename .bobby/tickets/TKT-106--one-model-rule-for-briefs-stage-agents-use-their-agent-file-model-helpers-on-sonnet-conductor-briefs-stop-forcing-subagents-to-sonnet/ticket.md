---
id: TKT-106
title: >-
  One model rule for briefs: stage agents use their agent-file model, helpers on
  Sonnet; Conductor briefs stop forcing subagents to Sonnet
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

Conductor briefs say "subagents on sonnet", which overrides the Opus setting in the plan, review and freewill agent files. That happened in every funnel and Intel session. It also conflicts with the studio memory 'subagents-on-opus' ("stage agents use their own agent-file model"). Lanes need one rule.

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] The Conductor brief template says: stage agents run on their agent-file model, helpers on Sonnet
- [ ] No Bobby skill or brief passes a model override to a bobby-* stage agent

## Comments
