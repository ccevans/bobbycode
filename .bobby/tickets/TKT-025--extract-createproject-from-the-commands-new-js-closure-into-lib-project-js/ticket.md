---
id: TKT-025
title: Extract createProject from the commands/new.js closure into lib/project.js
stage: done
type: improvement
priority: low
area: null
author: unknown
assigned: null
services: null
workflow: null
blocked: false
blocked_reason: null
previous_stage: null
parent: TKT-020
created: '2026-08-07'
updated: '2026-08-08'
---

## Description

`createProject` lives inside a closure in commands/new.js, so it can only be
called by the CLI. The app needs it for onboarding (TKT-024) and studio mode
(TKT-022) needs it to register new projects.

Extract it to lib/project.js as a plain function with no CLI coupling.

## Acceptance Criteria

- [ ] createProject is importable from lib/project.js
- [ ] commands/new.js uses the extracted function; behaviour is unchanged
- [ ] Covered by a unit test that does not shell out

## Comments
