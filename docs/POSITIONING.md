# Positioning: A Full SDLC Workflow for a Solo Developer

**Adopted:** 2026-07-05
**Status:** Active — every new feature is evaluated against this lens.

Bobby is a full software development lifecycle for **one person shipping a real project alone** — and the way it delivers that is by giving the solo developer a *whole team*. Not human teammates: a full lineup of agents (planner, builder, peer reviewer, testers, security auditor, QE) that fills every role an engineering org would staff. One human, a full team behind them.

It's not a team tool scaled down — it's a solo tool scaled *up*, giving a single builder the process discipline of a whole org without the ceremony that only exists because *humans* have to coordinate. The team is real; the coordination overhead isn't, because there's still only one person to answer to.

## Who Bobby is for

- The solo developer building a product on nights and weekends
- The indie hacker running a one-person SaaS
- The non-developer building with Claude Code who needs process, not prompts
- The freelancer juggling several small codebases alone

## Who Bobby is not for

Teams coordinating multiple humans on one codebase. Bobby has no concept of user accounts, permissions, human handoffs, or capacity planning — and never will. If your bottleneck is *people coordinating with people*, you want a different tool.

## The five solo-builder principles

Every feature decision starts from what's different about working alone:

1. **No reviewer — so the team is agents.**
   A solo developer has nobody to catch their mistakes. Bobby's review, test, security, and QE agents aren't nice-to-haves; they're the *only* second pair of eyes — the teammates you don't have. Verification must be automated, adversarial (fresh-perspective agents, never the author reviewing itself), and trustworthy enough to merge on.

2. **No standup — so the tool carries the context.**
   Nobody will remind you where you left off. Sessions, `progress.md` resume, ticket frontmatter, and learnings exist so that Monday-you inherits Friday-you's context automatically. Anything that helps Bobby answer "where was I, and what's next?" is core.

3. **One brain — so ceremony is pure overhead.**
   Team rituals (estimation, approval chains, status reporting to others) exist to synchronize brains. With one brain there's nothing to synchronize. Every command must pay for itself in shipped work; if a step exists only to inform someone else, it doesn't belong in Bobby.

4. **Bursty time — so everything must be resumable.**
   Solo work happens in stolen hours. Any workflow, sprint, or agent run must survive being interrupted and pick up cleanly — no long-lived state that rots between sessions.

5. **Solo doesn't mean small — so quality is non-negotiable.**
   A one-person project still has production users. TDD, code review, security audits, and post-deploy watchdogs are how a solo builder ships at team-grade quality without a team.

## The feature filter

Before building anything, ask:

- Does this serve **one person shipping alone**, or is it coordination overhead imported from team processes?
- Does it **reduce** ceremony or add it?
- Does it help Bobby **carry context** across interrupted sessions?
- Would it still make sense if the project's only human never talks to another human about it?

Two "no"s and it's out of scope.

## What this means for existing features

| Feature | Verdict | Notes |
|---------|---------|-------|
| Workflow (plan → build → review → test) | **Double down** | The automated "team" — principle 1 made concrete |
| Learnings & retros | **Double down** | Bobby's memory is the solo builder's institutional knowledge |
| Sessions & `progress.md` resume | **Double down** | Principle 2 and 4 made concrete |
| Backlog triage & archive | **Double down** | One brain needs a curated backlog, not an infinite one |
| Dashboard | **Keep, solo-framed** | Mission control for *your* parallel agents, not a team board |
| Sprints | **Keep, reframed** | A batch of related tickets riding one branch — see [ROADMAP.md](ROADMAP.md). Mechanics are already solo (one runner, sequential tickets, shared branch) |
| `bobby assign` | **Reframe** | Assignment routes tickets to *agents*, not people |
| Multi-user anything | **Out of scope** | Accounts, permissions, human review queues, capacity planning |

See [ROADMAP.md](ROADMAP.md) for the full feature-by-feature pass and what's next.
