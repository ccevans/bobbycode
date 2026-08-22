// test/e2e/ticket-claim-cli.e2e.test.js — BOB-120 AC1, the CLI half, for real.
//
// This file exists because three consecutive rounds shipped a source-text grep
// in place of a test. Each time, a reviewer reverted the guard while leaving the
// asserted literal behind in a comment, and the whole suite stayed green.
//
// The justification given for the greps — "placement cannot be executed without
// spawning the CLI" — was false. test/e2e/lifecycle.test.js has spawned
// bin/bobby.js since before this ticket existed, and already runs
// `bobby run workflow TKT-001`. This is that harness.
//
// So: real CLI process, real board, real run.lock on disk. A comment cannot
// satisfy any assertion here.
import { jest } from '@jest/globals';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { scaffoldProject } from '../../commands/init.js';
import { ticketClaimPath, claimTicket } from '../../lib/dashboard/ticket-claim.js';

// Each case spawns bin/bobby.js two to four times. Solo the file runs ~28s; the
// feature cases sit at ~4.2s against jest's 5s default with nothing configuring
// one, and CI runners are slower than a dev machine.
jest.setTimeout(30000);

describe('E2E: the CLI refuses a ticket that already has a run (BOB-120)', () => {
  let tmpDir, ticketsDir;
  const bobby = path.resolve('bin/bobby.js');

  // Non-zero exit is the refusal; capture instead of throwing.
  const run = (cmd) => {
    try {
      return { code: 0, out: execSync(`node ${bobby} ${cmd} 2>&1`, { cwd: tmpDir, encoding: 'utf8' }) };
    } catch (e) {
      return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
    }
  };

  const claim = (id) => {
    const dirname = fs.readdirSync(ticketsDir).find(d => d.startsWith(`${id}--`));
    claimTicket(ticketClaimPath(ticketsDir, dirname), { holder: 'bobby app (build)' });
    // Someone ELSE's run: strip our token so isOwnClaim cannot match.
    const file = ticketClaimPath(ticketsDir, dirname);
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    rec.token = 'another-holders-token';
    fs.writeFileSync(file, JSON.stringify(rec));
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-claim-e2e-'));
    scaffoldProject(tmpDir, {
      project: 'claim-e2e', stack: 'generic',
      health_checks: [], areas: [], commands: {},
      tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });
    ticketsDir = path.join(tmpDir, '.bobby', 'tickets');
    run('ticket create -t "First ticket"');    // TKT-001
    run('ticket create -t "Second ticket"');   // TKT-002
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('a free ticket still builds a prompt — the control', () => {
    const r = run('run build TKT-001');
    expect(r.code).toBe(0);
  });

  test('a single-ticket run on a claimed ticket is refused and names it', () => {
    claim('TKT-001');
    const r = run('run build TKT-001');
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('TKT-001');
    expect(r.out).toMatch(/already has a run in progress/);
    expect(r.out).toMatch(/bobby app \(build\)/);
  });

  test('a multi-id workflow run is refused when the CLAIMED ticket is second', () => {
    // The exact round-three defect: checking ids[0] only. The workflow builder
    // consumes every id, so this handed out a prompt driving TKT-002.
    claim('TKT-002');
    const r = run('run workflow TKT-001 TKT-002');
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('TKT-002');
  });

  test('...and when the claimed ticket is first — order-independent', () => {
    claim('TKT-001');
    const r = run('run workflow TKT-001 TKT-002');
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('TKT-001');
  });

  test('a multi-id run with both free still works — the control', () => {
    const r = run('run workflow TKT-001 TKT-002');
    expect(r.code).toBe(0);
  });

  test('a custom agent cannot bypass the guard', () => {
    // The custom-agent branch used to sit above the guard entirely.
    const agentsDir = path.join(tmpDir, '.claude', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'mycustom.md'), '# custom agent\n');
    claim('TKT-001');
    const r = run('run mycustom TKT-001');
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('TKT-001');
  });

  test('a feature run is refused when one of its CHILDREN is claimed', () => {
    // The epic being free says nothing about the work. This path had no test at
    // all: deleting the child loop from commands/run.js left the suite green.
    run('ticket create -t "An epic" --epic');            // TKT-003
    run('ticket create -t "A child" --parent TKT-003');  // TKT-004
    claim('TKT-004');

    const r = run('run feature TKT-003');
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('TKT-004');
    expect(r.out).toMatch(/already has a run in progress/);
  });

  test('a feature run with free children still builds — the control', () => {
    run('ticket create -t "Epic two" --epic');            // TKT-003
    run('ticket create -t "Child two" --parent TKT-003'); // TKT-004
    const r = run('run feature TKT-003');
    expect(r.code).toBe(0);
  });

  test('a BATCH run skips a ticket the app is already running', () => {
    // The last untested CLI shape, and the one with no backstop: the orchestrator
    // never writes `assigned:` (zero occurrences in orchestrator.js), so the
    // heldByOther filter is the ONLY thing keeping a batch off an app-held
    // ticket. AC1's third clause.
    run('ticket move TKT-001 build');
    run('ticket move TKT-002 build');
    claim('TKT-001');

    const r = run('run build');
    expect(r.code).toBe(0);
    expect(r.out).toContain('TKT-002');
    expect(r.out).not.toContain('TKT-001');   // handing this to an agent is the collision
  });

  test('a batch refusal on a holder-less claim says `another run`, not `undefined`', () => {
    // Round three's B5 verbatim. The previous test for it called claimedMessage()
    // — a function the batch path never invokes — and my e2e version always set a
    // holder, so the fallback was never exercised either. A record with no
    // holder is the only thing that can catch this.
    run('ticket move TKT-001 build');
    const dirname = fs.readdirSync(ticketsDir).find(d => d.startsWith('TKT-001--'));
    const file = ticketClaimPath(ticketsDir, dirname);
    claimTicket(file, { holder: 'x' });
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete rec.holder;
    rec.token = 'another-holders-token';
    fs.writeFileSync(file, JSON.stringify(rec));

    const r = run('run build');
    expect(r.code).not.toBe(0);
    expect(r.out).not.toMatch(/undefined/);
    expect(r.out).toMatch(/another run/);
  });

  test('a batch run with every ticket claimed refuses and NAMES a holder', () => {
    // Round three's B5: this message printed a literal `undefined`. The test
    // written to close it called claimedMessage() — a function the batch path
    // never invokes — so the defect could be reintroduced verbatim.
    run('ticket move TKT-001 build');
    claim('TKT-001');

    const r = run('run build');
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('TKT-001');
    expect(r.out).toContain('bobby app (build)');
    expect(r.out).not.toMatch(/undefined/);
  });

  test('an app-launched agent is not refused by its OWN orchestrator claim', () => {
    // Round one's F3. The app hands its agent the claim token in the
    // environment; without it, an agent running `bobby run <stage> <its own
    // ticket>` — which CLAUDE.md's routing tells it to do — is refused by the
    // claim its own orchestrator took.
    const dirname = fs.readdirSync(ticketsDir).find(d => d.startsWith('TKT-001--'));
    const file = ticketClaimPath(ticketsDir, dirname);
    claimTicket(file, { holder: 'bobby app (build)' });
    const token = JSON.parse(fs.readFileSync(file, 'utf8')).token;

    const withToken = (() => {
      try {
        return { code: 0, out: execSync(`node ${bobby} run build TKT-001 2>&1`,
          { cwd: tmpDir, encoding: 'utf8', env: { ...process.env, BOBBY_TICKET_CLAIM: token } }) };
      } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
    })();
    expect(withToken.code).toBe(0);

    // ...and the same command WITHOUT the token is refused, which is what makes
    // the assertion above meaningful.
    expect(run('run build TKT-001').code).not.toBe(0);
  });

  test('an unreadable claim does not kill the run with a filesystem error', () => {
    claim('TKT-001');
    const dirname = fs.readdirSync(ticketsDir).find(d => d.startsWith('TKT-001--'));
    const file = ticketClaimPath(ticketsDir, dirname);
    fs.chmodSync(file, 0o000);
    try {
      const r = run('run build TKT-001');
      expect(r.out).not.toMatch(/EACCES/);
    } finally {
      fs.chmodSync(file, 0o600);
    }
  });
});
