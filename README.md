# Bobby — A Full SDLC Workflow for a Solo Developer

[![npm version](https://img.shields.io/npm/v/bobbycode.svg)](https://www.npmjs.com/package/bobbycode)
[![CI](https://github.com/ccevans/bobbycode/actions/workflows/ci.yml/badge.svg)](https://github.com/ccevans/bobbycode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/bobbycode.svg)](https://nodejs.org)

Bobby is an open-source npm CLI that gives one person a **whole engineering team**. You're the only human; Bobby staffs the rest — a planner, a builder, a peer reviewer, testers, a security auditor, QE — as Claude Code agents that run a full software development lifecycle end to end. Tickets, TDD, code review, automated testing, security audits, shipping: the process discipline of an entire org, with a headcount of one.

**Who it's for:** solo devs, indie hackers, freelancers, and non-developers building with Claude Code who want a structured process instead of "one big prompt and hope for the best."

**The idea:** working alone means no reviewer, no standup, and no one to remind you where you left off. So Bobby *is* your team — its agents are your reviewer, its sessions carry your context between stolen hours, and every command pays for itself in shipped work. Read the full philosophy in [docs/POSITIONING.md](docs/POSITIONING.md) and where it's headed in [docs/ROADMAP.md](docs/ROADMAP.md).

**New here?** [docs/FLOW.md](docs/FLOW.md) walks the whole path end to end — the two ways in (new project vs. existing codebase) and the one loop you live in afterward.

## Install

Bobby is published to the public npm registry — no account or auth required.

```bash
# Run without installing (always the latest version)
npx bobbycode init

# ...or install globally to get the `bobby` command everywhere
npm install -g bobbycode
bobby init
```

Requires Node.js 18+ (you already have it if you use Claude Code).

<details>
<summary><strong>Never installed anything like this? Start here.</strong></summary>

Bobby runs in the terminal and drives Claude Code, so a first-time setup is three one-time installs, in this order:

1. **Node.js** — powers the `npx` and `npm` commands above. Go to [nodejs.org](https://nodejs.org), download the **LTS** installer, and click through it like any normal app install.
2. **Claude Code** — Bobby's agents run inside it, so you need it installed and signed in with a Claude account (Pro/Max subscription or an API key). Follow the [Claude Code setup guide](https://docs.anthropic.com/en/docs/claude-code/setup).
3. **Git** — Bobby commits your work as it goes. On a Mac, macOS offers to install it the first time it's needed — say yes. On Windows, download it from [git-scm.com](https://git-scm.com).

Then open your terminal — **Terminal** on Mac, **PowerShell** on Windows (both are already on your computer) — and run `npx bobbycode init`. From here on, the two commands above are all you touch.

</details>

## Vet the Idea First

Before you build anything, pressure-test the idea — solo, there's no cofounder to poke holes:

```bash
bobby vet "a habit tracker for runners"
```

This asks you the right questions **one at a time** — who feels the pain, what they use today, the riskiest assumption, the cheapest way to test it — then gives an honest **PURSUE / REFINE / PARK** read and a sharpened one-liner. Works from anywhere, no project needed. Vet a captured idea by number with `bobby vet 3`. If it survives, hand the sharpened idea to `bobby new`.

## Already Built Something? Audit It

If you vibe-coded an app and you're not sure it's safe to put customers on, start here — it works on **any** repo, whether or not Bobby has ever touched it:

```bash
cd my-app
npx bobbycode audit
```

You get a **0–100 production-readiness score**, broken down by area, and every gap worst-first with what the audit saw and how to fix it:

```
  Production readiness  — 76 files scanned

  ██████████████████████░░  92/100  production-ready

    Security        88/100  4/5 checks
    Reliability    100/100  4/4 checks
    Operability     75/100  3/4 checks
    Change safety  100/100  5/5 checks
```

The checks are the guards that separate a prototype from something you can charge for: committed secrets, security headers, rate limiting, input validation, dependency scanning, config validation, error handling, timeouts, webhook signatures and idempotency, structured logging, request correlation, secret redaction, health checks, tests, CI, and static analysis. Checks that don't apply to your project are skipped, not counted against you.

It's **deterministic and local** — no model calls, no network, no token cost. Same tree, same score, every time.

### Packs — what "finished" looks like for your kind of product

The baseline audit knows what every serious app needs. A **pack** adds what a
*particular kind of product* needs — and carries the roadmap to get there:

```bash
bobby pack list                     # what's installed
bobby audit --pack saas-starter     # score against a platform's expectations
bobby pack apply saas-starter       # seed its roadmap as tickets
bobby go                            # work the roadmap
```

```
  Production readiness + SaaS Foundations  — 76 files scanned

  █████████████████████░░░  86/100  nearly there

    Security              88/100  4/5 checks
    Reliability          100/100  4/4 checks
    Operability           75/100  3/4 checks
    Change safety        100/100  5/5 checks
    Product completeness  95/100  5/6 checks
    Data & tenancy         0/100  0/2 checks
```

Packs are declarative YAML — checks, a roadmap, and optional scaffolds — so they
are safe to install and easy to write. `bobby pack apply` seeds only what your
repo is still missing, so the roadmap shrinks as you build. Write your own with
[docs/PACKS.md](docs/PACKS.md).

Two ship free: **`saas-starter`** (account model, paid path, email, deletion,
backups) and **`revenue`** — *Get Paid*, because an app that cannot charge money
is a hobby however well-engineered. It scores the whole path from "it works" to
"a stranger can pay me": a price in public, a checkout a visitor can complete
unaided, verified payment webhooks, features that are actually gated, and the
unglamorous parts that decide whether the money stays — failed payments,
cancellation, receipts.

```bash
bobby audit --pack revenue      # what stands between you and revenue
bobby pack apply revenue        # the roadmap to charging, as tickets
```

Then turn the gaps into work:

```bash
bobby audit --tickets     # one ticket per gap, described and prioritized
bobby go                  # start closing the worst one
```

Seeded tickets arrive with the gap, why it matters, the suggested fix, and acceptance criteria — and security gaps are routed to the `secure` workflow automatically. Use `--json` for CI, `--all` to see what passed.

## Make It Look Designed

The reason most solo-built apps look solo-built is that there was no designer —
so everything defaults to the same centered hero, the same purple gradient, the
same rounded cards. Bobby ships a **design lead**, free:

```bash
bobby "design a landing page for my habit tracker"
bobby "make it look less generic"
```

It runs the process a studio runs, rather than guessing at a prompt: research
real references and **cite** them, tear each one down into actual extracted
values, build mockups in each system so you choose by **reacting** ("warmer or
sharper?" — never "pick a hex code"), lock the winner into a versioned spec,
build it, then review the result live against that spec.

What keeps it from looking AI-made is that the rules are binding, not advisory:
a **slop checklist** of banned patterns, a directory of 13 studied design
systems to work from when you have no references of your own, and a final check
that probes the rendered page — it verifies computed styles rather than trusting
the source, and greps for CSS that fails silently.

Already built and just want a critique? That's `bobby run ux`, which reviews the
running app and files tickets. This skill *creates*; that one *reviews*.

## Bobby Pro

Bobby is free forever — the whole loop, all 23 agents (design included), the
audit, and the packs above are MIT and always will be. **Bobby Pro** is the
shelf on top:

- **The Bobby App** — your whole team in one page: where you left off, one
  "Do this next" button, the amber needs-you queue, live agent logs. Run
  `bobby app` and the browser is your engineering org.
- **Every paid pack** — now and every one released later.
- **Pro specialists** beyond the free 23, kept current as Claude Code and the
  models move.

```bash
bobby pro                    # status, and what it unlocks here
bobby pro activate <key>     # one key, every paid pack
bobby pro install <tarball>  # install a Pro add-on you downloaded
```

Activation is offline — a signature check, no account and no network call. **A
lapsed subscription keeps everything it paid for**; renewing only adds what
shipped since. [Get Bobby Pro](https://ccevans.gumroad.com/l/bobby-pro).

The line is simple and it does not move: **anything shipped in this MIT package
is free forever.** Pro is only ever net-new content, delivered as packs or as
add-ons that install into `~/.bobby/pro/` — never a lock bolted onto something
you already have.

## Start From an Idea

Got a new idea and nothing built yet? One command turns a sentence into a **running project** with an MVP epic ready to build:

```bash
npx bobbycode new "a habit tracker for runners"
```

This creates the directory, drops a **dependency-free runnable skeleton** (a Node HTTP server with `/health`, plus passing tests — no `npm install` needed), scaffolds Bobby, captures your idea as the MVP epic, and makes the first commit. Then you only need **one verb**:

```bash
cd a-habit-tracker-for-runners
npm run dev    # it already runs → http://localhost:3000
bobby go       # break the idea down, build it, ship it — run it again and again
```

**Starters** (`--stack`): `node` (HTTP API, default), `web` (static page), and `blog` (static blog) ship a runnable skeleton. Framework presets (`nextjs`, `go`, `django`, …) scaffold Bobby only for now. Name the directory with `--dir`. Already have a project? Use `init` below instead.

### Need a blog?

```bash
bobby new "notes on shipping alone" --stack blog
```

Markdown files in `posts/`, a static site out in `public/` — index page, a page per post, and an RSS feed. No framework, no database, **no dependencies at all**:

```bash
cd notes-on-shipping-alone
npm run dev      # build + preview at http://localhost:3000
```

Write a post by dropping a file in `posts/` with `title` and `date` frontmatter; `draft: true` keeps it out of the build until it's ready. The filename is the URL, the theme is one CSS file, and the generator is ~250 readable lines you own. Deploy `public/` to GitHub Pages, Netlify, Cloudflare Pages, or any static host.

## Just Say What You Want

The simplest way to use Bobby is to not learn commands at all — just say what you want (the `do` is optional):

```bash
bobby "add a health check endpoint"
bobby "is a Slack standup bot worth building"
bobby "the login button does nothing when clicked"
```

Anything that isn't a known command is treated as a request: Bobby matches it to the right capability (build it, vet it, debug it, review it, ship it…) and runs it. Inside a Claude Code session it's even more seamless — the generated `CLAUDE.md` teaches Claude Code the same routing, so you **just talk to it**, no `bobby` prefix at all.

## The Core Loop Is Two Verbs

```bash
npx bobbycode new "your idea"   # start a project (or `init` in an existing one)
bobby go                        # do the next thing — run it again and again
```

`bobby go` is the only command you run day to day. From any state it figures out and runs the single most useful next step — break a fresh idea into tickets, build the MVP, push in-flight work forward, or ship what's ready — and tells you what it did. You never have to learn the rest.

Everything below (`vet`, `idea`, `brief`, `ticket`, `sprint`, `run`, `dashboard`, …) is optional — reach for it when you want to, but `new` + `go` is the whole loop.

<details>
<summary>The optional verbs, when you want them</summary>

```bash
bobby vet "a risky idea"           # Pressure-test an idea before building it
bobby audit                        # Score this codebase on production readiness
bobby go "build the login page"    # Create a specific ticket AND build it now
bobby idea "dark mode someday"     # Capture a thought in 5 seconds, without touching the board
bobby brief                        # Where was I? What's in flight, what's blocked, what's next
bobby ticket list                  # See the full board
bobby dashboard                    # Watch agents work in parallel worktrees
```

</details>

`bobby init` scaffolds: `.bobby/` (tickets, sessions, config), `.claude/` (22 skills,
23 agents, 20 slash commands), and `CLAUDE.md` — everything auto-detected from your
repo. Prefer to choose? `bobby init --custom` runs the full wizard.

## Configuration

All configuration lives in `.bobbyrc.yml`, generated with comments during `bobby init`. Key sections:

```yaml
# Project identity
project: my-app
stack: nextjs                  # nextjs | rails-react | django | python-flask | go | rust | polyglot | generic
target: claude-code            # claude-code | cursor | cline | codex | agents-md | copilot | opencode

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
# Custom + override workflows (built-in: default, secure, quick, freewill, design, define)
workflows:
  default: [plan, build, review, test]
  secure: [plan, build, security, review, test]
  thorough: [plan, build, review, security, test]

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
  max_concurrent: 4               # Agents in flight at once; past the cap a run
                                  # is refused (with the running ones named),
                                  # never queued.

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

## Editors: Claude Code, Cursor, Cline, Codex, Copilot, OpenCode — and any AGENTS.md tool

Bobby's CLI never calls a model itself — tickets, audits, scoring, sprints, and
`bobby vet` are all deterministic local code. The AI half is a set of markdown
files (rules, agents, skills, commands) scaffolded into whatever your editor
reads. Set that with `target` in `.bobbyrc.yml`, or pick it in `bobby init --custom`:

| `target` | Rules | Skills | Commands | Agents | Subagents |
|---|---|---|---|---|---|
| `claude-code` | `CLAUDE.md` | `.claude/skills/` | `.claude/commands/` | `.claude/agents/` | Yes |
| `cursor` | `AGENTS.md` | `.cursor/skills/` | `.cursor/commands/` | `.cursor/agents/` | Yes (3.13+) |
| `cline` | `.clinerules/rules.md` | `.clinerules/skills/` | `.clinerules/workflows/` | `.clinerules/agents/` | No |
| `codex` | `AGENTS.md` | `.codex/skills/` | `.codex/commands/`¹ | `.codex/agents/`¹ | No² |
| `agents-md` | `AGENTS.md` | `.agents/skills/` | `.agents/commands/`¹ | `.agents/agents/`¹ | No |
| `copilot` | `AGENTS.md` | `.github/skills/` | `.github/prompts/*.prompt.md`³ | `.github/bobby/agents/`¹ | No |
| `opencode` | `AGENTS.md` | `.opencode/skills/` | `.opencode/commands/` | `.opencode/bobby/agents/`¹ | No |

¹ Reference docs the prompts can cite — these tools have no native command or
project-agent surface (verified against the shipped binaries; see the adapter
headers for citations). For `copilot` the agent files deliberately avoid the
native `.github/agents/` registry — its profile dialect is unverified without
a live install, so Bobby keeps unconforming files out of it. For `opencode`
the agent files likewise avoid the native `.opencode/agent(s)/` registry —
it is real (every `.md` there becomes an agent config), but Bobby's agent
files do not conform to its dialect, so they live in `.opencode/bobby/agents/`,
which no shipped scan matches (verified on the real binary: `opencode agent
list` shows only built-ins with the scaffold present). Its commands cell has
no marker: `.opencode/commands/` are real slash commands, with frontmatter
reduced to the documented `description` key. ² Codex has
subagent *tools* but no file registry. ³ Prompt files are IDE-only — the docs
state "Prompt files are only available in VS Code, Visual Studio, and JetBrains
IDEs" — so CLI and coding-agent users drive the same flows through
`.github/skills/` instead (every command body is a one-line pointer at its
skill).

`codex` also drives the dashboard headlessly (`codex exec --json`, derived from
`target: codex`). `agents-md` is the generic tier for the AGENTS.md ecosystem —
Devin Desktop (formerly Windsurf), Zed, Antigravity CLI (the
Gemini CLI successor), Jules, Amp and the rest: **rules + skills
work; nothing more is claimed.** The support matrix below is the summary of
how each target was verified; the full citations live in the adapter headers
(`lib/targets/*.js`), which stay the source of truth.

### Support matrix

Two tiers. A **dedicated** target has a hand-verified adapter: every scaffold
path is cited in its header, and it may drive the dashboard through a CLI
executor. The **generic** tier (`agents-md`) claims exactly rules + skills per
the AGENTS.md convention, for any tool that reads it — no dashboard
derivation, no subagent claim, nothing more. Tools we evaluated and found
fully served by the generic tier — Devin Desktop, Zed, Antigravity CLI — are
named in the prose above and deliberately get no rows of their own. The
Verified column exists because three claims in the original Cursor work
shipped wrong by trusting docs over binaries; every cell now states how its
row was checked — `real-CLI` (a real run of the named binary), `shipped-code`
(a reading of the shipped binary or source), or `convention` (published
convention only, with the claims limited to match).

| `target` | Tier | Dashboard | Verified | Canary |
|---|---|---|---|---|
| `claude-code` | dedicated | `claude` (default) | real-CLI — daily-driven; probe runs against claude 2.1.233, 2026-08-23 (BOB-089 verification ledger) | weekly |
| `cursor` | dedicated | `cursor-agent` | shipped-code — Cursor 3.13 bundle reading (adapter header) + real cursor-agent 2026.07.23-e383d2b runs, 2026-08-23 | weekly |
| `cline` | dedicated | — | convention — Cline docs only; **not verified against a Cline binary** (its adapter header says so) | — |
| `codex` | dedicated | `codex` (incl. chat resume) | real-CLI — codex-cli 0.146.0 runs, 2026-08-22/23, incl. the exec-resume cross-product; scaffold paths from the binary's own strings | weekly |
| `copilot` | dedicated | — | convention — official GitHub/VS Code docs, fetched 2026-08-23 (full URLs + quotes in lib/targets/copilot.js header) | — |
| `opencode` | dedicated | — | real-CLI — opencode 1.18.21 probes (debug config / debug skill / agent list) against the actual scaffold, 2026-08-24; SHA-pinned source permalinks (sst/opencode@03bba46, fetched 2026-08-23) in lib/targets/opencode.js header | — |
| `agents-md` | generic | — | convention — files land per the AGENTS.md spec; the `.agents/skills/` root corroborated by the cursor-agent 2026.07.23 binary; no per-tool claim | — |

Every dashboard executor above marked `weekly` is canary-monitored:
[`.github/workflows/flag-canary.yml`](.github/workflows/flag-canary.yml)
reinstalls each CLI on a schedule and re-runs the exact argv Bobby's
`buildArgs` builders emit (every permission mode × resume) against it;
unknown-flag drift files an issue. Merge-time verification decays — this is
what keeps the Verified column true over time. A future executor whose CLI has
no non-interactive install can't be canaried; its row says
`not canaried: <reason>` rather than faking a leg.

To switch, set `target:` and run `bobby init --refresh`. Your tickets, sessions,
and `.local` files carry over untouched — they live in `.bobby/`, which is
target-independent. Refresh only writes the new target's files, so the old
target's directory is left in place; delete it yourself if you don't want both
(`rm -rf .claude CLAUDE.md hooks`, say, after moving to Cursor).

### Using Bobby with Cursor

Three of the four paths land on things Cursor already understands, so the whole
loop works with no glue: skills are invocable as `/bobby-build`, commands as
`/bobby-plan`, and `AGENTS.md` is picked up automatically at the repo root.

> **Heads up — you may see each `/bobby-*` entry twice.** Bobby scaffolds both a
> skill and a command under the same name (all 20 commands share a name with a
> skill), because Cursor added skills after commands and older versions only
> support the latter. Either entry does the same thing — the command is a
> one-line pointer to the skill — so pick whichever appears. If your Cursor
> supports skills and you want a shorter menu, `rm -rf .cursor/commands` is safe.

```bash
bobby init --custom     # choose Cursor at the "AI target" prompt
```

There are three ways to actually run a stage, and only the middle one involves
pasting anything:

1. **In Cursor's agent pane — no pasting.** Type `/bobby-build` and pick your
   ticket, or just say "work tickets". `AGENTS.md` tells Cursor which skill to
   load for which request, so plain English routes correctly. This is the daily
   loop, and it's the same experience Claude Code users get.
2. **From the terminal** — `bobby run build TKT-001` (and `bobby go`) print a
   ready-made prompt for you to paste into Cursor or pipe to `cursor-agent -p`.
   This is how `bobby run` behaves on *every* target, Claude Code included.
3. **`bobby dashboard` — headless.** Each workspace spawns its own `cursor-agent`
   subprocess in an isolated git worktree, streaming tool calls and diffs to the
   web UI. Requires `cursor-agent` on your `PATH`. It runs start-to-finish
   without stopping to ask about file edits by default — see
   [Dashboard](#dashboard) for the two permission keys and how to tighten them.

Agent definitions land in `.cursor/agents/`, which Cursor 3.13+ reads as
workspace-scoped **subagents** — it keys their identity on the `name` frontmatter
field Bobby already writes, so `bobby-build` and friends show up as real
dispatchable subagents, the same as under Claude Code. On older Cursor builds
that predate subagents the directory is simply ignored, and the loop still works
because every generated prompt references its agent by path.

(`bobby run` prints a prompt to paste on *every* target, Claude Code included —
that isn't a Cursor penalty.)

Rules go to `AGENTS.md` rather than `.cursor/rules/*.mdc` on purpose: project
rules must carry the `.mdc` extension plus frontmatter to be read at all, while
`AGENTS.md` is plain markdown, always applied, and shared with every other tool
that reads the same convention. Checking Cursor 3.13's shipped code confirms it:
`AGENTS.md` is honored unconditionally, whereas `CLAUDE.md` is only picked up when
a third-party-extensibility setting is enabled. An existing `AGENTS.md` is backed
up to `AGENTS.md.pre-bobby` and merged, never clobbered.

Worth knowing if you work across both tools: Cursor also reads `.claude/skills/`,
so a `target: claude-code` project isn't inert when opened in Cursor. It still
isn't the better choice — `.claude/agents/` is *not* one of Cursor's subagent
roots, and `CLAUDE.md` needs that extra setting — so prefer `target: cursor`.

Bobby also writes `.cursorindexingignore` to keep session logs out of codebase
search. That is deliberately *not* `.cursorignore` — the latter would block the
agent from reading your tickets.

### Adding a new target (contributors)

Start from [`lib/targets/cursor.js`](lib/targets/cursor.js) — it exercises the
whole adapter contract, with every convention cited in its header;
[`lib/targets/codex.js`](lib/targets/codex.js) shows frontmatter stripping for
a harness that parses none. The acceptance bar is the target matrix suite,
[`test/lib/target-matrix.test.js`](test/lib/target-matrix.test.js): register
your adapter in [`lib/targets/index.js`](lib/targets/index.js) and add one
entry to the suite's `DISTINCTIVE` map, and every invariant runs against the
new target with zero further test edits.

The obligations, each enforced by a test:

- **Register everywhere users pick a target**: `lib/targets/index.js`, the
  `DISTINCTIVE` map, the `bobby init --custom` wizard choices, and the
  `# Options:` comment `.bobbyrc.yml` is written with (`lib/config.js`).
- **Cite every convention claim in the adapter header** — a real CLI run or a
  reading of the shipped binary/source. Docs alone cap the row's status at
  `convention`, with claims-limited wording to match.
- **Add the target's row to the [support matrix](#support-matrix)** —
  `test/docs/support-matrix.test.js` fails without an honest one.
- **Shipping a dashboard executor too?** Add the `EXECUTORS` entry in
  `lib/dashboard/executor.js` **and** one matrix entry (flavor +
  non-interactive install) in
  [`.github/workflows/flag-canary.yml`](.github/workflows/flag-canary.yml) —
  `test/scripts/flag-canary.test.js` enforces the pairing. A CLI with no
  non-interactive install cannot be canaried: say so in the matrix row, never
  fake a leg.

## Dashboard

Bobby ships with a local web dashboard for kicking off agents in parallel, isolated workspaces and watching them work in real time.

```bash
bobby dashboard             # Opens http://127.0.0.1:7777 in your browser
bobby dashboard --port 7778 # Custom port
bobby dashboard --no-open   # Don't auto-open the browser
```

**Workspace model.** Each workspace = one ticket + one git worktree on its own branch + one agent CLI subprocess. Multiple workspaces run in parallel without colliding — each agent lives in its own isolated checkout.

**Executor.** The dashboard drives `claude` by default, or `cursor-agent` when
`target: cursor`. Override either with `dashboard.executor`, and pass a specific
model with `dashboard.model`:

```yaml
dashboard:
  executor: cursor-agent           # claude | cursor-agent | /abs/path/to/a/binary
  model: composer-2.5              # optional — passed through as --model
  worktree_permission_mode: bypassPermissions   # ticket runs — see below
  repo_permission_mode: acceptEdits             # freeform runs — see below
```

**Permission posture — two keys, because the two kinds of run aren't equally
risky.** These map to `--permission-mode` for `claude` and `--force` for
`cursor-agent`.

- `worktree_permission_mode` (default `bypassPermissions`) covers **ticket
  runs**, which happen inside a throwaway git worktree. That copy *is* the
  sandbox: if an agent goes wrong you delete the directory and your checkout
  never saw it. Anything stricter doesn't make a headless agent careful, it
  makes it useless — there's no terminal to answer a permission prompt, so the
  agent retries until it gives up and exits successfully having written nothing.
- `repo_permission_mode` (default `acceptEdits`) covers **repo runs** — the
  freeform agents (`ux`, `arch`, `docs`, `ship`, …), which work in your *real*
  checkout, where none of that sandbox reasoning applies. File edits go through
  (git can review and revert them); arbitrary commands don't. An agent that
  genuinely needs a shell there — `ship`, for one — needs you to raise this key
  on purpose.

Either key takes `bypassPermissions`, `acceptEdits`, `plan`, or `default`
("ask", which headless means "refuse"). The older single `permission_mode` still
works and overrides both.

**When a run does nothing.** An agent that's being refused is stopped after three
refusals rather than left to spend, and a run that exits cleanly having written
nothing and moved no stage is recorded as `no_op` — never `completed` — with a
message naming the likely cause. A clean exit is not evidence of work.

`dashboard.model` is passed through verbatim, so get the valid names from the CLI
itself rather than guessing — `cursor-agent --list-models` (after `agent login`).
Leave it unset to use the CLI's own default.

Bobby prints which executor it's using at startup and warns if the binary isn't
found — it doesn't refuse to start, since reviewing diffs, approving, and merging
existing workspaces all work without the agent CLI.

The `cursor-agent` CLI is a separate install from the Cursor app:
`curl https://cursor.com/install -fsS | bash`, which lands in `~/.local/bin`
(add it to your `PATH`), then `agent login`.

**What you get:**
- **Workspace list** on the left — live status dots (running, awaiting approval, ready to merge, failed, stopped)
- **Live logs** streamed via Server-Sent Events — every tool call, every file edit, every stage transition
- **Diff viewer** — unified diff of the workspace branch vs main
- **Files tab** — changed files with added/removed line counts
- **Runs history** — every agent invocation with exit codes and durations
- **Actions per workspace:** `Run`, `Stop`, `Approve` (advance to next workflow stage), `Reject` (retry build), `Merge` (no-ff into main), `Discard`

**Crash-safe state.** Workspace state is persisted atomically to `.bobby/workspaces.json`, so `bobby dashboard` survives restarts.

**Security.** The dashboard binds to `127.0.0.1` only and has no authentication. If you override the host, bobby prints a loud warning.

**Everything above is free, forever.** The dashboard is MIT like the rest of
Bobby — there is no gated route and no feature that checks a license.

### The Bobby App (Pro)

`bobby app` is the same server wearing its best face — the whole loop in one
simple page, part of [Bobby Pro](#bobby-pro):

- **Home** — where you left off, the one **"Do this next"** button (the same
  brain as `bobby go`), and the amber **needs-you queue**: Approve, Send back,
  or Look first, at thumb size.
- **Board** — tickets by stage; create one with a sentence; start the full
  workflow from the ticket.
- **Live workspaces** — streaming agent logs, the diff one tap away.
- Nothing runs without a confirm sheet saying exactly what will happen — and
  that it uses your machine and your Claude subscription.

Without a Pro key, `bobby app` (and `bobby dashboard`, its old name) serves the
classic dashboard above — free forever, nothing taken away. With Pro, the same
command serves the app and keeps classic at `/classic/`.

### From your phone — `bobby remote`

The dashboard, but in your pocket. Your agents keep working after you walk away
from the desk; `bobby remote` means the moment one needs a human, you're still
that human:

```bash
bobby remote          # prints a QR — scan it with your phone
```

This starts the same dashboard bound to loopback, then opens **one outbound,
end-to-end-encrypted connection** to a relay. Your phone gets the Bobby HQ app:
the ticket board, live agent logs, and a **"Needs you"** queue with thumb-sized
Approve / Send back buttons.

The trust story, in full:

- **Your subscription, your machine.** Agents run here, exactly as if you'd
  typed `bobby dashboard`. Nothing about inference leaves your computer.
- **Outbound only.** No open ports, no port forwarding, NAT stays shut.
- **The relay is blind.** Every frame is AES-256-GCM under a key that travels
  only inside the QR/pairing code — the relay routes ciphertext it cannot read.
- **The phone gets verbs, not a shell.** The tunnel exposes the dashboard's
  `/api/*` surface and refuses everything else.
- Pairing state lives in `~/.bobby/remote/`, never in the repo. Lost a phone?
  `bobby remote --new-code` rotates the channel and cuts old devices off.

### Dashboard add-ons

The dashboard has an extension seam so *separately distributed* add-ons can
mount routes and UI without the free core carrying a paywall. `bobby dashboard`
reports what's loaded, and `GET /api/capabilities` tells the UI what's unlocked
so paid features can render as visible-but-locked rather than invisible.

An extension is a package exporting `register(context)`:

```js
export default {
  name: '@bobbycode/pro-dashboard',
  version: '1.0.0',
  features: ['Fleet view: all workspaces at once'],

  register({ route, serveDir, addScript, store, orchestrator, helpers }) {
    const mount = serveDir(new URL('./ui', import.meta.url).pathname);
    addScript(`${mount}pro.js`);                    // loads after the core app boots
    route('GET', '/api/pro/fleet', (req, res) =>    // /api/pro/* is reserved for add-ons
      helpers.sendJson(res, 200, { total: store.list().length }));
  },
};
```

Bobby looks for add-ons in `$BOBBY_PRO_DASHBOARD` (for developing one), then
`~/.bobby/pro/node_modules/` (where `bobby pro install` puts them), then the
project's `node_modules/`. A missing, unlicensed, or broken add-on degrades to
the free dashboard with a reason in the banner — an add-on can never take the
free dashboard down with it.

## Getting Started: Your First Ticket, End to End

After `npx bobbycode init`, here's a complete walkthrough:

### 1. Create a ticket

```bash
bobby ticket create -t "Add health check endpoint" -p medium --area api
```

### 2. See your board

```bash
bobby ticket list
```

```
 BACKLOG          PLANNING         BUILDING         REVIEWING        TESTING          SHIPPING
 ───────          ────────         ────────         ─────────        ───────          ────────
 TKT-001          ·                ·                ·                ·                ·
 Add health       
 check endpoint   
 ■ medium         
```

### 3. Run the workflow

```bash
bobby run workflow TKT-001
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
| I have a clear task to build | `bobby run workflow TKT-001` |
| I have a big feature idea | `bobby ticket create -t "Feature" --epic` then `bobby run feature TKT-001` |
| I have a batch of related tickets | `bobby sprint new "Auth overhaul" TKT-004 TKT-007` then `bobby sprint run SPR-001` |
| I want it to look designed, not generated | `bobby "design a landing page for X"` |
| I want to review the live app | `bobby run ux` / `bobby run pm` / `bobby run qe` |
| I want to validate before building | `bobby run vet TKT-001` or `bobby run strategy` |
| Something broke | `bobby run debug TKT-001` |
| I need a security audit | `bobby run security TKT-001` |
| I want to ship what's ready | `bobby run ship` |
| I want to step through one agent at a time | `bobby run next TKT-001` |

## How It Works

Bobby chains Claude Code agents through a workflow:

```
bobby run workflow TKT-001

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

### Tickets — `bobby ticket` (alias: `bobby tkt`)

Everything that touches a ticket lives under one namespace:

| Command | Description |
|---------|-------------|
| `bobby ticket create -t "Title"` | Create a ticket (`--epic`, `--parent <id>`, `-p <priority>`) |
| `bobby ticket list [stage]` | Show the ticket board (`--blocked`, `--epic <id>`, `--area <area>`) |
| `bobby ticket view <id>` | View ticket details (`--plan`, `--files`) |
| `bobby ticket move <id> <alias>` | Move ticket stage (see aliases below) |
| `bobby ticket comment <id> <note>` | Add a note to a ticket |
| `bobby ticket update <id>` | Update ticket fields (`--priority`, `--area`, `--title`, `--parent`) |
| `bobby ticket assign <id> <name>` | Route a ticket to an agent |
| `bobby ticket attach <id> <files>` | Attach screenshots, logs, etc. to a ticket |
| `bobby ticket triage` | Interactive backlog curation — keep, prioritize, plan, archive, or skip |
| `bobby ticket archive [ids...]` | Archive stale backlog tickets (`--stale <days>`, `--dry-run`) |

### Capture & Orientation

| Command | Description |
|---------|-------------|
| `bobby vet "idea"` | Pressure-test an idea — asks the right questions one at a time, then a PURSUE/REFINE/PARK read (`bobby vet <n>` for a captured idea) |
| `bobby new "idea"` | Spin up a brand-new project from an idea — scaffolds a running skeleton + an MVP epic (`--dir`, `--stack`) |
| `bobby go` | Do the most valuable next thing (finish in-flight → unblock → start backlog) |
| `bobby go "title"` | Create a ticket and run the full workflow on it, one step (`-p <priority>`) |
| `bobby go <id>` | Run the workflow on a specific ticket |
| `bobby pack list` / `info` / `add` / `rm` | Platform packs — domain checks + a roadmap to a finished product ([docs](docs/PACKS.md)) |
| `bobby pack apply <id>` | Seed a pack's roadmap as tickets (skips what you already have) and copy its scaffolds |
| `bobby pro` / `pro activate <key>` | Bobby Pro — one subscription for every paid pack and specialist |
| `bobby audit` | Score this codebase on production readiness — security, reliability, operability, change safety (`--tickets` to turn gaps into work, `--json`, `--all`) |
| `bobby idea "..."` | Capture an idea in five seconds, without touching the board |
| `bobby idea list` | List open ideas (`--all` includes promoted, `--inbox` for the global inbox) |
| `bobby idea promote <n>` | Turn an idea into a backlog ticket (`-p`, `--area`, `--epic`, `--inbox`) |
| `bobby idea rm <n>` | Delete an idea |
| `bobby brief` | "Where was I?" — in-flight work, blockers, and the single next action |
| `bobby brief --all` | The same, across **every** project on this machine |
| `bobby projects` | All your Bobby projects, with what each has in flight |

### Agent Orchestration

| Command | Description |
|---------|-------------|
| `bobby run <agent> [ids...]` | Run an agent on ticket(s) — see [Run Modes](#run-modes) below |
| `bobby sprint <subcommand>` | Batch related tickets onto one branch — see [Sprints](#sprints) below |
| `bobby dashboard` | Launch the local web dashboard — parallel workspaces, live logs, diffs, approvals |

### Learning & Retrospectives

| Command | Description |
|---------|-------------|
| `bobby learn <skill> "pattern" "desc"` | Record an anti-pattern or best practice to a skill's learnings |
| `bobby decision add --id … --fact … --why …` | Record an architectural decision that `bobby-review` will enforce |
| `bobby decision list` | Show active decisions (`--all` includes invalidated ones) |
| `bobby retro` | Generate a weekly retrospective from session logs |

### Setup & Admin

| Command | Description |
|---------|-------------|
| `bobby init` | Initialize a new Bobby project |
| `bobby init --refresh` | Regenerate shipped skills/agents/commands from the installed version (`.local` files untouched) |
| `bobby init local` | Discover and configure a local dev profile |
| `bobby skill create <name>` | Scaffold a custom skill (`--agent` makes it runnable via `bobby run <name>`) |
| `bobby export plugin` | Export Bobby skills and agents as a Cowork plugin (.zip) |
| `bobby upgrade` | Upgrade to latest and refresh the project (`--check` to preview, `--to <version>` to pin or roll back) |

### Move Aliases

```
bobby ticket move TKT-001 plan        # → planning
bobby ticket move TKT-001 build       # → building
bobby ticket move TKT-001 review      # → reviewing
bobby ticket move TKT-001 test        # → testing
bobby ticket move TKT-001 ship        # → shipping
bobby ticket move TKT-001 done        # → done
bobby ticket move TKT-001 reject "reason"   # → building + rejection comment
bobby ticket move TKT-001 block "reason"    # → blocked (remembers previous stage)
bobby ticket move TKT-001 unblock           # → back to previous stage
```

## Run Modes

The `bobby run` command supports multiple orchestration patterns:

```bash
# Full workflow — auto-chains plan → build → review → test
bobby run workflow TKT-001
bobby run workflow TKT-001 TKT-002    # Multiple tickets sequentially

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
bobby run lighthouse                   # Lighthouse-audit page templates, propose tickets
bobby run watchdog                     # Post-deploy smoke tests

# Specialist agents (ticket required)
bobby run security TKT-001            # OWASP + STRIDE audit
bobby run debug TKT-001               # Root-cause investigation
```

## Sprints

A sprint is a **batch of related tickets riding one branch** — how a solo builder tackles work bigger than one ticket without dirtying `main` while it comes together. No scrum, no velocity, no ceremony: just an ordered list of tickets, a shared feature branch, and one runner that works through them.

```bash
bobby sprint new "Auth overhaul" TKT-004 TKT-007 --goal "Passwordless login"
bobby sprint add SPR-001 TKT-009       # Add tickets (order preserved)
bobby sprint view SPR-001              # See the batch and each ticket's stage
bobby sprint run SPR-001               # Work each ticket through its workflow on the shared branch
bobby sprint status SPR-001 done       # planned | active | done | abandoned
bobby sprint list                      # All sprints with progress
```

Each sprint gets a directory under `.bobby/sprints/` with:
- `sprint.yml` — the manifest: goal, branch, workflow, and the authoritative ordered ticket list
- `sprint-plan.md` — your cross-ticket context: sequencing rationale, shared decisions, what's out of scope

The runner works tickets one at a time through the sprint's workflow (default: plan → build → review → test), committing to the shared branch. Rejections retry per ticket (`--max-retries`, default 3). When everything lands, ship the branch as one PR.

**When to reach for a sprint vs. an epic:** an epic (`bobby run feature`) plans and breaks down one big idea; a sprint batches tickets you already have onto one branch. They compose — break an epic down, then sprint its children.

## Working Solo: Capture and Orientation

Two commands exist because working alone has no standup and no one to remind you of anything.

**Capture ideas without breaking flow.** Ideas arrive mid-task; a full ticket is too much friction in the moment. `bobby idea` jots one in five seconds, kept off the board until you decide it's real:

```bash
bobby idea "passwordless login would kill the password-reset support load"
bobby idea list                 # Review open ideas when you have a moment
bobby idea promote 1 -p high    # Turn idea #1 into a prioritized backlog ticket
```

**Pick up where you left off.** When you come back after a day (or a week), `bobby brief` reconstructs the state you'd otherwise hold in your head — what's in flight, what's blocked, and the one thing to do next:

```bash
bobby brief
```

```
  my-app — where you left off

  In flight
    [BUILDING]  TKT-001  add passwordless login  high

  Backlog  (2 total)
    · TKT-002  Fix logout bug  critical
    · TKT-003  Polish onboarding  low

  Next  — TKT-001 is in building — closest to done
    bobby run review TKT-001
```

## Your Studio: Every Project on One Machine

Solo builders rarely have just one project. Bobby treats your whole machine as one studio — all your projects, zero setup:

- **Auto-registration.** Any bobby command run inside a project records it in `~/.bobby/projects.yml`. No setup command, no config.
- **`bobby projects`** — every project, with in-flight/blocked/backlog counts and when you last touched it.
- **`bobby brief --all`** — the cross-project standup-of-one: each project's status and its single next action. Running `bobby brief` *outside* any project does this automatically.
- **Global idea inbox.** `bobby idea "..."` works even outside a project — the idea lands in `~/.bobby/inbox.yml`. Later, from inside whichever project it belongs to: `bobby idea promote <n> --inbox`.

```
$ bobby brief --all

  All projects — where you left off

  my-app  1 in flight · 3 backlog
    next: TKT-001 is in building — closest to done
    bobby run review TKT-001  (in ~/Repos/my-app)

  side-hustle  2 backlog
    next: Nothing in flight — start the top backlog item (high)
    bobby run workflow TKT-014  (in ~/Repos/side-hustle)
```

Set `BOBBY_NO_REGISTRY=1` to opt out of auto-registration (e.g. in CI).

## Agents (23)

### Core Workflow

These agents chain together automatically via `bobby run workflow`:

| Agent | Role |
|-------|------|
| **bobby-plan** | Plans tickets — epic breakdown or refinement. Produces `plan.md` + `test-cases.md` |
| **bobby-build** | TDD implementation. Writes code and commits to the current branch |
| **bobby-review** | Peer code review. Reviews git diff against acceptance criteria (fresh perspective) |
| **bobby-test** | Automated testing. Runs test suite and verifies acceptance criteria pass |
| **bobby-ship** | Creates PR from current branch, waits for CI, merges |

### Design

Six agents that run the design process in order — see [Make It Look Designed](#make-it-look-designed):

| Agent | Role |
|-------|------|
| **bobby-design-research** | Gathers and **cites** the references a design is built from |
| **bobby-design-analyze** | Tears each reference down into extracted values — type, scale, colour, spacing |
| **bobby-design-mockup** | Builds options in each reference's system so you can pick by reacting |
| **bobby-design-spec** | Locks the agreed decisions into a versioned contract |
| **bobby-design-build** | Builds the real thing from the locked spec |
| **bobby-design-check** | Independent live review against the spec and the slop checklist |

### Review & Product

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
| **bobby-lighthouse** | Lighthouse audit — sweeps the four pillars across page templates, proposes tickets on real gaps |
| **bobby-watchdog** | Post-deploy verification — smoke tests, uptime, console errors |
| **bobby-arch** | Architecture discovery — documents codebase structure and decisions |
| **bobby-ticket-intake** | Converts PM specs into structured Bobby tickets |
| **bobby-freewill** | One agent, whole ticket, deliberately few instructions — for Opus 5 / Fable 5 |

## Skills (24)

Each agent is backed by a **skill** — a detailed instruction set in `.claude/skills/bobby-{name}/SKILL.md`. Skills also accumulate learnings over time, so agents get smarter as your project evolves.

### Teaching Bobby

Record anti-patterns and best practices so agents avoid repeating mistakes:

```bash
bobby learn bobby-build "hard-coded test values" "Implement the algorithm, don't match test inputs"
bobby learn bobby-review "missing error handling" "Check all async calls have try/catch"
```

Learnings land in `.claude/skills/bobby-{name}/learnings.local.md` — a file that's yours and survives every upgrade — and agents load them before every run.

## Make It Yours (and Keep It Through Upgrades)

Every file Bobby scaffolds follows **one rule**: `X.md` is shipped and replaced on upgrade; `X.local.md` is yours and never overwritten. Agents read both, and yours wins.

```bash
# add project rules on top of a shipped skill — survives every upgrade
echo "Every plan MUST include a rollback section." >> .claude/skills/bobby-plan/SKILL.local.md

# same for an agent, or for CLAUDE.md via CLAUDE.local.md
echo "Always run make verify before committing." >> .claude/agents/bobby-build.local.md
```

Build your own skills and agents — any name that doesn't start with `bobby-` is yours forever:

```bash
bobby skill create deploy-check "Verify staging health before any deploy." --agent
bobby run deploy-check              # runs immediately — no registration
bobby learn deploy-check "..." "..."  # teach it like any shipped skill
```

Custom agents can claim tickets and slot into workflows — swap a shipped agent out per stage:

```yaml
workflows:
  default:
    - { stage: planning, agent: deploy-check }   # replaces bobby-plan
    - { stage: building, agent: bobby-build }
```

Updates are explicit and safe: `bobby upgrade` installs the latest and refreshes shipped files (refusing to clobber uncommitted edits), `bobby upgrade --to 1.2.0` pins or rolls back, and your `.local` files, tickets, and data survive in every direction. Details in [docs/CUSTOMIZING.md](docs/CUSTOMIZING.md).

## Slash Commands (22)

Bobby scaffolds Claude Code slash commands in `.claude/commands/` so you can invoke agents directly from Claude:

```
/bobby-plan          /bobby-build         /bobby-review
/bobby-test          /bobby-ship          /bobby-workflow
/bobby-feature       /bobby-ux            /bobby-pm
/bobby-qe            /bobby-vet           /bobby-strategy
/bobby-security      /bobby-debug         /bobby-docs
/bobby-performance   /bobby-lighthouse    /bobby-watchdog
/bobby-arch          /bobby-ticket-intake /bobby-local
/bobby-define        /bobby-freewill
```

## Custom Workflows

Bobby ships built-in workflows — `default`, `secure`, `quick`, `freewill`, plus the `design` and `define` pipelines. Define your own (or override a built-in) in `.bobbyrc.yml`:

```yaml
workflows:
  thorough: [plan, build, review, security, test]
```

Run a named workflow:

```bash
bobby run workflow TKT-001 --workflow secure
```

## Contributing

Contributions are welcome! To get started:

1. Fork the repo and create a feature branch from `main`
2. Install dependencies: `npm install`
3. Make your changes
4. Run tests: `npm test`
5. Open a pull request against `main`

Please keep PRs focused on a single change. If you're planning something large, open an issue first to discuss the approach.

### Releasing (maintainers)

Bobby publishes to npm via [`.github/workflows/publish.yml`](.github/workflows/publish.yml) using
**Trusted Publishing (OIDC)** — no long-lived tokens, and each release gets a provenance attestation.

**One-time setup** (a brand-new package name can't have a trusted publisher until it exists):

1. Publish the first version manually from your machine:
   ```bash
   npm login          # interactive, with your 2FA
   npm publish        # publishes bobbycode@1.0.0 and creates the package
   ```
2. On npmjs.com → the `bobbycode` package → **Settings → Trusted Publisher**, add a GitHub
   Actions publisher: organization `ccevans`, repository `bobbycode`, workflow `publish.yml`.

**Every release after that** is fully automated — no secrets:

```bash
npm version patch          # bumps package.json + creates a vX.Y.Z tag (minor / major as needed)
git push --follow-tags     # pushes the commit and the tag
```

The workflow runs the test suite, verifies the tag matches `package.json`, then publishes via OIDC.

## License

MIT
