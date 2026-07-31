---
id: TKT-009
title: 'OpenCode dashboard executor: drive opencode run'
stage: backlog
type: feature
priority: low
area: null
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-001
created: '2026-07-31'
updated: '2026-07-31'
---

## Description

OpenCode executor flavor for the dashboard: `opencode run` is a headless
non-interactive mode in the same family as `claude -p`, `cursor-agent -p`,
and `codex exec`. Fourth entry in the EXECUTORS registry.

Depends on TKT-008 (target) for resolveExecutor derivation, and on the
patterns proven in TKT-004: argv builder verified with the recording-shim
Orchestrator test, flags cited to a real CLI run (--help output committed to
the PR description), model passthrough mapped to OpenCode's provider/model
flag, permission_mode mapped to its nearest equivalent or explicitly dropped
with a comment.

Being open source, the stream format can be verified from OpenCode's own
source. parseLine is shape-agnostic so unknown event shapes degrade to text
events, but verify whether run mode emits JSONL at all — if it only emits
plain text, set outputFormat null in buildArgs and let text events carry the
log (the dashboard tolerates this; the orchestrator reads stage from disk).

## Acceptance Criteria

- [ ] EXECUTORS['opencode'] with buildArgs citing real `opencode run --help`
      output; resolveExecutor derives it from target: opencode
- [ ] Recording-shim Orchestrator test proves argv from .bobbyrc.yml alone
- [ ] Stream handling decision (JSONL vs text) cited to OpenCode source
- [ ] Dashboard banner and missing-binary warning cover opencode
- [ ] README support matrix row updated with dashboard status

## Comments
