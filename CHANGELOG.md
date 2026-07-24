# Changelog

All notable changes to Bobby are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Bobby follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-07-24

First public release, live on npm: `npm install -g bobbycode`. Bobby is a full
SDLC workflow for a solo developer — one person, a whole team of Claude Code
agents.

### Changed — BREAKING
- **"Pipelines" are now "workflows"** throughout the user-facing surface:
  `bobby pipeline` → `bobby workflow`, `--pipeline` → `--workflow`, the
  `pipelines:` config key → `workflows:`, the ticket `pipeline:` field →
  `workflow:`, and `bobby run pipeline` → `bobby run workflow`. The old
  `pipelines:` config and ticket field are still read as a fallback.

### Added
- **Built-in workflows** — `default`, `secure` (adds a security stage), and
  `quick` (plan→build→test) are available everywhere with no config; your
  `workflows:` entries extend or override them. `bobby workflow list` shows them.
- **Ticket-by-default + workflow selection.** Asking for a feature/change creates
  a ticket and runs it; `bobby go` takes `--workflow <name>`, and the router /
  `CLAUDE.md` now pick the fitting workflow (secure for auth/payments/secrets,
  quick for tiny changes, else default).
- **`bobby do "<request>"`** — the natural-language front door. Say what you want
  in plain words; Bobby routes it to the right skill/command (build, vet, debug,
  review, ship, …) and runs it. Driven by a capability catalog in `lib/router.js`;
  the generated `CLAUDE.md` now carries the same intent-routing table so talking
  to Bobby inside a Claude Code session routes the same way.

### Changed
- **`bobby go` is now the single guided loop** — the whole process is two verbs:
  `bobby new "<idea>"` to start, then `bobby go` again and again. From any state
  `go` names and runs the next step: a fresh idea → break it down, a planned epic
  → build the MVP, in-flight work → push it forward, and outside a project it
  points you at `bobby new`. Default `bobby --help` now shows just the loop
  (new / go / init); everything else is listed compactly and still has `--help`.

### Added
- **`bobby vet "<idea>"`** — pressure-test an idea before building it. Emits a
  self-contained interrogation (works with no project): asks one question at a
  time — users, problem, alternatives, riskiest assumption, cheapest test —
  then a PURSUE/REFINE/PARK verdict and a sharpened one-liner to hand to
  `bobby new`. `bobby vet <n>` vets a captured idea (project or global inbox).
- **`bobby new "<idea>"`** — the 0→1 on-ramp. Turns a one-line idea into a
  **running** project: a dependency-free starter skeleton, Bobby scaffolding, an
  MVP epic (idea baked into its description), and an initial commit — then hands
  off to `bobby run plan` → `bobby run feature`. Options: `--dir`, `--stack`.
- **Built-in scaffolding system** — `templates/starters/<name>/` + `lib/starters.js`.
  Starters ship a runnable app (Node built-ins + `node:test`, zero install):
  `node` (HTTP API with `/health`, default) and `web` (static page). Extensible:
  add a starter dir + a `stacks/<name>.json` preset.

### Changed — BREAKING
- `bobby local-init` → `bobby init local`; `bobby export-plugin` → `bobby export plugin`.
- **All ticket operations moved under `bobby ticket` (alias `bobby tkt`).**
  `bobby create` → `bobby ticket create`, and likewise for `list`, `view`,
  `move`, `comment`, `update`, `assign`, `attach`, `archive`, `triage`.
  The old top-level commands are removed (pre-1.0, pre-publication break).
  All skills, agent prompts, and templates have been updated to the new paths —
  re-run `bobby init` in existing projects to refresh scaffolded skills.

### Added
- **`bobby go` — the golden path.** No args: runs the most valuable next action
  (finish in-flight → unblock → start top of backlog). With text: creates the
  ticket AND runs the full workflow in one step. With an ID: runs that ticket.
- **Zero-question `bobby init`.** Everything auto-detected (name, stack, target);
  `--custom` keeps the full wizard. New-project initial commit is automatic.
- **Progressive help.** `bobby --help` shows the eight founder-facing commands;
  power tools (workflow, retro, learn, projects, session, sync, export, upgrade)
  stay fully functional and are listed in a one-line footer.
- **Studio: one machine, many projects.**
  - Projects auto-register in `~/.bobby/projects.yml` whenever a bobby command
    runs inside them (opt out with `BOBBY_NO_REGISTRY=1`).
  - `bobby projects` — every project with in-flight/blocked/backlog counts.
  - `bobby brief --all` — the cross-project standup-of-one; bare `bobby brief`
    outside any project does this automatically.
  - Global idea inbox: `bobby idea` outside a project captures to
    `~/.bobby/inbox.yml`; promote into a project with
    `bobby idea promote <n> --inbox`.
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

Initial public baseline: ticketing, the plan → build → review → test workflow,
17 agents, 21 skills, sprints, the local dashboard, learnings/retros, and
multi-stack init.
