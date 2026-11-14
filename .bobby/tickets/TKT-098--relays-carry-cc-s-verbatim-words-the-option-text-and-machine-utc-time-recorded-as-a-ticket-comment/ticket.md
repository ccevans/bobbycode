---
id: TKT-098
title: >-
  Relays carry CC's verbatim words, the option text and machine UTC time,
  recorded as a ticket comment
stage: backlog
type: feature
priority: critical
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

Relays carry conclusions instead of CC's words. "whatever the plan is" was relayed as yes to three plan decisions, one never shown, and turned off three Intel jobs. "don't post" was read as "don't pause". Relays also carried guessed times: "~15:40Z" on a message that arrived at 15:16Z, and "~14:15Z" for an answer typed at 15:09Z.

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] A relayed CC decision includes the decision ID, CC's verbatim text, the option text it answers, and a machine UTC time from `date`
- [ ] The relay is written as a comment on the ticket, and lanes cite that comment
- [ ] The receiver rejects a relay whose ID is unknown or whose time is in the future

## Comments
