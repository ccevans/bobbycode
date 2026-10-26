# bobbycode — Ticket Workflow

## Stages

| Stage | Description |
|-------|-------------|
| `backlog` | Tickets waiting to be worked on |
| `planning` | Being refined — plan.md + test-cases.md |
| `building` | Engineer is actively building (TDD) |
| `reviewing` | Code complete, peer review in progress |
| `testing` | Review passed, automated testing |
| `shipping` | Tests passed, ready to ship (launch pad) |
| `done` | Shipped and verified |
| `blocked` | Cannot proceed — blocker documented |

## Ticket Structure

All tickets live in a single directory: `.bobby/tickets/`

Each ticket is a folder: `{ID}--{slug}/`

Contents:
- `ticket.md` — Frontmatter (stage, priority, etc.) + description + comments
- `test-cases.md` — Test cases (added during planning)
- `plan.md` — Implementation plan (added during planning)

Stage is tracked in `ticket.md` frontmatter — no physical file moves.

## Commands

| Action | Command |
|--------|---------|
| Create ticket | `bobby ticket create -t "Title" --type feature -p medium` |
| Create epic | `bobby ticket create -t "Big feature" --epic` |
| View board | `bobby ticket list` |
| View stage | `bobby ticket list building` |
| View blocked | `bobby ticket list --blocked` |
| View epic children | `bobby ticket list --epic TKT-001` |
| View ticket | `bobby ticket view TKT-001` |
| View plan | `bobby ticket view TKT-001 --plan` |
| View files | `bobby ticket view TKT-001 --files` |
| Move to stage | `bobby ticket move TKT-001 build` |
| Reject (back to building) | `bobby ticket move TKT-001 reject "reason"` |
| Block | `bobby ticket move TKT-001 block "reason"` |
| Unblock | `bobby ticket move TKT-001 unblock` |
| Step through stages (slow) | `bobby run next TKT-001` |
| Auto-chain all agents (fast) | `bobby run workflow TKT-001` |
| Run agent on all in stage | `bobby run plan` (no ticket ID) |
| Ship | `bobby run ship` |
| UX design review | `bobby run ux` |
| PM product review | `bobby run pm` |
| Add comment | `bobby ticket comment TKT-001 "note"` |
| Assign | `bobby ticket assign TKT-001 name` |

## Running Agents

### Fast Mode — Auto-Chain
`bobby run workflow TKT-001` chains all agents automatically:

```
bobby-plan → bobby-build → bobby-review → bobby-test → shipping
```

- Fully automated — no pauses
- Rejections loop back to building (max 3 retries)
- Workflow resumes from current stage
- `bobby run ship` creates PR + merges when ready

### Slow Mode — Step by Step
`bobby run next TKT-001` reads the ticket's current stage and runs exactly one agent. Re-run after each step to advance.

Best for complex or sensitive work where you want to review between stages.

### Batch Mode — All Tickets in a Stage
`bobby run plan` (no ticket ID) finds all tickets in the matching stage and generates a prompt to run each in a parallel subagent.

Works with: `plan`, `build`, `review`, `test`

### Cowork Agents
`bobby run ux` and `bobby run pm` launch freeform design or product reviews via browser automation. Optionally pass a ticket ID to focus the review.

## Health Checks


_No health checks configured._


## Retrospectives

When a systemic issue is found:
1. `bobby retro TKT-001 "pattern name"` — creates a retro
2. `bobby learn bobby-build "pattern" "description"` — adds to skill learnings

This feedback loop is what makes Bobby get smarter over time.
