# Plan — TKT-001: Multi-harness support: Bobby works first-class beyond Claude Code

## Approaches Considered

| Approach | Description | Effort (×3) | Risk (×2) | Maintainability (×2) | Impact (×1) | **Total** |
|----------|-------------|-------------|-----------|----------------------|-------------|-----------|
| **A — Foundation-first** | Target-matrix invariant suite first, then a dedicated Codex adapter + `codex exec` executor, then a generic `agents-md` target for the AGENTS.md long tail. | 4 → 12 | 5 → 10 | 5 → 10 | 4 → 4 | **36** |
| B — Breadth-first dedicated adapters | Hand-write dedicated adapters for Codex, Copilot, OpenCode, and Gemini now, each with its own hand-written tests (the current pattern). | 2 → 6 | 2 → 4 | 2 → 4 | 5 → 5 | **19** |
| C — Generic-only | Ship only the `agents-md` generic target and declare every AGENTS.md-reading tool supported. | 5 → 15 | 2 → 4 | 4 → 8 | 2 → 2 | **29** |

## Decision

**Approach A — Foundation-first (36).**

The risk scores are grounded in three incidents from the Cursor target work, all
of the same species — claims about a harness that were never verified against it:

1. Scaffolded agents referenced `CLAUDE.md` on targets that never write it —
   shipped broken in Cline for its entire life because each target has
   hand-written tests instead of shared invariants.
2. `composer-1` and then `sonnet-4-thinking` were documented as model names;
   neither exists. Only running the real CLI surfaced it.
3. "Cursor has no subagent registry" was wrong for Cursor 3.13+ — refuted only
   by reading the shipped binary.

Approach B repeats that failure mode four more times, and includes Gemini CLI
mid-rename to "Antigravity CLI" (building against a convention being renamed is
how sonnet-4-thinking happened). Approach C is cheapest but has no dashboard
story for any new harness and no first-class skills for Codex — "approximately
works everywhere" is the same unverified-claim trap with broader blast radius.

A's ordering makes every subsequent target cheaper and pre-verified: the matrix
suite means Codex and agents-md land with the invariants already enforced.

## Problem Statement

Bobby supports three harnesses (Claude Code, Cursor, Cline) via the target
adapter abstraction (`lib/targets/`) and two dashboard executors (`claude`,
`cursor-agent`). The mid-2026 landscape says the next users arrive from Codex
CLI (#2 terminal agent, tops Terminal-Bench) and from the AGENTS.md ecosystem
(Linux Foundation standard, read natively by 20+ tools, 60k+ repos). Today
those users get nothing, and every new target we add is a fresh chance to
repeat the CLAUDE.md-class bug because target behavior has no shared contract
tests.

## Proposed Solution

1. A target-matrix invariant suite (`describe.each(TARGETS)`) encoding the
   contract every adapter must satisfy — written first so the new targets land
   pre-verified and the existing three get the coverage they never had.
2. A dedicated `codex` target: rules → `AGENTS.md`, skills → `.codex/skills/`,
   both corroborated by two independent sources (Codex docs; Cursor 3.13's
   shipped binary scans `.codex/skills/` as a skill root).
3. A `codex` executor flavor: `codex exec --json` is headless prompt-in/
   result-out — the same shape as `claude -p` and `cursor-agent -p`.
4. A generic `agents-md` target: rules → `AGENTS.md`, skills →
   `.agents/skills/` — the honest answer to "does Bobby support X?" for any
   AGENTS.md-reading tool without a dedicated adapter.
5. A harness support matrix in the docs stating exactly what each tier gets
   (scaffold / subagents / dashboard) and what is verified vs. expected.

## User Stories

- A Codex CLI user runs `bobby init`, picks Codex, and gets skills invocable
  in Codex plus a dashboard that drives `codex exec` — parity with Cursor.
- A Windsurf/Zed/Copilot/OpenCode user picks `agents-md` and Bobby's rules and
  loop work in their tool without Bobby shipping a bespoke adapter.
- A contributor adding target #6 writes ~40 lines and inherits the full
  invariant suite instead of hand-writing tests.

## Technical Approach

- `lib/targets/codex.js`, `lib/targets/agents-md.js` following the cursor.js
  pattern (paths / supportsSubagents / promptHint / transformCommand /
  extraPaths / scaffoldExtras); register in `lib/targets/index.js`, the init
  wizard, config comments, and `lib/detect.js`.
- `EXECUTORS['codex']` in `lib/dashboard/executor.js` with a `buildArgs` for
  `codex exec --json`; `resolveExecutor` derives it from `target: codex`.
  Stream events pass through `parseLine` untouched (shape-agnostic by design —
  the orchestrator reads ticket stage from disk, not the stream).
- Matrix suite in `test/lib/target-matrix.test.js`: for every name in
  `TARGETS`, scaffold into a temp dir and assert the shared invariants (see
  child ticket for the list).
- Verification rule learned from Cursor: no claim about a harness ships
  without either running its real CLI or reading its shipped code. Flags,
  model names, and file conventions must cite their evidence in the PR.

## Out of Scope

- Gemini CLI / Antigravity (mid-rename; revisit next quarter).
- Dedicated Copilot, OpenCode, Windsurf, Zed adapters (agents-md covers the
  rules layer; build dedicated adapters on demand).
- Real-model eval harness (separate concern; wouldn't have caught any bug the
  matrix suite catches).
- Cloud agents with no local process (Devin, Jules).

## Ticket Dependencies

| Order | Ticket | Depends on |
|-------|--------|------------|
| 1 | Target-matrix invariant test suite | — |
| 2 | Codex CLI target adapter | 1 |
| 3 | Codex dashboard executor (`codex exec`) | 2 |
| 4 | Generic `agents-md` target | 1 |
| 5 | Harness support matrix docs | 2, 3, 4 |
