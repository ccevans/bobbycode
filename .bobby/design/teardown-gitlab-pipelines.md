# Teardown — GitLab CI Pipelines (live, light theme)

**Openable:** <https://gitlab.com/gitlab-org/gitlab/-/pipelines> — public, no login. Rendered live
2026-08-02, `colorScheme: light`. Screenshot: `.bobby/design/shots/gitlab-pipes.png`.
**Extraction:** `extracted` = pulled from live computed styles / `:root` CSS vars. `observed` = read from the screenshot.

## The four citation fields

| Field | |
|---|---|
| **Name** | GitLab CI pipelines list — the pipeline-of-stages view. |
| **Source** | <https://gitlab.com/gitlab-org/gitlab/-/pipelines> |
| **What's good (the thinking)** | This is the **honest, real-world version of our exact screen**: each row is a pipeline (= a feature), with a **status pill** (Running / Passed / Failed / Warning) and a **Stages column that draws the ordered stages as a row of connected circular status glyphs**. State is a *tonal badge* — a soft tinted background with dark same-hue text — never an edge-stripe. The whole run's health is one glance: pill on the left, stage-circles in the middle, actions on the right. |
| **What we take** | The **connected-stage-circle ribbon** as the pipeline spine; the **tonal status system** (tinted bg + dark same-hue text) to replace the left-stripe/pulse; the **status-pill + stage-ribbon + actions** row anatomy. |

## Extracted values

### Colour — `extracted` from live CSS `:root`
- **Page canvas:** `#ECECEF` (rgb 236 236 239) — a cool light neutral, faintly blue-violet, **not** pure grey, **not** cream.
- **Surface (cards/rows):** `#FFFFFF` (`--gl-background-color-default`).
- **Default ink:** `#3A383F` (`--gl-text-color-default`).
- **CI status system (the important part — all `extracted`):**

| State | Tinted bg | Same-hue dark text |
|---|---|---|
| Success | `#C3E6CD` (green-100) | `#306440` (green-700) |
| Running | `#CBE2F9` (blue-100) | `#2F5CA0` / `#1F75CB` (blue-500) |
| Warning | `#F5D9A8` (orange-100) | `#894B16` (orange-700) |
| Failed | `#FDD4CD` (red-100) | `#A32C12` (red-700) |
| Pending/neutral | `#DCDCDE` (neutral-100) | `#89888D` (neutral-400) |

  Every state is **tint-bg + dark-same-hue-text** at ~5–6:1 contrast. This is the pattern that lets colour carry stage-state without a stripe and without failing AA.

### Type — `extracted`
- **Face:** `"GitLab Sans"` (custom grotesque — not a system default, not a slop face).
- **Body:** 14px `extracted`. **Floor caveat:** raise to ≥16px for our build; keep the *proportions*.
- **Heading:** 28px / weight 600.

### Surface — `extracted` / `observed`
- **Radii:** status pills `20px`; badges `9999px` (full pill); buttons `8px` `extracted`.
- **Stage glyphs:** circular icons (~20–24px) `observed`, connected by short `–` / `→` connectors into a ribbon; overflow collapses to `»` `observed`.
- **No card left-border stripe anywhere.** State lives in the glyph and the pill.

### Motion
- Running state uses a small in-glyph spinner/pie `observed`; state change is discrete. No ambient pulse on resting rows `observed`.

## The true feel
Dense but calm engineering legibility. The eye lands on the **status pill**, confirms with the
**stage-ribbon**, and moves on. Colour is *entirely* semantic — it only ever means "this stage is in
this state" — which is exactly the discipline the Bobby Feature view needs. `observed`.

## Inherited rules (if this anchors the direction)
1. Stage state = **tinted-bg + dark-same-hue-text glyph/pill**, never a card edge-stripe (retires the #1 tell).
2. The pipeline is a **row of connected stage-circles**; the current/gate stage is the emphasised node.
3. Ground `#ECECEF` (or warm it at spec time); surfaces white.
4. Colour is semantic-only — one hue per state, nothing decorative.
5. Raise body type to the 16px floor; keep GitLab's proportions and pill radii.
