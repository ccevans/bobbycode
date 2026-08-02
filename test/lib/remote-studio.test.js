// test/lib/remote-studio.test.js
// Pair once, for the whole studio: one channel+key per machine, frames
// addressed by projectId, one tunnel multiplexing many projects.
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { newPairing } from '../../lib/remote/crypto.js';
import { RemoteTunnel, projectIdFor } from '../../lib/remote/tunnel.js';
import { loadOrCreatePairing, loadOrCreateStudioPairing } from '../../lib/remote/pairing-store.js';

describe('studio pairing store', () => {
  const origHome = process.env.HOME;
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-studio-'));
    process.env.HOME = tmpHome;
  });
  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('creates once, then every call returns the same studio identity', () => {
    const first = loadOrCreateStudioPairing();
    const second = loadOrCreateStudioPairing();

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.channel).toBe(first.channel);
    expect(second.key.equals(first.key)).toBe(true);
    expect(first.file).toBe(path.join(tmpHome, '.bobby', 'remote', 'studio.yml'));
  });

  it('is machine-wide — projects do not matter', () => {
    const a = loadOrCreateStudioPairing({ migrateFrom: '/project-a' });
    const b = loadOrCreateStudioPairing({ migrateFrom: '/project-b' });

    expect(b.channel).toBe(a.channel);
  });

  it('keeps the key file private (0600)', () => {
    const { file } = loadOrCreateStudioPairing();

    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('rotate mints a fresh identity — every phone is cut off at once', () => {
    const first = loadOrCreateStudioPairing();
    const rotated = loadOrCreateStudioPairing({ rotate: true });

    expect(rotated.channel).not.toBe(first.channel);
    expect(rotated.key.equals(first.key)).toBe(false);
    expect(loadOrCreateStudioPairing().channel).toBe(rotated.channel);
  });

  it('adopts a legacy per-project pairing so an already-paired phone survives', () => {
    const legacy = loadOrCreatePairing('/old/project');

    const studio = loadOrCreateStudioPairing({ migrateFrom: '/old/project' });

    expect(studio.migrated).toBe(true);
    expect(studio.channel).toBe(legacy.channel);
    expect(studio.key.equals(legacy.key)).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, '.bobby', 'remote', 'studio.yml'))).toBe(true);
  });

  it('ignores legacy pairings once a studio identity exists', () => {
    const studio = loadOrCreateStudioPairing();
    loadOrCreatePairing('/old/project');

    const again = loadOrCreateStudioPairing({ migrateFrom: '/old/project' });

    expect(again.migrated).toBe(false);
    expect(again.channel).toBe(studio.channel);
  });

  it('does not migrate when rotating — rotation means a clean break', () => {
    const legacy = loadOrCreatePairing('/old/project');

    const studio = loadOrCreateStudioPairing({ rotate: true, migrateFrom: '/old/project' });

    expect(studio.channel).not.toBe(legacy.channel);
  });
});

describe('projectIdFor', () => {
  it('is a slug of the name plus a short hash of the path', () => {
    expect(projectIdFor('My App!', '/home/cc/my-app')).toMatch(/^my-app-[a-f0-9]{8}$/);
  });

  it('is stable for the same name+path, distinct for different paths', () => {
    const a = projectIdFor('app', '/one/app');

    expect(projectIdFor('app', '/one/app')).toBe(a);
    expect(projectIdFor('app', '/two/app')).not.toBe(a);
  });

  it('falls back to the directory name when the project has no name', () => {
    expect(projectIdFor('', '/home/cc/thing')).toMatch(/^thing-[a-f0-9]{8}$/);
  });
});

/**
 * Wait until `cond` holds instead of sleeping a fixed interval — under a
 * loaded test machine an HTTP round trip can outlive any guessed delay, and a
 * late response would bleed into the next test's assertions.
 */
const waitFor = async (cond, ms = 2000) => {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
};

describe('multiplexed tunnel — one channel, many projects', () => {
  // Two stand-in dashboards so routing is observable per project.
  let serverA; let serverB; let portA; let portB; let seenA; let seenB;
  const PID_A = 'alpha-aaaaaaaa';
  const PID_B = 'beta-bbbbbbbb';

  const boot = (tag, sink) => new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      sink.push({ method: req.method, url: req.url });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ from: tag }));
    }).listen(0, '127.0.0.1', () => resolve(s));
  });

  beforeAll(async () => {
    seenA = []; seenB = [];
    serverA = await boot('A', seenA);
    serverB = await boot('B', seenB);
    portA = serverA.address().port;
    portB = serverB.address().port;
  });
  afterAll((done) => {
    serverA.closeAllConnections?.();
    serverB.closeAllConnections?.();
    serverA.close(() => serverB.close(done));
  });
  beforeEach(() => { seenA.length = 0; seenB.length = 0; });

  function studioTunnel() {
    const { key } = newPairing();
    const sent = [];
    const tunnel = new RemoteTunnel({
      relayUrl: 'ws://unused.invalid', channel: 'studio', key, version: '9.9.9',
      projects: [
        { projectId: PID_A, name: 'Alpha', localPort: portA },
        { projectId: PID_B, name: 'Beta', localPort: portB },
      ],
    });
    tunnel.sendFrame = (obj) => sent.push(obj); // capture instead of network
    return { tunnel, sent };
  }

  it('routes each request to the project the frame is addressed to', async () => {
    const { tunnel, sent } = studioTunnel();

    await tunnel.handleFrame({ t: 'req', id: 'r1', project: PID_A, method: 'GET', path: '/api/health' });
    await tunnel.handleFrame({ t: 'req', id: 'r2', project: PID_B, method: 'GET', path: '/api/tickets' });
    await waitFor(() => sent.length >= 2);

    expect(seenA).toEqual([{ method: 'GET', url: '/api/health' }]);
    expect(seenB).toEqual([{ method: 'GET', url: '/api/tickets' }]);
    expect(sent).toContainEqual({ t: 'res', id: 'r1', project: PID_A, status: 200, body: { from: 'A' } });
    expect(sent).toContainEqual({ t: 'res', id: 'r2', project: PID_B, status: 200, body: { from: 'B' } });
  });

  it('silently ignores frames for a project it does not serve', async () => {
    const { tunnel, sent } = studioTunnel();

    await tunnel.handleFrame({ t: 'req', id: 'r1', project: 'gamma-cccccccc', method: 'GET', path: '/api/health' });
    await new Promise((r) => setTimeout(r, 50));

    expect(seenA).toEqual([]);
    expect(seenB).toEqual([]);
    expect(sent).toEqual([]); // silence — another host may serve it
  });

  it('ignores an unaddressed frame when serving more than one project', async () => {
    const { tunnel, sent } = studioTunnel();

    // No project field and two candidates: guessing would leak one project's
    // data to a request meant for another. Refuse by silence.
    await tunnel.handleFrame({ t: 'req', id: 'r1', method: 'GET', path: '/api/health' });
    await new Promise((r) => setTimeout(r, 50));

    expect(seenA).toEqual([]);
    expect(seenB).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('answers {t:"who"} with a hi per served project', async () => {
    const { tunnel, sent } = studioTunnel();

    await tunnel.handleFrame({ t: 'who' });

    expect(sent).toEqual([
      { t: 'hi', project: 'Alpha', projectId: PID_A, version: '9.9.9' },
      { t: 'hi', project: 'Beta', projectId: PID_B, version: '9.9.9' },
    ]);
  });

  it('scopes subscription ids per project — same id, no collision', async () => {
    const { tunnel } = studioTunnel();
    // Not asserting stream contents (the stand-ins are not SSE) — only that
    // both subs register instead of the second being refused as a duplicate.
    await tunnel.handleFrame({ t: 'sub', id: 's1', project: PID_A, path: '/api/events' });
    await tunnel.handleFrame({ t: 'sub', id: 's1', project: PID_B, path: '/api/events' });

    expect(tunnel.subs.has(`${PID_A}:s1`)).toBe(true);
    expect(tunnel.subs.has(`${PID_B}:s1`)).toBe(true);

    await tunnel.handleFrame({ t: 'unsub', id: 's1', project: PID_A });

    expect(tunnel.subs.has(`${PID_A}:s1`)).toBe(false);
    expect(tunnel.subs.has(`${PID_B}:s1`)).toBe(true);
    tunnel.stopAllSubs();
  });
});
