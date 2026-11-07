---
id: TKT-071
title: 'Dashboard plugins receive boot config/board, not the active project''s'
stage: backlog
type: bug
priority: medium
area: null
author: unknown
assigned: null
services: null
repos: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: null
feature: null
persona: null
created: '2026-08-16'
updated: '2026-08-16'
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
- [2026-08-16] user: Found during TKT-022 review (round 5, reviewer's non-blocking note). lib/dashboard/server.js's plugin loop calls plugin.register({ orchestrator, store, sseHub, config, repoRoot, ticketsDir }) ONCE at buildServer time, passing the BOOT config, repoRoot and ticketsDir. In a studio (TKT-022) the active project can change at runtime via POST /api/projects/select; the orchestrator follows it (live config/ticketsDir/sessionsDir getters, boardDir()/activeConfig() in the core routes), but a plugin that captured the config/ticketsDir it was handed at register time still sees the boot project after a switch. A plugin that instead reads orchestrator.config / orchestrator.ticketsDir is fine — those are live. So the fix is likely an API-shape decision: either stop passing config/ticketsDir to register and make plugins read them off the orchestrator, or pass live accessor functions. Pre-existing (the seam predates TKT-022) but latent until switching existed. Matters because the App UI itself ships as a plugin (@bobbycode/pro-dashboard). Scope note: deliberately left out of TKT-022 to stop that ticket growing further; it is a plugin-API change with its own blast radius. Verify against a real plugin before changing the register signature.
