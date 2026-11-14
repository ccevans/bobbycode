---
id: TKT-102
title: >-
  bobby-design preview gate (references + teardown before first mockup, 3
  options, known issues, design-check) and Conductor design-brief template
stage: backlog
type: feature
priority: high
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

CC called the 11-14 design rounds "pretty bad". RF-2116 round 1 had 0 references and one option, typed from code. The redo and RF-2129 wrote teardowns after building, gave 2 options, and routed around the preview registry's 3-option guard. A Conductor brief capped a round at "at most 2 options", and RF-1928's option B put back the defect. The ask was misread twice and never clarified (new look vs new flow), and no design-check ever ran.

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] A round can't register in /preview or be sent unless the ticket has references/ (≥15 images) and teardown.md committed before the first mockup commit
- [ ] Three options, each naming the references and built style it came from
- [ ] The preview message carries a 'known issues' line
- [ ] A separate bobby-design-check agent scores every option before the link goes out
- [ ] Conductor design briefs quote CC verbatim, state 'new look or new flow in the current look', and launch research → analyze → mockup → check
- [ ] One round per question; a parallel round on the same ask is refused

## Comments
