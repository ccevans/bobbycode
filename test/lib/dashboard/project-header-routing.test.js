// test/lib/dashboard/project-header-routing.test.js — BOB-067.
//
// One pairing must reach every project a studio serves. The tunnel stamps the
// project a phone frame names onto the proxied request as x-bobby-project, and
// the server resolves THAT board per request — statelessly. The alternative,
// switchTo() before the proxy, mutates the one global active project: a frame
// for B arriving before A's proxied request is served mis-scopes it, and the
// desktop gets its board flipped under it besides.
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { buildServer } from '../../../lib/dashboard/server.js';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { WorkspaceStore } from '../../../lib/dashboard/state.js';
import { ProjectContext } from '../../../lib/dashboard/project-context.js';
import { createTicket } from '../../../lib/tickets.js';
import { RemoteTunnel } from '../../../lib/remote/tunnel.js';

const sseHub = () => ({ broadcast() {}, connect() { return () => {}; } });

function makeStudio(tmp) {
  const root = path.join(tmp, 'studio');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '.bobbyrc.yml'), 'studio: teststudio\n');
  for (const name of ['alpha', 'beta']) {
    const dir = path.join(root, '.bobby', name);
    fs.mkdirSync(path.join(dir, 'tickets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.bobbyrc.yml'), `project: ${name}\nprefix: ${name === 'alpha' ? 'AL' : 'BE'}\n`);
  }
  createTicket(path.join(root, '.bobby', 'alpha', 'tickets'), { prefix: 'AL', title: 'alpha work' });
  createTicket(path.join(root, '.bobby', 'beta', 'tickets'), { prefix: 'BE', title: 'beta work' });
  return root;
}

function wire(tmp) {
  const root = makeStudio(tmp);
  const config = { studio: 'teststudio', project: 'alpha', ticket_prefix: 'TKT' };
  const projectContext = new ProjectContext(root, config);
  const store = new WorkspaceStore(path.join(root, '.bobby', 'workspaces.json')).load();
  const hub = sseHub();
  const orchestrator = new Orchestrator({
    repoRoot: root, config,
    ticketsDir: projectContext.ticketsDir, sessionsDir: projectContext.sessionsDir,
    agentsPath: '.claude/agents', store, sseHub: hub,
    pipeline: [], pipelineName: 'default', projectContext,
  });
  const server = buildServer({
    orchestrator, store, sseHub: hub, config, repoRoot: root,
    ticketsDir: projectContext.ticketsDir,
  });
  return { root, server, projectContext };
}

async function listen(server) {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return server.address().port;
}
async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
}
const get = async (port, p, headers = {}) => {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, { headers });
  return { status: res.status, body: await res.json() };
};

describe('per-request project routing (BOB-067)', () => {
  let tmp, server, port;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-067-'));
    ({ server } = wire(tmp));
    port = await listen(server);
  });
  afterEach(async () => {
    await closeServer(server);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('no header reads the ACTIVE project — every existing caller unchanged', async () => {
    const r = await get(port, '/api/tickets');
    expect(r.body.tickets.map(t => t.id)).toEqual(['AL-001']);
  });

  test('the header addresses another project without switching anything', async () => {
    const beta = await get(port, '/api/tickets', { 'x-bobby-project': 'beta' });
    expect(beta.body.tickets.map(t => t.id)).toEqual(['BE-001']);

    // THE POINT: the active project did not move. A concurrent desktop read
    // still sees alpha — the phone addressed beta, it did not steal the board.
    const after = await get(port, '/api/tickets');
    expect(after.body.tickets.map(t => t.id)).toEqual(['AL-001']);
  });

  test('config is scoped too — the prefix is a per-project fact', async () => {
    const beta = await get(port, '/api/config', { 'x-bobby-project': 'beta' });
    expect(beta.body.project).toBe('beta');
  });

  test('an unknown project 400s naming the real ones, not a silent fallback', async () => {
    // Exactly 400 — the earlier `>= 400` let a 500 'Internal error' pass for
    // the whole life of this feature (the live TC-10 rejection). A phone with
    // a stale roster must see a CLIENT error whose body names the projects
    // that do exist, not a server crash with the names buried in details.
    const r = await get(port, '/api/tickets', { 'x-bobby-project': 'nope' });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("No such project 'nope'");
    expect(r.body.error).toContain('alpha');
    expect(r.body.error).toContain('beta');
  });

  test('EVERY board-scoped route 400s the same way — one seam, not per-route luck', async () => {
    // The six routes the live rejection probed, plus sessions. Each one must
    // give the same clean 400 naming the real projects.
    const routes = [
      '/api/tickets',
      '/api/brief',
      '/api/tickets/AL-001',
      '/api/config',
      '/api/features',
      '/api/workflows',
      '/api/sessions',
    ];
    for (const route of routes) {
      const r = await get(port, route, { 'x-bobby-project': 'nope' });
      expect({ route, status: r.status }).toEqual({ route, status: 400 });
      expect(r.body.error).toContain("No such project 'nope'");
      expect(r.body.error).toContain('alpha');
      expect(r.body.error).toContain('beta');
    }
  });

  test('the relay-frame path gets the same 400 — tunnel project field, real server', async () => {
    // End-to-end minus the websocket: a frame naming an unknown project rides
    // the tunnel's own header stamping into the real studio server.
    const tunnel = new RemoteTunnel({ relayUrl: 'ws://127.0.0.1:1', channel: 'x', key: Buffer.alloc(32), localPort: port });
    const frame = await new Promise((resolve) => {
      tunnel.sendFrame = (f) => resolve(f);
      tunnel.handleRequest({ id: 'p1', method: 'GET', path: '/api/tickets', project: 'nope' });
    });
    expect(frame.t).toBe('res');
    expect(frame.status).toBe(400);
    expect(frame.body.error).toContain("No such project 'nope'");
    expect(frame.body.error).toContain('alpha');
    expect(frame.body.error).toContain('beta');
  });

  test('interleaved requests for different projects never cross boards', async () => {
    // The race the switchTo() design ships: fire alternating reads concurrently
    // and require every response to carry its own project's tickets.
    const reads = [];
    for (let i = 0; i < 10; i++) {
      reads.push(get(port, '/api/tickets', { 'x-bobby-project': 'beta' })
        .then(r => ({ want: 'BE-001', got: r.body.tickets[0]?.id })));
      reads.push(get(port, '/api/tickets')
        .then(r => ({ want: 'AL-001', got: r.body.tickets[0]?.id })));
    }
    const results = await Promise.all(reads);
    for (const r of results) expect(r.got).toBe(r.want);
  });
});

describe('the tunnel stamps the frame project onto the proxied request (BOB-067)', () => {
  test('req and sub frames carry their project as x-bobby-project', async () => {
    // A capture server in place of the local API: what matters is exactly what
    // the tunnel forwards.
    const seen = [];
    const api = http.createServer((req, res) => {
      seen.push({ path: req.url, project: req.headers['x-bobby-project'] || null });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    const apiPort = await new Promise((r) => api.listen(0, '127.0.0.1', () => r(api.address().port)));

    const tunnel = new RemoteTunnel({ relayUrl: 'ws://127.0.0.1:1', channel: 'x', key: Buffer.alloc(32), localPort: apiPort });
    try {
      await new Promise((resolve) => {
        tunnel.sendFrame = () => resolve();        // capture the res frame instead of a socket
        tunnel.handleRequest({ id: '1', method: 'GET', path: '/api/tickets', project: 'beta' });
      });
      await new Promise((resolve) => {
        tunnel.sendFrame = () => resolve();
        tunnel.handleRequest({ id: '2', method: 'GET', path: '/api/tickets' });
      });
    } finally {
      api.closeAllConnections?.();
      await new Promise((r) => api.close(r));
    }

    expect(seen[0]).toEqual({ path: '/api/tickets', project: 'beta' });
    expect(seen[1]).toEqual({ path: '/api/tickets', project: null });
  });

  test('the hi frame carries the roster, and off-studio it is just this project', () => {
    const withRoster = new RemoteTunnel({ relayUrl: 'ws://x', channel: 'c', key: Buffer.alloc(32), localPort: 1, project: 'alpha', projects: ['alpha', 'beta'] });
    expect(withRoster.projects).toEqual(['alpha', 'beta']);
    const solo = new RemoteTunnel({ relayUrl: 'ws://x', channel: 'c', key: Buffer.alloc(32), localPort: 1, project: 'solo' });
    expect(solo.projects).toEqual(['solo']);
  });
});
