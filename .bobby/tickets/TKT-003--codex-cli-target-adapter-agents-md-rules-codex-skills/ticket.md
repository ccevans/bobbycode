---
id: TKT-003
title: 'Codex CLI target adapter (AGENTS.md rules, .codex/skills)'
stage: backlog
type: feature
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

Add a `codex` target adapter so Codex CLI users (the #2 terminal agent by
mindshare) get first-class scaffolding. Conventions, each with its evidence:

- rules -> `AGENTS.md` (Codex reads it natively; same file the cursor target
  writes, so the merge/backup path is already proven)
- skills -> `.codex/skills/<name>/` — corroborated twice: Codex docs, and
  Cursor 3.13's shipped binary scans `.codex/skills/` as a skill root
- commands -> Codex marks custom prompts (`~/.codex/prompts`) deprecated in
  favor of skills, so do NOT scaffold a commands dir blindly; during build,
  verify against the real CLI what project-level invocables exist and either
  map commands there or fold them into skills
- agents -> `.codex/agents/` as prompt-referenced files (same fallback pattern
  as cline); verify whether Codex has a native subagent registry before
  setting `supportsSubagents()` — read the shipped code or run the CLI, do not
  trust docs (lesson: Cursor 3.13's registry was undocumented)

Follow lib/targets/cursor.js as the template: displayName, paths,
supportsSubagents, promptHint, transformCommand, extraPaths, scaffoldExtras.
Register in lib/targets/index.js, the init --custom wizard, config comments
(lib/config.js), and lib/detect.js rules detection.

Hard rule from the epic: no convention ships without citing its verification
(real CLI run or shipped-code reading) in the PR description.

## Acceptance Criteria

- [ ] `bobby init --custom` offers Codex; `target: codex` scaffolds rules,
      skills, and agents to the verified paths, and nothing to `.claude/`,
      `.cursor/`, or `.clinerules/`
- [ ] `supportsSubagents()` value is backed by cited evidence (CLI run or
      shipped-code reading), not documentation alone
- [ ] Existing `AGENTS.md` is backed up to `AGENTS.md.pre-bobby` and merged
- [ ] `bobby init --refresh` regenerates codex-target files and leaves
      `.local` overlays untouched
- [ ] Target-matrix suite (TKT-002) passes for codex with zero test edits
      beyond registration
- [ ] README and CHANGELOG document the target with its verification status

## Comments
