---
id: TKT-007
title: 'GitHub Copilot target adapter (.github/prompts, AGENTS.md)'
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

Dedicated GitHub Copilot target. Largest install base of any harness
(~42% share, 20M+ users) but weakest file-convention fit — Copilot reads
AGENTS.md natively (added Aug 2025), so the agents-md generic tier (TKT-005)
already covers rules. A dedicated adapter adds what generic can't:

- prompt files -> `.github/prompts/*.prompt.md` (Copilot's reusable-prompt
  convention; maps from Bobby's commands, likely via transformCommand since
  prompt files have their own frontmatter dialect — verify against a real
  VS Code + Copilot install)
- instructions -> decide between AGENTS.md alone vs also
  `.github/copilot-instructions.md`; verify precedence behavior in the real
  product before choosing (do not ship both blindly — precedence conflicts
  would be the CLAUDE.md bug in a new costume)
- agents -> prompt-referenced files (no user-defined subagent registry;
  verify against current Copilot agent mode before asserting)
- no dashboard executor in this ticket: `copilot` CLI exists but its headless
  behavior needs its own verification pass — split it out if demand appears

Demand-driven per the epic decision: build when a Copilot user asks, or when
positioning wants the '20M users' checkbox. Parked at low until then.

## Acceptance Criteria

- [ ] Target registered in lib/targets/index.js, init --custom wizard, config
      comments, and lib/detect.js
- [ ] Target-matrix suite (TKT-002) passes with zero per-target test edits
- [ ] Every path/convention claim cites its verification (real tool run or
      shipped-code reading) in the PR — docs alone are insufficient
- [ ] README support matrix (TKT-006) row added with verification status
- [ ] Prompt-file frontmatter dialect verified against a real Copilot install,
      with transformCommand adapted accordingly
- [ ] Instructions-file precedence (AGENTS.md vs copilot-instructions.md)
      verified and documented; only the winning convention is scaffolded

## Comments
