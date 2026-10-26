---
id: TKT-066
title: >-
  Pairings accumulate with no way to list or revoke them — one on this machine
  was 9 days old and still live
stage: backlog
type: improvement
priority: medium
area: cli
author: unknown
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
feature: null
persona: null
created: '2026-08-09'
updated: '2026-08-09'
---

## Description

`~/.bobby/remote/` on this machine tonight held three pairings:

    1d164badf1c1ea01.yml  a scratchpad project deleted weeks ago
    a2a365fdc7eed411.yml  this repo, under its pre-move path
    4367ceefc395941e.yml  this repo, current

Two were dead. One had a `bobby remote` process still attached to it after
**nine days**, pointed at an ngrok URL that had long since expired — found only
because `ps` was being read for another reason. The relay reported
`channels: 3` with one host actually connected.

There is no command that shows any of this. To answer "what can currently reach
my machine?" you read a directory of YAML by hand, and to revoke one you delete
a file. `--new-code` rotates the pairing for the project you are standing in and
says nothing about the others.

Why it matters: a pairing is a live route for running agents on this machine.
An old code someone still holds is exactly the thing a user should be able to
see and cut off, and the current answer is "know that the directory exists".

The pairing is keyed by project PATH, which is its own trap — moving a repo
silently creates a second pairing for the same project rather than following it,
which is how the duplicate above appeared.

## Acceptance Criteria

- [ ] `bobby remote --list` shows every pairing: project, channel, created, and
      whether a host is attached right now
- [ ] Dead pairings — project directory gone — are marked as such
- [ ] A pairing can be revoked by id, not by deleting a file
- [ ] A pairing whose project has moved is repaired or clearly reported, rather
      than silently duplicated
- [ ] Revoking cuts off a connected client, verified by test
