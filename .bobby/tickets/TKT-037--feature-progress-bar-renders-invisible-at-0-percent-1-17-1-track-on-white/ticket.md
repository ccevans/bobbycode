---
id: TKT-037
title: 'Feature progress bar renders invisible at 0 percent (1.17:1 track on white)'
stage: blocked
type: bug
priority: low
area: ui
author: unknown
assigned: null
services: null
repos: null
workflow: null
blocked: true
blocked_reason: >-
  Declined: --fill-track #EDEDED is the spec's own token, used exactly as the
  approved Pipeline bar uses it. The bar is aria-hidden and the same fact is
  stated in words beside it ('0 of 2 done'), so nothing is carried by the track
  alone. Raising it would deviate from a locked token for a decorative element.
  Reopen only if the spec's track token changes.
previous_stage: backlog
parent: null
feature: null
persona: null
created: '2026-08-07'
updated: '2026-08-07'
---

## Description

The feature row ends with the Pipeline header's `.bar` instead of an `.rdot` —
that terminal difference is what is meant to make an epic read as a different
kind of thing. But `.bar`'s track is `--fill-track` `#EDEDED` on `--surface`
`#FFFFFF`, measured at **1.17:1**, and the fill `i` is set to `width: 0%` when no
child is done. So a feature with nothing finished ends in 72×6px of nothing, and
the structural signal vanishes at precisely the state a backlog epic is normally
in.

Verified in the browser: `getComputedStyle` on the two fill elements returns
`14.39px` (Subscriptions & billing, 1 of 5) and `0px` (Onboarding checklist,
0 of 2). The 0% row is visually a bare row with a gap where the dot would be.

Not a WCAG failure — the bar is `aria-hidden` and the sublabel says "0 of 2 done"
in words, so it is decorative and the 3:1 floor does not bind it. It is a
legibility and signal problem, not an accessibility one.

## Acceptance Criteria

- [ ] A feature row at 0% still reads as a feature row
- [ ] Any fix stays on the spec's palette and adds no fourth animated property
- [ ] The bar stays `aria-hidden` with the count carried in words

## Steps to Reproduce (bugs only)

1. Open the populated board fixture at 390px (`#/board`)
2. Look at the Features section, second row: "Onboarding checklist · Backlog ·
   0 of 2 done"
3. Expected: the row visibly ends in the progress component. Actual: the track is
   1.17:1 on white and the row appears to end in empty space.

## Comments
- [2026-08-07] system: Declined: --fill-track #EDEDED is the spec's own token, used exactly as the approved Pipeline bar uses it. The bar is aria-hidden and the same fact is stated in words beside it ('0 of 2 done'), so nothing is carried by the track alone. Raising it would deviate from a locked token for a decorative element. Reopen only if the spec's track token changes.
