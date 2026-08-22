// test/lib/dashboard/ticket-claim.test.js — BOB-120.
//
// The race: an app run and a CLI run, two processes with no shared memory, both
// deciding to start on the same ticket. Exactly one may win.
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ticketClaimPath, claimTicket, releaseTicketClaim, readTicketClaim,
  isTicketClaimed, claimedMessage, isOwnClaim,
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

  // A claim taken by ANOTHER orchestrator. Identity is the recorded pid, and the
  // test process is the one that called claimTicket, so a claim made here is
  // "ours" and deliberately does not collide (a workflow runs stage after stage
  // against one workspace). Re-stamping the pid to init — always alive, never
  // us — is what makes it someone else's.
  const asAnotherProcess = (file) => {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    rec.pid = 1;
    fs.writeFileSync(file, JSON.stringify(rec));
    return rec;
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
    asAnotherProcess(claimFile);
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
    // advance past its first stage.
    claimTicket(claimFile, { holder: 'bobby app (plan)' });
    expect(isTicketClaimed(claimFile)).toBe(false);
    expect(isOwnClaim(readTicketClaim(claimFile))).toBe(true);

    // The same record, held by a different process, does collide.
    asAnotherProcess(claimFile);
    expect(isOwnClaim(readTicketClaim(claimFile))).toBe(false);
    expect(isTicketClaimed(claimFile)).toBe(true);
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

  const otherProcess = (file) => {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    rec.pid = 1;                       // init: alive, and not this process
    fs.writeFileSync(file, JSON.stringify(rec));
  };

  test('a free ticket is runnable', async () => {
    const { ticketHasLiveRun, assertTicketFree } = await import('../../../lib/workflow.js');
    expect(ticketHasLiveRun(ticketsDir, ID)).toBe(false);
    expect(() => assertTicketFree(ticketsDir, ID)).not.toThrow();
  });

  test('a claimed ticket is refused, naming the holder', async () => {
    const { ticketHasLiveRun, assertTicketFree } = await import('../../../lib/workflow.js');
    const file = ticketClaimPath(ticketsDir, DIRNAME);
    claimTicket(file, { holder: 'bobby app (build)' });
    otherProcess(file);

    expect(ticketHasLiveRun(ticketsDir, ID)).toBe(true);
    expect(() => assertTicketFree(ticketsDir, ID)).toThrow(/bobby app \(build\)/);
  });

  test('a released claim makes it runnable again', async () => {
    const { ticketHasLiveRun } = await import('../../../lib/workflow.js');
    const file = ticketClaimPath(ticketsDir, DIRNAME);
    const claim = claimTicket(file, { holder: 'app' });
    otherProcess(file);
    expect(ticketHasLiveRun(ticketsDir, ID)).toBe(true);
    claim.release();
    expect(ticketHasLiveRun(ticketsDir, ID)).toBe(false);
  });

  test('an unknown ticket is not reported as running', async () => {
    const { ticketHasLiveRun } = await import('../../../lib/workflow.js');
    expect(ticketHasLiveRun(ticketsDir, 'BOB-999')).toBe(false);
  });
});
