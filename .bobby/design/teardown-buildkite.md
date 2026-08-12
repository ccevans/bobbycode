# Teardown — Buildkite Pipelines (live, light page)

**Openable:** <https://buildkite.com/features/pipelines> — public, no login. Rendered live 2026-08-02,
`colorScheme: light`. Screenshot: `.bobby/design/shots/buildkite.png`. **Extraction:** `extracted` = live computed
styles / `:root`; `observed` = screenshot.

## The four citation fields

| Field | |
|---|---|
| **Name** | Buildkite Pipelines — marketing page with a live product-UI card. |
| **Source** | <https://buildkite.com/features/pipelines> |
| **What's good (the thinking)** | The hero card is **the cleanest rendering of our exact shape**: a run ("Merge pull request #1924 · Running for 4s") over an **ordered ribbon of stage pills** — `Upload pipeline ✓ · Build ✓ · Test ✓ · Package ✓` (green tonal, checked) then `Deploy 🚀` (amber, pending) with a `»` overflow — plus an author line and a **`Rebuild`** action. It reads left-to-right as *done → done → done → the one still going*, and the single amber pill is the eye's target. Each pill carries a small **drawn glyph** (not emoji-as-icon in the real product). |
| **What we take** | The **stage-pill ribbon anatomy** (identity + elapsed on top, ordered tonal pills below, action on the right); the **one amber pending pill** as the "here's what's live / next" focus; a **`Rebuild`/gate action** docked to the run. |

## Extracted values

### Colour
- **Page (`extracted`):** ground `#FDFDFF` (faint cool white), ink `#383451` (a **violet-slate**, not grey), face **Aeonik**; primary button violet `≈#7A3FF1` `observed`.
- **Product card (`observed`):** the demo card itself is **dark** (`--terminal-bg #070224`) — stage pills are **green tonal** (passed, with check) and **amber** (Deploy, pending); running = an amber spinner. **We take the pill/ribbon anatomy and render it on a LIGHT surface** (GitLab's tonal light system already gives us the light equivalents).
- **ANSI/status tokens (`extracted`):** success green `#0DBC79`/`#23D18B`, warning `#EAB308`, error `#EF4444` — a conventional semantic set.

### Type — `extracted`
- **Face:** **Aeonik** (headings) + `ui-sans-serif` body. Distinctive, not a slop face. Body 16px; raise small labels to floor.

### Surface — `extracted` / `observed`
- **Radii:** buttons/pills `8px` `extracted`; stage pills are soft rounded rectangles (not full circles like GitLab) `observed`.
- **Ribbon:** pills separated by thin connectors, overflow collapses to `»` `observed` — same collapse convention as GitLab.
- **No left-stripe.** State is the pill fill + glyph.

## The true feel
Confident, product-forward. The page is quiet and light; the one loud thing is the run card, and within it the
one loud thing is the amber "Deploy" pill. That double focus — quiet page → quiet ribbon → one live pill — is
exactly the attention hierarchy the Feature view needs. `observed`.
**Honest caveat:** the demo *card* is dark; only the *page* is light. We inherit its **structure**, not its surface — the light rendering comes from GitLab's tonal system.

## Inherited rules (if this anchors/reinforces a direction)
1. Run header = **identity + elapsed + running indicator**; below it the ordered **stage-pill ribbon**; action docked right.
2. Exactly **one pill is "live/next"** (amber tonal) — the eye's single target; the rest recede.
3. Pills are **soft rounded rects with a drawn glyph**, tonal fill = state; overflow collapses to `»`.
4. A **`Rebuild`/gate action** lives on the run (our morphing Build → Approve → Merge).
5. Render on a **light** surface (Buildkite's card is dark — do not inherit the dark).
