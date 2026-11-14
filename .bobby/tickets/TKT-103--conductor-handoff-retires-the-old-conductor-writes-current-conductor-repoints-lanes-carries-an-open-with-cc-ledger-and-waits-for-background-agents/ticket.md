---
id: TKT-103
title: >-
  Conductor handoff retires the old Conductor, writes current-conductor,
  repoints lanes, carries an open-with-CC ledger, and waits for background
  agents
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

Handoffs lose work at every Conductor boundary. From Conductor 3 to 4, the Threads restart, Founding 100 delivery, the copy-approval promise and the waiting list were dropped. The old Conductor 5 kept posting for 78 min after handoff, and lanes reported to dead Conductors. Background agents were orphaned by handoffs and reported to capped sessions.

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] Handoff stops the old Conductor and writes a `current-conductor` file that lanes and Intel sessions read
- [ ] Every live lane is repointed at takeover
- [ ] An open-with-CC ledger holds every decision, promise and 'I'll check'; the successor's first message lists all open rows; a row closes only with a quoted CC answer
- [ ] Handoff refuses while background agents run, or writes their ids and output paths into progress.md for the successor

## Comments
