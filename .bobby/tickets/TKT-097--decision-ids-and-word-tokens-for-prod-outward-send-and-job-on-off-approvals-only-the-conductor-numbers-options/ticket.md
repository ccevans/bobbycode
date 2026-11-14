---
id: TKT-097
title: >-
  Decision IDs and word tokens for prod, outward-send and job on/off approvals;
  only the Conductor numbers options
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

Every session numbers options 1/2, with the state-changing one first, and the same decision gets renumbered across sessions. Bare replies then reach prod. On 11-14 Intel Conductor shipped listrobin-ui #1757 on a bare "1" that answered Conductor 6's list, where 1 meant the opposite: 129 robinoffer pages were noindexed, then reverted (#1758). Conductor 5 shipped RF-1913 on "1" then "2" nine seconds apart, and 125 sends went out in draft wording. Conductor 4 ran a prod copy seed on "1" when the prompt had asked for "go".

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] Every decision ask gets a unique ID (e.g. D-41) owned by one session, and it is never renumbered when forwarded
- [ ] Prod writes, outward sends and job load/unload act only on "<ID> <word>" (e.g. "D-41 ship")
- [ ] A bare digit, two different answers in a row, or an answer more than 60 min after the ask gets a one-line echo of the exact action and no action
- [ ] Lane reports contain no numbered decision blocks; lanes send asks to the Conductor in words

## Comments
