# Changelog

All notable changes to Bobby are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Bobby follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **The `.local` overlay — your customizations now survive every upgrade.** One
  rule for the whole system: `X.md` is shipped and refreshed; `X.local.md` is
  yours and never written twice. Works for skills (`SKILL.local.md`), learnings
  (`learnings.local.md` — `bobby learn` writes here now), agents
  (`<agent>.local.md`), and `CLAUDE.local.md`. Every shipped skill and agent is
  told to read its overlay and let it win on conflict.
- **`bobby init --refresh`** — non-interactively regenerate shipped skills,
  agents, and commands from the installed version. Aborts if shipped files have
  uncommitted edits (`--force` to override), prunes stale `bobby-*` files that
  no longer ship, and reports skills that were removed without deleting them
  (they may hold your `.local` files). `bobby upgrade` runs it automatically
  after installing, and stamps `.bobby/.scaffold-version` so drift between the
  package and the project is detectable.
- **`bobby upgrade --to <version>`** — pin or roll back to an exact version and
  re-scaffold from it. Rollback removes files a newer version added; your
  `.local` files, tickets, and data survive in both directions.
- **Custom agents run by name.** `bobby run <name>` dispatches any
  `.claude/agents/<name>.md` — no registration required. They can claim tickets
  and slot into custom workflows. The `bobby-` prefix is now formally reserved
  for shipped files (refresh prunes that namespace; packs and custom work must
  use their own names).
- **`bobby skill create <name> [description] [--agent]`** — scaffold a custom
  skill with the naming rules enforced (kebab-case, `bobby-` rejected), seed its
  `learnings.local.md`, and optionally create the matching agent so
  `bobby run <name>` works immediately.
- **Design skill: structure gate and shape-first research.** New step 1b decides
  what the screen is *made of* (queue, letter, conversation, ledger…) before any
  reference is opened — naming the category default so it can be refused — and
  research now searches for the chosen *shape*, never the category name, on
  every platform (category queries return the category norm everywhere).
- **Design skill: silent-failure greps.** New check 6c catches CSS that dies
  quietly: math operators without surrounding whitespace (the whole declaration
  is dropped and the element inherits) and absolutely-positioned children inside
  CSS multicol (they detach at column breaks). The design-check agent runs the
  same greps independently and probes `getComputedStyle` rather than trusting
  source.

- **Bobby Pro** — one subscription that unlocks every paid pack, now and every
  one released later. `bobby pro` shows status and what it unlocks here;
  `bobby pro activate <key>` activates (and works before any pack is installed,
  so you can subscribe first and pull packs down after). A pack opts in with
  `license: { pro: true }`. Verification stays offline: an ed25519 signature
  check, no server, no account, no network call. Bobby's core is MIT and
  unaffected — everything that ships free today stays free.
  - **A lapsed subscription keeps everything it paid for.** Expiry only stops
    *new* content: a pack is withheld solely when its `released` date is after
    your updates ended, and packs with no `released` date are never withheld.
  - `bobby pack activate` still works and now accepts a Pro key too.
- **`blog` starter** — `bobby new "..." --stack blog` scaffolds a static blog:
  markdown posts in `posts/`, a dependency-free generator (`build.js`), and a
  built site in `public/` with an index page, a page per post, and an RSS feed.
  Frontmatter is `title` / `date` / `summary` / `tags` / `draft`; the filename
  is the URL (a `2026-08-01-` prefix is stripped); the theme is one CSS file the
  build never overwrites. No dependencies, no framework, nothing to install.

### Fixed
- `bobby learn bobby-shared` was a silent no-op (the file had no
  `## Anti-Patterns` heading, so the insert regex never matched but success was
  still reported). Learn now appends the heading when missing.
- `bobby upgrade` referenced `__dirname`, which doesn't exist in ESM — the
  global-vs-local install detection always fell through to the global fallback.
- License keys resolve `~/.bobby/licenses.yml` per call and prefer `$HOME`, so a
  sandboxed run (tests, CI) can no longer write a key into the real user's home.

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
