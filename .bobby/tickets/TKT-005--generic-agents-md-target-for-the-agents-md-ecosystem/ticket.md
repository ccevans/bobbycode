---
id: TKT-005
title: Generic agents-md target for the AGENTS.md ecosystem
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

Add a generic `agents-md` target for the AGENTS.md ecosystem — the Linux
Foundation-stewarded standard read natively by 20+ tools (Copilot, Windsurf,
Zed, Jules, Amp, Factory, opencode, Devin...). This is Bobby's honest answer to
"does Bobby support X?" for tools without a dedicated adapter.

Mapping:
- rules -> `AGENTS.md`
- skills -> `.agents/skills/` (cross-tool root; Cursor 3.13's binary scans it,
  and it is part of the emerging agents standard)
- agents -> `.agents/agents/` as prompt-referenced files (no subagent claim —
  supportsSubagents() false; the prompts reference agents by path so the loop
  works in any tool)
- commands -> fold into skills or omit (no cross-tool command convention
  exists); transformCommand strips frontmatter since no generic tool parses it
- no executor derivation — dashboard stays on `claude` unless
  dashboard.executor says otherwise

Positioning matters as much as code: docs must be explicit that this tier is
"rules + skills work in any AGENTS.md tool" — NOT full parity. Overclaiming
here is the exact trap the epic exists to avoid.

## Acceptance Criteria

- [ ] `target: agents-md` scaffolds AGENTS.md + .agents/skills/ +
      .agents/agents/ and nothing tool-specific
- [ ] Wizard entry describes it as the generic/fallback tier naming example
      tools it covers
- [ ] `resolveExecutor` does NOT derive a special executor from agents-md
- [ ] Existing AGENTS.md backed up and merged (shared path with cursor/codex)
- [ ] Target-matrix suite passes with zero per-target test edits
- [ ] Docs state precisely what this tier does and does not provide

## Comments
