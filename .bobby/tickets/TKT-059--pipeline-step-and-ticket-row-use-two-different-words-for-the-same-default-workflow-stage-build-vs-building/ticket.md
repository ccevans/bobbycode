---
id: TKT-059
title: >-
  Pipeline step and ticket row use two different words for the same
  default-workflow stage (Build vs Building)
stage: done
type: bug
priority: medium
area: ui
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
created: '2026-08-08'
updated: '2026-08-08'
---

## Description

Found in the independent design check on TKT-055 / TKT-054 / TKT-056.

`stepLabel()` in `app/app/views/feature.js` names a pipeline step from the stage's **agent**,
not from the stage:

```js
const raw = (s.agent || s.stage || '').replace(/^bobby-/, '');
return stageWords(raw) || stageWords(s.stage);
```

On the `design` and `secure` workflows the agent and the stage share a name, so nothing shows.
On `default` they do not, and the page ends up with two words for one stage a couple of inches
apart:

| Pipeline step | Ticket row beneath it |
|---|---|
| Plan | Planning |
| Build | **Building · in progress** |
| Review | Reviewing |
| Test | Testing |

This is the same fault TKT-056 fixed on the Board — one stage, one word — and the comment
added to `feature.js` in that change claims it is already fixed here:

> "The Board's word for the same stage, not a second one ... `stepLabel` above was already
> applying this exact rule by hand; both call the one copy of it now."

They do not call one rule: `stepLabel` reads the agent, `stageWord` reads the stage.

The spec is also inaccurate on the mechanism. "The pipeline (the signature)" says step names
are **the stage as words** ("Design Research", not `design-research`); the build derives them
from the agent. The words `Plan / Build / Review / Test` are themselves sanctioned by the
spec's Decided row, so the fix is a judgement call — either the rows adopt the pipeline's
shorter words on the Feature view, or the steps adopt the stage words — but the page must not
ship both vocabularies.

## Acceptance Criteria

- [ ] A stage is named with the same words wherever it appears on the Feature view
- [ ] The spec describes the mechanism the build actually uses
- [ ] The misleading comment in `feature.js` is corrected or made true
- [ ] `design` and `secure` are unchanged by the fix

## Steps to Reproduce (bugs only)

1. Seed a plain epic with a child moved to `building`.
2. Open `#/feature/<epic>`.
3. Expected: one word for the stage. Actual: the pipeline step reads "Build" and the row
   beneath reads "Building · in progress".

## Comments
