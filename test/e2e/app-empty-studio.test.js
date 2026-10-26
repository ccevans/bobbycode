// test/e2e/app-empty-studio.test.js
//
// BOB-024 design-check round 2, finding 1: `bobby app` must BOOT on a studio
// with zero projects. The onboarding flow exists precisely for the empty
// studio, but commands/app.js resolved the board dirs eagerly and
// lib/config.js's studioBoardDir threw "No projects yet" before buildServer
// was ever reached — the boot-to-onboarding trigger was unreachable through
// the real entry point.
//
// Like app-studio-projects.test.js, nothing here builds a server by hand: it
// spawns `node bin/bobby.js app` against a real zero-project studio on disk
// and talks to it over HTTP. If the empty-studio guard is removed from
// commands/app.js, the boot test goes red again.
//
// Finding 2 rides the same server: the first onboarded ticket's id must carry
// the project's prefix (`AS-001`), never `undefined-001` — asserted HERE,
// through the real route, because the unit suite's 4/4 mutation cases never
// checked id shape.

import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import { execSync, spawn } from 'child_process';
import YAML from 'yaml';

const bobby = path.resolve('bin/bobby.js');
const git = (cwd, cmd) => execSync(`git ${cmd}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

/** A free port, so parallel jest workers cannot collide on a fixed one. */
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
 * The state a brand-new studio is in before its first project: `.bobbyrc.yml`
 * with a `studio:` key, empty `.bobby/` and `repos/`, a git repo (the app
 * refuses a non-repo) — and NO project boards, NO active-project file.
 */
function makeEmptyStudio(tmp) {
  const root = path.join(tmp, 'studio');
  fs.mkdirSync(path.join(root, '.bobby'), { recursive: true });
  fs.mkdirSync(path.join(root, 'repos'), { recursive: true });
  fs.writeFileSync(path.join(root, '.bobbyrc.yml'), YAML.stringify({
    studio: 'emptystudio',
    repos: {},
    workflows: { default: ['plan', 'build', 'review', 'test'] },
  }));
  git(root, 'init -q -b main');
  git(root, 'config user.email test@example.com');
  git(root, 'config user.name Test');
  fs.writeFileSync(path.join(root, 'README.md'), '# studio\n');
  git(root, 'add -A');
  git(root, 'commit -q -m initial');
  return root;
}

/** Start the real command; resolve once listening, reject with its output if it exits first. */
function startAppOnce(root, port, extraArgs = []) {
  const child = spawn('node', [bobby, 'app', '--port', String(port), '--no-open', ...extraArgs], {
    cwd: root,
    env: {
      ...process.env,
      NO_COLOR: '1',
      BOBBY_APP_DIR: '',
      BOBBY_NO_REGISTRY: '1',
      BOBBY_PROJECT: '',
    },
  });
  let out = '';
  return new Promise((resolve, reject) => {
    const fail = (msg) => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail(`app did not start in 20s. Output:\n${out}`), 20000);
    const onData = (buf) => {
      out += buf.toString();
      if (out.includes('Running at')) {
        clearTimeout(timer);
        resolve({ child, output: () => out });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code) => {
      clearTimeout(timer);
      reject(new Error(`app exited early (code ${code}). Output:\n${out}`));
    });
  });
}

async function startApp(root, { args = [], attempts = 3 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    const port = await freePort();
    try {
      const { child } = await startAppOnce(root, port, args);
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

describe('bobby app boots on an empty studio and onboards through it (BOB-024)', () => {
  let tmp, root, child, api;

  beforeAll(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-appempty-')));
    root = makeEmptyStudio(tmp);
    ({ child, api } = await startApp(root));
  }, 40000);

  afterAll(async () => {
    await stopApp(child);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  // Finding 1: the server must come up at all — beforeAll already proves the
  // boot; these assert the responses the app's boot sequence reads.
  test('GET /api/config reports an empty studio with no active project', async () => {
    const { status, body } = await api('GET', '/api/config');
    expect(status).toBe(200);
    expect(body.isStudio).toBe(true);
    expect(body.activeProject).toBe(null);
  });

  test('GET /api/projects returns an empty roster — the #/onboard trigger', async () => {
    const { status, body } = await api('GET', '/api/projects');
    expect(status).toBe(200);
    expect(body.projects).toEqual([]);
    expect(body.active).toBe(null);
  });

  test('GET /api/tickets answers an empty board, not a crash', async () => {
    const { status, body } = await api('GET', '/api/tickets');
    expect(status).toBe(200);
    expect(body.tickets).toEqual([]);
  });

  test('GET /api/brief answers on a boardless studio', async () => {
    const { status } = await api('GET', '/api/brief');
    expect(status).toBe(200);
  });

  // Findings 2 + 3 through the real route: onboarding mints a properly
  // prefixed ticket id (never `undefined-001`) and a word-boundary name.
  test('POST /api/onboard creates the first project with a real ticket id and a humane name', async () => {
    const { status, body } = await api('POST', '/api/onboard', {
      idea: 'A site where local bakeries list day-old bread',
    });
    expect(status).toBe(200);
    // Finding 3: not the raw 40-char slug cut mid-thought
    // ('a-site-where-local-bakeries-list-day-old') — whole words, short enough
    // to read as a name in Home's h1.
    expect(body.project).toBe('a-site-where-local-bakeries');
    // Finding 2: the id carries the project prefix createStudioProject wrote.
    expect(body.ticketId).toMatch(/^[A-Z][A-Z0-9]*-\d{3}$/);
    expect(body.ticketId).not.toMatch(/undefined/);

    // The empty studio gained its first active project — Home is reachable.
    const { body: projects } = await api('GET', '/api/projects');
    expect(projects.projects.map((p) => p.name)).toEqual(['a-site-where-local-bakeries']);
    expect(projects.active).toBe('a-site-where-local-bakeries');

    // And the board now serves that ticket with the same well-formed id.
    const { body: tickets } = await api('GET', '/api/tickets');
    expect(tickets.tickets.length).toBe(1);
    expect(tickets.tickets[0].id).toBe(body.ticketId);
  });
});
