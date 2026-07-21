# Bobby — A Full SDLC Workflow for a Solo Developer

[![npm version](https://img.shields.io/npm/v/bobbycode.svg)](https://www.npmjs.com/package/bobbycode)
[![CI](https://github.com/ccevans/bobbycode/actions/workflows/ci.yml/badge.svg)](https://github.com/ccevans/bobbycode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/bobbycode.svg)](https://nodejs.org)

Bobby is an open-source npm CLI that gives one person a **whole engineering team**. You're the only human; Bobby staffs the rest — a planner, a builder, a peer reviewer, testers, a security auditor, QE — as Claude Code agents that run a full software development lifecycle end to end. Tickets, TDD, code review, automated testing, security audits, shipping: the process discipline of an entire org, with a headcount of one.

**Who it's for:** solo devs, indie hackers, freelancers, and non-developers building with Claude Code who want a structured process instead of "one big prompt and hope for the best."

**The idea:** working alone means no reviewer, no standup, and no one to remind you where you left off. So Bobby *is* your team — its agents are your reviewer, its sessions carry your context between stolen hours, and every command pays for itself in shipped work. Read the full philosophy in [docs/POSITIONING.md](docs/POSITIONING.md) and where it's headed in [docs/ROADMAP.md](docs/ROADMAP.md).

## Install

Bobby is published to the public npm registry — no account or auth required.

```bash
# Run without installing (always the latest version)
npx bobbycode init

# ...or install globally to get the `bobby` command everywhere
npm install -g bobbycode
bobby init
```

Requires Node.js 18+ (you already have it if you use Claude Code).

## Vet the Idea First

Before you build anything, pressure-test the idea — solo, there's no cofounder to poke holes:

```bash
bobby vet "a habit tracker for runners"
```

This asks you the right questions **one at a time** — who feels the pain, what they use today, the riskiest assumption, the cheapest way to test it — then gives an honest **PURSUE / REFINE / PARK** read and a sharpened one-liner. Works from anywhere, no project needed. Vet a captured idea by number with `bobby vet 3`. If it survives, hand the sharpened idea to `bobby new`.

## Start From an Idea

Got a new idea and nothing built yet? One command turns a sentence into a **running project** with an MVP epic ready to build:

```bash
npx bobbycode new "a habit tracker for runners"
```

This creates the directory, drops a **dependency-free runnable skeleton** (a Node HTTP server with `/health`, plus passing tests — no `npm install` needed), scaffolds Bobby, captures your idea as the MVP epic, and makes the first commit. Then you only need **one verb**:

```bash
cd a-habit-tracker-for-runners
npm run dev    # it already runs → http://localhost:3000
bobby go       # break the idea down, build it, ship it — run it again and again
```

**Starters** (`--stack`): `node` (HTTP API, default) and `web` (static page) ship a runnable skeleton. Framework presets (`nextjs`, `go`, `django`, …) scaffold Bobby only for now. Name the directory with `--dir`. Already have a project? Use `init` below instead.

## Just Say What You Want

The simplest way to use Bobby is to not learn commands at all — just say what you want (the `do` is optional):

```bash
bobby "add a health check endpoint"
bobby "is a Slack standup bot worth building"
bobby "the login button does nothing when clicked"
```

Anything that isn't a known command is treated as a request: Bobby matches it to the right capability (build it, vet it, debug it, review it, ship it…) and runs it. Inside a Claude Code session it's even more seamless — the generated `CLAUDE.md` teaches Claude Code the same routing, so you **just talk to it**, no `bobby` prefix at all.

## The Core Loop Is Two Verbs

```bash
npx bobbycode new "your idea"   # start a project (or `init` in an existing one)
bobby go                        # do the next thing — run it again and again
```

`bobby go` is the only command you run day to day. From any state it figures out and runs the single most useful next step — break a fresh idea into tickets, build the MVP, push in-flight work forward, or ship what's ready — and tells you what it did. You never have to learn the rest.

Everything below (`vet`, `idea`, `brief`, `ticket`, `sprint`, `run`, `dashboard`, …) is optional — reach for it when you want to, but `new` + `go` is the whole loop.

<details>
<summary>The optional verbs, when you want them</summary>

```bash
bobby vet "a risky idea"           # Pressure-test an idea before building it
bobby go "build the login page"    # Create a specific ticket AND build it now
bobby idea "dark mode someday"     # Capture a thought in 5 seconds, without touching the board
bobby brief                        # Where was I? What's in flight, what's blocked, what's next
bobby ticket list                  # See the full board
bobby dashboard                    # Watch agents work in parallel worktrees
```

</details>

`bobby init` scaffolds: `.bobby/` (tickets, sessions, config), `.claude/` (21 skills,
17 agents, 20 slash commands), and `CLAUDE.md` — everything auto-detected from your
repo. Prefer to choose? `bobby init --custom` runs the full wizard.

## Configuration

All configuration lives in `.bobbyrc.yml`, generated with comments during `bobby init`. Key sections:

```yaml
# Project identity
project: my-app
stack: nextjs                  # nextjs | rails-react | django | python-flask | go | rust | polyglot | generic
target: claude-code            # claude-code | cline

# Directories
bobby_dir: .bobby
tickets_dir: .bobby/tickets
sessions_dir: .bobby/sessions
ticket_prefix: TKT             # Prefix for ticket IDs (e.g., TKT-001)

# Dev commands — used by all agents for test/lint/build
commands:
  dev: npm run dev
  test: npm test
  lint: npm run lint
  build: npm run build

# Health check URLs — agents verify the app is running before testing
health_checks:
  - name: app
    url: http://localhost:3000

# Feature areas — categorize tickets, route to area-specific skills
areas: [auth, dashboard, api]

# Testing tools available to the test agent
testing_tools: [playwright, curl]

# Max retries when review/test rejects (per ticket)
max_retries: 3
```

<details>
<summary>Optional configuration (commented out in generated file)</summary>

```yaml
# Custom + override workflows (built-in: default, secure, quick)
workflows:
  default: [plan, build, review, test]
  secure: [plan, build, security, review, test]
  thorough: [plan, build, review, security, test]

# Project-specific skills the build agent follows
build_skills:
  - api-patterns
  - component-library

# Multi-repo shipping (PR per repo)
repos:
  - name: api
    path: backend-api
  - name: ui
    path: frontend-ui

# Git branch naming conventions
git_conventions:
  feature_branch_prefix: feature  # Epic branches: feature/{id}-{slug}
  ticket_branch_prefix: tkt       # Ticket branches: tkt-{id}
  worktree_prefix: bobby           # Worktree branches: bobby/{id}-{stage}

# Dashboard configuration
dashboard:
  port: 7777
  worktree_root: ../bobby-wt
  auto_approve_stages: []

# Parallel isolation for batch operations
parallel_isolation: none         # none | worktree

# Backlog management
backlog_limit: 50
backlog_stale_days: 30

# Conductor.build integration (set to false to skip)
conductor: true
```

</details>

## Stacks

Bobby auto-detects your tech stack during `bobby init` and configures commands, health checks, and areas automatically.

| Stack | Detection | Commands | Health Check |
|-------|-----------|----------|-------------|
| **Next.js** | `next` in package.json | `npm run dev/test/lint/build` | `:3000` |
| **Rails + React** | Gemfile + React subdirectory | Docker Compose + npm | `:3000` (API), `:3001` (UI) |
| **Django** | `manage.py` or django in requirements.txt | `manage.py runserver/test` + ruff | `:8000` |
| **Python / Flask** | Flask in requirements.txt | `flask run` + pytest + ruff | `:5000` |
| **Go** | `go.mod` | `go run/test` + golangci-lint | `:8080` |
| **Rust** | `Cargo.toml` | `cargo run/test/clippy` | `:8080` |
| **Polyglot** | 2+ language markers in subdirectories | Per-service (configured during init) | Per-service |
| **Generic** | Fallback | Empty (you configure in `.bobbyrc.yml`) | None |

**Custom stacks:** Create `.bobby/stacks/<name>.json` with your own commands, areas, and health checks. Custom stacks appear at the top of the `bobby init` selection menu. See [docs/CUSTOMIZING.md](docs/CUSTOMIZING.md) for the JSON schema.

## Dashboard

Bobby ships with a local web dashboard for kicking off agents in parallel, isolated workspaces and watching them work in real time.

```bash
bobby dashboard             # Opens http://127.0.0.1:7777 in your browser
bobby dashboard --port 7778 # Custom port
bobby dashboard --no-open   # Don't auto-open the browser
```

**Workspace model.** Each workspace = one ticket + one git worktree on its own branch + one `claude` subprocess. Multiple workspaces run in parallel without colliding — each agent lives in its own isolated checkout.

**What you get:**
- **Workspace list** on the left — live status dots (running, awaiting approval, ready to merge, failed, stopped)
- **Live logs** streamed via Server-Sent Events — every tool call, every file edit, every stage transition
- **Diff viewer** — unified diff of the workspace branch vs main
- **Files tab** — changed files with added/removed line counts
- **Runs history** — every agent invocation with exit codes and durations
- **Actions per workspace:** `Run`, `Stop`, `Approve` (advance to next workflow stage), `Reject` (retry build), `Merge` (no-ff into main), `Discard`

**Crash-safe state.** Workspace state is persisted atomically to `.bobby/workspaces.json`, so `bobby dashboard` survives restarts.

**Security.** The dashboard binds to `127.0.0.1` only and has no authentication. If you override the host, bobby prints a loud warning.

## Getting Started: Your First Ticket, End to End

After `npx bobbycode init`, here's a complete walkthrough:

### 1. Create a ticket

```bash
bobby ticket create -t "Add health check endpoint" -p medium --area api
```

### 2. See your board

```bash
bobby ticket list
```

```
 BACKLOG          PLANNING         BUILDING         REVIEWING        TESTING          SHIPPING
 ───────          ────────         ────────         ─────────        ───────          ────────
 TKT-001          ·                ·                ·                ·                ·
 Add health       
 check endpoint   
 ■ medium         
```

### 3. Run the workflow

```bash
bobby run workflow TKT-001
```

Bobby chains four agents automatically:

```
[bobby-plan]   → Breaks down the ticket, writes plan.md + test-cases.md
[bobby-build]  → TDD implementation, commits to a feature branch
[bobby-review] → Code review against acceptance criteria
[bobby-test]   → Runs tests, verifies ACs pass
```

If review or test rejects, Bobby loops back to build (up to 3 retries).

### 4. Ship it

```bash
bobby run ship
```

Creates a PR, waits for CI, and merges.

### Which Agent Should I Use?

| Situation | Command |
|-----------|---------|
| I have a clear task to build | `bobby run workflow TKT-001` |
| I have a big feature idea | `bobby ticket create -t "Feature" --epic` then `bobby run feature TKT-001` |
| I have a batch of related tickets | `bobby sprint new "Auth overhaul" TKT-004 TKT-007` then `bobby sprint run SPR-001` |
| I want to review the live app | `bobby run ux` / `bobby run pm` / `bobby run qe` |
| I want to validate before building | `bobby run vet TKT-001` or `bobby run strategy` |
| Something broke | `bobby run debug TKT-001` |
| I need a security audit | `bobby run security TKT-001` |
| I want to ship what's ready | `bobby run ship` |
| I want to step through one agent at a time | `bobby run next TKT-001` |

## How It Works

Bobby chains Claude Code agents through a workflow:

```
bobby run workflow TKT-001

[bobby-plan]   ✓ planned
[bobby-build]  ✓ built + committed
[bobby-review] ✓ approved
[bobby-test]   ✓ passed → shipping

bobby run ship  → creates PR, merges
```

Each agent is a separate Claude Code subagent with a fresh perspective. Rejections loop back to building automatically (max 3 retries).

## Ticket Lifecycle

```
backlog → planning → building → reviewing → testing → shipping → done
```

Tickets live in `.bobby/tickets/`. Stage is tracked in frontmatter — no physical file moves, clean git diffs.

## Command Reference

### Tickets — `bobby ticket` (alias: `bobby tkt`)

Everything that touches a ticket lives under one namespace:

| Command | Description |
|---------|-------------|
| `bobby ticket create -t "Title"` | Create a ticket (`--epic`, `--parent <id>`, `-p <priority>`) |
| `bobby ticket list [stage]` | Show the ticket board (`--blocked`, `--epic <id>`, `--area <area>`) |
| `bobby ticket view <id>` | View ticket details (`--plan`, `--files`) |
| `bobby ticket move <id> <alias>` | Move ticket stage (see aliases below) |
| `bobby ticket comment <id> <note>` | Add a note to a ticket |
| `bobby ticket update <id>` | Update ticket fields (`--priority`, `--area`, `--title`, `--parent`) |
| `bobby ticket assign <id> <name>` | Route a ticket to an agent |
| `bobby ticket attach <id> <files>` | Attach screenshots, logs, etc. to a ticket |
| `bobby ticket triage` | Interactive backlog curation — keep, prioritize, plan, archive, or skip |
| `bobby ticket archive [ids...]` | Archive stale backlog tickets (`--stale <days>`, `--dry-run`) |

### Capture & Orientation

| Command | Description |
|---------|-------------|
| `bobby vet "idea"` | Pressure-test an idea — asks the right questions one at a time, then a PURSUE/REFINE/PARK read (`bobby vet <n>` for a captured idea) |
| `bobby new "idea"` | Spin up a brand-new project from an idea — scaffolds a running skeleton + an MVP epic (`--dir`, `--stack`) |
| `bobby go` | Do the most valuable next thing (finish in-flight → unblock → start backlog) |
| `bobby go "title"` | Create a ticket and run the full workflow on it, one step (`-p <priority>`) |
| `bobby go <id>` | Run the workflow on a specific ticket |
| `bobby idea "..."` | Capture an idea in five seconds, without touching the board |
| `bobby idea list` | List open ideas (`--all` includes promoted, `--inbox` for the global inbox) |
| `bobby idea promote <n>` | Turn an idea into a backlog ticket (`-p`, `--area`, `--epic`, `--inbox`) |
| `bobby idea rm <n>` | Delete an idea |
| `bobby brief` | "Where was I?" — in-flight work, blockers, and the single next action |
| `bobby brief --all` | The same, across **every** project on this machine |
| `bobby projects` | All your Bobby projects, with what each has in flight |

### Agent Orchestration

| Command | Description |
|---------|-------------|
| `bobby run <agent> [ids...]` | Run an agent on ticket(s) — see [Run Modes](#run-modes) below |
| `bobby sprint <subcommand>` | Batch related tickets onto one branch — see [Sprints](#sprints) below |
| `bobby dashboard` | Launch the local web dashboard — parallel workspaces, live logs, diffs, approvals |

### Learning & Retrospectives

| Command | Description |
|---------|-------------|
| `bobby learn <skill> "pattern" "desc"` | Record an anti-pattern or best practice to a skill's learnings |
| `bobby retro` | Generate a weekly retrospective from session logs |

### Setup & Admin

| Command | Description |
|---------|-------------|
| `bobby init` | Initialize a new Bobby project (or re-initialize to update skills/agents) |
| `bobby init local` | Discover and configure a local dev profile |
| `bobby export plugin` | Export Bobby skills and agents as a Cowork plugin (.zip) |
| `bobby upgrade` | Upgrade Bobby to the latest version (`--check` to preview) |

### Move Aliases

```
bobby ticket move TKT-001 plan        # → planning
bobby ticket move TKT-001 build       # → building
bobby ticket move TKT-001 review      # → reviewing
bobby ticket move TKT-001 test        # → testing
bobby ticket move TKT-001 ship        # → shipping
bobby ticket move TKT-001 done        # → done
bobby ticket move TKT-001 reject "reason"   # → building + rejection comment
bobby ticket move TKT-001 block "reason"    # → blocked (remembers previous stage)
bobby ticket move TKT-001 unblock           # → back to previous stage
```

## Run Modes

The `bobby run` command supports multiple orchestration patterns:

```bash
# Full workflow — auto-chains plan → build → review → test
bobby run workflow TKT-001
bobby run workflow TKT-001 TKT-002    # Multiple tickets sequentially

# Feature workflow — plans all epic children holistically, then executes each
bobby run feature TKT-001              # Epic ID
bobby run feature                      # Interactive epic selection

# Single agent on a ticket
bobby run plan TKT-001
bobby run build TKT-001
bobby run review TKT-001
bobby run test TKT-001

# Batch mode — run agent on all tickets in the matching stage
bobby run plan                         # All tickets in "planning" stage
bobby run build                        # All tickets in "building" stage

# Next step — runs whatever agent is next for a ticket's current stage
bobby run next TKT-001

# Ship — creates PR, waits for CI, merges all shipping tickets
bobby run ship

# Freeform agents (no ticket required)
bobby run ux                           # Visual/UX review via browser
bobby run pm                           # Product review via browser
bobby run qe                           # QA testing via browser + API
bobby run vet                          # Interrogate design before planning
bobby run strategy                     # Strategic validation gate
bobby run docs                         # Update documentation
bobby run performance                  # Benchmark and detect regressions
bobby run watchdog                     # Post-deploy smoke tests

# Specialist agents (ticket required)
bobby run security TKT-001            # OWASP + STRIDE audit
bobby run debug TKT-001               # Root-cause investigation
```

## Sprints

A sprint is a **batch of related tickets riding one branch** — how a solo builder tackles work bigger than one ticket without dirtying `main` while it comes together. No scrum, no velocity, no ceremony: just an ordered list of tickets, a shared feature branch, and one runner that works through them.

```bash
bobby sprint new "Auth overhaul" TKT-004 TKT-007 --goal "Passwordless login"
bobby sprint add SPR-001 TKT-009       # Add tickets (order preserved)
bobby sprint view SPR-001              # See the batch and each ticket's stage
bobby sprint run SPR-001               # Work each ticket through its workflow on the shared branch
bobby sprint status SPR-001 done       # planned | active | done | abandoned
bobby sprint list                      # All sprints with progress
```

Each sprint gets a directory under `.bobby/sprints/` with:
- `sprint.yml` — the manifest: goal, branch, workflow, and the authoritative ordered ticket list
- `sprint-plan.md` — your cross-ticket context: sequencing rationale, shared decisions, what's out of scope

The runner works tickets one at a time through the sprint's workflow (default: plan → build → review → test), committing to the shared branch. Rejections retry per ticket (`--max-retries`, default 3). When everything lands, ship the branch as one PR.

**When to reach for a sprint vs. an epic:** an epic (`bobby run feature`) plans and breaks down one big idea; a sprint batches tickets you already have onto one branch. They compose — break an epic down, then sprint its children.

## Working Solo: Capture and Orientation

Two commands exist because working alone has no standup and no one to remind you of anything.

**Capture ideas without breaking flow.** Ideas arrive mid-task; a full ticket is too much friction in the moment. `bobby idea` jots one in five seconds, kept off the board until you decide it's real:

```bash
bobby idea "passwordless login would kill the password-reset support load"
bobby idea list                 # Review open ideas when you have a moment
bobby idea promote 1 -p high    # Turn idea #1 into a prioritized backlog ticket
```

**Pick up where you left off.** When you come back after a day (or a week), `bobby brief` reconstructs the state you'd otherwise hold in your head — what's in flight, what's blocked, and the one thing to do next:

```bash
bobby brief
```

```
  my-app — where you left off

  In flight
    [BUILDING]  TKT-001  add passwordless login  high

  Backlog  (2 total)
    · TKT-002  Fix logout bug  critical
    · TKT-003  Polish onboarding  low

  Next  — TKT-001 is in building — closest to done
    bobby run review TKT-001
```

## Your Studio: Every Project on One Machine

Solo builders rarely have just one project. Bobby treats your whole machine as one studio — all your projects, zero setup:

- **Auto-registration.** Any bobby command run inside a project records it in `~/.bobby/projects.yml`. No setup command, no config.
- **`bobby projects`** — every project, with in-flight/blocked/backlog counts and when you last touched it.
- **`bobby brief --all`** — the cross-project standup-of-one: each project's status and its single next action. Running `bobby brief` *outside* any project does this automatically.
- **Global idea inbox.** `bobby idea "..."` works even outside a project — the idea lands in `~/.bobby/inbox.yml`. Later, from inside whichever project it belongs to: `bobby idea promote <n> --inbox`.

```
$ bobby brief --all

  All projects — where you left off

  my-app  1 in flight · 3 backlog
    next: TKT-001 is in building — closest to done
    bobby run review TKT-001  (in ~/Repos/my-app)

  side-hustle  2 backlog
    next: Nothing in flight — start the top backlog item (high)
    bobby run workflow TKT-014  (in ~/Repos/side-hustle)
```

Set `BOBBY_NO_REGISTRY=1` to opt out of auto-registration (e.g. in CI).

## Agents (17)

### Core Workflow

These agents chain together automatically via `bobby run workflow`:

| Agent | Role |
|-------|------|
| **bobby-plan** | Plans tickets — epic breakdown or refinement. Produces `plan.md` + `test-cases.md` |
| **bobby-build** | TDD implementation. Writes code and commits to the current branch |
| **bobby-review** | Peer code review. Reviews git diff against acceptance criteria (fresh perspective) |
| **bobby-test** | Automated testing. Runs test suite and verifies acceptance criteria pass |
| **bobby-ship** | Creates PR from current branch, waits for CI, merges |

### Design & Product

Freeform agents that review the live application and create tickets for issues found:

| Agent | Role |
|-------|------|
| **bobby-ux** | UX design review via browser automation — never reads source code |
| **bobby-pm** | Product review — identifies UX gaps and feature opportunities, shapes into tickets |
| **bobby-qe** | QE testing via browser + API calls — never reads source code |
| **bobby-vet** | Interrogates designs before planning — probes assumptions, explores alternatives |
| **bobby-strategy** | Strategic validation gate — assesses demand, scope, ROI before tickets enter planning |

### Specialists

Focused agents for specific concerns:

| Agent | Role |
|-------|------|
| **bobby-security** | OWASP Top 10 + STRIDE threat modeling on changed code |
| **bobby-debug** | Systematic root-cause investigation — traces data flow, tests hypotheses |
| **bobby-docs** | Updates README, CLAUDE.md, and docs to stay in sync with code changes |
| **bobby-performance** | Benchmarking — measures page load, resource sizes, Core Web Vitals |
| **bobby-watchdog** | Post-deploy verification — smoke tests, uptime, console errors |
| **bobby-arch** | Architecture discovery — documents codebase structure and decisions |
| **bobby-ticket-intake** | Converts PM specs into structured Bobby tickets |

## Skills (21)

Each agent is backed by a **skill** — a detailed instruction set in `.claude/skills/bobby-{name}/SKILL.md`. Skills also accumulate learnings over time in `learnings.md`, so agents get smarter as your project evolves.

### Teaching Bobby

Record anti-patterns and best practices so agents avoid repeating mistakes:

```bash
bobby learn bobby-build "hard-coded test values" "Implement the algorithm, don't match test inputs"
bobby learn bobby-review "missing error handling" "Check all async calls have try/catch"
```

Learnings are stored in `.claude/skills/bobby-{name}/learnings.md` and loaded by agents before every run.

## Slash Commands (20)

Bobby scaffolds Claude Code slash commands in `.claude/commands/` so you can invoke agents directly from Claude:

```
/bobby-plan          /bobby-build         /bobby-review
/bobby-test          /bobby-ship          /bobby-workflow
/bobby-feature       /bobby-ux            /bobby-pm
/bobby-qe            /bobby-vet           /bobby-strategy
/bobby-security      /bobby-debug         /bobby-docs
/bobby-performance   /bobby-watchdog      /bobby-arch
/bobby-ticket-intake /bobby-local
```

## Custom Workflows

Bobby ships three built-in workflows — `default`, `secure`, `quick`. Define your own (or override a built-in) in `.bobbyrc.yml`:

```yaml
workflows:
  thorough: [plan, build, review, security, test]
```

Run a named workflow:

```bash
bobby run workflow TKT-001 --workflow secure
```

## Contributing

Contributions are welcome! To get started:

1. Fork the repo and create a feature branch from `main`
2. Install dependencies: `npm install`
3. Make your changes
4. Run tests: `npm test`
5. Open a pull request against `main`

Please keep PRs focused on a single change. If you're planning something large, open an issue first to discuss the approach.

### Releasing (maintainers)

Bobby publishes to npm via [`.github/workflows/publish.yml`](.github/workflows/publish.yml) using
**Trusted Publishing (OIDC)** — no long-lived tokens, and each release gets a provenance attestation.

**One-time setup** (a brand-new package name can't have a trusted publisher until it exists):

1. Publish the first version manually from your machine:
   ```bash
   npm login          # interactive, with your 2FA
   npm publish        # publishes bobbycode@1.0.0 and creates the package
   ```
2. On npmjs.com → the `bobbycode` package → **Settings → Trusted Publisher**, add a GitHub
   Actions publisher: organization `ccevans`, repository `bobbycode`, workflow `publish.yml`.

**Every release after that** is fully automated — no secrets:

```bash
npm version patch          # bumps package.json + creates a vX.Y.Z tag (minor / major as needed)
git push --follow-tags     # pushes the commit and the tag
```

The workflow runs the test suite, verifies the tag matches `package.json`, then publishes via OIDC.

## License

MIT
