---
id: TKT-100
title: >-
  bobby-ship requires a changed-behaviour prod check and ends at shipping; only
  bobby-test closes a ticket
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

"Live" means released with no 5xx in the logs. RF-2071 was "verified" on one funnel while two others crashed on prod for about 3h20m. RF-2120, RF-2121, RF-2128, RF-2060 and RF-2068 never ran their changed behaviour on prod. A ship agent also walked and moved RF-2073 to done with "not run" cases.

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] ship.md has a 'prod check' line naming one request, page or send that exercises the diff; 'no 5xx' alone fails
- [ ] UI ships list 1440 and 390 screenshots, or state 'dark, 404 verified'
- [ ] bobby-ship ends at `shipping`; only bobby-test moves a ticket to done, and any 'not run' case keeps it open

## Comments
