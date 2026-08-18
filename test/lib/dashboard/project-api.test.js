// test/lib/dashboard/project-api.test.js
//
// TKT-022: the studio-mode project routes and the re-scoping they drive,
// exercised over real HTTP against a real Orchestrator + ProjectContext + a real
// studio on disk. The board reads (findTicket/listTickets) are real, which is
// the whole point — switching must move the board the API reads.
//
// No git and no CLI: switching and listing touch neither. TC-7's "running agent"
// is a fake handle in the process map, which is exactly what the real thing is
// from switchProject's point of view (something it must not touch).

import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildServer } from '../../../lib/dashboard/server.js';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { ProjectContext } from '../../../lib/dashboard/project-context.js';
import { WorkspaceStore } from '../../../lib/dashboard/state.js';
import { createTicket } from '../../../lib/tickets.js';

const sseHub = () => ({ broadcast() {}, connect() { return () => {}; } });

/** A studio with alpha/beta/gamma boards; alpha gets AL-001, beta gets BE-001. */
function makeStudio(tmp) {
  const root = path.join(tmp, 'studio');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '.bobbyrc.yml'), 'studio: teststudio\n');
  for (const name of ['alpha', 'beta', 'gamma']) {
    const dir = path.join(root, '.bobby', name);
    fs.mkdirSync(path.join(dir, 'tickets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.bobbyrc.yml'), `project: ${name}\n`);
  }
  createTicket(path.join(root, '.bobby', 'alpha', 'tickets'), { prefix: 'AL', title: 'alpha work' });
  createTicket(path.join(root, '.bobby', 'beta', 'tickets'), { prefix: 'BE', title: 'beta work' });
  return root;
}

/**
 * A wired-up studio dashboard: real store, real orchestrator, real project
 * context (starting on alpha), server. Returns the pieces a test pokes at.
 */
function wireStudio(tmp) {
  const root = makeStudio(tmp);
  const config = { studio: 'teststudio', project: 'alpha', ticket_prefix: 'TKT' };
  const projectContext = new ProjectContext(root, config);
  const store = new WorkspaceStore(path.join(root, '.bobby', 'workspaces.json')).load();
  const hub = sseHub();
  const orchestrator = new Orchestrator({
    repoRoot: root,
    config,
    ticketsDir: projectContext.ticketsDir,
    sessionsDir: projectContext.sessionsDir,
    agentsPath: '.claude/agents',
    store,
    sseHub: hub,
    pipeline: [],
    pipelineName: 'default',
    projectContext,
  });
  const server = buildServer({
    orchestrator, store, sseHub: hub, config, repoRoot: root,
    ticketsDir: projectContext.ticketsDir,
  });
  return { root, config, projectContext, store, orchestrator, server };
}

/** A single-project (non-studio) dashboard: no project context. */
function wireSingle(tmp) {
  const root = path.join(tmp, 'single');
  fs.mkdirSync(path.join(root, '.bobby', 'tickets'), { recursive: true });
  const config = { project: 'solo', tickets_dir: '.bobby/tickets' };
  const projectContext = new ProjectContext(root, config);   // inert off-studio
  const store = new WorkspaceStore(path.join(root, '.bobby', 'workspaces.json')).load();
  const hub = sseHub();
  const orchestrator = new Orchestrator({
    repoRoot: root, config,
    ticketsDir: path.join(root, '.bobby', 'tickets'),
    sessionsDir: path.join(root, '.bobby', 'sessions'),
    agentsPath: '.claude/agents', store, sseHub: hub, pipeline: [], pipelineName: 'default',
    projectContext,
  });
  const server = buildServer({ orchestrator, store, sseHub: hub, config, repoRoot: root, ticketsDir: path.join(root, '.bobby', 'tickets') });
  return { root, store, orchestrator, server };
}

async function withServer(server, fn) {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  try { await fn(api); }
  // Drop undici's keep-alive socket before closing. On Node 18 `close()` waits
  // on the idle client connection `fetch` leaves open, so its callback never
  // fires and every test here times out — see server-api.test.js, same pattern.
  finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

describe('studio project routes (TKT-022)', () => {
  let tmp;
  beforeEach(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-projapi-'))); });
  afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

  test('TC-5: GET /api/projects lists the studio projects and the active one', async () => {
    const { server } = wireStudio(tmp);
    await withServer(server, async (api) => {
      const { status, body } = await api('GET', '/api/projects');
      expect(status).toBe(200);
      expect(body).toEqual({ projects: ['alpha', 'beta', 'gamma'], active: 'alpha' });
    });
  });

  test('TC-6: POST /api/projects/select switches the active project', async () => {
    const { server } = wireStudio(tmp);
    await withServer(server, async (api) => {
      const sel = await api('POST', '/api/projects/select', { name: 'beta' });
      expect(sel.status).toBe(200);
      expect(sel.body.active).toBe('beta');
      const { body } = await api('GET', '/api/projects');
      expect(body.active).toBe('beta');
    });
  });

  test('POST /api/projects/select without a name is a 400', async () => {
    const { server } = wireStudio(tmp);
    await withServer(server, async (api) => {
      const { status } = await api('POST', '/api/projects/select', {});
      expect(status).toBe(400);
    });
  });

  test('POST /api/projects/select on an unknown project is a 400 naming it', async () => {
    const { server } = wireStudio(tmp);
    await withServer(server, async (api) => {
      const { status, body } = await api('POST', '/api/projects/select', { name: 'nope' });
      expect(status).toBe(400);
      expect(body.error).toMatch(/nope/);
    });
  });

  // Half of AC3: the switch touches neither the process nor the record. The
  // other half — that the run's own EXIT still reads the board it started on —
  // is not visible from here, because nothing here ever lets the run exit. It
  // lives in orchestrator-project-pin.test.js.
  test('TC-7: switching does not disturb a running agent in the other project', async () => {
    const { server, store, orchestrator } = wireStudio(tmp);
    // A running alpha workspace, with a live process handle in the map.
    store.create({ id: 'ws-al', ticketId: 'AL-001', kind: 'worktree', status: 'running', updatedAt: new Date().toISOString(), runs: [] });
    orchestrator.runningProcesses.set('ws-al', { stop() {}, done: Promise.resolve(), pid: 4242 });

    await withServer(server, async (api) => {
      const sel = await api('POST', '/api/projects/select', { name: 'beta' });
      expect(sel.status).toBe(200);
    });

    // The process was never touched, and the record is still running.
    expect(orchestrator.runningProcesses.has('ws-al')).toBe(true);
    expect(store.get('ws-al').status).toBe('running');
  });

  test('TC-8: GET /api/tickets returns only the active project\'s board', async () => {
    const { server } = wireStudio(tmp);
    await withServer(server, async (api) => {
      const onAlpha = await api('GET', '/api/tickets');
      expect(onAlpha.body.tickets.map(t => t.title)).toEqual(['alpha work']);

      await api('POST', '/api/projects/select', { name: 'beta' });
      const onBeta = await api('GET', '/api/tickets');
      expect(onBeta.body.tickets.map(t => t.title)).toEqual(['beta work']);
    });
  });

  test('workspaces list re-scopes to the active project (repo runs always shown)', async () => {
    const { server, store } = wireStudio(tmp);
    store.create({ id: 'ws-al', ticketId: 'AL-001', kind: 'worktree', status: 'idle', updatedAt: new Date().toISOString(), runs: [] });
    store.create({ id: 'ws-be', ticketId: 'BE-001', kind: 'worktree', status: 'idle', updatedAt: new Date().toISOString(), runs: [] });
    store.create({ id: 'repo-1', ticketId: null, kind: 'repo', status: 'idle', updatedAt: new Date().toISOString(), runs: [] });

    await withServer(server, async (api) => {
      const onAlpha = await api('GET', '/api/workspaces');
      const ids = onAlpha.body.workspaces.map(w => w.id).sort();
      expect(ids).toEqual(['repo-1', 'ws-al']);   // beta's ws is hidden; repo run stays

      await api('POST', '/api/projects/select', { name: 'beta' });
      const onBeta = await api('GET', '/api/workspaces');
      expect(onBeta.body.workspaces.map(w => w.id).sort()).toEqual(['repo-1', 'ws-be']);
    });
  });

  // A workspace records the board it was created on, so ownership is that
  // recorded value rather than a lookup that can hit the wrong ticket. Both
  // projects here hold X-001; only alpha's workspace may appear on alpha.
  test('workspaces are scoped by the board they were created on, not by id', async () => {
    const { server, store, root } = wireStudio(tmp);
    const board = (p) => path.join(root, '.bobby', p, 'tickets');
    createTicket(board('alpha'), { prefix: 'X', title: 'alpha X' });
    createTicket(board('beta'), { prefix: 'X', title: 'beta X' });

    const rec = (id, project) => ({
      id, ticketId: 'X-001', kind: 'worktree', status: 'idle',
      ticketsDir: board(project), updatedAt: new Date().toISOString(), runs: [],
    });
    store.create(rec('ws-alpha-x', 'alpha'));
    store.create(rec('ws-beta-x', 'beta'));

    await withServer(server, async (api) => {
      const onAlpha = await api('GET', '/api/workspaces');
      expect(onAlpha.body.workspaces.map(w => w.id)).toEqual(['ws-alpha-x']);

      await api('POST', '/api/projects/select', { name: 'beta' });
      const onBeta = await api('GET', '/api/workspaces');
      expect(onBeta.body.workspaces.map(w => w.id)).toEqual(['ws-beta-x']);
    });
  });

  test('TC-9: GET /api/config carries activeProject and isStudio, surviving a reload', async () => {
    const { server } = wireStudio(tmp);
    await withServer(server, async (api) => {
      await api('POST', '/api/projects/select', { name: 'beta' });
      const { body } = await api('GET', '/api/config');
      expect(body.isStudio).toBe(true);
      expect(body.activeProject).toBe('beta');
    });
  });

  test('the selection persists to .bobby/active-project (survives a fresh context)', async () => {
    const { server, root } = wireStudio(tmp);
    await withServer(server, async (api) => {
      await api('POST', '/api/projects/select', { name: 'gamma' });
    });
    // A brand-new context (as if the server restarted) lands back on gamma.
    const fresh = new ProjectContext(root, { studio: 'teststudio' });
    expect(fresh.projectName).toBe('gamma');
  });

  test('TC-10: non-studio GET /api/projects is a 400', async () => {
    const { server } = wireSingle(tmp);
    await withServer(server, async (api) => {
      const { status, body } = await api('GET', '/api/projects');
      expect(status).toBe(400);
      expect(body.error).toMatch(/not available/i);
    });
  });

  test('TC-11: non-studio POST /api/projects/select is a 400', async () => {
    const { server } = wireSingle(tmp);
    await withServer(server, async (api) => {
      const { status } = await api('POST', '/api/projects/select', { name: 'anything' });
      expect(status).toBe(400);
    });
  });
});
