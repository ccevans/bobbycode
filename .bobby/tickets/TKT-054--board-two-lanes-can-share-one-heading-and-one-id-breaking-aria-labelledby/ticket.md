---
id: TKT-054
title: 'Board: two lanes can share one heading and one id, breaking aria-labelledby'
stage: done
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
updated: '2026-08-08'
---

## Description

Found in the TKT-050 design review, driving the real board in Playwright.

`laneOrder()` gives any stage the canonical list does not name its own lane at the end,
titled with `stageWords(stage)` and headed by an element whose id is `lane-${stageSlug(stage)}-head`.
Both helpers are many-to-one, and nothing downstream disambiguates:

- `"Design Spec"` (hand-typed in frontmatter) and `"design-spec"` (canonical) both render a
  lane headed **"Design Spec"**, and both heads get the id `lane-design-spec-head`.
- `"!!!"` and `"???"` both slug to the fallback, so both heads get `lane-unnamed-head`.

Two consequences, both confirmed in the browser:

1. **Invalid HTML / wrong screen-reader announcement.** `<section aria-labelledby>` resolves
   to the *first* element with that id, so the `"???"` lane is announced as `"!!!"`, and the
   hand-typed `Design Spec` lane is announced as the canonical one.
2. **Two visually identical lane headings**, drawn apart from each other (the canonical lane
   sits in pipeline position, the hand-typed one is sorted into the extras at the end), with
   nothing on screen telling the user why "Design Spec" appears twice.

This is narrow — it needs a hand-edited or newer-CLI stage value. But that is precisely the
case `laneOrder()`'s own comment says the unknown-lane branch exists to serve
("Ticket frontmatter is a file a human can edit"), so the edge case is the feature's own
stated purpose.

No CSS is involved and nothing else on the page regresses; scroll width stays 390/390 and the
console is clean.

## Acceptance Criteria

- [ ] Two stages that differ only in case or punctuation never produce two `<h2>` elements with the same `id`
- [ ] Every lane's `aria-labelledby` resolves to that lane's own heading, verified with more than one unknown stage on the board
- [ ] A hand-typed stage that renders the same words as a canonical one is distinguishable on screen (or is folded into the canonical lane)
- [ ] A board with several unnamed-slug stages (`!!!`, `???`) still renders each lane with a unique id

## Steps to Reproduce (bugs only)

1. Seed a board with tickets in stages `design-spec`, `Design Spec`, `!!!` and `???` (write the stage straight into ticket frontmatter — `moveTicket` rejects non-canonical values).
2. Open `#/board`.
3. Expected: four lanes, each with a distinct heading id, each `aria-labelledby` naming its own heading. Actual: heading ids are `lane-design-spec-head`, `lane-unnamed-head`, `lane-unnamed-head`, `lane-design-spec-head` — two duplicate pairs — and two lanes both read "Design Spec".

## Comments
