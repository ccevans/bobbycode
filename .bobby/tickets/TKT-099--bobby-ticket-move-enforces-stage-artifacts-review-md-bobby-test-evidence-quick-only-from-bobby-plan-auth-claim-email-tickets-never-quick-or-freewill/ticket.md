---
id: TKT-099
title: >-
  bobby ticket move enforces stage artifacts (review.md, bobby-test evidence);
  quick only from bobby-plan; auth/claim/email tickets never quick or freewill
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

Stages are faked or skipped on prod ships: back-to-back `bobby ticket move` calls, `workflow: quick` set by script, testing with no test agent. Examples: RF-1914, RF-2033, RF-2016 (43 files, no review, never rendered), RF-2015, RF-2060. RF-2078 loosened account claim with no security stage. RF-2071's acceptance criterion was edited so the build passed review.

Source: Bobby session evals 2026-11-14 (studio branch intel-conductor, `.bobby/handoffs/2026-11-14-bobby-session-evals.md`), 38 session digests judged by Fable 5.2 at CC's request.

## Acceptance Criteria

- [ ] Moving to testing fails without review.md from a bobby-review run
- [ ] Moving to shipping fails without test-evidence/results.md written by a bobby-test run
- [ ] `quick` can only be set by bobby-plan sizing; a hand edit is rejected
- [ ] Tickets touching auth, claim, verification, mailers or follow-up rules get `secure` or `default` and can't run quick or freewill without a CC comment
- [ ] Two moves on one ticket within 60 s are refused
- [ ] Changing an acceptance criterion requires a CC comment on the ticket

## Comments
