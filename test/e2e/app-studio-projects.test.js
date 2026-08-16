// test/e2e/app-studio-projects.test.js
//
// TKT-022: studio project switching works in the SHIPPED command.
//
// This suite exists because every other TKT-022 test hand-wires its own
// Orchestrator with a ProjectContext — and stayed green for two review rounds
// while `bobby app`, the only local command that serves the app, constructed
// one WITHOUT it. `ProjectContext` had been threaded into commands/dashboard.js,
// a module `bin/bobby.js` does not register (commands/app.js carries
// `.alias('dashboard')`). The feature was complete, correct, and unreachable.
//
// So nothing here builds a server. It spawns `node bin/bobby.js app` against a
// real two-project studio on disk and talks to it over HTTP, which is the only
// way to assert that the product — not a fixture that resembles it — can switch
// projects. If the wiring is removed from commands/app.js, these go red.

import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import { execSync, spawn } from 'child_process';
import YAML from 'yaml';
import { createTicket } from '../../lib/tickets.js';

const bobby = path.resolve('bin/bobby.js');
const git = (cwd, cmd) => execSync(`git ${cmd}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

/**
 * A free port, so parallel jest workers cannot collide on a fixed one. Both
 * halves must be awaited: `address()` is null until 'listening', and a socket
 * closed but not yet awaited is still bound — either shortcut hands out a port
 * the app then cannot bind.
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * A real studio: git repo (the app refuses a non-repo), `.bobbyrc.yml` with a
 * `studio:` key, and two project boards under `.bobby/<name>/` — the layout
 * lib/studio.js and lib/config.js resolve.
 */
function makeStudio(tmp) {
  const root = path.join(tmp, 'studio');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '.bobbyrc.yml'), YAML.stringify({
    studio: 'teststudio',
    ticket_prefix: 'TKT',
    dashboard: { worktree_root: 'wt' },
  }));

  for (const name of ['alpha', 'beta']) {
    const dir = path.join(root, '.bobby', name);
    fs.mkdirSync(path.join(dir, 'tickets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.bobbyrc.yml'), YAML.stringify({ project: name }));
  }
  createTicket(path.join(root, '.bobby', 'alpha', 'tickets'), { prefix: 'AL', title: 'alpha work' });
  createTicket(path.join(root, '.bobby', 'beta', 'tickets'), { prefix: 'BE', title: 'beta work' });

  // A studio with a project already selected — what `bobby project use alpha`
  // leaves behind, and the state every studio is in after its first use.
  // Without it `readConfig` refuses to resolve a board at all and the app exits
  // 1 before serving anything ("Select a project: `bobby project use <name>`"),
  // which is why ProjectContext's own no-selection fallback never runs here.
  fs.writeFileSync(path.join(root, '.bobby', 'active-project'), 'alpha', 'utf8');

  git(root, 'init -q -b main');
  git(root, 'config user.email test@example.com');
  git(root, 'config user.name Test');
  fs.writeFileSync(path.join(root, 'README.md'), '# studio\n');
  git(root, 'add -A');
  git(root, 'commit -q -m initial');
  return root;
}

/**
 * Start the real command and resolve once it is listening. Rejects with the
 * child's own output if it exits first — a crashed command must not surface as
 * an opaque fetch timeout.
 */
function startAppOnce(root, port) {
  const child = spawn('node', [bobby, 'app', '--port', String(port), '--no-open'], {
    cwd: root,
    env: { ...process.env, NO_COLOR: '1', BOBBY_APP_DIR: '' },
  });
  let out = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`app did not start in 20s. Output:\n${out}`)), 20000);
    const onData = (buf) => {
      out += buf.toString();
      if (out.includes('Running at')) {
        clearTimeout(timer);
        resolve({ child, output: () => out });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`app exited early (code ${code}). Output:\n${out}`));
    });
  });
}

/**
 * Start on a free port, retrying if something grabbed it in the gap between
 * releasing it and the app binding it. Returns { child, port } plus the api
 * helper bound to that port.
 */
async function startApp(root, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    const port = await freePort();
    try {
      const { child } = await startAppOnce(root, port);
      return { child, port, api: apiFor(port) };
    } catch (e) {
      lastError = e;
      if (!/already in use/i.test(e.message)) throw e;
    }
  }
  throw lastError;
}

/** An HTTP helper bound to one port: (method, path, body) → { status, body }. */
function apiFor(port) {
  return async (method, p, body) => {
    const res = await fetch(`http://127.0.0.1:${port}${p}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
}

function stopApp(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.on('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } resolve(); }, 3000).unref();
  });
}

describe('bobby app serves studio project switching (TKT-022)', () => {
  let tmp, root, child, api;

  beforeAll(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-appstudio-')));
    root = makeStudio(tmp);
    ({ child, api } = await startApp(root));
  }, 40000);

  afterAll(async () => {
    await stopApp(child);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  // The exact three responses that were wrong. Before the wiring, the shipped
  // command reported isStudio:false here and 400'd both project routes.
  test('GET /api/config reports the studio and its active project', async () => {
    const { status, body } = await api('GET', '/api/config');
    expect(status).toBe(200);
    expect(body.isStudio).toBe(true);
    expect(body.activeProject).toBe('alpha');
  });

  test('GET /api/projects lists the studio projects', async () => {
    const { status, body } = await api('GET', '/api/projects');
    expect(status).toBe(200);
    expect(body.projects).toEqual(['alpha', 'beta']);
    expect(body.active).toBe('alpha');
  });

  // AC1 + AC2 end to end: the switch is accepted AND the board the API serves
  // actually moves. Asserting the 200 alone would pass on a switch that changed
  // nothing, which is the weaker-assertion trap this suite exists to avoid.
  test('POST /api/projects/select re-scopes the tickets the app serves', async () => {
    const before = await api('GET', '/api/tickets');
    expect(before.body.tickets.map(t => t.title)).toEqual(['alpha work']);

    const sel = await api('POST', '/api/projects/select', { name: 'beta' });
    expect(sel.status).toBe(200);
    expect(sel.body.active).toBe('beta');

    const after = await api('GET', '/api/tickets');
    expect(after.body.tickets.map(t => t.title)).toEqual(['beta work']);

    // AC4: the choice is persisted where a reload (and the next `bobby app`)
    // reads it — the real file, written by the real command.
    expect(fs.readFileSync(path.join(root, '.bobby', 'active-project'), 'utf8').trim()).toBe('beta');
    expect((await api('GET', '/api/config')).body.activeProject).toBe('beta');
  });

  test('an unknown project is refused, naming it, and does not move the board', async () => {
    const { status, body } = await api('POST', '/api/projects/select', { name: 'nope' });
    expect(status).toBe(400);
    expect(body.error).toMatch(/nope/);
    expect((await api('GET', '/api/config')).body.activeProject).toBe('beta');
  });
});

// The other half of the wiring contract: a single-project repo must be exactly
// as it was. The context is constructed there too, so "inert off-studio" is a
// property of the shipped command, not just of the class.
describe('bobby app on a single-project repo is unchanged (TKT-022)', () => {
  let tmp, root, child, api;

  beforeAll(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-appsolo-')));
    root = path.join(tmp, 'solo');
    fs.mkdirSync(path.join(root, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(root, '.bobbyrc.yml'), YAML.stringify({
      project: 'solo', tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    }));
    createTicket(path.join(root, '.bobby', 'tickets'), { prefix: 'TKT', title: 'solo work' });
    git(root, 'init -q -b main');
    git(root, 'config user.email test@example.com');
    git(root, 'config user.name Test');
    fs.writeFileSync(path.join(root, 'README.md'), '# solo\n');
    git(root, 'add -A');
    git(root, 'commit -q -m initial');

    ({ child, api } = await startApp(root));
  }, 40000);

  afterAll(async () => {
    await stopApp(child);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  test('reports no studio and still serves its own board', async () => {
    const cfg = await api('GET', '/api/config');
    expect(cfg.body.isStudio).toBe(false);
    const tickets = await api('GET', '/api/tickets');
    expect(tickets.body.tickets.map(t => t.title)).toEqual(['solo work']);
  });

  test('both project routes refuse rather than pretend', async () => {
    expect((await api('GET', '/api/projects')).status).toBe(400);
    expect((await api('POST', '/api/projects/select', { name: 'anything' })).status).toBe(400);
  });
});
