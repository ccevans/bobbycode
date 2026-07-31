---
id: TKT-004
title: 'Codex dashboard executor: drive codex exec --json'
stage: backlog
type: feature
priority: medium
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

Add a `codex` executor flavor so the dashboard can drive Codex CLI
headlessly, completing parity with claude and cursor-agent.

`codex exec` strips the TUI and runs prompt-in/result-out; `--json` emits
structured output. Same integration shape as the other two flavors:

- Add `EXECUTORS['codex']` in lib/dashboard/executor.js with a buildArgs
  mapping: prompt (positional or flag — verify against the real CLI), `--json`,
  model passthrough, and the closest equivalents of permission_mode
  (Codex has sandbox/approval flags — verify exact names by running the CLI,
  not from docs; lesson: sonnet-4-thinking came from stale help text)
- `resolveExecutor` derives codex from `target: codex`
- Stream events pass through parseLine untouched (it is shape-agnostic; the
  orchestrator reads ticket stage from disk, not the stream)
- Verify with the argv-recording shim pattern used for cursor-agent: drive the
  real Orchestrator from .bobbyrc.yml alone and assert the exact spawn argv,
  cwd=worktree, BOBBY_SESSION_ID in env
- If a real `codex` binary + auth is available, run the exact argv against it:
  it must clear argument parsing (auth failure acceptable, unknown-option is
  not) — the control-test pattern from cursor-agent verification

## Acceptance Criteria

- [ ] `resolveExecutor({target:'codex'})` returns the codex flavor;
      explicit `dashboard.executor` still overrides
- [ ] buildArgs maps outputFormat/model/permissionMode to verified codex flags;
      unsupported options are dropped with a comment, never guessed
- [ ] Orchestrator-level shim test proves correct argv from config alone
- [ ] `bobby dashboard` banner names the codex executor; missing binary warns
      but does not exit
- [ ] Every flag cited to a real CLI run in the PR; none sourced from docs or
      help-text examples alone

## Comments
