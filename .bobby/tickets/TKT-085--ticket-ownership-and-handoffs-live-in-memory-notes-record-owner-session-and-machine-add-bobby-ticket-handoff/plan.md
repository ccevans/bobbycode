# TKT-085 plan — record owner session and machine, add `bobby ticket handoff`

Planned against origin/main `8cc1ddb`. Size: **m**.

## Approaches considered

| # | Approach | Effort (x3) | Risk (x2) | Maint. (x2) | Impact (x1) | Score |
|---|---|---|---|---|---|---|
| A | `owner:` in frontmatter, set by `assign --session` and `handoff`. `handoff` writes or validates a fixed six-section `progress.md` the agent fills in. `brief` groups in-flight tickets by owner. | 4 | 4 | 4 | 4 | 32 |
| B | `handoff` takes one flag per section (`--stopped`, `--branch`, ...) and writes progress.md from them | 3 | 4 | 3 | 4 | 27 |
| C | A separate `.bobby/owners.yml` registry | 2 | 2 | 2 | 4 | 18 |

**Selected: A.** Agents already write `progress.md` (PreCompact, context-cap hooks), and six multi-paragraph sections don't fit in shell flags. The command owns the shape: it writes the template, refuses placeholders, and records the owner. The agent owns the content. C splits ticket state out of `ticket.md`, against the "state = files, frontmatter is the record" design.

## Decisions made while planning

1. **`handoff --to` without `--machine` leaves `owner.machine: null`.** It does not default to this machine: the common handoff is to another computer (Intel ↔ M4), and a default would record a wrong fact. `--machine <name>` sets it. The receiving session claims the ticket with `bobby ticket assign <id> <name> --session <me>`, which records its own machine. `brief` shows `null` as "machine not recorded", which is explicit, not a guess.
2. **Machine name:** `scutil --get ComputerName` on darwin and `os.hostname()` elsewhere. A failure or empty result is an explicit error. There is no env override (no-fallbacks rule). Tests inject `platform`/`run` into the lib function.
3. **Placeholder token:** each template section body starts as `TODO(handoff): <hint>`. A section is unfilled if its body is empty or still contains `TODO(handoff)`. "none" is a valid fill.
4. **Existing free-form `progress.md`** (PreCompact checkpoints) is kept. The template is written above it, and the old text moves under `## Earlier notes`, which validation ignores.
5. **`assign` without `--session` leaves any existing `owner` alone.** `assigned` keeps its current meaning (a name), and `owner` is separate.
6. **"Auto-syncs the ticket"** uses the existing `autoSync()` (a local commit of only the ticket folder; it never pushes), the same as `triage`/`learn`/`retro`.

## Files to modify

- `lib/owner.js` — **new**. `machineName({ platform, run })`, `HANDOFF_SECTIONS`, `parseHandoff(text)`, `renderHandoffTemplate(id, existingText)`, `unfilledSections(text)`.
- `commands/assign.js` (33 lines) — `--session` option, plus the new `handoff` subcommand registered in the same `registerAssign(program)` function. Registering it here keeps `commands/ticket.js` untouched (TKT-086 adds a command too).
- `lib/brief.js` (197 lines) — new exported pure helper `groupInFlightByOwner(inFlight)`. `buildBrief` is unchanged.
- `commands/brief.js` (125 lines) — the "In flight" block (lines 68–77) renders the groups when any in-flight ticket has an owner. Output is unchanged otherwise.
- `templates/skills/bobby-shared/SKILL.md` — a new "Handing off a ticket" section.
- `templates/WORKFLOW.md.ejs` — two command-table rows after the `Assign` row (line 53).
- Tests: `test/lib/owner.test.js` (new), `test/commands/assign.test.js` (new; none exists today), `test/lib/brief.test.js` (add a grouping case), `test/commands/brief-owners.test.js` (new).
- Do **not** hand-edit `.claude/skills/bobby-shared/SKILL.md` in this repo. It is generated from the template by `bobby init --refresh`.

## Shared files (parallel build — keep edits additive and in these exact spots)

- `commands/brief.js` — also edited by **TKT-083**, which adds an import line after line 6 and one call line after line 62 (plus a helper at the bottom of the file). TKT-085 changes the `../lib/brief.js` import **on line 3** (add `groupInFlightByOwner`) and replaces **only lines 68–77** (the `// In flight` block). Do not touch lines 4–66, and put any new helper function directly above `export function registerBrief`, not at the bottom of the file.
- `templates/WORKFLOW.md.ejs` — also edited by **TKT-086**, which adds a row after line 40. TKT-085 adds its rows **after line 53** (`| Assign | ...`) only.
- `commands/ticket.js` — deliberately NOT edited (see Files).
- Dependencies: none.

## Step-by-step plan

### 1. `lib/owner.js` (new)

- [ ] `machineName({ platform = process.platform, run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }) } = {})`:
  - darwin: `run('scutil', ['--get', 'ComputerName']).trim()`. Throw `Could not read this computer's name (scutil --get ComputerName): <msg>` on error or an empty result.
  - else: `os.hostname().trim()`. Throw on empty.
- [ ] `export const HANDOFF_SECTIONS = [ ['Where it stopped', 'what is done, and the exact step in progress'], ['Branch and commit', 'repo, branch, last commit SHA, pushed or not'], ['Unpushed patches', 'stashes, uncommitted files, local-only commits, or "none"'], ['Resources held', 'dev servers, docker DBs, ports, worktrees, run.lock, or "none"'], ['Open decisions for the human', 'questions waiting on the human, or "none"'], ['Next step', 'the one command or action the next session starts with'] ];`
- [ ] `parseHandoff(text)` → `Map<heading, body>` for `## <heading>` lines matching a HANDOFF_SECTIONS name exactly. A body runs until the next `## ` line or EOF and is trimmed.
- [ ] `unfilledSections(text)` → names that are missing, empty, or contain `TODO(handoff)`.
- [ ] `renderHandoffTemplate(id, existingText)`:
  - If `existingText` already has some of the sections, append only the missing ones (each `## <name>\n\nTODO(handoff): <hint>\n`) to the end and return it.
  - Otherwise return `# Handoff — <id>\n\n` + all six sections with placeholders, plus `\n## Earlier notes\n\n<existingText>` when `existingText.trim()` is non-empty.

### 2. `commands/assign.js`

- [ ] Add `.option('--session <name>', 'Record the session that owns this ticket, and this machine, in owner:')`.
- [ ] In the action, after `data.assigned = name;`: if `opts.session !== undefined`, an empty or whitespace value → `error('--session needs a session name')` and exit 1. Otherwise `data.owner = { session: opts.session.trim(), machine: machineName(), since: new Date().toISOString() }`. Print `  owner: <session> on <machine>`.
- [ ] Register `handoff` in the same function, after the `assign` command:
  ```
  program.command('handoff <id>')
    .description('Hand a ticket to another session: fills progress.md, sets owner, commits the ticket')
    .requiredOption('--to <session>', 'Session taking over')
    .option('--machine <name>', 'Computer the receiving session runs on (otherwise left unset; the receiver claims it with assign --session)')
  ```
  Action:
  1. Resolve root/config/ticketsDir and `findTicket` as `assign` does. Not found → error, exit 1.
  2. `p = path.join(found.path, 'progress.md')` and `text = exists ? read : ''`.
  3. `missing = unfilledSections(text)`. If any section is absent from the file, write `renderHandoffTemplate(id, text)`, then `error('Wrote the handoff template to <rel p>. Fill all six sections (write "none" where nothing applies), then rerun: bobby ticket handoff <id> --to <session>')` and exit 1. Owner unchanged.
  4. If all sections are present but some are unfilled: `error('Handoff refused — still placeholders in: <names>. Edit <rel p> and rerun.')`, exit 1, and leave the file untouched.
  5. Otherwise: `prev = found.data.owner`. Insert or replace a `> Handed off <since> from <prev?.session ?? 'no recorded owner'><prev?.machine ? ' on ' + prev.machine : ''> to <to><machine ? ' on ' + machine : ''>` line directly under the `# ` title (replace an existing `> Handed off` line if one is there). Set `data.owner = { session: to, machine: opts.machine || null, since }` and `data.updated = today`. Write the ticket and progress.md.
  6. Sync: `top = git rev-parse --show-toplevel` (cwd `found.path`; skip the sync with a dim "not a git repo — not committed" line on a non-zero exit), then `autoSync(top, [path.relative(top, found.path)])`.
  7. `success('<id> handed off to <to>')`. `tryLogEntry(root, config, { type: 'handoff', ticket: id, to })`.

### 3. `lib/brief.js`

- [ ] `export function groupInFlightByOwner(inFlight)`: returns `null` when no ticket has `owner?.session`. Otherwise returns `{ machines: [{ machine, sessions: [{ session, tickets }] }], unowned }`, with machines sorted by name (`null` last) and sessions by name. Ticket order within a session is the input order (already `sortByProgress`).

### 4. `commands/brief.js` — replace lines 68–77

- [ ] `const groups = groupInFlightByOwner(b.inFlight);`. If `null`, use the exact current rendering. Otherwise:
  ```
  In flight
    <machine | 'machine not recorded'>
      <session>
        [STAGE]  ID  title  priority
    No owner
        [STAGE]  ...
  ```
  Reuse the current per-ticket line format via a small `ticketLine(t)` helper placed directly above `registerBrief`.

### 5. Shipped text

- [ ] `templates/skills/bobby-shared/SKILL.md`: insert before `## Project overrides`:
  ```
  ## Handing off a ticket

  Ownership lives on the ticket, not in memory notes or ad-hoc HANDOFF files.

  - Taking a ticket: `bobby ticket assign <ID> <agent> --session "<session name>"` records owner.session, this machine and the time.
  - Handing it on: `bobby ticket handoff <ID> --to "<session>" [--machine <computer>]`. The first run writes the six-section template into the ticket's progress.md. Fill every section (Where it stopped, Branch and commit, Unpushed patches, Resources held, Open decisions for the human, Next step; write "none" where nothing applies) and run it again. It refuses placeholders, sets the owner and commits the ticket.
  - `bobby brief` shows in-flight tickets grouped by machine and session.
  ```
- [ ] `templates/WORKFLOW.md.ejs` after line 53:
  `| Claim for a session | \`bobby ticket assign TKT-001 name --session "<session>"\` |` and `| Hand off to another session | \`bobby ticket handoff TKT-001 --to "<session>"\` |`

### 6. Tests (see test-cases.md)

- [ ] Unit: `machineName` with injected darwin/linux runners, plus its error cases. `parseHandoff`, `unfilledSections`, `renderHandoffTemplate` (including the "earlier notes" case). `groupInFlightByOwner`.
- [ ] CLI (`test/commands/assign.test.js`, the same fixture style as `attach.test.js`): assign --session, handoff template → refuse → fill → success, placeholder refusal. In a git-initialised tmp project, assert that the handoff commit exists (`git log -1 --format=%s` = `bobby: auto-sync`).
- [ ] CLI `test/commands/brief-owners.test.js`: grouped output.
- [ ] Full suite to a log and read the summary.

## Risk areas

- **gray-matter round-trip of a nested `owner` object**: verify with a write → read unit test (`since` is an ISO string, so YAML must quote it or keep it a string, not convert it to a Date). If js-yaml parses it back as a Date, store it with `toISOString()` and normalise on read in brief (`String(...)`), and pin that in a test.
- **CI machines without scutil** (Linux): the linux branch uses `os.hostname()`, and CLI tests compare against `machineName()` computed in-test, never a literal.
- **`autoSync` swallows its own failures** (existing behaviour, `lib/auto-sync.js:48`). The handoff success line must not claim "committed". Say "handed off" and let autoSync's own `Auto-synced` info line speak.

## Out of scope

- Changing `templates/hooks/context-cap.sh` to call `bobby ticket handoff` (follow-up candidate).
- Push on handoff.
- Showing owners in the dashboard.
