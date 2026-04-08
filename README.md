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
- `.bobbyrc.yml` config file
- `.claude/skills/` with 17 workflow skills
- `.claude/agents/` with 15 agent definitions
- `.claude/commands/` with 17 slash commands
- `CLAUDE.md` with Bobby workflow instructions

Then start working:

```bash
bobby create -t "Build login page" -p high    # Create a ticket
bobby create -t "User auth" --epic             # Create an epic (breaks down)
bobby list                                     # See your board
bobby run pipeline TKT-001                    # Run the full pipeline
```

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

## Command Reference (16 commands)

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
bobby run ux                           # Visual/UX review via Chrome
bobby run pm                           # Product review via Chrome
bobby run qe                           # QA testing via Chrome + API
bobby run vet                          # Interrogate design before planning
bobby run strategy                     # Strategic validation gate
bobby run docs                         # Update documentation
bobby run performance                  # Benchmark and detect regressions
bobby run watchdog                     # Post-deploy smoke tests

# Specialist agents (ticket required)
bobby run security TKT-001            # OWASP + STRIDE audit
bobby run debug TKT-001               # Root-cause investigation
```

## Agents (15)

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
| **bobby-ux** | UX design review via Chrome browser — never reads source code |
| **bobby-pm** | Product review — identifies UX gaps and feature opportunities, shapes into tickets |
| **bobby-qe** | QE testing via Chrome + API calls — never reads source code |
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

## Skills (17)

Each agent is backed by a **skill** — a detailed instruction set in `.claude/skills/bobby-{name}/SKILL.md`. Skills also accumulate learnings over time in `learnings.md`, so agents get smarter as your project evolves.

| Skill | Purpose |
|-------|---------|
| bobby-plan | Planning methodology (epic breakdown + ticket refinement) |
| bobby-build | TDD build process and commit discipline |
| bobby-review | Code review criteria and rejection standards |
| bobby-test | Test execution and acceptance verification |
| bobby-ship | PR creation, CI checks, and merge workflow |
| bobby-ux | Visual review protocol and design heuristics |
| bobby-pm | Product analysis and feature opportunity assessment |
| bobby-qe | QA test methodology (browser + API) |
| bobby-vet | Design interrogation framework |
| bobby-strategy | Strategic scoring and prioritization criteria |
| bobby-security | Security audit checklist (OWASP + STRIDE) |
| bobby-debug | Debugging methodology (reproduce → trace → fix) |
| bobby-docs | Documentation update protocol |
| bobby-performance | Benchmarking and regression detection |
| bobby-watchdog | Post-deploy smoke test protocol |
| bobby-pipeline | Pipeline orchestration (auto-chains agents with retry) |
| bobby-feature | Feature workflow (holistic planning + sequential execution) |

### Teaching Bobby

Record anti-patterns and best practices so agents avoid repeating mistakes:

```bash
bobby learn bobby-build "hard-coded test values" "Implement the algorithm, don't match test inputs"
bobby learn bobby-review "missing error handling" "Check all async calls have try/catch"
```

Learnings are stored in `.claude/skills/bobby-{name}/learnings.md` and loaded by agents before every run.

## Slash Commands (17)

Bobby scaffolds Claude Code slash commands in `.claude/commands/` so you can invoke agents directly from Claude:

```
/bobby-plan          /bobby-build         /bobby-review
/bobby-test          /bobby-ship          /bobby-pipeline
/bobby-feature       /bobby-ux            /bobby-pm
/bobby-qe            /bobby-vet           /bobby-strategy
/bobby-security      /bobby-debug         /bobby-docs
/bobby-performance   /bobby-watchdog
```

## Stacks

Bobby comes with pre-configured defaults for:
- **Next.js** — `npm` commands, single health check on :3000
- **Rails + React** — multi-repo support, dual health checks (API :3000, UI :3001)
- **Python / Flask** — `pytest`, `flake8`, Flask defaults on :5000
- **Polyglot / Multi-Service** — auto-detects services, per-service commands
- **Generic** — sensible defaults, configure manually in `.bobbyrc.yml`

You can also create **custom stacks** by placing a JSON file in `.bobby/stacks/<name>.json`. See [docs/CUSTOMIZING.md](docs/CUSTOMIZING.md) for the stack JSON schema.

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

## License

MIT
