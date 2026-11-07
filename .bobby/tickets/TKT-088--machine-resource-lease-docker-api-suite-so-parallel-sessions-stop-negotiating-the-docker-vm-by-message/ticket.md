---
id: TKT-088
title: >-
  Machine resource lease (docker, api-suite) so parallel sessions stop
  negotiating the Docker VM by message
stage: backlog
type: feature
priority: low
area: null
author: CC Evans
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
created: '2026-11-07'
updated: '2026-11-07'
---

## Description

Found in the 2026-11-07 session review. On the Intel Mac, Oct 24-26, sessions sent about 90 peer messages negotiating one Docker VM, and a 4 h full rspec run was killed 1 h 46 m in when Docker was quit. CC chose NOT to build this now (2026-11-07). It stays in backlog in case contention returns; it is only worth doing when several sessions share one machine's Docker again.

Sketch: `bobby lease take|status|release <docker|api-suite> --for <ticket> --est <dur> --session <name>`. Per-machine leases in ~/.bobby/leases/, reusing acquireLock/readLock/isStale from lib/dashboard/main-checkout-lock.js. Expiry is est plus grace. Build, test and ship agents take the lease before compose up/stop/restart or a full suite. `bobby brief` shows holders.

## Acceptance Criteria

- [ ] Not scheduled: CC deferred 2026-11-07; revisit if multiple sessions share one Docker VM again

## Comments
