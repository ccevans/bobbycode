// test/lib/dashboard/server-static.test.js
//
// Static serving and the extension seam, exercised over real HTTP. These guard
// the containment rules: an extension mount must not be escapable, and core
// routes must keep working with an extension loaded.
import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildServer } from '../../../lib/dashboard/server.js';

let tmp;
let server;
let base;

const fakeStore = {
  list: () => ([{ id: 'ws-1', status: 'running' }]),
  get: (id) => ({ id, status: 'running' }),
  subscribe: () => {},
};

const stubs = {
  orchestrator: { readLatestSessionFile: () => null },
  store: fakeStore,
  sseHub: { connect: () => () => {}, broadcast: () => {} },
  config: {},
};

async function start({ plugins = [], pluginStatus = { state: 'absent' } } = {}) {
  server = buildServer({
    ...stubs,
    repoRoot: tmp,
    ticketsDir: path.join(tmp, 'tickets'),
    plugins,
    pluginStatus,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}

/** An extension that serves a directory and registers a route. */
function makeExtension(uiDir, { name = '@bobbycode/pro-dashboard' } = {}) {
  return {
    name,
    version: '1.0.0',
    features: ['fleet view'],
    register({ route, serveDir, addScript, store, helpers }) {
      const mount = serveDir(uiDir);
      addScript(`${mount}pro.js`);
      route('GET', '/api/pro/fleet', (req, res) => {
        helpers.sendJson(res, 200, { total: store.list().length });
      });
    },
  };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-static-'));
});

afterEach(async () => {
  if (server) await new Promise((r) => server.close(r));
  server = null;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('core static serving', () => {
  test('serves the dashboard shell at /', async () => {
    await start();
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Bobby Dashboard');
  });

  test('cache-busts core assets', async () => {
    await start();
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toMatch(/style\.css\?v=\d+/);
    expect(html).toMatch(/app\.js\?v=\d+/);
  });

  test('does not inject extension tags when none are loaded', async () => {
    await start();
    expect(await (await fetch(`${base}/`)).text()).not.toContain('/pro/');
  });

  test.each([
    ['/../../../../etc/passwd', 'plain traversal'],
    ['/..%2f..%2f..%2fetc/passwd', 'encoded traversal'],
    ['/%2e%2e%2f%2e%2e%2fetc/passwd', 'fully encoded traversal'],
  ])('refuses to serve outside the template dir: %s (%s)', async (urlPath) => {
    await start();
    const res = await fetch(`${base}${urlPath}`);
    expect([403, 404]).toContain(res.status);
  });

  test('a malformed percent-escape is rejected, not thrown', async () => {
    await start();
    const res = await fetch(`${base}/%E0%A4%A`);
    expect([403, 404]).toContain(res.status);
  });
});

describe('capabilities', () => {
  test('reports free tier when no extension is loaded', async () => {
    await start();
    const body = await (await fetch(`${base}/api/capabilities`)).json();
    expect(body.core.workspaces).toBe(true);
    expect(body.pro.state).toBe('absent');
    expect(body.extensions).toEqual([]);
  });

  test('reports the loaded extension and its features', async () => {
    const ui = path.join(tmp, 'ui');
    fs.mkdirSync(ui);
    fs.writeFileSync(path.join(ui, 'pro.js'), '// pro');
    await start({
      plugins: [makeExtension(ui)],
      pluginStatus: { state: 'active', package: '@bobbycode/pro-dashboard', version: '1.0.0' },
    });
    const body = await (await fetch(`${base}/api/capabilities`)).json();
    expect(body.pro.state).toBe('active');
    expect(body.extensions).toEqual([
      { name: '@bobbycode/pro-dashboard', version: '1.0.0', features: ['fleet view'] },
    ]);
  });
});

describe('extension seam', () => {
  let ui;

  beforeEach(() => {
    ui = path.join(tmp, 'ui');
    fs.mkdirSync(ui);
    fs.writeFileSync(path.join(ui, 'pro.js'), '// pro asset');
    // A file just outside the mount, to prove it stays unreachable.
    fs.writeFileSync(path.join(tmp, 'secret.txt'), 'do not serve me');
  });

  test('serves extension assets under a URL-safe slug', async () => {
    await start({ plugins: [makeExtension(ui)] });
    const res = await fetch(`${base}/pro/bobbycode-pro-dashboard/pro.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('// pro asset');
  });

  test('injects the extension script after the core app', async () => {
    await start({ plugins: [makeExtension(ui)] });
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('/pro/bobbycode-pro-dashboard/pro.js');
    expect(html.indexOf('/app.js')).toBeLessThan(html.indexOf('/pro/bobbycode-pro-dashboard/pro.js'));
  });

  test('registers extension routes', async () => {
    await start({ plugins: [makeExtension(ui)] });
    const res = await fetch(`${base}/api/pro/fleet`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 1 });
  });

  test.each([
    ['/pro/bobbycode-pro-dashboard/../secret.txt'],
    ['/pro/bobbycode-pro-dashboard/..%2fsecret.txt'],
    ['/pro/bobbycode-pro-dashboard/%2e%2e%2fsecret.txt'],
  ])('cannot escape an extension mount: %s', async (urlPath) => {
    await start({ plugins: [makeExtension(ui)] });
    const res = await fetch(`${base}${urlPath}`);
    expect([403, 404]).toContain(res.status);
    if (res.status !== 403) expect(await res.text()).not.toContain('do not serve me');
  });

  test('rejects an extension route outside the /api/pro/ namespace', async () => {
    const badPlugin = {
      name: 'bad-ext',
      register({ route }) { route('GET', '/api/workspaces', () => {}); },
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await start({ plugins: [badPlugin] });
    // Core route still answers — the hijack never registered.
    expect((await fetch(`${base}/api/workspaces`)).status).toBe(200);
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/must start with \/api\/pro\//));
    spy.mockRestore();
  });

  test('an extension that throws while registering does not break the dashboard', async () => {
    const boom = {
      name: 'boom-ext',
      register() { throw new Error('registration exploded'); },
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await start({ plugins: [boom] });
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    expect((await fetch(`${base}/`)).status).toBe(200);
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/registration exploded/));
    spy.mockRestore();
  });

  test('core routes win when an extension is loaded', async () => {
    await start({ plugins: [makeExtension(ui)] });
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true, version: 2 });
  });
});
