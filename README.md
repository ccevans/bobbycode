# Bobby — Your Pair Programmer

Bobby is an open-source npm CLI that gives structure to AI-assisted development. It turns Claude Code into a disciplined engineering partner with tickets, TDD, peer review, automated testing, and agent chaining that runs a full pipeline end-to-end.

**Target audience:** People who use Claude Code and want a structured process instead of "one big prompt and hope for the best."

## Quick Start

```bash
npx bobbycode init
```

This scaffolds your project with:
- `.bobby/tickets/` — single directory, frontmatter-based stages
- `.bobbyrc.yml` config file
- `.claude/skills/` with 5 workflow skills
- `.claude/agents/` with 5 agent definitions
- `CLAUDE.md` with instructions for Claude

Then start working:

```bash
bobby create -t "Build login page" -p high    # Create a ticket
bobby create -t "User auth" --epic             # Create an epic (breaks down)
bobby list                                     # See your board
bobby run pipeline TKT-001                    # Run the full pipeline
```

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

## Command Reference (11 commands)

| Command | Description |
|---------|-------------|
| `bobby init` | Initialize a new Bobby project |
| `bobby create -t "Title"` | Create a ticket (`--epic` for big features) |
| `bobby list [stage]` | Show the ticket board (`--blocked`, `--epic <id>`) |
| `bobby view <id>` | View ticket details (`--plan`, `--files`) |
| `bobby move <id> <alias>` | Move ticket (aliases below) |
| `bobby assign <id> <name>` | Assign ticket to someone |
| `bobby comment <id> <note>` | Add a note to a ticket |
| `bobby retro <id> "pattern"` | Create a retrospective |
| `bobby learn <skill> "pattern" "desc"` | Add learning to a skill |
| `bobby run <agent> [ids...]` | Run agents or pipeline |
| `bobby activate <key>` | Activate pro license |

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

### Run Commands

```
bobby run plan TKT-001                  # Run a single agent
bobby run pipeline TKT-001              # Full auto-chain
bobby run pipeline TKT-001 TKT-002      # Multiple tickets sequentially
bobby run ship                           # PR + merge all shipping tickets
```

## Agents

| Agent | Role |
|-------|------|
| **bobby-plan** | Plans tickets — epic breakdown or refinement (plan.md + test-cases.md) |
| **bobby-build** | TDD implementation, commits to current branch |
| **bobby-review** | Peer code review — separate agent for fresh perspective |
| **bobby-test** | Automated testing — runs test suite, verifies acceptance criteria |
| **bobby-ship** | Creates PR, waits for CI, merges |

## Stacks

Bobby comes with pre-configured defaults for:
- **Next.js** — `npm` commands, single health check
- **Rails + React** — `docker compose` + `npm`, dual health checks
- **Python / Flask** — `pytest`, `flake8`, Flask defaults
- **Generic** — sensible defaults, configure manually

## License

MIT
