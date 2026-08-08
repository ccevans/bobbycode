# Design Spec — Bobby App, Feature view

**Locked:** 2026-08-06 · **Direction:** "Track to finish" · **Status:** approved by CC
**Scope:** the Feature view (an epic + its child tickets moving through a workflow),
and — since 2026-08-07 — **Home**, the **Board**, **ticket detail** and the
**Workspace** (live log + diff), built as its siblings from the same parts. All five
share one CSS class (`.appview`) rather than parallel copies, so they cannot drift.
This spec does **not** govern the marketing homepage — that is `design-spec.md`
(direction R1 "Stage"), a separate surface with its own tokens.

Source of truth for the build: `.bobby/design/mockups/devin-white-fin-2.html`.
**Values are copied from this file, never retyped from memory.**

---

## Decided

| Field | Value |
|---|---|
| **Direction** | "Track to finish" — Devin's white mobile register, pipeline drawn as a route |
| **Reference** | app.devin.ai on iPhone, photographed by CC (4 screenshots, see Provenance) |
| **Canvas** | Phone-first at 390px; app column `max-width: 440px` centred on the ground at any width |
| **Signature move** | A hairline connector runs down through the step glyphs and **terminates in a chequered finish** at Merge. The pipeline is a route, not a checklist. The route's *length* is the epic's own workflow (five steps on `default`, seven on `design`); the connector and the chequered terminus are what do not vary. |
| **Structure** | Top bar → title + repo sublabel → status line → Pipeline → note → decision buttons → Tickets |

### Colour — every value pixel-sampled from the reference photos

| Token | Value | Sampled from |
|---|---|---|
| `--ground` | `#F8F8F8` | IMG_5805, ground behind the list container |
| `--surface` | `#FFFFFF` | IMG_5805 list container; IMG_5808 composer |
| `--hairline` | `#E2E2E2` | IMG_5807 card border + chip border |
| `--fill-active` | `#F5F5F5` | IMG_5805 selected session row |
| `--fill-track` | `#EDEDED` | IMG_5808 progress track |
| `--fill-hover` | `#FAFAFA` | derived |
| `--ink` | `#191919` | IMG_5805/5807/5808 primary text |
| `--ink-2` | `#6E6E6E` | **deviation** — sampled `#7D7D7D`, darkened for AA |
| `--blue` | `#467AF6` | IMG_5808 check circle + progress fill; IMG_5805 status dots |
| `--btn` | `#363636` | IMG_5807 "Create automation" fill |
| `--dot-muted` | `#8F8F8F` | **deviation** — sampled `#E2E2E2` ring, lifted to ≥3:1 |

The greys are **pure neutral (R=G=B)**, not warm. Verified by sampling; do not
"warm them up" — that was an earlier wrong assumption taken from the marketing site.

Blue is the only accent. It means *live / needs attention*. Black (`--btn`) is for
primary buttons and ink. **The blue is never a button fill.**

### Type

- Family: system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`). One face for the whole page — reference-backed.
- Body 15px / 1.35 · H1 **22px/600** · row title 14px · sublabel 13px · section heads 14px/600
- **Floor: 13px.** Nothing smaller anywhere. (Reference runs 12px; our floor wins.)
- `font-variant-numeric: tabular-nums` on all counts, times and IDs.

### Shape & surface

- Radii: container `12px` · row `8px` · button `8px` · pill `999px`
- Border: `1px solid var(--hairline)`
- **No shadows anywhere.** No gradients. No tinted status fills.
- **No dividers between ticket rows** — verified by pixel scan of the reference.
  Rows are separated by space; the active row carries a `--fill-active` inset fill.

### The pipeline (the signature)

- **One step per stage of the epic's own workflow, then `Merge` as the terminus.**
  `default` draws the five this spec was written against — Plan · Build · Review ·
  Test · **Merge**. `secure` draws six, `quick` four, `design` seven (Design
  Research · Design Analyze · Design Mockup · Design Spec · Design Build · Design
  Check · **Merge**).
  The list is vertical, so length costs height and never width — seven steps at
  the 34px pitch is 238px, and 390px is unaffected. Nothing is condensed,
  wrapped, scrolled or truncated.
- **A step is named after the step, not after the stage it parks a ticket in** —
  spelled out as words, never as an id: "Design Research", not `design-research`.
  The stage cannot do this job: two `design` steps park their tickets in stages
  that are not theirs (`design-build` writes `building`, `design-check` writes
  `reviewing` — `STAGE_MAP` in `lib/workflow.js`), so reading the stage would
  print "Building" and "Reviewing" in the middle of the design route and lose
  two of the seven names listed above. **The rows beneath take their word from
  the step**, so one stage is one word everywhere on this view — the pipeline
  said "Build" over a row reading "Building · in progress" for every `default`
  feature until TKT-059. Off the track — backlog, done, shipping, or a stage
  this workflow has no step for — no step has named it and the stage's own
  words stand. Every word on the page goes through one formatter (`stageWords`).
  The Board cannot do this and does not: it draws every workflow at once, so
  there a stage has no single step and the stage's own words are the only
  honest name.
- Glyphs, 18px box, 34px row pitch:
  - done → filled `--blue` circle, white check
  - current → `--blue` ring with `--blue` centre dot
  - not started → hollow `--dot-muted` ring, 1.5px
  - **finish (Merge) → 20×20 chequer, 5×5 grid at 4px cells, `--btn` `#363636`**
- **"Current" means work sits at this step** — a run is on it, or a ticket is
  parked there. More than one step may be current at once, because children can
  be spread across stages, and when they are the drawing says so. A step a ticket
  is standing on is never drawn "done" and never drawn "not started": that test
  runs before the count is consulted, because the pipeline contradicting the rows
  an inch beneath it is the one failure this section exists to prevent.
  Exactly one step carries `aria-current="step"` — the run's, or the earliest
  parked one.
- **The count is steps *cleared*, and a step is cleared only when the least
  advanced ticket has left it.** That is the whole rule, and the **tickets** are
  what answer it: the count is the minimum over the children, never the epic's
  own stage. An epic can run ahead of a child — a send-back, or a run that
  advanced the epic while a child stayed put — and when it did, the page put
  done checks on steps no ticket had reached and ran the blue road out of a
  glyph it was simultaneously drawing as current (TKT-057). A blocked child is
  not counted: its row says "Blocked", not "in progress", and one stuck ticket
  must not freeze the route at zero. The epic's stage stands in only when no
  ticket can answer — no children yet, or none at a stage this workflow has a
  step for. Whatever number arrives, it is finally clamped to the first step a
  ticket is standing on, so the count, the bar and the blue length cannot
  contradict the glyphs even in principle.
- **Where the *run* is is a different number, and it is the epic's own stage.**
  That is the field a run advances, so it is what the decision button and the
  note read — "Approve — send to review" is a statement about the run, not about
  how far the least advanced ticket has got. Keeping the two apart is what lets
  the count be honest without the button going wrong; collapsing them into one
  number is what produced the contradiction above.
- **Connector:** hairline running down the glyph column, terminating at the chequer.
  Completed segments `--blue` (3.68:1); segments ahead `--hairline` (decorative
  connective tissue — the glyphs carry state, so it is not a state carrier).
  Requires `z-index: 0` on segments, `z-index: 1` on rows, and ground-coloured ring
  fills, or the line paints through the glyphs.
- Grid parity matters: **odd grids only.** 5×5 has filled corners and reads as a
  flag; 6×6 leaves opposite corners empty and serrates into a diamond.
- Cells on whole-pixel boundaries, `shape-rendering="crispEdges"`.

### Rows and the headings above them (the Board)

- **A row names its stage unless the heading directly above it already has.**
  Stage is never carried by position or colour alone — but inside a stage lane
  the `<h2>` is the stage, so the sublabel opens with the id instead
  (`TKT-002`, not `Design Research · TKT-002`). Outside a stage lane the word
  stays, because nothing else supplies it: **Blocked** (whose heading is not a
  stage), **Features**, Home, and the ticket page.
- **Every section heading on the Board is unique in words and in `id` — across
  the whole page, not just among the lanes.** Stage ids come off disk and both
  the prettifier and the slugifier are many-to-one, so uniqueness is made rather
  than assumed: the `id` takes a numeric suffix on collision, and two lanes that
  prettify to the same phrase both fall back to the raw stage string
  (`design-spec` beside `Design Spec`). `aria-labelledby` resolves to the first
  element with an id — a duplicate is one lane announced as another.
  **`Features` and `Blocked` are in that set.** They are the page's two fixed
  sections and their ids are constants, so a lane is measured against them too:
  a hand-typed stage of `Blocked` slugs onto `lane-blocked-head`, which the
  Blocked section already owns, and the lane was announced as that section
  (TKT-058). Uniqueness is decided against the sections actually drawn, so a
  board with no epics reserves nothing for Features.
  Against a fixed section the raw-stage fallback is no help — `Blocked` reads as
  `Blocked` however it was written — so there the **lane** is qualified,
  `Blocked (stage)`, and the section is left alone: the section is a state the
  board groups by, the lane is a stage someone typed, and the qualifier is the
  page saying which is which. It never appears on a board nobody has hand-edited.

### Motion

Near-none. One `background-color` transition at 120ms linear on row hover.
No transforms. No pulsing status dots — retired by construction
(see `references-feature-view.md`; five teardowns record "no pulse").

---

## Vetted — from the user

**Keep**
- White theme, simple layout (CC: *"I like the white theme and simple layout"*)
- The chequered flag as the one racing grace note (CC: *"let's do subtle check flags"*)
- The connector-line treatment (CC chose "Track version" over the bolder flag)

**Drop**
- Dark mode entirely (CC: *"I hate dark mode"*) — this surface is light-only
- The circuit-line drawing, car dot, sector labels, lap counter, livery stripe (CC: *"little too much"*)
- Cards around status; tinted row fills; left-border stripes

---

## Deviations (each needs a reason)

- `--ink-2 #6E6E6E` instead of sampled `#7D7D7D` — reference is **4.12:1**, fails AA.
- Not-started ring `#8F8F8F` @1.5px instead of `#E2E2E2` — reference is **1.30:1** and
  is the sole carrier of "not started".
- Sublabels 13px instead of reference 12px — below our floor.
- Ticket rows ~57px instead of reference ~44px — consequence of the 13px floor plus
  the ≥44px tap-target rule.
- Current-step glyph (blue ring + centre dot) is **invented** — Devin's checklist has
  only done and not-started. This is the one glyph without provenance.
- **`--mono` on a literal shell command** (Home's "Next" section, `.cmd`) despite the
  one-face rule. The rule bans a decorative display/body pairing; quoting a terminal
  string is content, and monospace is what makes the ticket id and the argument
  boundaries legible. Exactly one node on the page. Set in `--ink`, not `--ink-2` —
  it is the payload of the button beneath it, so it must not be quieter than the
  plain-language reason above it.
- **`.btn-quiet` border is `--dot-muted` `#8F8F8F`, not `--hairline`.** The edge is what
  identifies the secondary as a control; `--hairline` is 1.22:1 on the ground and left
  "Send back" reading as floating text. Same reason the spec already lifts this colour
  for the not-started ring.
- **Form-control borders are `--dot-muted` `#8F8F8F`, not `--hairline`** (`textarea`,
  `input[type=text]`, `select`). Identical reasoning to `.btn-quiet` one line above, plus
  WCAG 1.4.11, which requires 3:1 on the boundary of an input. `#8F8F8F` measures
  **3.23:1** on `--surface`; `--hairline` measures 1.22:1 and left a field reading as
  empty space.
- **Sheet titles are 15px/600, not the 22px H1.** A sheet is a page head by role, but its
  title is prose the caller passes in (`Build ${epic.id} — ${epic.title}?`), which ran to
  three lines and 38% of the panel at 22px. Hierarchy is carried by weight and colour
  against the `--ink-2` body — which is what the flat 13/14/15 scale is for.
- **Form controls are 15px, below the 16px at which iOS zooms on focus.** 15px is the
  spec's body size; 16px is not on the scale. Recorded rather than silently resolved:
  the scale wins, and the zoom is the cost. See Open below.

### The live log and the diff — the instrument decision (TKT-010)

The Workspace view's two panes were the last near-black surfaces in the app
(`#0b0e11` with syntax tints). A terminal log and a code diff are the one place a dark
surface can honestly be argued for inside a light product: they are instruments, not
documents, and every tool the user already knows draws them dark.

**Decision: they go light.** The reasoning, in the order it decided the question:

1. This surface is light *by decision, not by default* — CC: *"I hate dark mode"*, and
   the Vetted section drops dark mode entirely. A dark pane is not an exception to a
   preference; on a page that has none, it is a second theme.
2. Two black rectangles halfway down an otherwise white page do not read as deliberate
   instruments. They read as the parts nobody converted — which is exactly what they
   were, and a design that looks unfinished is unfinished.
3. The claim "a log must be dark" is about a *terminal*, where the surface is the
   application. Here the log is one section of a page, sitting between a decision block
   and a facts grid. Its neighbours set the ground; it does not get to set its own.

**But not white either.** A wall of log output on `#FFFFFF` is harsh at length, and a
white pane would be the same material as the `.list` containers, which are rows you tap.
The panes are drawn as **quiet instrument panels**, recessed rather than raised:

| Property | Value | Why |
|---|---|---|
| Surface | `--fill-active` `#F5F5F5` | One step under the `#F8F8F8` ground, so the pane sinks. Not `--surface`: white is the material of things you tap. |
| Edge | `1px solid --hairline` `#E2E2E2` | What separates every container in this system. A white `.list` on the ground measures 1.06:1; fill contrast has never drawn these edges. |
| Radius | `--r-container` `12px` | Container, not row. |
| Type | `--mono`, **13px**/1.5, `tabular-nums` | The floor. The old pane ran 11.5px. |
| Log — context | `--ink-2` `#6E6E6E` | **4.68:1** on `#F5F5F5`. |
| Log — tool calls | `--ink` `#191919` | **16.13:1**. Tool calls are the structural beats of a run, so they take full strength rather than a hue. |
| Log — errors | `--bad` `#B42318` | **6.03:1**. |
| Diff — adds | `--ok` `#0F7B3E` | **4.91:1**. |
| Diff — removes | `--bad` `#B42318` | **6.03:1**. |
| Diff — hunk headers | `--ink` | **16.13:1**. |

- **`--fill-active` `#F5F5F5` over `--fill-track` `#EDEDED`** — the other honest
  candidate, and the choice is a measurement, not a preference. On `#EDEDED` the diff's
  `--ok` lands at **4.57:1** and the log's `--ink-2` context lines at **4.36:1**, which is
  under the AA floor. On `#F5F5F5` they are 4.91 and 4.68. `#EDEDED` is the token for a
  *track a bar runs in*, where nothing is set in type; these panes are nothing but type.
  No new token was invented.
- **No tinted add/remove row fills in the diff**, though the brief permitted them.
  Three reasons: the spec bans tinted status fills; `--ok` has 0.4 of headroom over AA on
  this surface, so any tint darker than the pane breaks it and any tint lighter re-lights
  the recess and makes one pane read as two grounds; and the `+` / `-` git already put at
  the head of every line is a non-colour carrier that is *in the content*, so nothing here
  is carried by colour alone.
- **No `--blue` in the log**, though the brief named it for tool lines. It measures
  **3.58:1** on `#F5F5F5` — correct for a graphic under the spec's ≥3:1 rule, and below
  the 4.5 floor for text. This system has never set blue as type, and the exception is not
  worth making for a rank that `--ink` already carries. Recorded rather than silently
  dropped. No pulse either — the spec retired those by construction.
- **Pane height is `340px` (`480px` above 900px), not the old `52dvh`.** The reason is the
  phone, not embedding: at 420px the pane ran to the bottom edge of a 390×844 screen, so
  the page appeared to end at the log and the "Changes" heading below it was never seen.
  340px is ~17 lines and leaves the next section reachable. A fixed height also makes the
  pane's own size independent of the window, which is what a scrolling instrument wants —
  `52dvh` meant the log grew when you resized and the number of lines you could see was
  never the same twice. The desktop step-up is the enhancement; the phone value is the
  base. *(An earlier draft of this entry justified it by frame embedding. That was wrong
  on two counts — `dvh` resolves against the viewport whatever the ancestor sizing, and
  nothing in this app is framed. The decision stands on the reason above.)*
- **The Workspace's back glyph is a chevron, not the siblings' board panel.** The panel
  is a *destination* glyph — on Feature and ticket detail it always means "the board". A
  workspace's honest "up" is the ticket or the feature it is working on (you arrive here
  from one of those or from Home, never from the board), so painting the panel and landing
  somewhere else would be a control that lies. A chevron claims only "back", and the page
  it returns to is the one this page's own h1 names. Home stays the fallback.
- **The Workspace's log and diff panes are focusable (`tabindex="0"`, `role="region"`).**
  They scroll; a region that scrolls and cannot be reached by keyboard cannot be read by
  keyboard. `min-height: 44px` keeps an empty one off the tap floor.

---

## Accessibility floor (verified, not asserted)

- All text AA. Worst case `--ink-2` at **5.10:1** on white.
- Meaningful non-text graphics ≥3:1: blue graphics 3.91 vs white; muted dot 3.23;
  chequer 11.38 on ground.
- Tap targets ≥44px — **the rule, with two measured exceptions still open**:
  `a.pill` in the top bar is 62×28 / 94×28 on every view, and the desktop rail's
  `.nav-btn` / `.nav-link` are 199×43 above 1000px. Everything else clears it
  (ticket rows 57px, the blocked row 74px, every button). Recorded here rather
  than claimed as verified, because this section is only worth anything if what
  it says is measured — see **TKT-060** under Open.
- Visible `:focus-visible` on every interactive element.
- `scrollWidth == clientWidth` at 375 / 390 / 768 / 1440.
- Renders fully with **JavaScript disabled**. `prefers-reduced-motion` honoured.

---

## Open — known, not yet resolved

- **iOS zooms on focusing a control below 16px.** Ours are 15px, because 16px is not on
  the scale. Either the scale gains a control-only size or the zoom is accepted.
- **The top-bar pill (28px) and the desktop nav items (43px) are under the 44px tap
  floor** — TKT-060, filed and not yet worked. The nav's 43px is a padding value rather
  than a decision and is a one-line fix; the pill is not, because a 44px lozenge changes
  the proportion of the top bar on all five views, and that is a design decision with a
  round of its own rather than something to slip into a conformance fix. Left whole, and
  the floor above stops claiming to be verified until it is done.
- **Pre-existing values outside this spec's surfaces**, found during the TKT-027 review.
  Most are now resolved, because the Workspace was the last surface off the system and
  taking it on made the code that held them dead: `.next-reason` (16px), `.backlink`
  (39px, under the tap floor), `--radius: 10px`, `.card-head` / `.card-id` / `.card-stage`
  / `.lamp`, `.meta-grid`, `.detail-actions`, `.rail-head`, `.btn-row`, `.log-pane`,
  `.diff-pane`, the `--lamp-*` trio, `--attn`, and the `--surface-2` / `--ink-dim` /
  `--ink-faint` aliases are all deleted, along with `STAGE_LAMP`, `workspaceLamp` and
  `STATUS_LABEL` in `lib/ui.js`. Still open: `#2B2B2B` / `#1F1F1F` / `#F0F0F0` untokenised
  greys; the global `:focus-visible { border-radius: 4px }`; the base `.btn` block, which
  renders 15px and is now reached by nothing (every button in the app is inside `.appview`
  or `.sheet`) but is left as the default for anything added outside them.
- **A code diff in a 440px column scrolls horizontally.** The spec's canvas is 440px at
  any width, which leaves the diff pane ~408px — narrow for code. It scrolls inside its
  own container so the page never does, but a wide diff on a 1440px screen is a worse read
  than it needs to be. Widening the column for one section would break the five-view
  register, so the canvas wins and the cost is recorded. If it is ever revisited, the fix
  is a full-width reading mode for the diff, not a wider page.
- **"Renders fully with JavaScript disabled"** in the floor below is aspirational for this
  surface — the app is client-rendered and ships a `<noscript>` fallback instead.

## Provenance

Reference photos (app.devin.ai, mobile Safari, CC's own repo — the app is behind
auth, so these could not be captured by tooling):
`b1bb4042-IMG_5805.png` (sessions list) · `5c242cb7-IMG_5806.png` (nav drawer +
recent) · `89c3732e-IMG_5807.png` (Automations empty state) · `df06d338-IMG_5808.png`
(composer + "Get started" checklist — the source of the pipeline pattern).

Supporting: 76 Devin captures in `.bobby/design/inspiration/devin/`, gallery notes in
`.bobby/design/inspiration/README.md`, round history in `references-feature-view.md`.

**The rule that made this work, learned the hard way:** cards are for *choosing*
between things, never for displaying status. Status lives in bare rows on the ground.
Eight earlier mockups put status in a bordered card with a tinted stripe; that was the
"looks AI / looks amateur" tell, and it was structural, not cosmetic.

---

## Changelog

- 2026-08-06 — Spec created and locked. Direction "Track to finish" chosen by CC over
  the bolder no-connector variant.
- 2026-08-07 — The three modal sheets brought onto the system (TKT-027), and the bottom
  nav moved after `<main>` in the DOM so content is reached first (TKT-032). The sheets
  are governed from here on: they share `.appview`'s button rules via added `.sheet`
  selectors rather than owning a copy. Three deviations recorded above (form-control
  border, 15px sheet title, 15px control text). `--bad` left the routine send-back and
  stop controls entirely; `.btn-danger` is deleted.
- 2026-08-07 — Home brought onto the system (TKT-007). Status left its cards for bare
  rows in one container; the three-button row became primary + outline secondary, with
  "look first" carried by the row itself; the mono wordmark and the global topbar are
  hidden on both views. Feature's selectors moved from `#view-feature` to a shared
  `.appview`. Two deviations recorded above (`--mono` command, `.btn-quiet` border);
  the latter changes the Feature view's "Send back" too, which is intended — the two
  views move together or they are not one system.
- 2026-08-07 — The **Workspace** brought onto the system (TKT-010), the last view on the
  old chrome. Its live log and diff go light as recessed instrument panels on
  `--fill-active`; the decision, the contrast that chose that token over `--fill-track`,
  and the three things the brief permitted that measurement ruled out (tinted diff rows,
  blue tool lines, a `dvh` pane height) are all in Deviations above. Its status words are
  Home's and the ticket page's, not a second vocabulary — `STATUS_LABEL` is deleted. Its
  back control is a chevron rather than the board glyph, also recorded. Taking this view
  on made ten CSS blocks and three `lib/ui.js` exports dead; they are gone, which closes
  most of the TKT-027 "pre-existing values" list under Open.
- 2026-08-08 — **The pipeline's length is the workflow's, and the spec now says so**
  (TKT-055). The five steps were never in the code: it has always drawn one node per
  stage of `/api/workflows`, and `default` is simply what resolves to five. What was
  missing is that nothing ever *selected* the workflow — with no `workflow:` in the
  epic's frontmatter it fell through to `default`, so a design epic was drawn against a
  vocabulary that has no word for where it is: "0 of 5", every glyph hollow, above four
  children plainly underway. The workflow is now inferred from the stages actually in
  play when the file is silent (conservatively — only a stage `default` cannot name can
  move a feature off it), and **"current" is defined as *work sits here* rather than *a
  run owns this***, so a step a ticket is standing on is never drawn done or
  not-started. The chequered terminus is untouched; seven steps cost 238px of height and
  no width at 390; nothing is condensed, wrapped or truncated. The "Decided" row now
  names the connector-and-flag as the invariant rather than the number five.
  Two Board rules arrived with it: a row drops the stage word wherever the lane heading
  already says it (TKT-056 — twelve lanes since TKT-050 meant twelve echoes, and the id
  was pushed behind a word already on screen), and lane headings and ids are made unique
  rather than assumed unique (TKT-054 — two lanes shared one id, so `aria-labelledby`
  announced one lane as another).
- 2026-08-08 — **Three conformance failures from the check on that work, and the two
  places this spec was arguing with itself.** (1) The count had two rules written a
  sentence apart — "the least advanced ticket" and "the epic's own stage answers
  whenever the track names it" — and the code implemented the second, so an epic ahead
  of a child drew "3 of 7", two done checks on steps no ticket had reached, and blue road
  running out of a glyph drawn as current (TKT-057). One rule now: the tickets answer,
  the epic's stage answers the separate question of where the *run* is, and the count is
  clamped to the first parked step so the two can never contradict the glyphs.
  (2) Heading uniqueness stopped at the lane boundary: `Features` and `Blocked` are fixed
  sections with fixed ids, and a hand-typed `Blocked` stage minted `lane-blocked-head`
  twice over, so a lane was announced as the Blocked section — exactly what TKT-054 was
  filed to prevent (TKT-058). Uniqueness is now decided against every section drawn, and
  a lane whose words collide with a fixed section is qualified `Blocked (stage)`.
  (3) Step names were said here to be "the stage as words" and were not — they come from
  the step, and they have to, because `design-build` and `design-check` park in
  `building` and `reviewing`. The spec now describes that, and the rows take the step's
  word rather than a second one (TKT-059). The tap-target floor stops claiming to be
  verified while TKT-060 is open.
