// test/lib/dashboard/ticket-claim.test.js — BOB-120.
//
// The race: an app run and a CLI run, two processes with no shared memory, both
// deciding to start on the same ticket. Exactly one may win.
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import path from 'path';
import {
  ticketClaimPath, claimTicket, readTicketClaim,
  claimedMessage, isOwnClaim, CLAIM_TOKEN_ENV,
} from '../../../lib/dashboard/ticket-claim.js';
import { STALE_AFTER_MS } from '../../../lib/dashboard/main-checkout-lock.js';

describe('ticket claim (BOB-120)', () => {
  let ticketsDir, claimFile;
  const TICKET = 'BOB-001--a-ticket';

  beforeEach(() => {
    ticketsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-claim-'));
    fs.mkdirSync(path.join(ticketsDir, TICKET), { recursive: true });
    claimFile = ticketClaimPath(ticketsDir, TICKET);
  });
  afterEach(() => { fs.rmSync(ticketsDir, { recursive: true, force: true }); });

  // What production actually calls. isTicketClaimed used to wrap these two, but
  // its only caller went with ticketHasLiveRun, and six tests driving a function
  // no production path reaches is the shape this ticket just deleted one level
  // down.
  const claimed = (f) => { const r = readTicketClaim(f); return r !== null && !isOwnClaim(r); };


  // Identity is the claim TOKEN, carried to an agent subprocess in the
  // environment. With no token in the env, every claim belongs to someone else —
  // which is the default a fresh CLI process sees.
  const asHolder = (token, fn) => {
    const saved = process.env[CLAIM_TOKEN_ENV];
    process.env[CLAIM_TOKEN_ENV] = token;
    try { return fn(); } finally {
      if (saved === undefined) delete process.env[CLAIM_TOKEN_ENV];
      else process.env[CLAIM_TOKEN_ENV] = saved;
    }
  };


  test('two orchestrators racing one ticket: exactly one wins', () => {
    const app = claimTicket(claimFile, { holder: 'bobby app (build)' });

    // The second orchestrator is a different process with no knowledge of the
    // first — all it can see is the board.
    let refused = null;
    try {
      claimTicket(claimFile, { holder: 'bobby run build' });
    } catch (e) { refused = e; }

    expect(app.record.token).toBeTruthy();
    expect(refused).toBeInstanceOf(Error);
    // The refusal names who holds it and since when — the AC, and the same
    // shape as the main-checkout lock's message.
    expect(refused.message).toContain('bobby app (build)');
    expect(refused.message).toContain(app.record.startedAt);
  });

  test('a released claim frees the ticket for the next run', () => {
    const first = claimTicket(claimFile, { holder: 'run one' });
    expect(claimed(claimFile)).toBe(true);
    expect(first.release()).toBe(true);
    expect(claimed(claimFile)).toBe(false);

    const second = claimTicket(claimFile, { holder: 'run two' });
    expect(second.record.holder).toBe('run two');
  });

  test('a claim from a dead run is reclaimable — a crash must not strand the ticket', () => {
    claimTicket(claimFile, { holder: 'a run that died' });
    // Rewrite the record as a long-dead holder: a pid that is not running, on
    // this host, so pid liveness (not just the age ceiling) is what reclaims it.
    const rec = JSON.parse(fs.readFileSync(claimFile, 'utf8'));
    rec.pid = 2 ** 22;                       // above any real pid on macOS/Linux
    fs.writeFileSync(claimFile, JSON.stringify(rec));

    expect(claimed(claimFile)).toBe(false);
    const next = claimTicket(claimFile, { holder: 'the next run' });
    expect(next.record.holder).toBe('the next run');
  });

  test('an ancient claim is reclaimable even when its pid looks alive', () => {
    // The pid-reuse and other-host case: only the age ceiling can judge it.
    claimTicket(claimFile, { holder: 'ancient' });
    const rec = JSON.parse(fs.readFileSync(claimFile, 'utf8'));
    rec.pid = process.pid;                   // demonstrably alive
    rec.startedAt = new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString();
    fs.writeFileSync(claimFile, JSON.stringify(rec));

    expect(claimed(claimFile)).toBe(false);
  });

  test('a reclaimed holder cannot release the new holder\'s claim', () => {
    const dead = claimTicket(claimFile, { holder: 'dead run' });
    const rec = JSON.parse(fs.readFileSync(claimFile, 'utf8'));
    rec.pid = 2 ** 22;
    fs.writeFileSync(claimFile, JSON.stringify(rec));
    const live = claimTicket(claimFile, { holder: 'live run' });

    // The corpse waking up and calling release() must not hand a third party a
    // ticket that is actively running.
    expect(dead.release()).toBe(false);
    expect(readTicketClaim(claimFile).holder).toBe('live run');
    expect(live.release()).toBe(true);
  });

  test('the holder is not blocked by its own claim — a workflow runs stage after stage', () => {
    // plan -> build -> review all run against ONE workspace, and the claim covers
    // the workspace. If a claim blocked its own holder the ticket could never
    // advance past its first stage. The app's agents are SUBPROCESSES with their
    // own pids, so the token — not the pid — is what proves the claim is theirs.
    const claim = claimTicket(claimFile, { holder: 'bobby app (plan)' });

    asHolder(claim.record.token, () => {
      expect(claimed(claimFile)).toBe(false);
      expect(isOwnClaim(readTicketClaim(claimFile))).toBe(true);
      // and the acquire path must agree with the check path
      expect(() => claimTicket(claimFile, { holder: 'bobby app (build)' })).not.toThrow();
    });

    // Any other process — no token, or the wrong one — does collide.
    expect(isOwnClaim(readTicketClaim(claimFile))).toBe(false);
    expect(claimed(claimFile)).toBe(true);
    asHolder('a-different-token', () => {
      expect(claimed(claimFile)).toBe(true);
    });
  });

  test('a recycled pid cannot walk past a claim it never took', () => {
    // The old identity was the pid, which made this pass silently: the app dies,
    // its pid is reused within the staleness window, and the new process reads
    // the claim as its own.
    const claim = claimTicket(claimFile, { holder: 'the app' });
    const rec = JSON.parse(fs.readFileSync(claimFile, 'utf8'));
    rec.pid = process.pid;              // exactly the reuse case
    fs.writeFileSync(claimFile, JSON.stringify(rec));

    expect(isOwnClaim(readTicketClaim(claimFile))).toBe(false);
    expect(claimed(claimFile)).toBe(true);
    expect(claim.record.token).toBeTruthy();
  });

  test('claims on different tickets never contend', () => {
    const other = 'BOB-002--another';
    fs.mkdirSync(path.join(ticketsDir, other), { recursive: true });
    const a = claimTicket(claimFile, { holder: 'run a' });
    const b = claimTicket(ticketClaimPath(ticketsDir, other), { holder: 'run b' });
    expect(a.record.token).not.toBe(b.record.token);
  });

  test('an unreadable claim does not wedge the ticket forever', () => {
    fs.writeFileSync(claimFile, 'not json at all');
    expect(claimed(claimFile)).toBe(false);
    expect(() => claimTicket(claimFile, { holder: 'recovering' })).not.toThrow();
  });

  test('the refusal message names the holder', () => {
    expect(claimedMessage({ holder: 'bobby run review', startedAt: '2026-08-21T10:00:00Z' }))
      .toMatch(/bobby run review/);
  });
});

/* NOTE: the CLI half of AC1 is covered end-to-end in
 * test/e2e/ticket-claim-cli.e2e.test.js, which spawns bin/bobby.js against a
 * real board. Four tests here previously exercised `ticketHasLiveRun` under a
 * heading claiming to be CLI coverage; that function has no production caller
 * since the batch path was rewritten, so they proved nothing about the CLI. It
 * and they are gone. */

/* B2/B4/B5 from round three: each of these fixes shipped with NO test able to
 * detect its own regression — reverting any one left the suite 1302/1302 green.
 * The lesson recorded with them: when a review round produces N fixes,
 * mutation-verify all N, not only the one flagged as the blocker. */
describe('round-three fixes, each with a test that can fail (BOB-120)', () => {
  let dir, ticketsDir, ticketId, claimFile;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-claim-r3-'));
    ticketsDir = path.join(dir, 'tickets');
    fs.mkdirSync(ticketsDir, { recursive: true });
    ticketId = 'BOB-701';
    const dirname = `${ticketId}--a-ticket`;
    fs.mkdirSync(path.join(ticketsDir, dirname), { recursive: true });
    fs.writeFileSync(path.join(ticketsDir, dirname, 'ticket.md'),
      `---\nid: ${ticketId}\ntitle: A ticket\nstage: building\n---\n\n## Description\n`);
    claimFile = ticketClaimPath(ticketsDir, dirname);
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('B4: an unreadable claim does not kill the run with a raw EACCES', async () => {
    claimTicket(claimFile, { holder: 'someone' });
    fs.chmodSync(claimFile, 0o000);
    try {
      const { assertTicketFree } = await import('../../../lib/workflow.js');
      // Before the fix this threw `EACCES: permission denied, open .../run.lock`
      // straight out of bobby run. An unreadable lock must not block work.
      expect(() => assertTicketFree(ticketsDir, ticketId)).not.toThrow();
    } finally {
      fs.chmodSync(claimFile, 0o600);
    }
  });

  test('B5: a claim with no holder still names something, never `undefined`', async () => {
    const { claimedMessage } = await import('../../../lib/dashboard/ticket-claim.js');
    // The batch refusal read record.holder raw. Naming the holder was the entire
    // point of that message, and it printed a literal "undefined".
    const msg = claimedMessage({ startedAt: '2026-08-22T01:00:00Z' });
    expect(msg).not.toMatch(/undefined/);
    expect(msg).toMatch(/another run/);
  });

  // B2 is covered behaviourally in ticket-claim-api.test.js, which drives the
  // real server against a board containing a genuinely malformed ticket. The
  // version that lived here asserted two literals appeared in server.js and was
  // defeated by leaving them in a comment.
});

/* A claim is local state, not a fact about the ticket (BOB-120).
 *
 * The board is git-tracked and Bobby commits it itself (`bobby: auto-sync`), so
 * an un-ignored run.lock would be committed mid-run and travel to every machine,
 * carrying a pid and host that mean nothing there — and isStale refuses to judge
 * a foreign host, so the 6h ceiling becomes the only thing freeing that ticket.
 *
 * Asked of GIT, not of the file's text. The grep this replaces passed with the
 * pattern commented out, where it is inert. */
describe('claims are never committed', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-ignore-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const ignored = (root, rel) => {
    try { execSync(`git check-ignore -q "${rel}"`, { cwd: root, stdio: 'pipe' }); return true; }
    catch { return false; }
  };

  test('the scaffolded .gitignore makes git ignore run.lock', async () => {
    // Renders the template `bobby init` writes (commands/init.js:739) and asks
    // GIT whether it honours it. scaffoldProject does not write .gitignore — the
    // wizard does — so driving scaffoldProject here proved nothing, which is
    // what the first version of this test did.
    const ejs = (await import('ejs')).default;
    execSync('git init -q', { cwd: tmp, stdio: 'pipe' });
    const tpl = fs.readFileSync(new URL('../../../templates/gitignore.ejs', import.meta.url), 'utf8');
    fs.writeFileSync(path.join(tmp, '.gitignore'), ejs.render(tpl, { stack: 'generic' }));
    fs.mkdirSync(path.join(tmp, '.bobby/tickets/TKT-001--x'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.bobby/tickets/TKT-001--x/run.lock'), '{}');
    fs.writeFileSync(path.join(tmp, '.bobby/tickets/TKT-001--x/ticket.md'), '---\nid: TKT-001\n---\n');

    expect(ignored(tmp, '.bobby/tickets/TKT-001--x/run.lock')).toBe(true);
    // The board itself must stay tracked — over-ignoring would lose the tickets.
    expect(ignored(tmp, '.bobby/tickets/TKT-001--x/ticket.md')).toBe(false);
  });

  test('a studio ignores run.lock under every project board', async () => {
    const { initStudio } = await import('../../../lib/studio.js');
    execSync('git init -q', { cwd: tmp, stdio: 'pipe' });
    initStudio(tmp);
    fs.mkdirSync(path.join(tmp, '.bobby/proj/tickets/BOB-001--x'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.bobby/proj/tickets/BOB-001--x/run.lock'), '{}');
    fs.writeFileSync(path.join(tmp, '.bobby/proj/tickets/BOB-001--x/ticket.md'), '---\nid: BOB-001\n---\n');

    expect(ignored(tmp, '.bobby/proj/tickets/BOB-001--x/run.lock')).toBe(true);
    expect(ignored(tmp, '.bobby/proj/tickets/BOB-001--x/ticket.md')).toBe(false);
  });
});
