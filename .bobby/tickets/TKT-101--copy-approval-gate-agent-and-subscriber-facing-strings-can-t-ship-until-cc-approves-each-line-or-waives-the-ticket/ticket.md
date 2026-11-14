---
id: TKT-101
title: >-
  Copy-approval gate: agent- and subscriber-facing strings can't ship until CC
  approves each line or waives the ticket
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

Copy ships as "drafts for the batch" before CC sees it: RF-2005, both welcome emails, RF-1913, the RO-084/085 CTA lines, the RF-2078 error lines and the RF-2079 phone hint. The batch reached 191 lines before CC saw a page. RF-1914 cut a line CC had signed and shipped it.

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] A ticket whose diff adds or changes agent- or subscriber-facing strings can't leave shipping until each line is marked approved by CC, or CC waives that ticket by name
- [ ] Changing or cutting a CC-signed line needs a decision before ship

## Comments
