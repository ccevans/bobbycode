---
id: TKT-081
title: >-
  Shipped hooks never fire in practice: stop.sh counts type 'human' (transcripts
  use 'user'); postcompact-restore only matches a ticket ID in the branch name
stage: testing
type: bug
priority: medium
area: null
author: claude
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
size: null
created: '2026-11-07'
updated: '2026-11-07'
---

## Description

[What is this ticket about? Provide enough context for an engineer to understand the problem or feature.]

## Acceptance Criteria

- [ ] [First criterion]
- [ ] [Second criterion]
- [ ] [Third criterion]

## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Expected vs actual result]

## Comments
- [2026-11-07] scope-check: Scope check: out of plan — brand-board.html, components.html, docs/FUTURE_bobby_new.md, editorial-brand.html, editorial-components.html, homepage.html, option-1-terminal.html, option-2-editorial.html, option-3-retro.html, templates/hooks/context-cap.sh, templates/hooks/handoff-spawn.sh, templates/settings.json.ejs
- [2026-11-07] claude: Seen in bobby-code-studio, 2026-11-07, across all sessions since 2026-11-01. (1) hooks/stop.sh counts transcript lines with type=='human'; Claude Code 2.1.x writes 'user', so human_count is always 0 and the bobby learn prompt never fires (~/.bobby/hook-state is empty). Fix: count type=='user' entries whose message.content is a string. (2) hooks/postcompact-restore.sh only restores when the git branch contains a ticket ID. Studio sessions run on branches like studio-sync-2026-10-22, so ~10 compactions since Nov 1 restored nothing. Suggested fix: read transcript_path from the hook input (it currently discards stdin) and restore the last progress.md or .bobby/handoffs/*.md this session wrote via Write/Edit; keep the branch match first. Both files ship from templates/hooks/, so studio copies get replaced on upgrade.
