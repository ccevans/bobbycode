---
id: TKT-084
title: >-
  Studio project is one shared active-project file: worktrees can't see it and
  parallel sessions clobber it; infer it from the ticket ID and folder
stage: building
type: bug
priority: high
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
size: m
created: '2026-11-07'
updated: '2026-11-07'
---

## Description

Found in the 2026-11-07 session review. Agents ran `bobby project use robinflow` 25 times in 2 weeks, usually prefixed to every command. A studio git worktree (worktrees/newsletter-v2-tickets) failed with "Select a project", because `.bobby/active-project` is gitignored and `resolveActiveProject()` (lib/config.js) reads it only from the worktree's own root. The file is also shared by every session in a studio, so one session switching project switches it for all of them.

Plan direction (approved): new precedence in `resolveActiveProject`:
explicit `--project` > `BOBBY_PROJECT` > ticket-ID prefix in argv (e.g. RF-1334 -> the studio project whose prefix is RF) > cwd under `worktrees/<project>/` > `.bobby/active-project` read from the MAIN worktree root (findMainWorktreeRoot) > sole project > null (the existing actionable error).
Prefix inference happens once in bin/bobby.js before dispatch. If a prefix matches no project, or matches more than one, that is an explicit error, not a guess. Update the shipped agent and skill text that tells agents to run `bobby project use` first.

## Acceptance Criteria

- [ ] `bobby ticket view RF-1334` resolves robinflow from any directory inside the studio (root, repos/<repo> without its own .bobbyrc.yml, worktrees/...) with no active-project file and no env var
- [ ] Inside a studio git worktree, commands see the main checkout's active-project
- [ ] cwd under worktrees/<project>/... selects that project
- [ ] --project and BOBBY_PROJECT still win over inference
- [ ] Unknown or ambiguous prefix is an explicit error naming the projects
- [ ] Shipped templates no longer instruct a `bobby project use` prefix before ticket commands
- [ ] Unit tests cover each precedence rung

## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]

## Comments
