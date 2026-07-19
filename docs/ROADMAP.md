# Roadmap

**North star:** the best way for one person to ship a real project alone. See [POSITIONING.md](POSITIONING.md) for the lens every item below was sorted through.

## Shipped

- **The studio: one machine, many projects.** Auto-registering project registry, `bobby projects`, cross-project `bobby brief --all`, and a global idea inbox capturable from anywhere. Solo builders juggle several projects; Bobby now follows them across the whole studio.
- **`bobby ticket` namespace.** All ten ticket operations consolidated under one command (alias `tkt`) — the CLI surface reads as a system, not a pile.

- **`bobby idea` / promote.** Five-second idea capture that lives outside the board until promoted to a ticket. Was in the original design spec (2026-03-16); now built.
- **`bobby brief` — the "where was I?" command.** Reads ticket stages and open sprints and answers: what's in flight, what's blocked, what's the one next action. Positioning principle 2 (the tool carries the context) made into a command.
- **Sprint language pass.** Help text and the generated `sprint-plan.md` now frame a sprint as *a batch of related tickets riding one branch so main stays clean while a bigger change comes together* — no scrum, no velocity, no ceremony.

## Now — sharpen what exists around the solo builder

- **Interruption-safety audit.** Verify every long-running flow (`bobby run pipeline`, `bobby sprint run`, feature workflow) survives being killed mid-run and resumes cleanly from `progress.md` / session state. Bursty time is the solo constraint; resumability is the feature.
- **`bobby brief` follow-ups.** Fold in recent session activity ("last touched TKT-003, 2 days ago") and surface stale-ticket nudges, so the brief reflects time as well as state.

## Next

- **Retro that feeds forward.** `bobby retro` summarizes the week; make its output actionable — propose `bobby learn` entries from the session logs so the retro automatically makes next week's agents smarter. The learnings loop is the solo builder's institutional memory.
- **Notify on human-needed.** The only human in the loop steps away. When a pipeline hits an approval gate, fails its retry budget, or a sprint finishes, Bobby should be able to ping you (OS notification first; anything fancier later). Complements the dashboard for the away-from-keyboard hours.

## Later

- **Multi-project awareness.** Freelancers and indie hackers juggle several small codebases. A cross-project `bobby brief` — every project's in-flight work in one view — without any server or account.
- **Deeper `assign` = agent routing.** Evolve `bobby assign` away from person-assignment semantics toward routing: pin a ticket to a specific agent or pipeline so batch runs pick the right specialist automatically.

## Reframed

| Feature | Old frame | Solo frame |
|---------|-----------|-----------|
| Sprints | Team iteration with a shared branch | A batch of related tickets riding one branch — bigger-than-one-ticket work without dirtying main |
| Dashboard | Team board | Mission control for *your* parallel agents — you're the only human watching |
| `bobby assign` | Assign to a person or agent | Route to an agent |
| Retro | Team ceremony | Personal feedback loop that trains your agents |

## Not doing

Multi-user accounts and permissions, human review queues and handoffs, capacity planning and estimation, real-time collaboration, anything whose only job is informing another human. Bobby has one human, by design.
