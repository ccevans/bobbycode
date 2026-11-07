# TKT-073 live end-to-end evidence

Headless `claude -p` (Claude Code 2.1.233), scratch project outside this repo, workflow `e2e: [build, review]`
(`orchestration: workflow`, `bobby init --refresh`), throwaway tickets that add a one-line text file.
Invocation = `bobby run e2e TKT-00x` (see `invocation.txt`). Permission mode bypassPermissions, budget cap $6 per run.

The Workflow tool IS callable from a headless session when the prompt names the saved workflow. It launches in the
background; `claude -p` prints its final message ~15s later and the process lingers until the workflow ends.

## Attempt 2 (the proof): kill, then resume in the SAME session

| Step | What happened |
|---|---|
| Run 1 | `claude -p "<invocation.txt>" --session-id 8cb763f7-23d9-4ac2-b620-3d6029605f4a`. Run id `wf_d7c67f47-8ed`. |
| Build | `bobby-build` agent `ab976d1b61603ee95` returned `{stage: reviewing, verdict: advanced}` (journal line 2). |
| Kill | `kill <pid>` (SIGTERM) at 20:36:51 UTC, as soon as the build result was in the journal and `bobby-review` (agent `aff19111…`) had started. Ticket sat in `reviewing`. |
| Run 2 | `claude -p "<resume-prompt.txt>" --resume 8cb763f7-…`. Workflow tool: `scriptPath .claude/workflows/bobby-e2e.js`, `resumeFromRunId wf_d7c67f47-8ed`, same args (`resume-prompt.txt`). Same run id. |
| Cache hit | `journal-attempt2-same-session.jsonl`: build key `cd547275…` has ONE `started` and ONE `result` (agent `ab976d1b…`) across both runs. No second build agent. |
| Live review | Review key `bf44e7f4…` has two `started` lines (killed agent `aff19111…`, then live agent `ac08b59a…`) and one `result`: `{stage: shipping, verdict: advanced}`. |
| End state | `final-state.txt`: TKT-002 `Stage: shipping`, `hello2.txt` committed (`fe579de`). Workflow report: TKT-002 `complete`, `rejections 0`, `iterations 2 of 20` (`iterations` counts the cached call too). |

Tokens/time (from the stream): run 1 cost $0.31 to launch; run 2 resume $0.54 + $1.32 cumulative as reported by the CLI;
workflow task summary `total_tokens 53476, tool_uses 16, duration 103981 ms` for the resumed (live review) part.

## Attempt 1 (a finding, kept on purpose): resume from a NEW session does not hit the cache

Same flow on TKT-001 but run 2 was a fresh `claude -p` (new session `b2b188cf…`). The Workflow tool accepted
`scriptPath` + `resumeFromRunId wf_90ead14e-1f7` and ran, but `journal-attempt1-run2-new-session.jsonl` shows the build key
`fdbd995e…` started AGAIN with a new agent (`a662b6a2…`), so nothing was served from cache. (The model's closing message said
"the cached build stage"; the journal shows it was not. Trust the journal.) The re-run build agent saw the ticket already in
`reviewing`, returned `verdict: mismatch`, and the script continued from `reviewing`: the stale-snapshot path working live.
Consequence: the printed resume instruction now says to resume in the same Claude Code session.

## Other observations

- The model passed `args` to the Workflow tool as a JSON string; the tool parsed it to an object, and the script's own validation accepted it.
- Files: `invocation.txt`, `resume-prompt.txt`, `run1-excerpt.txt`/`run2-excerpt.txt` (attempt 2 tool calls and results),
  `attempt1-*-excerpt.txt`, three `journal-*.jsonl` copies, `final-state.txt`.
