# Reference Set — Bobby App "Feature view" (light theme) — LIVE, rounds 2–3

> **Round 3 (breadth).** After the four round-2 refs, the user said *"Let's find some more."* Five new
> worlds sampled, three kept — all real, openable, rendered live in light mode, exact tokens extracted.
> The round-2 four are **kept**; these **add** to the set. The new material is in **§5** at the bottom;
> the round-2 body is unchanged below.

---

# Reference Set — Bobby App "Feature view" (light theme) — LIVE, round 2

**Job:** bobby-design-research · **Subject:** the Feature view in the Bobby App — a live screen where a
solo dev watches an *epic* (2–8 child tickets) move through a fixed workflow pipeline (plan → build →
review → test), with one primary action that morphs Build → Approve / Send back → Merge as the run advances.

**Hard constraint:** the theme is **LIGHT**, designed on purpose. Dark may exist as a secondary theme only.

> **Round 2.** The user asked whether the concepts came from real sites, then said *"Find real inspiration
> from images or sites."* So every reference below is a **working URL, rendered live, with EXACT tokens
> pulled from computed styles / the stylesheet.** The round-1 physical references (Beck tube map, Solari
> board, Apollo MOCR) are kept on disk but **marked superseded** for this ticket.
>
> Scoped file. The folder's `references.md` / `design-spec.md` are the **homepage** ("Stage" direction) and
> are left untouched — existing system wins.

---

## 0. Structure — unchanged from round 1 (SKILL.md step 1b)

Default refused: *"a list of child tickets with attributes."* Recommended structure: a **PIPELINE /
progress-track rendered as a STAGE** — an ordered set of stations the feature travels through, drawn as one
live composition whose lamps change in place, with a **Briefing** "what needs you" summary up top. Child
tickets are subordinate: they live *at* their current station, not in a top-level list. The one morphing
action sits at the gate. (Full reasoning and the alternatives table are retained below in §4.)

**This structure is confirmed by the live references:** the strongest real-world screens with our shape
(GitLab pipelines, GitHub Actions) draw exactly this — an ordered stage-ribbon per item with a status pill
and a human gate — and they do it in *light theme without a single left-stripe or pulse*.

---

## 1. The cited set — real, openable, rendered live, exact tokens

All rendered 2026-08-02 at 1440×900, `colorScheme: light`, tokens pulled from live computed styles / `:root`.
Screenshots saved to `.bobby/design/shots/`. Confidence tag per value: **`extracted`** (live CSS/computed) ·
**`observed`** (read from the screenshot I took). No `estimated`/from-memory values this round.

| Reference | Open it | What's good — the *thinking* | Exact tokens (extracted) | Screenshot | Teardown |
|---|---|---|---|---|---|
| **GitLab CI Pipelines** | <https://gitlab.com/gitlab-org/gitlab/-/pipelines> | The honest real-world version of our screen: each row = a pipeline, with a **status pill + an ordered ribbon of connected stage-circles**; state is a **tonal badge**, never a stripe. | Canvas `#ECECEF`, surface `#FFFFFF`, ink `#3A383F`; status = tint-bg + dark-same-hue text → success `#C3E6CD`/`#306440`, running `#CBE2F9`/`#2F5CA0`, warning `#F5D9A8`/`#894B16`, failed `#FDD4CD`/`#A32C12`, pending `#DCDCDE`/`#89888D`; face **GitLab Sans**; pill radius `20px`. | `shots/gitlab-pipes.png` | `teardown-gitlab-pipelines.md` |
| **GitHub Actions** (run list) | <https://github.com/vercel/next.js/actions> | Shows the **literal gate in a shipping product, in light**: a run waiting on a human reads **"Action required"** (amber ⚠). Row = status glyph → identity → branch → elapsed. | Canvas `#F6F8FA` (blue-biased), surface `#FFFFFF`, ink `#1F2328`, muted `#59636E`; amber needs-attention tonal `#FEF7E0`/`#7A5300`; face **Mona Sans VF**; easing `--base-easing-easeOut: cubic-bezier(.3,.8,.6,1)`; radius `6px`. | `shots/ghactions-run.png` | `teardown-github-actions.md` |
| **Atlassian Statuspage** (GitHub + Cloudflare status) | <https://www.githubstatus.com/> · <https://www.cloudflarestatus.com/> | A **briefing, not a dashboard**: one bold full-width banner answers the state first ("All Systems Operational" / amber incident), then quiet component rows + **mono timestamps** + ordered incident-update stages. **Not a dev dashboard.** | Canvas `#F6F8FA`/`#F7F7F8`, surface `#FFFFFF`, ink `#24292E`, muted `#6A737D`; operational green `#28A745`; incident amber tonal `#FEF7E0`/`#7A5300`; **`--font-stack-b: "Atlassian Mono"`** for timestamps; radius `4–8px`. | `shots/ghstatus.png` · `shots/cfstatus.png` | `teardown-statuspage.md` |
| **Plausible Analytics** (live demo) | <https://plausible.io/plausible.io> | A **calm instrument**: big-figure stat tiles (tiny label + 800-weight number + green/red delta) + a **subtle in-row tint bar** for magnitude + huge whitespace + one accent. **Not a dev dashboard.** | Ground `oklch(0.985 0 0)` ≈ `#FAFAFA`, ink `oklch(0.21…)` ≈ `#27272A`, muted ≈ `#71717A`; figures 36px/**800**; radius `6px`; accent `oklch(0.511 0.262 277)` ≈ `#4F46E5` indigo — **DROP (purple zone), substitute `#005FC6`**. | `shots/plausible.png` | `teardown-plausible-live.md` |

**Rejected while hunting (recorded so the search is auditable):** **Linear** (`linear.app/homepage`) — rendered
live but **dark** (`#08090A`) and set in **Inter** (a slop face); no reachable light view without auth, so out
for a light design.

---

## 2. Category norm — what every AI-agent-runner dashboard looks like (so we diverge on purpose)

> A **dark control room**: a left rail of tickets, cards each wearing a **3–4px coloured left-border stripe**
> as the stage indicator, a **pulsing status dot**, a **VibeCode-purple** accent, and progress as a thin bar
> or grey→green step pills. The current Bobby app is exactly this (`#0e0f12`, `#8b5cf6`, `.status-dot.running{animation:pulse}`).

Every live reference above **retires** those tells in a real shipping product: GitLab and GitHub carry
stage-state in a **tonal glyph/pill** (tint-bg + dark-same-hue-text), not a stripe; none pulse a resting row;
none use purple; all are **light**. That is the proof the divergence is buildable, not aspirational.

---

## 3. Three concept directions (different worlds, each anchored to real URLs + exact tokens)

All three: light-theme, pipeline-rendered-as-stage, one morphing action at the gate, and every tell retired.
They differ in *what real world the screen borrows from*.

### Direction A — **"The Ribbon"**  ·  anchors: [GitLab Pipelines](https://gitlab.com/gitlab-org/gitlab/-/pipelines) + [GitHub Actions](https://github.com/vercel/next.js/actions)
- **What it says:** *"Your feature is a run. See the ordered stages, where each ticket sits, and the one that needs your call."*
- **Signature move (visible):** the workflow is a **horizontal ribbon of four connected stage-nodes** (plan→build→review→test) rendered as **GitLab-style tonal status circles**; each child ticket is a row whose ribbon shows *its* position; the feature's overall **status pill** leads the row. The **gate node** (waiting on you) is the emphasised node and carries GitHub's **"Action required"** treatment — that node *is* where Build → Approve / Send back / Merge lives.
- **How it structures the screen:** header = feature identity + overall status pill; body = one row per child ticket, each an ordered stage-ribbon; the current gate node holds the morphing action. Refuses the list — the ribbon is the spine.
- **Light ground:** `#F6F8FA` (GitHub blue-biased canvas, `extracted`) or GitLab `#ECECEF`; surfaces `#FFFFFF`. **Stage colour = the GitLab tonal system** (tint-bg + dark-same-hue text), living **in the node/pill** — never a stripe.
- **Slop pass:** kills the left-stripe (state is a tonal glyph), no purple (blue/green/amber/red tonal set), no pulse (nodes advance discretely via Primer `easeOut`). *Tell to watch:* it's the closest to the CI category — divergence comes from curating to **exactly four named stages** and the calm ground, not a dense CI graph.
- **Risk:** low. The safest, most legible-to-existing-users, and demonstrably buildable in light.

### Direction B — **"The Briefing"**  ·  anchor: [Atlassian Statuspage](https://www.githubstatus.com/) (GitHub / Cloudflare status)
- **What it says:** *"One line tells you if the feature needs you. Everything else is detail you read only if it does."*
- **Signature move (visible):** lead with **one bold full-width banner** stating the whole feature's state — green *"All clear — building 4 tickets"* or amber *"Review needed — build passed on 3 of 4"* (modeled on "All Systems Operational"). Below, each child ticket is a **quiet white component row** with a **4-stage progress bar** (the Statuspage uptime-bar re-mapped to plan→build→review→test) and **mono timestamps**. The morphing action lives **in the banner**.
- **How it structures the screen:** banner (Briefing) → component rows (tickets) → ordered gate-history as an update list. Summary first, detail on demand.
- **Light ground:** `#F6F8FA`/`#F7F7F8` (`extracted`), surfaces `#FFFFFF`, ink `#24292E`. Banner colour = state (green `#28A745` clear / amber tonal `#FEF7E0`+`#7A5300` needs-you); **mono** (`Atlassian Mono` → our mono stack) for timestamps/figures.
- **Slop pass:** no stripe (state is the banner + row bar), no purple, no pulse (state is stated). *Tell to watch:* rows must stay a *briefing* (one loud banner, quiet rows) and not slide back into a scannable list — the banner carries the weight.
- **Risk:** medium. A genuinely different world (ops-status comms) that reframes the screen around "what needs me," not a pipeline graph.

### Direction C — **"The Panel"**  ·  anchor: [Plausible Analytics](https://plausible.io/plausible.io)
- **What it says:** *"Progress as a few big, calm numbers — not a graph, not a table. Glance and go."*
- **Signature move (visible):** the feature's progress is stated as **big-figure readouts** — a row of Plausible-style stat tiles (tiny uppercase label + **36px / weight-800** number + a coloured delta): e.g. **"3 / 4 past review"**, **"BUILD"** current stage, **"12m"** elapsed. Each child ticket is a **single row with a subtle in-row tint bar** filling to its stage — magnitude as the only decoration. Whitespace-forward, near-white, exactly one accent. The morphing action is one confident button, not a control cluster.
- **How it structures the screen:** big-figure summary band → quiet ticket rows with progress-fill → one gate action. Refuses both the graph and the list.
- **Light ground:** `#FAFAFA` (`extracted`, oklch 0.985), ink `#27272A`; hairlines + whitespace instead of shadows. **One accent = brand blue `#005FC6`** (Plausible's indigo `#4F46E5` **dropped** — purple zone); colour otherwise reserved for deltas/state.
- **Slop pass:** no stripe (progress is an in-row fill), **no purple — the one point where we override the reference** (indigo dropped, logged), no pulse (figures update discretely), no stacked border+shadow. *Tell to watch:* labels must clear the 13px floor (Plausible runs 12px).
- **Risk:** **the real risk.** Applies analytics restraint to a pipeline — unexpected, un-dashboardy, and it deliberately hides the stage graph in favour of a few numbers. Bold if it lands; too quiet if the "what needs me" gate isn't loud enough — that tension is the thing to test with the user.

**Three different worlds:** a CI run-ribbon · an ops status briefing · a calm analytics panel — all real, all
light, all with exact extracted tokens, all retiring stripe/pulse/purple. A stranger would not confuse which
world each belongs to.

---

## 4. Structure — full reasoning (retained from round 1)

**Default named, so it can be refused:** *"a list of child tickets with attributes (id · title · stage · status)."*
Refused because (a) the tickets aren't the subject — *where the feature is, and whether it's waiting on you*
is; (b) 2–8 items checked periodically with gate decisions is not a scannable inventory; (c) the screen is live.

| Shape | Fit | Verdict |
|---|---|---|
| **List** | Many items, comparison matters | ✗ too few items; buries the one fact |
| **Pipeline / Assembly line** | Few items, ordered progression, gate | ✓ **the spine** |
| **Stage** (composition, states swap in place) | Small fixed set, live | ✓ **the rendering** |
| **Briefing** (summary first) | Checked periodically; "what needs me" | ✓ **the top register** |
| **Queue** (one item, decide, advance) | Each needs a decision | ~ the *gate* is right; but the feature moves as one batch |

**Recommendation:** pipeline/progress-track rendered as a Stage, with a Briefing lead. Child tickets live at
their station. The one morphing action sits at the gate.

---

## Method note
GitLab, GitHub Actions, Atlassian Statuspage, and Plausible were each opened at a public no-login URL,
rendered live with Playwright (`colorScheme: light`), screenshotted to `.bobby/design/shots/`, and their
tokens pulled from live computed styles / `:root` custom properties — every value tagged `extracted` or
`observed`, none from memory. Linear was rendered and rejected for being dark + Inter. The one deliberate
override of a reference is Plausible's indigo accent, dropped for the brand blue and logged as such.

---

## 5. Round 3 — three more worlds (breadth), real + openable + rendered live + light

The user wanted more before committing. I ranged deliberately outside CI tooling: a **progress metaphor**, a
**stage-ribbon done warmly**, and a **consumer stepper**. Same rigor — every value `extracted` (live CSS/computed)
or `observed` (from the screenshot I took), none from memory. Screenshots in `.bobby/design/shots/`.

### New cited set

| Reference | Open it | What we'd take | Potential signature move for THIS screen | Exact tokens (extracted) | Screenshot | Teardown |
|---|---|---|---|---|---|---|
| **Basecamp Hill Charts** ⭐ | <https://basecamp.com/hill-charts> · thinking: <https://basecamp.com/shapeup/3.4-chapter-13> | Progress as **position on a hill** (confidence, not %); child ticket = a labelled **dot**; calm oklch pastel grounds + slate-teal ink. | Tickets as dots climbing a hill — plan/build = uphill, **crest = the review gate**, review→test→merge = downhill; the dot at the crest is the one needing your call. | Ground oklch pastels: blue `#EDF0F7`, warm `#F6F2EC`, green `#ECF3EE`; ink `#33434B`; blue `#2E6FD6`, green `#2E9E5B`; face **Graphik** (book: FF Meta Serif). | `shots/hillchart-real.png` · `shots/shapeup-hill.png` | `teardown-hill-charts.md` |
| **Buildkite Pipelines** | <https://buildkite.com/features/pipelines> | The **stage-pill ribbon anatomy** (identity+elapsed → ordered tonal pills → action); one amber pending pill as the focus; a docked **Rebuild/gate** action. | The pipeline as a soft **stage-pill ribbon** with exactly one amber "live/next" pill and the morphing action docked to the run. | Page ground `#FDFDFF`, ink `#383451` (violet-slate), face **Aeonik**, pill radius `8px`; product card is **dark** — take structure only. | `shots/buildkite.png` | `teardown-buildkite.md` |
| **Order-tracking stepper** | <https://www.bootdey.com/snippets/view/Shop-Order-Tracking> | The **friendly icon-stepper** (done+connected → current → grey+upcoming), drawn phase icons, a plain-language status line; mono IDs. | The four stages as a warm **icon-stepper** with a filling connector line + drawn phase icons (plan/build/review/test) — the "even non-technical brains get it" register. | Page `#F2F6F8`, ink `#182359`; **take the pattern, not Bootstrap's tokens**; IDs in `source-code-pro` (mono). | `shots/ordertrack.png` | `teardown-order-tracking.md` |

### Screenshot file paths (the actual inspiration to look at)
- `/Users/ccevans/Repos/bobby-wt/bobby-app/.bobby/design/shots/hillchart-real.png` — the interactive hill with labelled dots
- `/Users/ccevans/Repos/bobby-wt/bobby-app/.bobby/design/shots/shapeup-hill.png` — Shape Up "Show Progress" (the thinking, calm serif)
- `/Users/ccevans/Repos/bobby-wt/bobby-app/.bobby/design/shots/buildkite.png` — the stage-pill run card (Upload✓ Build✓ Test✓ Package✓ · Deploy pending · Rebuild)
- `/Users/ccevans/Repos/bobby-wt/bobby-app/.bobby/design/shots/ordertrack.png` — the 5-step icon-stepper (done/current/upcoming)

### Rendered and rejected (so the wider search is auditable)
- **Inngest** (`inngest.com`) — **dark** (`#0C0A09`). · **Trigger.dev** (`trigger.dev`) — **dark** (`#121317`, Geist). · **n8n** (`n8n.io`) — **dark** (`#0E0918`). All dark-only on the public site → out for a light design.
- **Duolingo** (`duolingo.com`) — **light** and warm (green `#58CC02`, feather font), but the actual **learning path is auth-walled**; the marketing page doesn't show it. Kept only as a token/idea note, not a rendered-shape reference. (`shots/duolingo.png`)
- **Netlify Deploy Previews** (`netlify.com/products/deploy-previews`) — **light** and nicely typed (Figtree 800 + **Martian Mono** labels + teal), but the page shows feature cards, **not** an ordered-stage UI → off-shape. (`shots/netlify.png`)
- **Render** (`render.com`) — light marketing (Roobert), no pipeline UI shown → off-shape.

### New concept direction suggested by the breadth

**Direction D — "The Hill"** · anchor: [Basecamp Hill Charts](https://basecamp.com/hill-charts)
- **What it says:** *"Forget percentages. See how sure we are — which tickets are past the hard part and which are still risky."*
- **Signature move (visible):** the feature's child tickets are **labelled dots on one hill curve**. The **uphill** side is "figuring it out" (plan → build), the **crest is the review gate**, the **downhill** is "shipping it" (review → test → merge). A ticket's dot position *is* its phase-and-confidence; the dot sitting **at the crest** is the one waiting on your call, and it carries the morphing action. Progress is a **saved snapshot you can step through** (arrows), not a live wiggle.
- **How it structures the screen:** one hill = the whole feature; dots = tickets; crest = the gate. A quiet legend and a plain status line frame it. It is the **anti-dashboard** — no bars, no lamps, no stripes.
- **Light ground:** a Basecamp **oklch pastel** — warm `#F6F2EC` or cool-blue `#EDF0F7` (`extracted`); ink `#33434B`; phase colour lives **in the dot** (green crested / orange downhill / blue upslope). No purple, no stripe, no pulse.
- **Slop pass:** kills stripe/pulse/purple by construction; the risk is legibility — "position = stage" needs a one-time legend, and a stranger must be able to read "past the gate = downhill." That's the thing to test.
- **Risk:** **the real risk of the whole set** — the most memorable and least dashboard-like, but it reframes "stage" as "confidence," which is a genuine bet. A strong candidate to *replace* round-2's "The Panel" as the bold option, or to sit beside it.

**Also noted (a warm register, not a new world):** the **order-tracking stepper** and **Buildkite** both reinforce
round-2 **Direction A "The Ribbon."** They offer a *warmer register* of it — call it **"The Stepper"**: rounded
icon-nodes joined by a filling line (plan→build→review→test) with drawn phase icons, instead of GitLab's terse
engineering circles. Same structure, friendlier voice; worth showing as an A-variant rather than a fourth world.

---

## 6. Round 4 — the CREATIVE swing (worlds far outside software)

> The user asked for **"more creative ideas."** So this round leaves the software category entirely and
> hunts the artifact, not the app: **transit, music, craft, play.** Same rigor — every reference below was
> **opened**: rendered live in light mode with Playwright, or (for the physical board) downloaded as a real
> image and viewed. Every value tagged `extracted` (live CSS/computed), `observed` (from the shot I took),
> or explicitly **not taken**. Nothing from memory. Directions **E · F · G** are proposed at the end and do
> **not** resemble A–D (ribbon / stepper / briefing / panel / hill). Screenshots in `.bobby/design/shots/`.

### New cited set — four worlds, none of them software

| Reference | World | Open it | What's good — the *thinking* | What we take | Signature move | Exact tokens | Shot · Teardown |
|---|---|---|---|---|---|---|---|
| **Ableton — Learning Music** (Make Beats) ⭐ | music / making | <https://learningmusic.ableton.com/make-beats/make-beats.html> | The closest real artifact to "a live thing moving through ordered stages": a **playhead sweeps a row of numbered cells**; each cell is simply on/off. Position of the head = now; the moving head is the *only* animation, so nothing else has to pulse. | The **sweeping-playhead-over-ordered-cells** as the live indicator; on/off cell as per-stage state. Palette **not taken** (site is grey-grounded). | A playhead sweeping numbered cells; each cell on or off. | Ground `#666` grey (**rejected → we go light**); display **Futura PT** 48/700; ink navy **`#00004C`**; active cell yellow ≈`#FFC92E`; controls = one ▶ / Clear / Export. | `ableton-beats.png`, `ableton-music.png` · `teardown-ableton-learningmusic.md` |
| **DC Metro — Live Map** ⭐ | transit / journey | <https://dcmetromap.com/live-map/> | The canonical "ordered journey with live position," and it's **light**: one coloured line, ordered station nodes, a **train dot moving in real time**, a bolder **interchange node** as the decision point. Zero stripes/pulse; purple here is an *earned* line, not a default. | **Single-line-as-pipeline**: 4 stages = 4 stations on one line; the run = a train dot between them; the **gate = a bolder interchange node**. Colour lives in line+node, never a card edge. | One coloured line · ordered nodes · a moving train dot · a ringed interchange = the gate. | Map near-white; panel **`#F5F5F7`**; surface `#FFFFFF`; warm callout `#FFEDD5`; mono `ui-monospace…`; lines red`#D8232A`/blue`#0072C6`/orange`#F7941E`/green`#00A94F` (`observed`). | `dcmetro-live.png` · `teardown-dcmetro-live.md` |
| **Timer.Coffee** (guided brew) | craft / making | <https://www.timer.coffee/> · <https://app.timer.coffee/> | A brew recipe rendered as a **guided run, not a checklist**: a **"Step 1/8"** counter, a **big countdown ring** for the *current* step only, one plain-language "now", and a **"Next:" peek**. Warm kitchen voice — the opposite of a control room. | The **"one live step gets a big ring; the rest are now/next context"** pattern + the warm making-voice. Typography **not taken** (Inter). | A big countdown ring for the step you're on + "Step N/M" + a quiet "Next:". | App screen: white ground; ring orange ≈`#E8863C`; step counter + "Next:" peek; monoline method icons. Marketing = Inter (rejected). | `timercoffee.png`, `timercoffee-app.png` · `teardown-timercoffee.md` |
| **Game of the Goose** (spiral board) | play / board game | <https://commons.wikimedia.org/wiki/File:Chess_and_goose_game_board_MET_155503.jpg> | The oldest "advance through ordered stages to a goal" interface: a **spiral of numbered cells**, a token whose **position = its whole state**, and the **centre = the goal/gate**. Purest proof that position on a path is a complete status. | **Structure only:** ordered track where position=stage + one distinguished **goal cell**. Reinforces the transit line; offers a playful "race to done" voice. | An ordered numbered track; position is the status; one cell is the goal. | **B&W antique photo — no palette/type taken.** Nostalgia flagged (Victorian parlour game). | `board-goose-met.jpg` · `teardown-goose-board.md` |

### Screenshot file paths (the actual inspiration to look at)
- `/Users/ccevans/Repos/bobby-wt/bobby-app/.bobby/design/shots/ableton-beats.png` — the step sequencer: yellow on/off cells, numbered 1–16, playhead scrubber above the grid
- `/Users/ccevans/Repos/bobby-wt/bobby-app/.bobby/design/shots/ableton-synths.png` — sibling Learning Synths (the navy ink + saturated-accent-per-module palette)
- `/Users/ccevans/Repos/bobby-wt/bobby-app/.bobby/design/shots/dcmetro-live.png` — the live transit map: coloured lines, station + interchange nodes, quiet docked panel
- `/Users/ccevans/Repos/bobby-wt/bobby-app/.bobby/design/shots/timercoffee.png` — marketing + in-mockup app screen ("Step 1/8", ring "5/10 s", "Next: Swirl…")
- `/Users/ccevans/Repos/bobby-wt/bobby-app/.bobby/design/shots/timercoffee-app.png` — the web app method picker ("What do you brew with?")
- `/Users/ccevans/Repos/bobby-wt/bobby-app/.bobby/design/shots/board-goose-met.jpg` — the spiral race-to-the-centre board

### Rendered / opened and REJECTED (so the wider hunt stays auditable)
- **Flightradar24** (`flightradar24.com`) — the flight-progress-arc metaphor is perfect, but the default basemap renders **dark teal**; no clean light view without fiddling. **Out for a light design.** (`shots/flightradar.png`)
- **Tide-Forecast** (`tide-forecast.com`) — the "Live Tide" widget (a wave curve + a red *now*-bug + "next high tide in 1h58m") is a real on-shape move, but the page is **ad-junk** (toe-fungus ad mid-fold) and set in generic Helvetica-Neue blue — too poor to cite as a *design* reference. Concept noted, execution rejected. (`shots/tidechart.png`)
- **ESPN Gamecast / Play-by-Play** (`espn.com/nfl/game/_/gameId/401547635`) — rendered **light** and clean, but the iconic **football-field-with-ball / end-zone-as-gate** graphic is **live-game-only** and won't render in August; the completed page shows a win-probability *curve* (off-shape) + a drive *list* (the list we refuse). The field metaphor is real but I won't cite it from memory. (`shots/espn-gamecast2.png`, `shots/espn-drive.png`)
- **Ableton Learning Synths playground** — light and lovely (navy ink + saturated accents) but it's a grid of **module cards**, not an ordered sequencer; kept only as a palette cross-check for the Make-Beats reference. (`shots/ableton-synths.png`)

---

## 7. Round 4 — three BOLD new directions (E · F · G) — nothing like A–D

All three: light theme, pipeline-as-ordered-progression, one morphing action at the gate, every category tell
(left-stripe · pulse · VibeCode purple) retired **by construction**. They differ in *which non-software world*
the screen borrows from. Each names its anchor, its ONE signature move for THIS screen, how it maps the pipeline
+ child tickets + the morphing gate, its light ground, and a concept-level slop pass.

### Direction E — **"The Sequencer"**  ·  anchor: [Ableton Learning Music](https://learningmusic.ableton.com/make-beats/make-beats.html)  ·  **THE RISK PICK**
- **What this says:** *"Your feature is a loop that's playing. The playhead is on the stage running right now — watch it move."*
- **Signature move (visible, subject-specific):** the four stages are a **row of four wide cells — PLAN · BUILD · REVIEW · TEST** — and a **playhead line sweeps across them in real time as agents run.** A **passed** cell is filled (solid tint); the **cell under the playhead** is the live stage and quietly glows; **upcoming** cells are hairline outlines. When the run hits a human gate the **playhead parks at that cell and it arms** — the cell *becomes* the morphing button (Build → Approve/Send back → Merge). The single moving playhead is the only animation on the screen; nothing else pulses, because it doesn't have to.
- **Maps the screen:** the feature's four-cell sequencer is the spine at the top (the whole feature's position). Each **child ticket is its own thin sequencer lane** below, its playhead at *its* stage — so you read all 2–8 tickets as stacked loops, instantly seeing which lag. The **gate = the parked+armed cell**, and it holds the one action. Refuses the list; the lane *is* the row.
- **Light ground:** a picked cool paper **`#F4F5F7`** (neutral, faintly cool — deliberately *not* cream). Cells: passed = tonal fill, live = same hue at higher chroma + soft glow, upcoming = 1px outline. Navy ink `#1B1D2A`. One accent for the playhead/armed cell (brand blue `#005FC6`) — Ableton's grey ground and yellow are **not** taken.
- **Slop pass (concept level):** no left-stripe (state is cell fill), **no purple**, **no pulsing dot** — the playhead's honest left→right motion replaces the fake-live pulse (this is the *antidote* to the pulse tell, not a version of it). One layout primitive (the lane) repeated for every ticket. *Tell to watch:* the glow on the live cell must stay a single soft state, not a saturated halo; and motion must be `transform`-based (the playhead translates), never animating width.
- **Risk:** **the real risk — and the most memorable thing we could ship.** A dev tool that reads like a step-sequencer is genuinely surprising; if the "four cells + moving playhead + parked-armed gate" lands, it's the signature. The bet: does a solo builder *love* the music metaphor or find it un-serious? That's the thing to put in front of the user.

### Direction F — **"The Line"**  ·  anchor: [DC Metro Live Map](https://dcmetromap.com/live-map/) (+ the transit line-diagram / [Game of the Goose](https://commons.wikimedia.org/wiki/File:Chess_and_goose_game_board_MET_155503.jpg) as the race-to-a-terminus reinforcement)
- **What this says:** *"Your feature is on a line. It's between stations. The next interchange is where you get on."*
- **Signature move (visible):** the pipeline is **one horizontal transit line** with four **station nodes** (Plan · Build · Review · Test) and a **terminus = Merge/Done**. The running feature is a **train dot that sits *between* stations** — mid-segment when an agent is working, *at* a station when that stage is complete. The **gate is drawn as a bolder ringed interchange node**; that node carries the "WAITING ON YOU" label and *is* the morphing action (Build → Approve/Send back → Merge). State is read as **position on a route**, never a status word.
- **Maps the screen:** the top line is the feature's overall position. Each **child ticket is its own short line** (same four stations) stacked below, its train dot showing where that ticket is — 2–8 parallel lines, like a strip timetable. The **interchange node** is the only place a human acts. It's a transit map, so it's a *composition*, not a list.
- **Light ground:** DC Metro's near-white map + **`#F5F5F7`** (`extracted`) docked control/legend panel; surface `#FFFFFF`. **One** line colour for the route (brand blue `#005FC6`), not the multi-line rainbow — stage *state* lives in the node (done = filled, live = ringed, upcoming = hollow), the interchange gate gets the one warm accent (amber `#B25E09`). Mono (`ui-monospace`) for elapsed/timestamps, inherited from the ref.
- **Slop pass:** no stripe (state is the node), no purple-by-default (one earned blue line + amber gate), no pulse (the dot *moves*, discretely, between stations). One primitive (the line) repeated per ticket. *Tell to watch:* keep it to **one** line colour + node states — the temptation is to rainbow the stages back into a CI graph; the calm comes from restraint. A one-time legend teaches "between stations = working."
- **Risk:** medium-high. A transit line is a warm, universally-legible frame that *nobody* expects on an agent runner, and it maps our exact 4-stages-plus-terminus perfectly. Less of a leap than the Sequencer, more memorable than anything in A–D.

### Direction G — **"The Brew"**  ·  anchor: [Timer.Coffee](https://www.timer.coffee/)
- **What this says:** *"You're tending a pour. One stage is live and on the timer; the rest is just now and next."*
- **Signature move (visible):** the feature is a **guided brew**. The **currently-running stage gets one big countdown/progress ring** in the centre (the stage name inside it — "REVIEW", with "3 of 4 tickets" and elapsed), exactly Timer.Coffee's live-step ring. Around/under it: a **"Step 2 of 4"** counter, a **plain-language "now"** line ("Claude is reviewing your changes"), and a quiet **"Next: Test"** peek. When the ring completes on a gated stage it turns into the **"taste / serve" gate** — the morphing action (Approve → the ring refills for Test; Merge → the pour is done). Warm, human, single-focus.
- **Maps the screen:** the big ring is the feature's live stage. The 2–8 **child tickets are a quiet list of "ingredients"** beneath, each with a tiny 4-dot step-read of its own stage — subordinate to the one big ring, exactly as Timer.Coffee subordinates everything to the current step. The **gate is the ring completing**, holding the one action. It deliberately shows *one* thing loudly (what's brewing now) and everything else softly.
- **Light ground:** a **deliberately chosen warm neutral `#F6F4F1`** — warm for the kitchen/craft register but a restrained warm-grey, *not* a yellow cream-by-reflex (justified: the making-world voice; flagged so it's a decision). Ink `#2A2622`. Ring accent = a **cooked amber/orange `#C2631B`** for the live pour; green `#2E9E5B` when a stage completes. One accent family, warm.
- **Slop pass:** no stripe (progress is the ring), **no pulse** (the ring fills honestly over the real elapsed), **cream flagged and chosen, not reflexive** (the one place we deliberately touch a warm ground — logged here). Typography is *ours*, not Timer.Coffee's Inter. *Tell to watch:* a single big centred ring risks reading as a generic "loading spinner" — it must carry the stage *name* + counter + now/next text to stay a *briefing about a brew*, not a spinner; and it must not become a hero-metric card. One ring, one voice.
- **Risk:** medium. The boldest *tonal* swing — it makes the screen feel like tending coffee, not watching CI. Warmest and most human of the set; the tension to test is whether a single big ring feels too "one-thing-at-a-time" for a builder who wants to see all 8 tickets at once (the ingredient list answers that, but it's the thing to check).

**Three worlds, none of them software:** a music sequencer that *plays* · a transit line you *ride* · a pour you
*tend*. Each retires stripe/pulse/purple by construction, each is anchored to a reference that was actually opened
and rendered/viewed in light, and **E "The Sequencer" is the real risk** — the one that could be the most memorable
thing we ship. A stranger could not confuse which world any of the three belongs to, and none of them is A–D.

---

## 8. Round 5 — SUBTLE RACING (after the F1-broadcast mockup was rejected)

> The user saw `mockups/f1-timing.html` (literal TV-timing-graphics) and said *"look for better
> inspiration for the race car theme… make it subtle but great design and concepts."* So the racing
> theme **stays** but the register flips: racing DNA in the details of a premium light tool, not a
> broadcast overlay. This round hunted the *refined* racing design world. Same rigor — every reference
> opened and rendered live (or the image viewed + pixel-sampled); shots prefixed `racing-ref-` in
> `mockups/shots/`. Values tagged `extracted` (computed styles / pixel-sampled) or `observed` (read
> from my own screenshot).

### Cited set — the refined racing world

| Reference | Open it | What's good — the thinking | What we take | Exact values | Shot |
|---|---|---|---|---|---|
| **Minimal circuit diagram — "Monte Carlo Formula 1 track map.svg"** ⭐ | <https://en.wikipedia.org/wiki/Circuit_de_Monaco> (infobox map; file on Commons) | The canonical wordless racing artifact: **one thin closed line**, sectors drawn as **coloured segments of that same line** (S1 yellow / S2 red / S3 teal on this map), small numbered corner marks, a **checkered start/finish tick**, scale bar. Position on the line is a complete status. | **THE signature move**: pipeline = one closed circuit line, 4 sector segments (plan/build/review/test), start/finish tick = merge/done; state lives in the **colour of the line segment**, the gate = one accent sector + the car marker parked at it. | Ground `#F9F9F9`, track-line blue `#5050FF`, ink black (`extracted`, pixel-sampled); sector-as-coloured-segment + SF checker tick (`observed`). | `racing-ref-circuit-monaco.png` · `racing-ref-circuit-monaco-map.png` |
| **Farer — "Introducing the Racing Chronographs"** ⭐ | <https://farer.com/> | A racing *chronograph* product page that is light, calm and premium: pale grey ground, **navy ink**, light-weight wide-tracked uppercase display, and each dial carries exactly **one saturated accent hand** (orange / yellow) against porcelain. Measured-time language without a single broadcast cliché. | The **timing-instrument register**: navy ink on porcelain, tabular numerals, ONE accent doing all the signalling; display type quiet, tracked small. | Body ink `#021A30` (rgb 2,26,48 `extracted`), face FoundersGrotesk 18px, H2 70px/300 uppercase, tracking 6px (`extracted`); one-accent-hand-per-dial (`observed`). | `racing-ref-farer.png` |
| **Gulf 917 livery specimens** ⭐ | <https://commons.wikimedia.org/w/index.php?search=Gulf+Porsche+917&title=Special:MediaSearch&type=image> | The most beautiful palette in racing, on the actual cars (15 real 917s viewed): powder-blue body + one marigold centre stripe. Restraint: two hues, one of them dominant, the stripe used **once**. | The **livery palette, desaturated toward premium**: powder blue family + marigold accent; the single centre-stripe motif used exactly once as a header rule. | Pixel-sampled from the grid of real cars (`extracted`): powder blue `#8EB4CF` / light `#AED0E8` / deep `#7295AC`; marigold `#CF5412`–`#CD562C`. | `racing-ref-gulf917-search.png` |
| **Autodromo — "Instruments for Motoring"** | <https://www.autodromo.com/> | Motoring heritage told in a light editorial voice: white ground, plain Helvetica body, and headings as **small wide-tracked engraved caps** — instrument-dial typography, zero shouting. | The **small tracked-caps label register** for section labels and sector marks (S1–S4); the calm instruments-not-graphics attitude. | White `#FFFFFF`, ink `#000`, body Helvetica 17px, H1 "Engravers Gothic" **14px / tracking 3.5px** (`extracted`). | `racing-ref-autodromo.png` |
| **Pit boards (real specimens)** | <https://commons.wikimedia.org/w/index.php?search=pit+board&title=Special:MediaSearch&type=image> | The Ferrari pit-wall board (row 1): chunky mono numerals on a plain board — `P2 · L2 · 36.70 · 36.05`. The entire message is 4 figures; the medium is restraint under pressure. | The **big-figure treatment** for "1 / 4" (chunky tabular mono, no decoration) and the **pit-wall call voice** for the gate message ("Box this lap — review is ready"), typeset calmly. | White/yellow numerals on black board, grid-of-figures anatomy (`observed`). | `racing-ref-pitboard-search.png` |
| **Petrolicious** (supporting) | <https://petrolicious.com/> | Heritage-motoring editorial in light: white ground, near-black ink, tracked uppercase nav. Proof the subject reads premium on a calm light page. | Register cross-check only (its faces are Roboto — not taken). | Ground `#FFFFFF`, ink `#191415` (rgb 25,20,21 `extracted`), tracked caps nav (`observed`). | `racing-ref-petrolicious.png` |

### Rendered / opened and REJECTED (auditable)
- **formula1.com** circuit page — dark chrome + cookie wall; the broadcast world we're leaving. (`racing-ref-f1-circuit.png`, `racing-ref-f1-circuit-map.png`)
- **TAG Heuer Carrera** — bot-walled ("Access Denied"); no render, not cited.
- **Automobilist** — design-forward posters but the *shop itself* is loud commerce (Poppins, banner stack); posters unreachable as clean specimens. (`racing-ref-automobilist.png`)
- **Goodwood** — rendered light (gill-sans-nova 84px tracked caps) but the motorsport page is a photo-card wall, off-shape for a tool. (`racing-ref-goodwood.png`)
- **Martini livery** — real specimens viewed + sampled (navy `#12304F`, red `#CD0E0B`, blue `#3268CB`, `racing-ref-martini917-search.png`) but **one livery only**: Gulf chosen (harmonises with the cool light ground; Martini's tri-stripe wants more ink than "subtle" allows).

### The mockup this round feeds
`mockups/racing-subtle.html` — clean-minimal bones + circuit-line signature + Gulf-derived palette +
timing-mono numerals. Reference-backed exemptions logged in the mockup header comment.

---

## 9. Round 6 — the CRAFT hunt (galleries + shipped products, all light)

Prompted by *"Looks amateur — find me an inspiration online."*

Rounds 1–5 gathered **anatomy** (pipelines, steppers, transit lines, hill charts). None of them
looked at how a craftsman **renders** a screen. That is round 6, and it lives in full at:

**`.bobby/design/inspiration/README.md`** — 9 cited references + 1 anti-reference, every one
rendered live, screenshotted, and read by eye. Screenshots in `.bobby/design/inspiration/`.

**Headline finding.** Dribbble/Behance searches for this category return *presentation art* —
gradient grounds, angled phone renders, dark glow dashboards, violet accents, a card around
everything. Copying that is likely how we got "amateur". The real craft is in shipped light
products, and the four best (Things 3, Devin, Amie, Notion Calendar) share one move:

> **Nothing is in a card.** Rows sit on the ground; grouping is a small muted label plus
> whitespace; colour appears only on the thing that is live or needs you.

**New cited set:** Things 3 · Devin (Cognition) · Amie · Notion Calendar · Basecamp · Clerk ·
Vercel · GitHub PR · Stripe (partial) · Dribbble+Behance (anti-reference).

**New structural option raised:** Amie's *log with a docked `Actions` block* — a genuine
alternative to the pipeline ribbon for a screen that moves while you are away. Open question for
the user before analysis proceeds.

**Rendered and rejected (auditable):** Mobbin (auth-walled) · UI Garage (shut down) ·
Screenlane (→ paywalled pageflows.com) · Collect UI tag (404) · Godly (→ recent.design, modal) ·
Land-book (marketing sites, wrong artifact) · Height.app (ERR_CONNECTION_RESET) ·
Hey Screener (404, unverified — not cited) · GitHub merge box (login-walled) ·
Graphite / Raycast / Railway / Linear / Resend / Jules (all dark-grounded).
