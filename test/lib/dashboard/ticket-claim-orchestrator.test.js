// test/lib/dashboard/ticket-claim-orchestrator.test.js — BOB-120, F1.
//
// WHY THIS FILE EXISTS, stated plainly. F1 was that discard() never released the
// ticket claim, so a discarded workspace left a run.lock holding the app
// server's own LIVE pid — not stale — refusing that ticket to every orchestrator
// for six hours with nothing in the product able to clear it.
//
// The first attempt to guard that regression read orchestrator.js as a STRING
// and asserted the substring `_releaseTicketClaim` appeared in a slice of it. A
// reviewer replaced the call with a comment saying the release now happened
// elsewhere and the entire suite stayed green — 1299/1299 — with the bug live. A
// source-text grep passes on a comment, on a dead branch, and on the original
// defect.
//
// So this drives the real Orchestrator against a real board and a real git repo,
// and asserts on the run.lock ON DISK.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { WorkspaceStore } from '../../../lib/dashboard/state.js';
import { createTicket } from '../../../lib/tickets.js';
import { ticketClaimPath } from '../../../lib/dashboard/ticket-claim.js';

const git = (dir, cmd) => execSync(`git ${cmd}`, { cwd: dir, stdio: 'pipe' });

function makeProject(tmp) {
  const root = path.join(tmp, 'proj');
  fs.mkdirSync(root, { recursive: true });
  git(root, 'init -q');
  git(root, 'config user.email test@example.com');
  git(root, 'config user.name Test');
  fs.writeFileSync(path.join(root, 'README.md'), '# test\n');
  git(root, 'add .');
  git(root, 'commit -q -m initial');

  const ticketsDir = path.join(root, '.bobby', 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });
  const config = { dashboard: { worktree_root: '../wt' }, git_conventions: {} };
  const store = new WorkspaceStore(path.join(root, '.bobby', 'workspaces.json'));
  const o = new Orchestrator({
    repoRoot: root, config, ticketsDir,
    sessionsDir: path.join(root, '.bobby', 'sessions'),
    agentsPath: null, store, sseHub: null,
  });
  return { o, root, ticketsDir };
}

describe('the orchestrator claim lifecycle, driven for real (BOB-120 F1)', () => {
  let tmp, o, ticketsDir, ticketId, claimFile;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-claim-orch-'));
    ({ o, ticketsDir } = makeProject(tmp));
    const t = createTicket(ticketsDir, { title: 'A ticket', type: 'feature' });
    ticketId = t.id;
    const dirname = fs.readdirSync(ticketsDir).find(d => d.startsWith(`${ticketId}--`));
    claimFile = ticketClaimPath(ticketsDir, dirname);
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('createWorkspace takes a claim that lands on disk', () => {
    expect(fs.existsSync(claimFile)).toBe(false);
    const ws = o.createWorkspace({ ticketId, agent: 'plan' });
    expect(fs.existsSync(claimFile)).toBe(true);
    expect(ws.claim.token).toBeTruthy();
    expect(JSON.parse(fs.readFileSync(claimFile, 'utf8')).token).toBe(ws.claim.token);
  });

  test('discard releases the claim — the six-hour lockout', async () => {
    o.createWorkspace({ ticketId, agent: 'plan' });
    expect(fs.existsSync(claimFile)).toBe(true);

    await o.discard(o.store.list()[0].id, { force: true });

    // THE assertion. A comment claiming some other method releases it cannot
    // satisfy this; only an actual release can.
    expect(fs.existsSync(claimFile)).toBe(false);
  });

  test('after a discard the ticket is immediately runnable again', async () => {
    const first = o.createWorkspace({ ticketId, agent: 'plan' });
    await o.discard(first.id, { force: true });

    // The user's real recovery path: start work, change your mind, start again.
    const second = o.createWorkspace({ ticketId, agent: 'build' });
    expect(second.claim.token).toBeTruthy();
    expect(second.claim.token).not.toBe(first.claim.token);
  });

  test('a second workspace on a claimed ticket is refused, naming the holder', () => {
    o.createWorkspace({ ticketId, agent: 'plan' });
    // A different orchestrator: no claim token in its environment.
    const saved = process.env.BOBBY_TICKET_CLAIM;
    delete process.env.BOBBY_TICKET_CLAIM;
    try {
      expect(() => o.createWorkspace({ ticketId, agent: 'build' }))
        .toThrow(/already has a run in progress/);
    } finally {
      if (saved !== undefined) process.env.BOBBY_TICKET_CLAIM = saved;
    }
  });

  test('a createWorkspace that fails afterwards leaves no claim behind', () => {
    // An unknown workflow throws after the claim is taken. A refused start must
    // not cost the ticket six hours.
    expect(() => o.createWorkspace({ ticketId, agent: 'plan', pipelineName: 'no-such-workflow' })).toThrow();
    expect(fs.existsSync(claimFile)).toBe(false);
  });
});
