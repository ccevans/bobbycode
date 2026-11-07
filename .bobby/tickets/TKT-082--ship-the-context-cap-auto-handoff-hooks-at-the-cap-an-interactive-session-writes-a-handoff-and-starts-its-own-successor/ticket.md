---
id: TKT-082
title: >-
  Ship the context-cap auto-handoff hooks: at the cap an interactive session
  writes a handoff and starts its own successor
stage: shipping
type: feature
priority: medium
area: templates
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

## Comments
- [2026-11-07] claude: Test (2026-11-07): real `bobby init` from this branch into a scratch git repo scaffolds context-cap.sh, handoff-spawn.sh, stop.sh, postcompact-restore.sh and registers SessionStart/PreCompact/Stop/UserPromptSubmit. On real Claude Code transcripts: stop.sh blocks with valid JSON at BOBBY_SAVE_INTERVAL=5; postcompact-restore on a non-ticket branch handed back RF-1123's progress.md that session wrote; context-cap at BOBBY_CONTEXT_CAP=50000 says hand off, at the default 250k says nothing. handoff-spawn's real spawn path covered by the fake-claude unit test (not run live, it would start a real session). Note: stop.sh counts task-notification entries as turns (string user content) — fires a little early, harmless.
- [2026-11-07] scope-check: Scope check: out of plan — brand-board.html, components.html, docs/FUTURE_bobby_new.md, editorial-brand.html, editorial-components.html, homepage.html, option-1-terminal.html, option-2-editorial.html, option-3-retro.html, templates/hooks/postcompact-restore.sh, templates/hooks/stop.sh
- [2026-11-07] system: REJECTED: context-cap.sh:24-31 reads pre-compact usage after /compact and falsely triggers handoff (reset last=0 on isCompactSummary + test); settings.json.ejs was left uncommitted (now committed); handoff-spawn.sh:34 silent exit when transcript missing (add || true)
- [2026-11-07] scope-check: Scope check: out of plan — brand-board.html, components.html, docs/FUTURE_bobby_new.md, editorial-brand.html, editorial-components.html, homepage.html, option-1-terminal.html, option-2-editorial.html, option-3-retro.html, templates/hooks/postcompact-restore.sh, templates/hooks/stop.sh
- [2026-11-07] claude: Built and running in bobby-code-studio since 2026-11-07 (commit aae21b5db there): hooks/context-cap.sh (UserPromptSubmit) reads the last assistant turn's usage from transcript_path; past BOBBY_CONTEXT_CAP (default 250000) it tells an interactive session to write a handoff (ticket progress.md, else .bobby/handoffs/<date>-<topic>.md) and run hooks/handoff-spawn.sh, which starts 'claude --bg --remote-control "<name> 2"' with the same model and effort and records ~/.bobby/hook-state/<session-id>.handoff so a session hands off once. Headless runs (CLAUDE_CODE_ENTRYPOINT=sdk*) only stop. Neither file is in templates/hooks/ or templates/settings.json.ejs, so bobby init projects never get it. Port both into templates/hooks/, register UserPromptSubmit in settings.json.ejs and migrateHookSettings, make both shipped (replaced on upgrade), and make the wording user-neutral (studio copy says 'CC'). Build alongside TKT-081.
