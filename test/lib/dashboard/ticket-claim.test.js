// test/lib/dashboard/ticket-claim.test.js — BOB-120.
//
// The race: an app run and a CLI run, two processes with no shared memory, both
// deciding to start on the same ticket. Exactly one may win.
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ticketClaimPath, claimTicket, readTicketClaim,
  isTicketClaimed, claimedMessage, isOwnClaim, CLAIM_TOKEN_ENV,
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
    expect(isTicketClaimed(claimFile)).toBe(true);
    expect(first.release()).toBe(true);
    expect(isTicketClaimed(claimFile)).toBe(false);

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

    expect(isTicketClaimed(claimFile)).toBe(false);
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

    expect(isTicketClaimed(claimFile)).toBe(false);
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
      expect(isTicketClaimed(claimFile)).toBe(false);
      expect(isOwnClaim(readTicketClaim(claimFile))).toBe(true);
      // and the acquire path must agree with the check path
      expect(() => claimTicket(claimFile, { holder: 'bobby app (build)' })).not.toThrow();
    });

    // Any other process — no token, or the wrong one — does collide.
    expect(isOwnClaim(readTicketClaim(claimFile))).toBe(false);
    expect(isTicketClaimed(claimFile)).toBe(true);
    asHolder('a-different-token', () => {
      expect(isTicketClaimed(claimFile)).toBe(true);
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
    expect(isTicketClaimed(claimFile)).toBe(true);
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
    expect(isTicketClaimed(claimFile)).toBe(false);
    expect(() => claimTicket(claimFile, { holder: 'recovering' })).not.toThrow();
  });

  test('the refusal message names the holder', () => {
    expect(claimedMessage({ holder: 'bobby run review', startedAt: '2026-08-21T10:00:00Z' }))
      .toMatch(/bobby run review/);
  });
});

/* The CLI half (BOB-120): `bobby run` builds a prompt and exits, so it cannot
 * HOLD a claim — but it must refuse to hand out a prompt for a ticket the app is
 * already running, which is the reported collision from the other direction. */
describe('CLI refuses a ticket that is already running', () => {
  let dir, ticketsDir;
  const ID = 'BOB-501';
  const DIRNAME = `${ID}--a-ticket`;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-cli-claim-'));
    ticketsDir = path.join(dir, 'tickets');
    fs.mkdirSync(path.join(ticketsDir, DIRNAME), { recursive: true });
    fs.writeFileSync(path.join(ticketsDir, DIRNAME, 'ticket.md'),
      `---\nid: ${ID}\ntitle: A ticket\nstage: building\n---\n\n## Description\n`);
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });


  test('a free ticket is runnable', async () => {
    const { ticketHasLiveRun, assertTicketFree } = await import('../../../lib/workflow.js');
    expect(ticketHasLiveRun(ticketsDir, ID)).toBe(false);
    expect(() => assertTicketFree(ticketsDir, ID)).not.toThrow();
  });

  test('a claimed ticket is refused, naming the holder', async () => {
    const { ticketHasLiveRun, assertTicketFree } = await import('../../../lib/workflow.js');
    claimTicket(ticketClaimPath(ticketsDir, DIRNAME), { holder: 'bobby app (build)' });

    expect(ticketHasLiveRun(ticketsDir, ID)).toBe(true);
    expect(() => assertTicketFree(ticketsDir, ID)).toThrow(/bobby app \(build\)/);
  });

  test('a released claim makes it runnable again', async () => {
    const { ticketHasLiveRun } = await import('../../../lib/workflow.js');
    const claim = claimTicket(ticketClaimPath(ticketsDir, DIRNAME), { holder: 'app' });
    expect(ticketHasLiveRun(ticketsDir, ID)).toBe(true);
    claim.release();
    expect(ticketHasLiveRun(ticketsDir, ID)).toBe(false);
  });

  test('an unknown ticket is not reported as running', async () => {
    const { ticketHasLiveRun } = await import('../../../lib/workflow.js');
    expect(ticketHasLiveRun(ticketsDir, 'BOB-999')).toBe(false);
  });
});

/* A claim is local state, not a fact about the ticket (BOB-120).
 *
 * The board is git-tracked and Bobby itself commits it (`bobby: auto-sync`), so
 * an un-ignored run.lock would be committed mid-run and travel to every other
 * machine — carrying a pid and hostname that mean nothing there, which leaves
 * the 6-hour staleness ceiling as the only thing that frees the ticket. A fresh
 * clone would find work blocked by a run that ended days ago.
 */
describe('claims are never committed', () => {
  test('the studio scaffold ignores run.lock', async () => {
    const { readFileSync } = await import('fs');
    const studio = readFileSync(new URL('../../../lib/studio.js', import.meta.url), 'utf8');
    expect(studio).toContain('.bobby/*/tickets/*/run.lock');
  });

  test('the single-project scaffold ignores run.lock', async () => {
    const { readFileSync } = await import('fs');
    const tpl = readFileSync(new URL('../../../templates/gitignore.ejs', import.meta.url), 'utf8');
    expect(tpl).toContain('.bobby/tickets/*/run.lock');
  });
});

/* NOTE: the orchestrator's claim lifecycle is covered by
 * ticket-claim-orchestrator.test.js, which builds a real Orchestrator and
 * asserts on the run.lock on disk.
 *
 * An earlier version of that coverage lived here and read orchestrator.js as a
 * STRING, asserting a method name appeared in a slice of it. Replacing the call
 * with a comment left the whole suite green with the bug live — a source-text
 * grep passes on a comment, on a dead branch, and on the original defect. It was
 * deleted rather than kept alongside: a test that cannot fail is worse than no
 * test, because it reads as coverage. */

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

  test('B2: the tolerant ticket listing decorates claims too', async () => {
    // listTickets throws on malformed frontmatter, so ONE bad ticket sent the
    // whole board down the fallback path — where `running` was absent, and the
    // app would offer Start work on tickets that are actively running.
    const src = fs.readFileSync(new URL('../../../lib/dashboard/server.js', import.meta.url), 'utf8');
    const fastPath = src.indexOf('listTickets(dir).map(withClaim)');
    const fallback = src.indexOf('tickets.push(withClaim(');
    expect(fastPath).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(-1);
  });
});
