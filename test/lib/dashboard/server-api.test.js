// test/lib/dashboard/server-api.test.js
//
// The loop routes the app UI runs on: brief, go, ticket writes, workflows —
// exercised over real HTTP against a real .bobby fixture, with the
// orchestrator stubbed (agent execution is the orchestrator suite's job).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildServer } from '../../../lib/dashboard/server.js';
import { createTicket, findTicket, getFeatureTickets, moveTicket } from '../../../lib/tickets.js';

let tmp;
let ticketsDir;
let server;
let base;
let orchestratorCalls;

const stubOrchestrator = () => ({
  readLatestSessionFile: () => null,
  createWorkspace({ ticketId, agent }) {
    orchestratorCalls.push(['create', ticketId, agent]);
    return { id: `ws-${ticketId}-${agent}`, ticketId, agent, status: 'idle' };
  },
  async runAgent(id) {
    orchestratorCalls.push(['run', id]);
  },
  // Mirrors the real method: resolve the workspace's ticket, then read the
  // shared board. No git required.
  featureProgress(id) {
    const [, ticketId] = /^ws-(.+)-feature$/.exec(id) || [];
    if (!ticketId) throw new Error(`Workspace ${id} not found`);
    return getFeatureTickets(ticketsDir, ticketId);
  },
  store: { get: (id) => ({ id, status: 'running' }) },
});

async function start() {
  server = buildServer({
    orchestrator: stubOrchestrator(),
    store: { list: () => [], get: () => null, subscribe: () => {} },
    sseHub: { connect: () => () => {}, broadcast: () => {} },
    config: { ticket_prefix: 'TKT' },
    repoRoot: tmp,
    ticketsDir,
    sprintsDir: path.join(tmp, '.bobby', 'sprints'),
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

const api = async (method, p, body) => {
  const res = await fetch(base + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-api-'));
  ticketsDir = path.join(tmp, '.bobby', 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });
  orchestratorCalls = [];
  await start();
});

afterEach((done) => {
  server.closeAllConnections?.();
  server.close(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    done();
  });
});

describe('brief + go', () => {
  it('GET /api/brief returns the brief with a nextAction', async () => {
    createTicket(ticketsDir, { prefix: 'TKT', title: 'First job', priority: 'high' });

    const { status, body } = await api('GET', '/api/brief');

    expect(status).toBe(200);
    expect(body.brief.backlogCount).toBe(1);
    expect(body.brief.nextAction.argv).toEqual(['run', 'workflow', 'TKT-001']);
  });

  it('POST /api/go executes the brief nextAction through the orchestrator', async () => {
    createTicket(ticketsDir, { prefix: 'TKT', title: 'First job' });

    const { status, body } = await api('POST', '/api/go', {});

    expect(status).toBe(200);
    expect(body.kind).toBe('workspace');
    expect(orchestratorCalls).toEqual([
      ['create', 'TKT-001', 'workflow'],
      ['run', 'ws-TKT-001-workflow'],
    ]);
  });

  it('POST /api/go with explicit argv runs that action instead', async () => {
    createTicket(ticketsDir, { prefix: 'TKT', title: 'A' });
    createTicket(ticketsDir, { prefix: 'TKT', title: 'B' });

    await api('POST', '/api/go', { argv: ['run', 'plan', 'TKT-002'] });

    expect(orchestratorCalls[0]).toEqual(['create', 'TKT-002', 'plan']);
  });

  it('POST /api/go with nothing to do reports kind none', async () => {
    const { status, body } = await api('POST', '/api/go', {});

    expect(status).toBe(200);
    expect(body.kind).toBe('none');
    expect(orchestratorCalls).toEqual([]);
  });
});

describe('ticket routes', () => {
  it('creates, reads, moves, comments, and updates a ticket', async () => {
    const created = await api('POST', '/api/tickets', { title: 'Add login', priority: 'high', description: 'Magic links.' });
    expect(created.status).toBe(201);
    expect(created.body.ticket.id).toBe('TKT-001');
    expect(created.body.ticket.stage).toBe('backlog');

    const read = await api('GET', '/api/tickets/TKT-001');
    expect(read.status).toBe(200);
    expect(read.body.ticket.title).toBe('Add login');
    expect(read.body.ticket.content).toContain('Magic links.');

    const moved = await api('POST', '/api/tickets/TKT-001/move', { stage: 'plan' });
    expect(moved.body.ticket.stage).toBe('planning'); // alias resolved

    const commented = await api('POST', '/api/tickets/TKT-001/comments', { text: 'looks good' });
    expect(commented.status).toBe(200);
    expect(findTicket(ticketsDir, 'TKT-001').content).toContain('looks good');

    const updated = await api('PATCH', '/api/tickets/TKT-001', { priority: 'critical' });
    expect(updated.body.ticket.priority).toBe('critical');
  });

  it('move supports block and unblock, restoring the previous stage', async () => {
    await api('POST', '/api/tickets', { title: 'X' });
    await api('POST', '/api/tickets/TKT-001/move', { stage: 'build' });

    const blocked = await api('POST', '/api/tickets/TKT-001/move', { stage: 'block', reason: 'waiting on keys' });
    expect(blocked.body.ticket.stage).toBe('blocked');

    const unblocked = await api('POST', '/api/tickets/TKT-001/move', { stage: 'unblock' });
    expect(unblocked.body.ticket.stage).toBe('building');
  });

  it('rejects garbage: missing title, unknown stage, stage via PATCH', async () => {
    expect((await api('POST', '/api/tickets', {})).status).toBe(400);

    await api('POST', '/api/tickets', { title: 'X' });
    expect((await api('POST', '/api/tickets/TKT-001/move', { stage: 'sideways' })).status).toBe(400);
    // stage is not PATCHable — /move owns transitions
    expect((await api('PATCH', '/api/tickets/TKT-001', { stage: 'done' })).status).toBe(400);
    expect((await api('GET', '/api/tickets/TKT-999')).status).toBe(404);
  });
});

describe('workflows', () => {
  it('lists built-ins', async () => {
    const { status, body } = await api('GET', '/api/workflows');

    expect(status).toBe(200);
    expect(body.workflows).toEqual(expect.arrayContaining(['default', 'secure', 'quick']));
  });

  it('describes each workflow as stage/agent steps', async () => {
    const { body } = await api('GET', '/api/workflows');

    expect(body.stages.default.map((s) => s.stage)).toEqual(['planning', 'building', 'reviewing', 'testing']);
    expect(body.stages.quick.map((s) => s.agent)).toEqual(['bobby-plan', 'bobby-build', 'bobby-test']);
  });
});

describe('feature routes', () => {
  const seedEpic = () => {
    createTicket(ticketsDir, { prefix: 'TKT', title: 'Payments', type: 'epic', description: 'Take money.' });
    createTicket(ticketsDir, { prefix: 'TKT', title: 'Checkout form', parent: 'TKT-001' });
    createTicket(ticketsDir, { prefix: 'TKT', title: 'Stripe webhook', parent: 'TKT-001' });
  };

  it('GET /api/features lists epics with child counts and a stage summary', async () => {
    seedEpic();
    createTicket(ticketsDir, { prefix: 'TKT', title: 'Loose ticket' }); // not an epic

    const { status, body } = await api('GET', '/api/features');

    expect(status).toBe(200);
    expect(body.features).toHaveLength(1);
    expect(body.features[0].id).toBe('TKT-001');
    expect(body.features[0].childCount).toBe(2);
    expect(body.features[0].stageSummary).toBe('2 backlog');
  });

  it('GET /api/features/:id returns the epic with content and its children', async () => {
    seedEpic();

    const { status, body } = await api('GET', '/api/features/TKT-001');

    expect(status).toBe(200);
    expect(body.epic.id).toBe('TKT-001');
    expect(body.epic.content).toContain('Take money.');
    expect(body.children.map((c) => c.id)).toEqual(['TKT-002', 'TKT-003']);
  });

  it('GET /api/features/:id → 404 unknown, 400 non-epic', async () => {
    createTicket(ticketsDir, { prefix: 'TKT', title: 'Just a ticket' });

    expect((await api('GET', '/api/features/TKT-099')).status).toBe(404);
    expect((await api('GET', '/api/features/TKT-001')).status).toBe(400);
  });

  // Was: "reads child stages from the worktree, not the main checkout". A child
  // only ever advances via `bobby ticket move`, which writes to the main
  // checkout from inside any worktree — so the worktree copy was frozen and
  // this route was reading progress that could not exist (TKT-051).
  it('GET /api/workspaces/:id/feature reports live child stages from the shared board', async () => {
    seedEpic();
    // The builder advances TKT-002 the only way an agent can.
    moveTicket(ticketsDir, 'TKT-002', 'building', 'bobby-build');

    const { status, body } = await api('GET', '/api/workspaces/ws-TKT-001-feature/feature');

    expect(status).toBe(200);
    const stages = Object.fromEntries(body.children.map((c) => [c.id, c.stage]));
    expect(stages['TKT-002']).toBe('building');
    expect(stages['TKT-003']).toBe('backlog');
  });

  it('GET /api/workspaces/:id/feature → 404 for an unknown workspace', async () => {
    expect((await api('GET', '/api/workspaces/nope/feature')).status).toBe(404);
  });
});
