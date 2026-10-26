// test/lib/dashboard/ticket-claim-api.test.js — BOB-120 B2, behaviourally.
//
// The app's Start-work control needs to know whether a ticket is already
// running. /api/tickets has TWO paths: a fast one via listTickets, and a
// tolerant fallback for when listTickets throws on a malformed ticket. Only the
// fast one was decorated, so ONE hand-edited ticket with a broken quote made
// every ticket come back `running: undefined` — and the app would offer Start
// work on tickets that are actively running, in exactly the degraded state where
// nobody is watching.
//
// The first attempt to guard that asserted two string literals appeared
// somewhere in server.js. A reviewer removed the call and left the literal in a
// comment: suite green. This drives the real server instead.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildServer } from '../../../lib/dashboard/server.js';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { WorkspaceStore } from '../../../lib/dashboard/state.js';
import { ticketClaimPath, claimTicket } from '../../../lib/dashboard/ticket-claim.js';

// Same inert stub the sibling api tests use.
const sseHub = () => ({ broadcast() {}, connect() { return () => {}; } });

function writeTicket(ticketsDir, id, body) {
  const dir = path.join(ticketsDir, `${id}--a-ticket`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ticket.md'), body);
  return dir;
}

async function withServer(server, fn) {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(async (p) => (await fetch(base + p)).json()); }
  // Drop undici's keep-alive socket before closing. On Node 18 `close()` waits on
  // the idle client connection `fetch` leaves open, so its callback never fires
  // and every test in the file times out — CI runs 18, 20 and 22.
  finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

describe('/api/tickets reports live runs on BOTH paths (BOB-120 B2)', () => {
  let tmp, ticketsDir, server;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-claim-api-'));
    ticketsDir = path.join(tmp, '.bobby', 'tickets');
    fs.mkdirSync(ticketsDir, { recursive: true });
    const config = { project: 'solo', tickets_dir: '.bobby/tickets' };
    const store = new WorkspaceStore(path.join(tmp, '.bobby', 'workspaces.json')).load();
    const hub = sseHub();
    const orchestrator = new Orchestrator({
      repoRoot: tmp, config, ticketsDir,
      sessionsDir: path.join(tmp, '.bobby', 'sessions'),
      agentsPath: '.claude/agents', store, sseHub: hub, pipeline: [], pipelineName: 'default',
    });
    server = buildServer({ orchestrator, store, sseHub: hub, config, repoRoot: tmp, ticketsDir });
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const claimOther = (id) => {
    const file = ticketClaimPath(ticketsDir, `${id}--a-ticket`);
    claimTicket(file, { holder: 'bobby app (build)' });
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    rec.token = 'another-holders-token';
    fs.writeFileSync(file, JSON.stringify(rec));
  };

  test('the fast path reports running/runningBy/runningSince', async () => {
    writeTicket(ticketsDir, 'TKT-001', '---\nid: TKT-001\ntitle: One\nstage: building\n---\n');
    writeTicket(ticketsDir, 'TKT-002', '---\nid: TKT-002\ntitle: Two\nstage: building\n---\n');
    claimOther('TKT-001');

    await withServer(server, async (get) => {
      const { tickets } = await get('/api/tickets');
      const one = tickets.find(t => t.id === 'TKT-001');
      const two = tickets.find(t => t.id === 'TKT-002');
      expect(one.running).toBe(true);
      expect(one.runningBy).toBe('bobby app (build)');
      expect(one.runningSince).toBeTruthy();
      expect(two.running).toBe(false);
    });
  });

  test('an unreadable claim does not make the ticket vanish from the board', async () => {
    // withClaim's try/catch. Without it the throw escapes into the fast path's
    // own catch, the handler falls back, and the per-entry catch then files the
    // ticket under `skipped` — so a mode-000 run.lock silently removes a ticket
    // from the app entirely rather than just leaving its claim unknown.
    writeTicket(ticketsDir, 'TKT-001', '---\nid: TKT-001\ntitle: One\nstage: building\n---\n');
    claimOther('TKT-001');
    const file = ticketClaimPath(ticketsDir, 'TKT-001--a-ticket');
    fs.chmodSync(file, 0o000);
    try {
      await withServer(server, async (get) => {
        const { tickets } = await get('/api/tickets');
        const one = tickets.find(t => t.id === 'TKT-001');
        expect(one).toBeDefined();          // still on the board
        expect(one.running).toBe(false);    // claim unknown, not fatal
      });
    } finally {
      fs.chmodSync(file, 0o600);
    }
  });

  test('ONE malformed ticket does not blind the whole board', async () => {
    writeTicket(ticketsDir, 'TKT-001', '---\nid: TKT-001\ntitle: One\nstage: building\n---\n');
    // An unterminated quote: listTickets throws, so the handler falls back.
    writeTicket(ticketsDir, 'TKT-003', '---\nid: TKT-003\ntitle: "broken\nstage: building\n---\n');
    claimOther('TKT-001');

    await withServer(server, async (get) => {
      const { tickets } = await get('/api/tickets');
      const one = tickets.find(t => t.id === 'TKT-001');
      // Before the fix this was `undefined` — the app would offer Start work on
      // a ticket that is actively running.
      expect(one.running).toBe(true);
      expect(one.runningBy).toBe('bobby app (build)');
    });
  });
});
