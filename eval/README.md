# Bobby Live Evals

Bobby's `test/` suite proves the **machinery** works (commands, state, workflow
resolution, prompt correctness). It cannot prove that the **agents** produce good
code on a hard task — that's the model's judgment on open-ended work, which is
non-deterministic and can't be asserted by a unit test.

This directory closes that gap: a small harness of **complex fixtures** you run
the agents against, graded **objectively** (behavior-based), producing a **pass
rate** instead of a green/red on the plumbing.

## Layout
- `base/` — a dependency-free notes API (Node built-ins + `node:test`). The app
  the agents build features on. Real substance: a router with params, an
  in-memory store, and existing tests that must not regress.
- `fixtures/<name>/`
  - `ticket.md` — a complex task with objective acceptance criteria.
  - `grade.sh <app-dir> <port>` — starts the built app and curls the required
    behavior + edge cases. Exits 0 only if **every** check passes. It also runs
    the app's `node --test` suite as a regression gate.

## The fixtures (escalating difficulty)
1. **01-delete** (moderate) — a new state-mutating endpoint + not-found path, no regressions.
2. **02-validate-filter** (harder) — two concerns at once: input validation on write, case-insensitive query filtering on read, each with edge cases.
3. **03-pagination** (hardest) — a feature with **unstated defaults** the agent must choose sensibly, plus **hostile inputs** (negative/non-numeric/absurd) that must not crash.

## How to run one
```bash
cp -r eval/base /tmp/eval-run && cd /tmp/eval-run
bobby init                                  # scaffold the agents
# create a ticket from the fixture's acceptance criteria, then:
bobby run workflow TKT-001                  # execute plan→build→review→test in Claude Code
# when the agents finish:
bash <repo>/eval/fixtures/01-delete/grade.sh /tmp/eval-run 4801
```

## Reading the result
- A single run gives a sample, not a rate — agent output is non-deterministic.
  For a real number, run each fixture several times and report `passed / total`.
- Grading is deliberately behavior-based (over HTTP), so it's blind to *how* the
  agent implemented the feature — only whether it works.

## Honest caveats
- Capability is bounded by the model executing the prompts; a pass rate reflects
  today's model + today's skill prompts, not a guarantee.
- These fixtures cover backend API work. Add fixtures for your own domain (UI,
  data migrations, multi-file refactors) to evaluate what you actually build.
