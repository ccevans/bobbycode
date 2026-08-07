# Architecture Wakeup

```
PLATFORM: bobbycode — MIT Node18+ ESM CLI + local web app that runs AI agents
  through a ticket workflow. No DB, no framework, no bundler. State = files.

LAYOUT:
  bin/bobby.js + commands/   → CLI (commander)
  lib/tickets|stages|workflow|brief|agent-registry  → the loop
  lib/dashboard/             → orchestrator, worktree, executor, state, sse, server (~31 routes)
  lib/targets/               → claude-code | cursor | cline    lib/remote/ → E2E relay
  APP UI IS NOT HERE → @bobbycode/pro-dashboard app/ , via BOBBY_APP_DIR or Pro plugin.
    API is here (lib/dashboard/server.js). Visual contract: .bobby/design/design-spec-feature-view.md

FLOW: browser → /api/* → Orchestrator → git worktree → spawn `claude -p` → stdout JSONL
  → session .jsonl + SSE. Ticket stage re-read FROM THE WORKTREE on exit.

AUTH: none. 127.0.0.1 only. `bobby remote` = outbound WS, AES-256-GCM, GET/POST /api/* only.

STATE: .bobby/tickets/*/ticket.md frontmatter · .bobby/workspaces.json · .bobby/sessions/*.jsonl

TESTS: npm test (jest, ESM flag) · npm run lint · no Docker · CI = lint+test on 18/20/22
  Use fs.mkdtempSync + real git; inject `spawn` into runAgent; never launch a real CLI.

PITFALLS:
  - Tickets ALWAYS resolve to the MAIN worktree root; a running agent reads its own
    worktree copy. `bobby ticket move` does not reach it.
  - New worktrees fork from main/master, not your branch. Unmerged work is invisible.
  - Stage done ≠ agent exited. Success = exit 0 AND stage changed, then awaits approval.
  - mergeToMain stashes + checks out main IN the main checkout — races any repo work.
  - _resolveNextAgent is likely off-by-one (skips build); AGENT_STAGE_MAP is dead code.
  - No concurrency cap. This repo's `default` workflow ends at review (no live app).
  - Never hand-edit .bobby/tickets/.counter — IDs are claimed by atomic mkdir.
  - UI is light-only, 13px type floor, no pulse, no shadows.

DECISIONS: see .bobby/decisions.yaml    FULL: .bobby/architecture.md
```
