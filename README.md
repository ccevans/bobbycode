# Bobby — Your Pair Programmer

Bobby is an open-source npm CLI that gives structure to AI-assisted development. It turns Claude Code into a disciplined engineering partner with tickets, stages, TDD, peer review, QA, and a feedback loop that gets smarter over time.

**Target audience:** People who use Claude Code and want a structured process instead of "one big prompt and hope for the best."

## Quick Start

```bash
npx bobbycode init
```

This scaffolds your project with:
- `tickets/` directory with 10 lifecycle stages
- `.bobbyrc.yml` config file
- `.claude/skills/` with 6 workflow skills
- `CLAUDE.md` with instructions for Claude
- `tickets/WORKFLOW.md` documentation

Then start working:

```bash
bobby idea "Add user authentication"    # Capture an idea
bobby create -t "Build login page" -p high  # Create a ticket
bobby list                                  # See your board
```

Tell Claude: **"work tickets"** and it picks up from the queue.

## How It Works with Claude Code

Bobby gives Claude structured roles and workflows:

1. **You create tickets** — `bobby create`, `bobby idea`
2. **Claude works them** — using skills loaded from `.claude/skills/`
3. **Claude follows TDD** — red-green-refactor for every ticket
4. **Peer review + QE** — structured quality gates before release
5. **Feedback loop** — retros and learnings make the skills smarter

## Ticket Lifecycle

```
0-ideas → 1-backlog → 2-ready-for-refinement → 3-ready-for-development
→ 4-in-progress → 5-peer-review → 6-ready-for-testing
→ 7-ready-for-release → 10-released
```

## Command Reference

### Ticket Management

| Command | Description |
|---------|-------------|
| `bobby init` | Initialize a new Bobby project |
| `bobby create -t "Title"` | Create a ticket in backlog |
| `bobby list [stage]` | Show the ticket board |
| `bobby view <id>` | View ticket details |
| `bobby plan <id>` | View implementation plan |
| `bobby files <id>` | List ticket folder contents |
| `bobby move <id> <stage>` | Move ticket to any stage |
| `bobby assign <id> <name>` | Assign ticket to someone |
| `bobby comment <id> <dev\|qe> <note>` | Add a note |

### Workflow Shortcuts

| Command | Transition |
|---------|-----------|
| `bobby refine <id>` | backlog → refinement |
| `bobby ready <id>` | refinement → development |
| `bobby start <id>` | development → in-progress |
| `bobby review <id>` | in-progress → peer-review |
| `bobby peer-approve <id>` | peer-review → testing |
| `bobby peer-reject <id> [reason]` | peer-review → needs-rework |
| `bobby approve <id>` | testing → release |
| `bobby reject <id> [reason]` | testing → needs-rework |
| `bobby release <id>` | release → released |
| `bobby reopen <id>` | needs-rework → in-progress |
| `bobby block <id> [reason]` | any → blocked |
| `bobby unblock <id>` | blocked → backlog |

### Ideas & Feedback

| Command | Description |
|---------|-------------|
| `bobby idea "title"` | Create a lightweight idea |
| `bobby promote <ideaId>` | Promote idea to ticket |
| `bobby retro <id> "pattern"` | Create a retrospective |
| `bobby learn <skill> "pattern" "desc"` | Add learning to skill |

## Free vs Pro

### Free (open source)
Everything you need: all ticket commands, 6 workflow skills, stack templates, full CLAUDE.md generation.

### Pro ($19/mo)
- `bobby dashboard` — terminal board UI
- `bobby velocity` — throughput metrics
- `bobby report` — weekly shipped summary
- `bobby skills` — premium skill packs

```bash
bobby activate <key>  # Unlock pro features
```

## Stacks

Bobby comes with pre-configured defaults for:
- **Next.js** — `npm` commands, single health check
- **Rails + React** — `docker compose` + `npm`, dual health checks
- **Python / Flask** — `pytest`, `flake8`, Flask defaults
- **Generic** — sensible defaults, configure manually

## License

MIT
