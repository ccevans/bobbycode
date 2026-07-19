# Changelog

All notable changes to Bobby are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Bobby follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `bobby idea` / `bobby idea promote` — five-second capture for ideas that arrive
  mid-task, kept out of the ticket board until you promote them.
- `bobby brief` — the "where was I?" command: summarizes in-flight tickets, open
  sprints, and the single next action from your session and ticket state.
- GitHub Actions CI (`ci.yml`) running lint + tests on Node 18/20/22 for every
  push and PR.
- npm release workflow (`publish.yml`) — pushing a `v*` tag publishes to the
  public npm registry.
- ESLint 9 flat config so `npm run lint` works.
- This changelog.

### Changed
- Repositioned Bobby around the **solo developer** — a full SDLC workflow that
  gives one person a whole team of agents. See `docs/POSITIONING.md` and
  `docs/ROADMAP.md`.
- Sprints reframed for solo use: a batch of related tickets riding one branch,
  minus the team ceremony.
- `bobby assign` now routes a ticket to an agent (was: to a person or agent).

### Removed
- Dead Bobby Pro license system (`bobby activate`, `lib/license.js`). Pro gating
  was never enforced and its validation was a stub; removed for an honest,
  fully open-source solo tool. Preserved in git history if monetization returns.

### Fixed
- `main` in `package.json` pointed at a nonexistent `lib/index.js`; removed
  (Bobby is a CLI, invoked via `bin`).

## [0.9.0]

Initial public baseline: ticketing, the plan → build → review → test pipeline,
17 agents, 21 skills, sprints, the local dashboard, learnings/retros, and
multi-stack init.
