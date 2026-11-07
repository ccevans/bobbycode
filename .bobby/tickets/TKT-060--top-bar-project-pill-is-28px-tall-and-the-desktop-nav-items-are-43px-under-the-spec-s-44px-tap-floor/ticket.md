---
id: TKT-060
title: 'Desktop nav items are 43px, 1px under the spec''s 44px tap floor'
stage: backlog
type: bug
priority: low
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
updated: '2026-08-09'
---

## Description

Found in the independent design check on TKT-055 / TKT-054 / TKT-056. Pre-existing — no CSS
changed in that work — but it is a live failure against a value the spec asserts as verified.

`.bobby/design/design-spec-feature-view.md`, "Accessibility floor (verified, not asserted)":

> Tap targets >=44px.

Measured with `getBoundingClientRect()` on the rendered app:

| Element | Where | Size |
|---|---|---|
| `a.pill` (project pill) | every top bar, Home / Board / Feature / ticket | 62x28 and 94x28 |
| `button.nav-btn` | desktop rail, >=1000px | 199x43 |
| `a.nav-link` | desktop rail, >=1000px | 199x43 |

The pill is the control that takes you Home and it is on every screen at 28px — 16px under the
floor, and the smallest target in the app. The nav items miss by 1px, which is the kind of
number that comes from a padding value rather than a decision.

Everything else measures at or above 44px: ticket rows are 57px (recorded as a deviation for
exactly this reason), buttons clear it, and the blocked row is 74px.

Either the targets come up to 44px or the spec's floor stops claiming to be verified.

## Acceptance Criteria

- [ ] `a.pill` measures >=44px tall on every view at 390 and 1440
- [ ] `.nav-btn` and `.nav-link` measure >=44px tall
- [ ] Nothing interactive inside `#app` measures under 44px on any of the four views
- [ ] The check is asserted in the e2e suite, so the floor stays verified rather than asserted

## Steps to Reproduce (bugs only)

1. Open the app at 390 and tab to the project pill in the top bar.
2. Measure its bounding box.
3. Expected: >=44px tall. Actual: 28px.

## Comments
- [2026-08-09] review: FALSE POSITIVE on the pill, half-valid on the nav. `.appview .pill::after { content:''; position:absolute; inset:-8px }` expands the 28px drawn box to a 44px touch target, with a comment saying exactly that. It landed in 16e7874 on 2026-08-07 — a day BEFORE this ticket was filed. The design check measured getBoundingClientRect() on the element, which returns the painted box and never sees a pseudo-element hit area, so it reported a pass as a failure. The nav finding stands: .nav-btn/.nav-link are padding 14px/12px around a 13px line = 43px, with no ::after expander and no deliberate comment — a padding value, not a decision. Narrowing this ticket to the nav.
