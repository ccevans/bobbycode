# Bobby — Your Pair Programmer

Bobby is an open-source npm CLI that gives structure to AI-assisted development. It turns Claude Code into a disciplined engineering partner with tickets, TDD, peer review, automated testing, and agent chaining that runs a full pipeline end-to-end.

**Target audience:** People who use Claude Code and want a structured process instead of "one big prompt and hope for the best."

## Quick Start

```bash
npx bobbycode init
```

This scaffolds your project with:
- `.bobby/tickets/` — single directory, frontmatter-based stages
- `.bobby/sessions/` — session logs for pipeline observability
- `.bobbyrc.yml` — all configuration in one commented file
- `.claude/skills/` with 21 workflow skills
- `.claude/agents/` with 17 agent definitions
- `.claude/commands/` with 20 slash commands
- `CLAUDE.md` with Bobby workflow instructions

Then start working:

```bash
bobby create -t "Build login page" -p high    # Create a ticket
bobby create -t "User auth" --epic             # Create an epic (breaks down)
bobby list                                     # See your board
bobby run pipeline TKT-001                    # Run the full pipeline
bobby dashboard                                # Open the workspace dashboard
```

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
# Custom pipelines
pipelines:
  default: [plan, build, review, test]
  secure: [plan, build, security, review, test]
  fast: [plan, build, test]

# Skill routing — maps areas to project skill directories
skill_routing:
  auth: [dev/fullstack]
  api: [dev/backend]

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
  auto_merge: false

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
- **Actions per workspace:** `Run`, `Stop`, `Approve` (advance to next pipeline stage), `Reject` (retry build), `Merge` (no-ff into main), `Discard`

**Crash-safe state.** Workspace state is persisted atomically to `.bobby/workspaces.json`, so `bobby dashboard` survives restarts.

**Security.** The dashboard binds to `127.0.0.1` only and has no authentication. If you override the host, bobby prints a loud warning.

## Getting Started: Your First Ticket, End to End

After `npx bobbycode init`, here's a complete walkthrough:

### 1. Create a ticket

```bash
bobby create -t "Add health check endpoint" -p medium --area api
```

### 2. See your board

```bash
bobby list
```

```
 BACKLOG          PLANNING         BUILDING         REVIEWING        TESTING          SHIPPING
 ───────          ────────         ────────         ─────────        ───────          ────────
 TKT-001          ·                ·                ·                ·                ·
 Add health       
 check endpoint   
 ■ medium         
```

### 3. Run the pipeline

```bash
bobby run pipeline TKT-001
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
| I have a clear task to build | `bobby run pipeline TKT-001` |
| I have a big feature idea | `bobby create -t "Feature" --epic` then `bobby run feature TKT-001` |
| I want to review the live app | `bobby run ux` / `bobby run pm` / `bobby run qe` |
| I want to validate before building | `bobby run vet TKT-001` or `bobby run strategy` |
| Something broke | `bobby run debug TKT-001` |
| I need a security audit | `bobby run security TKT-001` |
| I want to ship what's ready | `bobby run ship` |
| I want to step through one agent at a time | `bobby run next TKT-001` |

## How It Works

Bobby chains Claude Code agents through a pipeline:

```
bobby run pipeline TKT-001

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

### Ticket Management

| Command | Description |
|---------|-------------|
| `bobby create -t "Title"` | Create a ticket (`--epic`, `--parent <id>`, `-p <priority>`) |
| `bobby list [stage]` | Show the ticket board (`--blocked`, `--epic <id>`, `--area <area>`) |
| `bobby view <id>` | View ticket details (`--plan`, `--files`) |
| `bobby move <id> <alias>` | Move ticket stage (see aliases below) |
| `bobby update <id>` | Update ticket fields (`--priority`, `--area`, `--title`, `--parent`) |
| `bobby assign <id> <name>` | Assign ticket to a person or agent |
| `bobby comment <id> <note>` | Add a note to a ticket |

### Backlog Management

| Command | Description |
|---------|-------------|
| `bobby triage` | Interactive backlog curation — keep, prioritize, plan, archive, or skip each ticket |
| `bobby archive [ids...]` | Archive stale backlog tickets (`--stale <days>`, `--dry-run`) |

### Agent Orchestration

| Command | Description |
|---------|-------------|
| `bobby run <agent> [ids...]` | Run an agent on ticket(s) — see [Run Modes](#run-modes) below |
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
| `bobby export-plugin` | Export Bobby skills and agents as a Cowork plugin (.zip) |
| `bobby activate <key>` | Activate pro license |
| `bobby upgrade` | Upgrade Bobby to the latest version (`--check` to preview) |

### Move Aliases

```
bobby move TKT-001 plan        # → planning
bobby move TKT-001 build       # → building
bobby move TKT-001 review      # → reviewing
bobby move TKT-001 test        # → testing
bobby move TKT-001 ship        # → shipping
bobby move TKT-001 done        # → done
bobby move TKT-001 reject "reason"   # → building + rejection comment
bobby move TKT-001 block "reason"    # → blocked (remembers previous stage)
bobby move TKT-001 unblock           # → back to previous stage
```

## Run Modes

The `bobby run` command supports multiple orchestration patterns:

```bash
# Full pipeline — auto-chains plan → build → review → test
bobby run pipeline TKT-001
bobby run pipeline TKT-001 TKT-002    # Multiple tickets sequentially

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

## Agents (17)

### Core Pipeline

These agents chain together automatically via `bobby run pipeline`:

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
/bobby-test          /bobby-ship          /bobby-pipeline
/bobby-feature       /bobby-ux            /bobby-pm
/bobby-qe            /bobby-vet           /bobby-strategy
/bobby-security      /bobby-debug         /bobby-docs
/bobby-performance   /bobby-watchdog      /bobby-arch
/bobby-ticket-intake /bobby-local
```

## Custom Pipelines

Define named pipelines in `.bobbyrc.yml` to customize the agent chain:

```yaml
pipelines:
  default: [plan, build, review, test]
  secure: [plan, build, security, review, test]
  fast: [plan, build, test]
```

Run a named pipeline:

```bash
bobby run pipeline TKT-001 --pipeline secure
```

## Contributing

Contributions are welcome! To get started:

1. Fork the repo and create a feature branch from `main`
2. Install dependencies: `npm install`
3. Make your changes
4. Run tests: `npm test`
5. Open a pull request against `main`

Please keep PRs focused on a single change. If you're planning something large, open an issue first to discuss the approach.

## License

MIT
