---
id: TKT-104
title: >-
  bobby conductor wake, loud failure on send to idle lanes, heartbeat for
  waiting-on-CC, and dated queue entries instead of session timers
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

Messages sent to idle lanes are not delivered (RF-1916 lost about 8 hours). The 11-11 learning did not stop it recurring on 11-14. Conductor 3 was silent about 25 hours with five decisions open. Prod work sits on session-only timers: RF-2017's Wed 11-18 flip, and the Intel Monday check.

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] `bobby conductor wake <lane>` resolves the full session id, resumes under the same lane name, delivers the message and confirms the session is working
- [ ] `conductor send` to an idle lane wakes it or fails loudly
- [ ] A heartbeat drains the Conductor inbox on an interval, and posts the waiting-on-CC list when an item is more than N hours old
- [ ] Dated ships and future checks are queue entries with a date and owner, and survive any session stop

## Comments
