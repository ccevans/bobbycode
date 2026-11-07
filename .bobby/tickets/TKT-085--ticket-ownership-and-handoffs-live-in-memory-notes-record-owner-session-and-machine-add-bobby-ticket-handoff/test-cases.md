# Test Cases — TKT-085

Fixture: a plain tmp Bobby project (`.bobbyrc.yml`, `.bobby/tickets/TKT-001--fix-login/ticket.md` with `stage: building`). It is `git init`-ed with one commit for the sync cases. CLI cases run `node bin/bobby.js`.

## TC1 — assign --session records owner without disturbing assigned (AC 1, write path)
**Steps:** `bobby ticket assign TKT-001 bobby-build --session "studio-27"`, then read the frontmatter.
**Expected:** `assigned: bobby-build`. `owner.session` = `studio-27`, `owner.machine` = `machineName()` (computed in the test), and `owner.since` is an ISO timestamp from the last minute that reads back as a string.

## TC2 — assign without --session keeps an existing owner (decision 5)
**Steps:** After TC1, `bobby ticket assign TKT-001 someone-else`.
**Expected:** `assigned: someone-else`, and `owner` is identical to TC1's.

## TC3 — empty --session is an error
**Steps:** `bobby ticket assign TKT-001 x --session ""`.
**Expected:** Exit 1 with `--session needs a session name`, and ticket.md unchanged.

## TC4 — first handoff writes the template and refuses (AC 2, error path)
**Steps:** `bobby ticket handoff TKT-001 --to "intel-2"` (no progress.md yet).
**Expected:** Exit 1, and the message names the progress.md path. progress.md has all six `## ` headings in order, each body has `TODO(handoff):`, and `owner` is unchanged.

## TC5 — placeholders left → refused, naming the sections (AC 2)
**Steps:** Fill four sections, leave `Resources held` and `Next step` as TODO, and rerun the handoff.
**Expected:** Exit 1, the message lists `Resources held, Next step`, and progress.md and owner are unchanged.

## TC6 — filled handoff sets the owner and commits (AC 2, write path)
**Steps:** Fill all six (two of them with "none"), then `bobby ticket handoff TKT-001 --to "intel-2" --machine "Intel MBP"`.
**Expected:** Exit 0. `owner` = `{ session: intel-2, machine: Intel MBP, since: <ISO> }`, and `assigned` is unchanged. progress.md has a `> Handed off … from studio-27 on <machine> to intel-2 on Intel MBP` line under the title. `git log -1 --name-only` shows the commit `bobby: auto-sync` touching only the ticket folder.

## TC7 — handoff without --machine leaves the machine null (decision 1)
**Steps:** Repeat TC6 without `--machine`.
**Expected:** `owner.machine` is `null`. A later `bobby brief` shows the ticket under `machine not recorded`.

## TC8 — existing free-form progress.md is preserved (decision 4)
**Preconditions:** progress.md = `checkpoint: halfway through step 3`.
**Steps:** `bobby ticket handoff TKT-001 --to x`.
**Expected:** Exit 1 (template written). The file contains the six sections plus `## Earlier notes` with `checkpoint: halfway through step 3`. After the six are filled, the handoff succeeds (Earlier notes are ignored by validation).

## TC9 — unknown ticket
**Steps:** `bobby ticket handoff TKT-999 --to x`.
**Expected:** Exit 1, `Ticket TKT-999 not found`.

## TC10 — brief groups in-flight tickets by machine and session (AC 3, read path)
**Preconditions:** TKT-001 building, owner `{studio-27, M4}`. TKT-002 reviewing, owner `{intel-2, Intel MBP}`. TKT-003 building, owner `{studio-28, M4}`. TKT-004 testing, no owner. TKT-005 done, with an owner.
**Steps:** `bobby brief`.
**Expected:** Under `In flight`: `Intel MBP` › `intel-2` › TKT-002, then `M4` › `studio-27` › TKT-001 and `studio-28` › TKT-003, then `No owner` › TKT-004. TKT-005 is not in flight.

## TC11 — brief without any owners is unchanged
**Steps:** Remove all owners, then `bobby brief`.
**Expected:** `In flight` lists tickets in the old flat format (no machine headings).

## TC12 — machineName errors and platforms (unit)
**Steps:** `machineName({ platform: 'darwin', run: () => 'Studio M4\n' })`, `machineName({ platform: 'darwin', run: () => { throw new Error('nope') } })`, `machineName({ platform: 'darwin', run: () => '' })`, `machineName({ platform: 'linux' })`.
**Expected:** `Studio M4`; throws mentioning `scutil --get ComputerName`; throws; equals `os.hostname()`.

## TC13 — shared skill points at the command (AC 4)
**Steps:** Read `templates/skills/bobby-shared/SKILL.md`, and scaffold a project to read the generated `.claude/skills/bobby-shared/SKILL.md`.
**Expected:** Both contain `bobby ticket handoff` and `--session`.
