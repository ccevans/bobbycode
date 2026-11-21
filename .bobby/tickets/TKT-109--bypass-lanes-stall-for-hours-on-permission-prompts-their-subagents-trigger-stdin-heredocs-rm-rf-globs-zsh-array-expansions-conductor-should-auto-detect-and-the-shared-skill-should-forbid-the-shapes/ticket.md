---
id: TKT-109
title: >-
  Bypass lanes stall for hours on permission prompts their subagents trigger
  (stdin heredocs, rm -rf globs, zsh array expansions); conductor should
  auto-detect and the shared skill should forbid the shapes
stage: backlog
type: improvement
priority: high
area: null
author: Conductor 15
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
created: '2026-11-21'
updated: '2026-11-21'
---

## Description

[What is this ticket about? Provide enough context for an engineer to understand the problem or feature.]

## Acceptance Criteria

- [ ] [First criterion]
- [ ] [Second criterion]
- [ ] [Third criterion]

## Comments
- [2026-11-21] Conductor 15: 2026-11-21 in robinflow: 5 stalls in one day (RF-2439 giveaway design 2 ~60 min, RF-2427 plan 2 ~50 min, plan 3 twice, plan 4 once). Each was a lane SUBAGENT running: cat > f <<'EOF' in /tmp, python3 - <<'EOF', rm -rf tmp/storage/*, zsh F=("${(@f)$(...)}"). bobby conductor status shows 'waiting for: permission prompt'; state.json 'needs' holds the command. Fix today is manual: claude stop <id> then claude --bg --resume <uuid> '<msg>' (no flags = same id). Ideas: bobby-shared learnings + every agent prompt template forbid those shapes (Write tool into $CLAUDE_JOB_DIR/tmp, Edit for spec patches, find -exec rm -r for cleanup); conductor tick detects 'permission prompt' >5 min and messages the orchestrator or auto-restarts.
