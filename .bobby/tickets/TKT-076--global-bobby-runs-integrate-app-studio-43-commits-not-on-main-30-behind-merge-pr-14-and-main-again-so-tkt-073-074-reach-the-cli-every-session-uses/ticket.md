---
id: TKT-076
title: >-
  Global bobby runs integrate/app-studio (43 commits not on main, 30 behind):
  merge PR #14 and main again so TKT-073/074 reach the CLI every session uses
stage: building
type: bug
priority: high
area: null
author: claude-main
assigned: bobby-plan
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
found_in: TKT-074
feature: null
persona: null
created: '2026-10-26'
updated: '2026-10-26'
---

## Description

The global `bobby` (`/usr/local/bin/bobby` -> `~/Repos/bobbycode` -> `~/Repos/bobby/repos/bobbycode`) runs a checkout parked on `integrate/app-studio` (PR #14). That checkout is 18 behind its own origin, and it is missing main's TKT-073 (Workflow scripts) and TKT-074 (stay in the ticket). Meanwhile main lacks app-studio's 61 commits (BOB-120 claims, BOB-123 refresh preservation, BOB-135 model per stage, codex/opencode/copilot/agents-md targets and executors). Converge the two into one branch (main, via PR #14), run the full suite, and point the global CLI at main. The one-board question (TKT vs BOB) is CC's decision and is carried by TKT-079. This ticket leaves the board as main has it.

## Acceptance Criteria

- [ ] AC1: The merge keeps every file under `.bobby/` and `.bobbyrc.yml` as on main (app-studio's deletion is not applied), and `bobby ticket view TKT-074` resolves from the repo root.
- [ ] AC2: TKT-073 and TKT-074 behaviour and app-studio behaviour coexist. Claims block both the prompt and Workflow-script paths of `bobby run`, and `--found-in` and `--size` both persist. Leaving building runs the scope check, and done reclaims the worktree.
- [ ] AC3: The continue-builder/SendMessage loop and workflow scripts reach only claude-code with the `claude` executor, never codex, opencode, copilot, agents-md, cursor, cline or a custom binary. Stage-agent prompts carry no model override. Merged skill templates carry both sides' rules.
- [ ] AC4: Full suite and lint pass on the converged branch (0 failed, 0 lint errors), including the target-matrix and scope-rule-template suites.
- [ ] AC5: PR #14 is merged into main with a merge commit, and both pre-merge tips are ancestors of origin/main. No force-push anywhere.
- [ ] AC6: A new shell's `bobby` resolves to a checkout at origin/main (shows `--found-in` and `--size`). Long-running bobby processes are restarted, and the rollback command is recorded.

## Comments
- [2026-10-26] bobby-plan: Planned. Size L, workflow default (plan, build, review) then ship. Approach A: merge origin/main into tkt-076-converge off origin/integrate/app-studio, review, fast-forward app-studio, then merge PR #14 into main with a merge commit. Trial merge on current tips: 11 textual conflicts (not 4). A plain merge silently deletes .bobbyrc.yml plus 242 board files (34cae69), so resolution 1 restores main's .bobby. There were 2 semantic failures (target-matrix extraPaths, freewill heading count) and 1 real cross-branch bug: SendMessage continue-builder leaks to codex/opencode dashboard executors (deny-list), fixed as an allow-list. With all 13 resolutions the trial suite ran green: 1785 passed, 0 failed, lint 0 errors. Global link: L1, move ~/Repos/bobby/repos/bobbycode to main (rollback: checkout integrate/app-studio). The board stays as main has it; the one-board decision goes to CC and TKT-079. Filed: TKT-077, TKT-078, TKT-079.
- [2026-10-26] user: Found 2026-10-25 while making TKT-073/074 live. /usr/local/bin/bobby -> /usr/local/lib/node_modules/bobbycode -> ~/Repos/bobbycode, checked out on integrate/app-studio (PR #14, open). That branch has 43 commits not on main (BOB-120 claims, BOB-123 init --refresh key preservation, BOB-024/067 studio projects, BOB-078..089 targets/executors, BOB-130/133/135) and lacks 30 on main (TKT-073 workflow scripts, TKT-074 scope rule, TKT-072). The local checkout is also 18 behind origin/integrate/app-studio. A trial 'git merge origin/main' there conflicted in .bobby/decisions.yaml, .bobby/tickets/.counter (BOB- vs TKT- boards), commands/run.js, test/lib/targets.test.js; aborted, nothing changed. TKT-068 converged the branches once; they drifted again. Needs: converge, run full suite, point the global link at main (or publish), and decide one ticket board/prefix.
