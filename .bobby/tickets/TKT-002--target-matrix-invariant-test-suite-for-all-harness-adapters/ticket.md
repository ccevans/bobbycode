---
id: TKT-002
title: Target-matrix invariant test suite for all harness adapters
stage: backlog
type: improvement
priority: high
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

Each target (claude-code, cline, cursor) currently has hand-written tests, so a
contract violation in one target goes unnoticed in the others. Proof: the
scaffolded-agents-reference-`CLAUDE.md` bug shipped broken in Cline for its
entire life and was only caught when the Cursor target got a hand-written sweep
test the others still lack. Coverage is also inverted — cline has 55 test
mentions, cursor 47, and claude-code (the default) just 9 with no scaffold
integration block at all.

Build `test/lib/target-matrix.test.js` using `describe.each(TARGETS)` so every
invariant runs against every registered target automatically, and any future
target (codex, agents-md) inherits the full suite by being registered.

Invariants to encode (scaffold each target into a temp dir, then assert):
- All four `paths()` entries exist and were written to; nothing was written to
  another target's paths (no `.claude/` leakage under cursor, etc.)
- No scaffolded file references another target's rules file by name
  (the CLAUDE.md-class bug)
- Rules file contains the target's own `displayName()`
- Generated prompts (`buildSingleAgentPrompt` etc.) reference this target's
  agents path and no other's
- `transformCommand` output for every shipped command template is frontmatter-
  free for targets that don't parse frontmatter, intact for those that do
- `scaffoldExtras`/`extraPaths` agree: every extra path declared is created,
  and re-running scaffold is idempotent (no duplicate ignore entries)
- Pre-existing rules file is backed up to `<rules>.pre-bobby` and merged,
  never clobbered

## Acceptance Criteria

- [ ] `test/lib/target-matrix.test.js` exists and iterates `TARGETS` from
      `lib/targets/index.js` — adding a target to the registry runs the whole
      suite against it with zero test edits
- [ ] All invariants above are asserted per-target, and the suite passes for
      claude-code, cline, and cursor
- [ ] Deliberately re-introducing the CLAUDE.md bug in the cline template path
      (locally, as a check) fails the cline leg of the matrix — verified once
      during review, not committed
- [ ] Redundant hand-written per-target assertions in `test/lib/targets.test.js`
      that the matrix now covers are removed, not duplicated; target-specific
      quirks (e.g. cursor transformCommand edge cases) stay
- [ ] Full suite and lint stay green

## Comments
