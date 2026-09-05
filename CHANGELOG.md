# Changelog

All notable changes to Bobby are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Bobby follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **A failed run now names the executor that actually ran (BOB-136).** Every
  non-zero exit reported `claude exited with code N` regardless of which CLI the
  dashboard had launched, so a failed opencode, codex or cursor-agent run sent
  its user to the wrong binary, the wrong docs and the wrong auth. The line was
  hardcoded from 6c01c85, long before the dashboard grew four flavors. `_launch`
  now stamps the run's own resolved executor on the result it settles — one seam
  covering all three exit paths, including chat turns — and a new
  `executorLabel()` names it, falling back to a custom binary's basename so an
  absolute-path `dashboard.executor` reads as `opencode`, not as forty
  characters of path. Nothing is re-resolved at exit: the run's config is pinned,
  and a throw inside an exit handler would strand the workspace in `running`.
- **README Executor prose caught up with the registry (BOB-134).** The
  Dashboard section still said the dashboard drives `claude` or `cursor-agent`
  only — three flavors stale after codex (BOB-080) and opencode (BOB-085)
  shipped, and wrong about the default rule, which derives from `target`, not
  "claude unless cursor". The prose, the YAML example's `executor:` comment,
  and the permission-posture paragraph now match `lib/dashboard/executor.js`,
  and a new `test/docs/executor-prose.test.js` anchors all three against
  `EXECUTOR_NAMES` the way BOB-082's suite guards the support-matrix table —
  the next flavor added cannot leave them stale silently.
- **`.bobby/decisions.yaml` finally has a writer (TKT-063).** Nothing in the
  codebase ever appended to the architectural decision log — `bobby init` seeded
  it, `bobby-review` read it in prose, and every entry was put there by an agent
  hand-editing YAML. The file's own header made that worse by claiming it was
  "Updated via `bobby learn`", a command that has never opened it. The result was
  what you would expect from freehand edits to a structured file: one append
  deleted the commented format block, another had to repair the previous entry's
  missing `supersedes`/`invalidated` keys. `bobby decision add --id … --fact …
  --why …` now parses the document, appends a validated seven-key entry, and
  writes it back, so comments and prior entries survive; `bobby decision list`
  reads it. Duplicate ids, non-kebab-case ids, and superseding a decision that
  does not exist are refused, and a log that does not parse raises instead of
  being overwritten. `bobby-arch` and `bobby-review` now use the command. Also
  fixes the schema split behind the same filename: `lib/studio.js` seeded
  `decisions: []` while `bobby init` seeded a bare list — both now use the one
  seed, and pre-existing studio files are still read and appended in place.

### Added

- **A model per stage, not one for the whole board (BOB-135).** Bobby ran every
  agent on whatever single model `dashboard.model` named — or, from the CLI, on
  whatever model the operator's session happened to be on — so reviewing a diff
  and recording a page's load time cost the same. Each agent now declares a
  **tier** in `lib/agent-registry.js`: `opus` for judgment (plan, review,
  security, debug, arch, vet, strategy, the design critiques), `sonnet` for
  execution (build, test, qe, ship, docs), `haiku` for bookkeeping (performance,
  watchdog). `lib/models.js` resolves a tier plus the project's config into the
  model an agent actually gets, and BOTH paths honour it: the orchestrator
  passes it to the executor as `--model`, and `bobby init`/`bobby upgrade` stamp
  it into each scaffolded `.claude/agents/bobby-*.md` frontmatter so a stage
  launched from your own session lands on the right model too. `bobby run`
  prints the resolved model in its header.

  Override any of it with a `models:` block in `.bobbyrc.yml` — `models.<stage>`
  beats `models.default` beats `dashboard.model` beats the shipped tier, and
  `inherit` at any level means "pass no model at all". Two deliberate
  restraints: an existing `dashboard.model` still governs every stage, so a
  project that already pinned one model keeps meaning that and never quietly
  acquires per-stage defaults; and because `opus`/`sonnet`/`haiku` are aliases
  only the `claude` CLI and Claude Code frontmatter accept, the shipped tiers
  are withheld from `cursor-agent`, `codex` and `opencode`, which take full
  model names — passing one an alias it does not have kills the run rather than
  degrading it. Those projects behave exactly as before until they name models
  themselves. `test/docs/model-tiers-prose.test.js` anchors the README's tier
  table against the registry so it cannot drift.

- **Push notifications actually fire (BOB-130).** The relay could already turn a
  `{type:'notify'}` frame into a Web Push, but nothing in the host ever sent one
  — so the Needs-you queue gained tickets in silence. `bobby remote` now carries
  a notifier that watches the workspace store and sends on the *edge* into a
  push-worthy state: `needs_you` when a run stops for you, `failed` when one
  ends badly. It fires once per transition, not once per store write, and its
  seed is taken before subscribing so a restart with work already parked stays
  quiet. `bobby app` is unaffected — no tunnel, no notifier. The frame stays
  cleartext by design and carries only `{type, kind}` with `kind` drawn from a
  two-value set, so a push reveals that something wants you and nothing about
  what: no ticket, title, stage, or project.

- **Codex CLI target + executor** (`target: codex`): scaffolds `AGENTS.md`,
  `.codex/skills/`, and prompt-referenced agents; the dashboard drives
  `codex exec --json` headlessly. Every convention verified against the
  shipped codex-cli 0.146.0 binary — including two the docs implied wrongly
  (no project agent registry; no command surface).
- **Generic `agents-md` target**: rules + skills for any AGENTS.md-reading
  tool. Claims-limited by design. Windsurf (now Devin Desktop, renamed June
  2026) is declared covered by this tier — its docs first-party-document root
  `AGENTS.md` as an always-on rule and `.agents/skills/` as a cross-agent
  skill root (docs.devin.ai, fetched 2026-08-23; citations in
  `lib/targets/agents-md.js`) — so no dedicated Windsurf adapter ships. Zed is
  likewise declared covered, on shipped-code evidence: its released source
  (v1.16.1) lists `AGENTS.md` in its rules-file array and scans
  `.agents/skills/` as its project skills root (SHA-pinned permalinks in the
  same adapter header) — so no dedicated Zed adapter ships either, and a
  `.rules` adapter would be a same-list filename swap that loses the AGENTS.md
  ecosystem. Antigravity CLI (`agy`, Gemini CLI's successor — the consumer
  Gemini CLI was retired June 2026) is likewise declared covered: its own CLI
  docs name a root `AGENTS.md` as a rules file parsed on startup and
  `.agents/skills/` as its project skills root (antigravity.google/docs/cli,
  fetched 2026-08-23; citations in the same adapter header) — so no dedicated
  adapter ships, and a future `agy` dashboard executor is deferred behind a
  recorded re-open condition rather than claimed from docs alone.
- **Dedicated GitHub Copilot target** (`target: copilot`): scaffolds
  `AGENTS.md`, `.github/skills/`, slash-invocable prompt files at
  `.github/prompts/*.prompt.md` (frontmatter kept — the shipped keys are the
  documented prompt-file dialect), and prompt-referenced agents in
  `.github/bobby/agents/` (deliberately not the native `.github/agents/`
  registry). Convention tier: every path cited to official GitHub/VS Code
  docs (fetched 2026-08-23) in the adapter header; no dashboard executor.
  `.github/copilot-instructions.md` is detected but never written — the CLI
  combines instruction files, so duplicating rules there would drift.
- **Dedicated OpenCode target** (`target: opencode`): scaffolds `AGENTS.md`,
  slash-invocable commands at `.opencode/commands/` (frontmatter reduced to
  the documented `description` key — the shipped loader throws on schema
  failure, so only schema-named keys ship), native skills at
  `.opencode/skills/`, and prompt-referenced agents in
  `.opencode/bobby/agents/` (deliberately not the real `.opencode/agent(s)/`
  registry — its dialect is unverified for Bobby's files). Every convention
  cited to SHA-pinned source permalinks (sst/opencode@03bba46) in the adapter
  header and confirmed by real opencode 1.18.21 probes against the actual
  scaffold.
- **OpenCode dashboard executor** (derived from `target: opencode`): the
  dashboard drives `opencode run --format json` headlessly, with chat resume
  via `--session <id>` (opencode's camelCase `sessionID` captured off its
  stream events) and permission modes mapped to run-mode's own posture
  (`--auto` for bypass, the built-in `plan` agent for plan mode, no flag for
  acceptEdits/default — which IS run-mode's default posture). Every flag
  verified against the real opencode 1.18.21 binary as cross-products, prompt
  passed positionally (`-p` is opencode's basic-auth password flag), and the
  flavor registered in the weekly flag-drift canary with a dedicated
  usage-dump drift pattern (opencode rejects unknown flags with a bare help
  dump, no error text).
- **Target-matrix invariant suite**: every registered target runs the same
  contract tests; new targets land pre-verified with zero test edits.
- **README harness support matrix** with a per-target verification-status
  column (`real-CLI` / `shipped-code` / `convention` — every verified cell
  names its evidence) and canary coverage, plus a contributor guide for new
  targets. Enforced by `test/docs/support-matrix.test.js`: a target without an
  honest row, an executor without a flag-canary leg, or an overclaimed
  generic tier is a red PR.
- **`bobby-freewill` — one agent, the whole ticket, deliberately few
  instructions.** `bobby run freewill <id>` (or `--workflow freewill`) collapses
  plan → build → review → test into a single agent that gets the goal and the
  invariants and nothing else. It exists because Opus 5 and Fable 5 do better
  from a brief than from a script: a long procedure spends their attention on
  compliance, produces an agent that finishes the checklist rather than the
  ticket, and caps the work at whatever the procedure's author imagined. The
  skill is short on purpose and says so — corrections go to
  `bobby learn bobby-freewill`, not into new steps, and a registry test keeps the
  dispatch prompt from growing back into a checklist. The trade-off is stated
  rather than hidden: collapsing the stages removes the reviewer who didn't write
  the code, so freewill sends security-sensitive, underspecified, and epic-sized
  tickets back to `default`/`secure`, does an adversarial pass on its own diff in
  place of the review stage, and asks for the full chain on smaller models.
- **`bobby blueprint` — see the whole plan before you build it.** One page,
  generated from the locked definition and the board: the outcome and the
  success metric, who it's for, the headline journey with **the crux marked**
  (the step a human named as their give-up point, and the feature that serves
  it), every Must feature and its ticket grouped into build tracks and
  traceable back to a journey step and a persona, and what's deliberately out
  of scope. It also runs a **drift check the documents can't**: every Must row
  must have exactly one ticket, and every ticket's `feature:` ref must exist in
  the map — reported in the terminal and on the page. Deterministic and local
  (no model calls, no network, no token cost); the page is self-contained with
  no scripts or CDNs, so it opens from the filesystem, works offline, themes
  light/dark, and prints. `--json` for the model, `--out` to place the file.
  It runs as the fifth define stage (`define-blueprint`) so every definition
  ends by showing the human what they're about to build, and the page is
  regenerated, never hand-edited.
- **The define pipeline — how the pros go from idea to buildable tickets.**
  `bobby run define <epicId>` takes the MVP epic through the artifact chain a
  real product team runs: **brief → personas → journeys → feature map →
  blueprint**, one
  interviewing agent per stage (one question at a time, bracketed tags, a
  question budget) and a ⛳ human gate after each. Artifacts are locked and
  committed in `.bobby/product/` with design-spec-style Locked/Deviations/
  Changelog discipline; features are derived from journey steps, never
  brainstormed; the Never column must cite a brief Non-goal. The workflow
  terminates at `planning`, where **bobby-plan's new Product-Aware Epic Mode**
  decomposes against the locked map — one ticket per Must row, each carrying
  new `feature:`/`persona:` frontmatter refs (`--feature F1.1 --persona P1` on
  `ticket create`/`update`, `--feature` filter on `list`, shown by `view`),
  with a traceability table in the epic's plan.md and a self-check drift gate.
  Build/test prompts automatically tell agents to read the feature-map row and
  journey step their ticket serves. `bobby go` routes it all: a fresh epic with
  no feature map → "define it first"; mid-definition → resume; map locked →
  decompose; children → build. Say "just draft it" for the express path
  (artifacts drafted with `(assumed)` marks, one combined gate).
- **Pipeline stages are now visible to `bobby go`/`brief` — including design's.**
  A ticket parked in any `design-*` stage now appears in-flight and resumes its
  own stage agent; previously it was invisible and produced no next action. New
  stage invariants (rank, color, workflow mapping for every stage) are enforced
  by tests so a future pipeline can't reintroduce the gap. The design pipeline
  also gained its missing `bobby do` routing entry and CLAUDE.md rows.
- **`bobby app` — the Bobby App (Pro), with the classic dashboard staying free.**
  One command, two tiers, no hostages: without a Pro key, `bobby app` (and
  `bobby dashboard`, now an alias) serves the classic dashboard exactly as
  before — free forever, as published. With Bobby Pro, the same command serves
  the App: Home with the brief, one "Do this next" button (the same brain as
  `bobby go`, via new `POST /api/go`), the amber needs-you queue
  (Approve / Send back / Look first), a ticket Board, and live workspace logs
  with the diff a tap away. Nothing runs without a confirm sheet naming exactly
  what will run. The App UI ships in `@bobbycode/pro-dashboard` via
  `bobby pro install` — never in this MIT package, because a license check on
  MIT-licensed files would be theatre. Classic stays reachable at `/classic/`
  when the App is active. `BOBBY_APP_DIR` overrides the UI location for
  development.
  - New loop API for the App (MIT, also serves the classic UI and the relay):
    `GET /api/brief`, `POST /api/go`, ticket writes
    (`POST /api/tickets`, `/move` with reject/block/unblock aliases, `PATCH`,
    `/comments`), `GET /api/workflows`, `GET /api/config`.
  - Fixed: a workspace's recorded workflow (`pipeline: 'quick'`) was ignored —
    approve() always advanced through the server-default workflow.
  - Fixed: an EventSource opened during page load kept the window load event
    (and the tab spinner) hanging forever.
- **`bobby-lighthouse` — a Lighthouse audit that proposes tickets, not noise.**
  Sweeps Performance, Accessibility, Best Practices and SEO across page
  *templates* (discovered from the sitemap, ranked by how many live URLs each
  covers), then classifies what is worth a ticket. It proposes only on audits
  that fail with real DOM nodes, never on a score (which is noisy run to run) and
  never on a timing-derived audit that merely reflects a slow run. It dedupes
  against open tickets by audit id and section, groups shared-shell findings into
  one proposal, and refuses to trust a report that measured the wrong URL. Ships
  a runner (`lighthouse-audit.mjs`, no install — shells out to
  `npx lighthouse@12`) plus the `bobby run lighthouse` agent. Distinct from
  `bobby audit`, which scores codebase readiness from source.
- **`bobby remote` — run your team from your phone.** Starts the dashboard on a
  loopback-only ephemeral port, then opens ONE outbound, end-to-end-encrypted
  WebSocket to a relay; scan the printed QR (or paste the code) and the Bobby HQ
  app gets exactly the dashboard's API — approve, reject, run, live logs —
  nothing more. Inference stays on your machine, on your subscription. Every
  frame is AES-256-GCM under a key delivered only inside the pairing code, so
  the relay routes ciphertext it cannot read; the tunnel refuses any path
  outside `/api/*` and any method beyond GET/POST. Pairing state lives in
  `~/.bobby/remote/` (never in the repo); `--new-code` rotates the channel and
  cuts old phones off.

## [1.3.0] — 2026-07-29

### Added
- **Dashboard extension seam — paid add-ons without a paywall in the free core.**
  The dashboard stays MIT and ungated; separately distributed add-ons can now
  mount their own routes and UI. An extension exports `register(context)` and
  gets `route` (restricted to `/api/pro/*`, so a core route can never collide),
  `serveDir` (assets under `/pro/<slug>/`), `addScript`/`addStylesheet` (injected
  after the core app boots), plus the orchestrator, store, and response helpers.
  Discovery order: `$BOBBY_PRO_DASHBOARD`, then `~/.bobby/pro/node_modules/`,
  then the project's `node_modules/`. Loading never throws — absent, unlicensed,
  or broken all degrade to the free dashboard and say why in the banner, so an
  add-on cannot take the free dashboard down with it. New `GET /api/capabilities`
  reports core features and add-on status so the UI can render paid features as
  visible-but-locked instead of invisible. New `bobby pro install <tarball>`
  verifies activation, installs into `~/.bobby/pro/`, and then proves the add-on
  actually loads rather than reporting success on an unpack.

  The reasoning, recorded because it constrains future work: gating code that
  ships inside an MIT npm tarball is theatre — the source is on disk and
  `npm i bobbycode@<older>` is a version pin away. A capability is only really
  paid if its code never enters this package.
- **Cursor support — `target: cursor`.** Scaffolds to locations Cursor already
  reads natively: skills to `.cursor/skills/<name>/SKILL.md` (invocable as
  `/bobby-build`), commands to `.cursor/commands/`, and rules to `AGENTS.md`.
  Agent definitions go to `.cursor/agents/`, which Cursor 3.13+ reads as
  workspace-scoped subagents keyed on the `name` frontmatter Bobby already
  writes; older builds ignore the directory and the prompts reference each agent
  by path regardless. Command frontmatter is rewritten
  (Cursor doesn't parse it; the filename is the command name). An existing
  `AGENTS.md` is backed up to `AGENTS.md.pre-bobby` and merged. Bobby writes
  `.cursorindexingignore` to keep session logs out of codebase search —
  deliberately not `.cursorignore`, which would stop the agent reading tickets.
- **The dashboard can drive `cursor-agent`.** It defaults to `claude`, or
  `cursor-agent` when `target: cursor`; `dashboard.executor` overrides either and
  still accepts a bare binary path. New `dashboard.model` is passed through as
  `--model` (get valid names from `cursor-agent --list-models`). The executor
  binary is checked against `PATH`
  at startup and named in the banner, so a missing CLI fails once instead of on
  every agent run.
- **The `.local` overlay — your customizations now survive every upgrade.** One
  rule for the whole system: `X.md` is shipped and refreshed; `X.local.md` is
  yours and never written twice. Works for skills (`SKILL.local.md`), learnings
  (`learnings.local.md` — `bobby learn` writes here now), agents
  (`<agent>.local.md`), and `CLAUDE.local.md`. Every shipped skill and agent is
  told to read its overlay and let it win on conflict.
- **`bobby init --refresh`** — non-interactively regenerate shipped skills,
  agents, and commands from the installed version. Aborts if shipped files have
  uncommitted edits (`--force` to override), prunes stale `bobby-*` files that
  no longer ship, and reports skills that were removed without deleting them
  (they may hold your `.local` files). `bobby upgrade` runs it automatically
  after installing, and stamps `.bobby/.scaffold-version` so drift between the
  package and the project is detectable.
- **`bobby upgrade --to <version>`** — pin or roll back to an exact version and
  re-scaffold from it. Rollback removes files a newer version added; your
  `.local` files, tickets, and data survive in both directions.
- **Custom agents run by name.** `bobby run <name>` dispatches any
  `.claude/agents/<name>.md` — no registration required. They can claim tickets
  and slot into custom workflows. The `bobby-` prefix is now formally reserved
  for shipped files (refresh prunes that namespace; packs and custom work must
  use their own names).
- **`bobby skill create <name> [description] [--agent]`** — scaffold a custom
  skill with the naming rules enforced (kebab-case, `bobby-` rejected), seed its
  `learnings.local.md`, and optionally create the matching agent so
  `bobby run <name>` works immediately.
- **Design skill: structure gate and shape-first research.** New step 1b decides
  what the screen is *made of* (queue, letter, conversation, ledger…) before any
  reference is opened — naming the category default so it can be refused — and
  research now searches for the chosen *shape*, never the category name, on
  every platform (category queries return the category norm everywhere).
- **Design skill: silent-failure greps.** New check 6c catches CSS that dies
  quietly: math operators without surrounding whitespace (the whole declaration
  is dropped and the element inherits) and absolutely-positioned children inside
  CSS multicol (they detach at column breaks). The design-check agent runs the
  same greps independently and probes `getComputedStyle` rather than trusting
  source.

- **Bobby Pro** — one subscription that unlocks every paid pack, now and every
  one released later. `bobby pro` shows status and what it unlocks here;
  `bobby pro activate <key>` activates (and works before any pack is installed,
  so you can subscribe first and pull packs down after). A pack opts in with
  `license: { pro: true }`. Verification stays offline: an ed25519 signature
  check, no server, no account, no network call. Bobby's core is MIT and
  unaffected — everything that ships free today stays free.
  - **A lapsed subscription keeps everything it paid for.** Expiry only stops
    *new* content: a pack is withheld solely when its `released` date is after
    your updates ended, and packs with no `released` date are never withheld.
  - `bobby pack activate` still works and now accepts a Pro key too.
- **`blog` starter** — `bobby new "..." --stack blog` scaffolds a static blog:
  markdown posts in `posts/`, a dependency-free generator (`build.js`), and a
  built site in `public/` with an index page, a page per post, and an RSS feed.
  Frontmatter is `title` / `date` / `summary` / `tags` / `draft`; the filename
  is the URL (a `2026-08-01-` prefix is stripped); the theme is one CSS file the
  build never overwrites. No dependencies, no framework, nothing to install.

### Changed
- **Dashboard static serving now percent-decodes request paths**, so assets whose
  names contain spaces or non-ASCII characters resolve. Decoding happens before
  normalizing, and containment is checked against `dir + path.sep` rather than a
  bare string prefix — both required now that extensions mount their own
  directories, where a sibling path like `../ui-secret/` would otherwise satisfy
  a prefix match. (The core template dir was never reachable this way: an
  absolute path's leading `/` makes `normalize()` collapse leading `..`, and
  nothing decoded `%2f` into a separator.)

### Fixed
- **Out of the box, the app's agents could not write anything.** No permission
  mode was set, and for a headless `claude -p` that means "ask before writing"
  with nobody there to answer. Measured on a real run: 88 turns, 9m14s, $2.97,
  zero files written, ticket never moved — and exit code 0, so the app reported
  it as a finished stage. Three changes, all of which matter separately:
  - **Posture is now set per kind of run**, because the two kinds are not
    equally risky. `dashboard.worktree_permission_mode` (default
    `bypassPermissions`) covers ticket runs, which happen in a throwaway git
    worktree — that copy *is* the sandbox. `dashboard.repo_permission_mode`
    (default `acceptEdits`) covers freeform runs (`ux`, `arch`, `docs`, `ship`,
    …), which work in your real checkout, where that reasoning does not apply:
    edits go through, arbitrary commands do not. Both are overridable; the older
    single `permission_mode` still works and overrides both.
  - **An agent that is being refused is now stopped** after three refusals,
    with a message naming the config key — instead of retrying for nine minutes.
  - **A run that changed nothing is no longer recorded as `completed`.** A
    worktree run that exits cleanly having moved no stage and left its branch on
    the same commit is recorded as `no_op`, on both the run and the workspace,
    with a message naming the likely cause. Repo runs are exempt — several of
    those agents are supposed to write nothing.
- **Scaffolded agents and skills referenced `CLAUDE.md` literally**, so on any
  non-Claude-Code target they pointed at a file that is never written — most
  importantly `bobby-build` and `bobby-ship`, whose "follow the Safety Rules in
  `CLAUDE.md`" instruction silently loaded nothing, and `bobby-docs`, which was
  told to keep a nonexistent file in sync. All 13 references now render the
  target's actual rules file (`AGENTS.md`, `.clinerules/rules.md`). Affected
  Cline since it was introduced.
- **`dashboard.executor` is no longer dead config.** It had a default but was
  never passed to the subprocess, so the dashboard always spawned `claude`
  regardless of the setting.
- **The dashboard never passed a permission mode to the agent CLI**, so a
  headless run could stall or deny its own file edits. New optional
  `dashboard.permission_mode` (`bypassPermissions` | `acceptEdits` | `plan`)
  maps to `--permission-mode` for `claude` and `--force` for `cursor-agent`.
  Unset keeps each CLI's existing default.
- **The rules-file backup notice reported the wrong file.** It keyed off whichever
  rules file was detected first rather than the one the target actually writes, so
  a repo holding both `CLAUDE.md` and `AGENTS.md` could be told the wrong file was
  backed up — or not told at all.
- `bobby dashboard` no longer refuses to start when the agent CLI is missing; it
  warns instead, since reviewing diffs, approving, and merging need no CLI.
- Target extras (`.cursorindexingignore`, `.clineignore`) are now staged by
  auto-sync instead of being left permanently unstaged.
- `bobby learn bobby-shared` was a silent no-op (the file had no
  `## Anti-Patterns` heading, so the insert regex never matched but success was
  still reported). Learn now appends the heading when missing.
- `bobby upgrade` referenced `__dirname`, which doesn't exist in ESM — the
  global-vs-local install detection always fell through to the global fallback.
- License keys resolve `~/.bobby/licenses.yml` per call and prefer `$HOME`, so a
  sandboxed run (tests, CI) can no longer write a key into the real user's home.

## [1.2.0] — 2026-07-27

### Added
- **bobby-design skill** — a real design process for building sites: six named
  design jobs wired into the workflow, a binding AI-slop pattern checklist, a
  style directory of 13 studied design systems (cited), metaphor staging and
  affordance rules, and dashboard rules that verify data marks actually render.
- **Spec-conformance review in bobby-ux** — design work now gets a verify phase
  against the locked spec.
- **README first-time setup walkthrough** — a collapsible section for
  non-technical users covering Node.js, Claude Code, git, and which terminal
  app to open.

## [1.0.0] — 2026-07-24

First public release, live on npm: `npm install -g bobbycode`. Bobby is a full
SDLC workflow for a solo developer — one person, a whole team of Claude Code
agents.

### Changed — BREAKING
- **"Pipelines" are now "workflows"** throughout the user-facing surface:
  `bobby pipeline` → `bobby workflow`, `--pipeline` → `--workflow`, the
  `pipelines:` config key → `workflows:`, the ticket `pipeline:` field →
  `workflow:`, and `bobby run pipeline` → `bobby run workflow`. The old
  `pipelines:` config and ticket field are still read as a fallback.

### Added
- **Built-in workflows** — `default`, `secure` (adds a security stage), and
  `quick` (plan→build→test) are available everywhere with no config; your
  `workflows:` entries extend or override them. `bobby workflow list` shows them.
- **Ticket-by-default + workflow selection.** Asking for a feature/change creates
  a ticket and runs it; `bobby go` takes `--workflow <name>`, and the router /
  `CLAUDE.md` now pick the fitting workflow (secure for auth/payments/secrets,
  quick for tiny changes, else default).
- **`bobby do "<request>"`** — the natural-language front door. Say what you want
  in plain words; Bobby routes it to the right skill/command (build, vet, debug,
  review, ship, …) and runs it. Driven by a capability catalog in `lib/router.js`;
  the generated `CLAUDE.md` now carries the same intent-routing table so talking
  to Bobby inside a Claude Code session routes the same way.

### Changed
- **`bobby go` is now the single guided loop** — the whole process is two verbs:
  `bobby new "<idea>"` to start, then `bobby go` again and again. From any state
  `go` names and runs the next step: a fresh idea → break it down, a planned epic
  → build the MVP, in-flight work → push it forward, and outside a project it
  points you at `bobby new`. Default `bobby --help` now shows just the loop
  (new / go / init); everything else is listed compactly and still has `--help`.

### Added
- **`bobby vet "<idea>"`** — pressure-test an idea before building it. Emits a
  self-contained interrogation (works with no project): asks one question at a
  time — users, problem, alternatives, riskiest assumption, cheapest test —
  then a PURSUE/REFINE/PARK verdict and a sharpened one-liner to hand to
  `bobby new`. `bobby vet <n>` vets a captured idea (project or global inbox).
- **`bobby new "<idea>"`** — the 0→1 on-ramp. Turns a one-line idea into a
  **running** project: a dependency-free starter skeleton, Bobby scaffolding, an
  MVP epic (idea baked into its description), and an initial commit — then hands
  off to `bobby run plan` → `bobby run feature`. Options: `--dir`, `--stack`.
- **Built-in scaffolding system** — `templates/starters/<name>/` + `lib/starters.js`.
  Starters ship a runnable app (Node built-ins + `node:test`, zero install):
  `node` (HTTP API with `/health`, default) and `web` (static page). Extensible:
  add a starter dir + a `stacks/<name>.json` preset.

### Changed — BREAKING
- `bobby local-init` → `bobby init local`; `bobby export-plugin` → `bobby export plugin`.
- **All ticket operations moved under `bobby ticket` (alias `bobby tkt`).**
  `bobby create` → `bobby ticket create`, and likewise for `list`, `view`,
  `move`, `comment`, `update`, `assign`, `attach`, `archive`, `triage`.
  The old top-level commands are removed (pre-1.0, pre-publication break).
  All skills, agent prompts, and templates have been updated to the new paths —
  re-run `bobby init` in existing projects to refresh scaffolded skills.

### Added
- **`bobby go` — the golden path.** No args: runs the most valuable next action
  (finish in-flight → unblock → start top of backlog). With text: creates the
  ticket AND runs the full workflow in one step. With an ID: runs that ticket.
- **Zero-question `bobby init`.** Everything auto-detected (name, stack, target);
  `--custom` keeps the full wizard. New-project initial commit is automatic.
- **Progressive help.** `bobby --help` shows the eight founder-facing commands;
  power tools (workflow, retro, learn, projects, session, sync, export, upgrade)
  stay fully functional and are listed in a one-line footer.
- **Studio: one machine, many projects.**
  - Projects auto-register in `~/.bobby/projects.yml` whenever a bobby command
    runs inside them (opt out with `BOBBY_NO_REGISTRY=1`).
  - `bobby projects` — every project with in-flight/blocked/backlog counts.
  - `bobby brief --all` — the cross-project standup-of-one; bare `bobby brief`
    outside any project does this automatically.
  - Global idea inbox: `bobby idea` outside a project captures to
    `~/.bobby/inbox.yml`; promote into a project with
    `bobby idea promote <n> --inbox`.
- `bobby idea` / `bobby idea promote` — five-second capture for ideas that arrive
  mid-task, kept out of the ticket board until you promote them.
- `bobby brief` — the "where was I?" command: summarizes in-flight tickets, open
  sprints, and the single next action from your session and ticket state.
- GitHub Actions CI (`ci.yml`) running lint + tests on Node 18/20/22 for every
  push and PR.
- npm release workflow (`publish.yml`) — pushing a `v*` tag publishes to the
  public npm registry.
- ESLint 9 flat config so `npm run lint` works.
- This changelog.

### Changed
- Repositioned Bobby around the **solo developer** — a full SDLC workflow that
  gives one person a whole team of agents. See `docs/POSITIONING.md` and
  `docs/ROADMAP.md`.
- Sprints reframed for solo use: a batch of related tickets riding one branch,
  minus the team ceremony.
- `bobby assign` now routes a ticket to an agent (was: to a person or agent).

### Removed
- Dead Bobby Pro license system (`bobby activate`, `lib/license.js`). Pro gating
  was never enforced and its validation was a stub; removed for an honest,
  fully open-source solo tool. Preserved in git history if monetization returns.

### Fixed
- `main` in `package.json` pointed at a nonexistent `lib/index.js`; removed
  (Bobby is a CLI, invoked via `bin`).

## [0.9.0]

Initial public baseline: ticketing, the plan → build → review → test workflow,
17 agents, 21 skills, sprints, the local dashboard, learnings/retros, and
multi-stack init.
