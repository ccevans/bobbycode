// test/lib/dashboard/server-api.test.js
//
// The loop routes the app UI runs on: brief, go, ticket writes, workflows —
// exercised over real HTTP against a real .bobby fixture, with the
// orchestrator stubbed (agent execution is the orchestrator suite's job).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
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

/* --------------------------------------------------------------------- *
 * TKT-012 — /api/config carries the git remote
 *
 * The Feature view's sublabel is specified as `ccevans/bobbycode · TKT-001`,
 * and config knew only the project NAME. `repo` is where the code lives; it is
 * null whenever nothing can honestly answer, and the UI falls back to `project`.
 * The remote is read per request, not at boot, so `git remote add` while the
 * server is up is picked up — which is what these two tests exercise together.
 * --------------------------------------------------------------------- */

/* --------------------------------------------------------------------- *
 * TKT-018 — ideas
 *
 * Ideas are NOT tickets. `bobby idea` writes them to `.bobby/ideas.yml`
 * (lib/ideas.js) — a numbered list that deliberately stays off the board until
 * you promote one, which is the whole point of capturing a thought in five
 * seconds. So these routes are a thin skin over that same file: no second
 * store, and the CLI and the app read and write the one list.
 *
 * Mutations are POST rather than PUT/DELETE to match every other write in this
 * server (`/move`, `/comments`, `/discard`) — and because `bobby remote` tunnels
 * GET and POST only, so a DELETE route would work at the desk and not on the
 * phone.
 * --------------------------------------------------------------------- */

describe('ideas', () => {
  const ideasFile = () => path.join(tmp, '.bobby', 'ideas.yml');
  const capture = (text) => api('POST', '/api/ideas', { text });

  it('GET /api/ideas is empty before anything is captured', async () => {
    const { status, body } = await api('GET', '/api/ideas');

    expect(status).toBe(200);
    expect(body.ideas).toEqual([]);
    // No file was conjured just by looking.
    expect(fs.existsSync(ideasFile())).toBe(false);
  });

  it('POST /api/ideas captures one into the same file the CLI uses', async () => {
    const { status, body } = await capture('  a dark mode nobody asked for  ');

    expect(status).toBe(201);
    expect(body.idea).toMatchObject({ n: 1, text: 'a dark mode nobody asked for', promoted: null });
    expect(fs.readFileSync(ideasFile(), 'utf8')).toContain('a dark mode nobody asked for');

    const listed = await api('GET', '/api/ideas');
    expect(listed.body.ideas.map((i) => i.text)).toEqual(['a dark mode nobody asked for']);
  });

  it('POST /api/ideas → 400 with no text', async () => {
    expect((await api('POST', '/api/ideas', {})).status).toBe(400);
    expect((await capture('   ')).status).toBe(400);
  });

  it('POST /api/ideas/:n/promote turns the idea into a backlog ticket', async () => {
    await capture('let the board filter by area');

    const { status, body } = await api('POST', '/api/ideas/1/promote', {});

    expect(status).toBe(201);
    expect(body.ticket.title).toBe('let the board filter by area');
    expect(body.ticket.stage).toBe('backlog');
    expect(body.ticket.type).toBe('feature');
    expect(body.idea.promoted).toBe(body.ticket.id);

    // It really is on the board, and really is off the open list.
    expect(findTicket(ticketsDir, body.ticket.id)).toBeTruthy();
    expect((await api('GET', '/api/ideas')).body.ideas).toEqual([]);
    // …but not deleted — `?all=true` is how the CLI shows promoted ones too.
    const all = await api('GET', '/api/ideas?all=true');
    expect(all.body.ideas.map((i) => i.promoted)).toEqual([body.ticket.id]);
  });

  it('POST /api/ideas/:n/promote honours priority and --epic', async () => {
    await capture('rebuild the whole thing');

    const { body } = await api('POST', '/api/ideas/1/promote', { priority: 'high', epic: true, area: 'ui' });

    expect(body.ticket.type).toBe('epic');
    expect(body.ticket.priority).toBe('high');
    expect(body.ticket.area).toBe('ui');
  });

  it('POST /api/ideas/:n/promote → 404 unknown, 400 already promoted', async () => {
    await capture('something');
    expect((await api('POST', '/api/ideas/99/promote', {})).status).toBe(404);

    expect((await api('POST', '/api/ideas/1/promote', {})).status).toBe(201);
    const again = await api('POST', '/api/ideas/1/promote', {});
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already promoted/i);
  });

  it('POST /api/ideas/:n/delete removes it', async () => {
    await capture('first');
    await capture('second');

    const { status, body } = await api('POST', '/api/ideas/1/delete', {});

    expect(status).toBe(200);
    expect(body.idea.text).toBe('first');
    expect((await api('GET', '/api/ideas')).body.ideas.map((i) => i.text)).toEqual(['second']);
  });

  it('POST /api/ideas/:n/delete → 404 for an idea that is not there', async () => {
    const { status, body } = await api('POST', '/api/ideas/7/delete', {});

    expect(status).toBe(404);
    expect(body.error).toMatch(/#7/);
  });

  it('rejects a non-numeric idea number rather than acting on NaN', async () => {
    await capture('something');

    expect((await api('POST', '/api/ideas/abc/delete', {})).status).toBe(400);
    expect((await api('POST', '/api/ideas/abc/promote', {})).status).toBe(400);
    // Nothing was touched on the way past.
    expect((await api('GET', '/api/ideas')).body.ideas).toHaveLength(1);
  });
});

describe('config', () => {
  const git = (args) => execSync(`git ${args}`, { cwd: tmp, stdio: 'pipe', encoding: 'utf8' });

  it('returns owner/repo for the origin remote', async () => {
    git('init');
    git('remote add origin git@github.com:ccevans/bobbycode.git');

    const { status, body } = await api('GET', '/api/config');

    expect(status).toBe(200);
    expect(body.repo).toBe('ccevans/bobbycode');
  });

  it('returns repo: null with no remote, and still answers everything else', async () => {
    const { status, body } = await api('GET', '/api/config');

    expect(status).toBe(200);
    expect(body.repo).toBeNull();
    // The route did not merely survive — the fields the Board depends on are
    // all still there, which is what "degrades" has to mean.
    expect(body.project).toBe(path.basename(tmp));
    expect(body.stages).toContain('backlog');
    // The default TARGET, not an executor flavor — the one `claude` string in
    // lib/dashboard/ that BOB-136's sweep must leave alone. This is the guard
    // rail on the next over-eager sweep.
    expect(body.target).toBe('claude-code');
  });
});
