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
updated: '2026-11-08'
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
- [2026-11-08] system: Unblocked
- [2026-11-08] system: Decision needed (CC): code matches plan + all ACs as written, tests/lint green, but the unknown-prefix error breaks legacy TKT- IDs in the real studio. About 183 open TKT- tickets sit on robinflow/listrobin/robinoffer/sam/bobbycode-site boards and no project's config prefix is TKT, so 'bobby ticket view TKT-491' worked before and now exits 1. Choose: (1, recommended) resolve an unowned prefix by exact-ID lookup across boards: one board has it -> that project, else an explicit error naming the boards; (2) fall through to the cwd/active-project rungs (a fallback, needs approval); (3) keep it, legacy IDs need --project. See review.md.
- [2026-11-08] bobby-review: Blocked: code matches the plan, all 7 ACs as written, 144 impacted tests + lint green. But the unknown-prefix error breaks the about 183 open legacy TKT- tickets on the robinflow-studio boards (no project's config prefix is TKT): 'bobby ticket view TKT-491' worked before and now exits 1. CC must choose how unowned prefixes resolve. See review.md.
- [2026-11-07] scope-check: Scope check: out of plan — test/lib/template.test.js
- [2026-11-07] bobby-build: Built: project inference (b5c04b9 on tkt-084-project-inference). Full suite: 1924 passed, 51 skipped, 1 failed (e2e lifecycle 'reclaims its worktree', a shared /tmp/bobby-wt/TKT-001-ticket collision with the parallel builds; passes 23/23 on rerun). Note: the studio-owned robinflow-campaign-launch skill still tells agents to run 'bobby project use' (outside this repo, not edited).
