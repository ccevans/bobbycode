// test/lib/remote.test.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import {
  newPairing, encodePairingCode, decodePairingCode, encrypt, decrypt,
} from '../../lib/remote/crypto.js';
import { isAllowedPath, RemoteTunnel } from '../../lib/remote/tunnel.js';
import { loadOrCreatePairing } from '../../lib/remote/pairing-store.js';

describe('remote crypto', () => {
  it('round-trips a frame under the pairing key', () => {
    const { key } = newPairing();
    const frame = { t: 'req', id: 'a1', method: 'GET', path: '/api/health' };

    expect(decrypt(key, encrypt(key, frame))).toEqual(frame);
  });

  it('rejects a frame encrypted under a different key', () => {
    const a = newPairing();
    const b = newPairing();

    expect(() => decrypt(b.key, encrypt(a.key, { hello: 1 }))).toThrow(/authentication/i);
  });

  it('rejects a tampered ciphertext', () => {
    const { key } = newPairing();
    const data = encrypt(key, { secret: true });
    const buf = Buffer.from(data, 'base64url');
    buf[buf.length - 1] ^= 0xff;

    expect(() => decrypt(key, buf.toString('base64url'))).toThrow(/authentication/i);
  });

  it('uses a fresh nonce per frame — identical plaintext never repeats', () => {
    const { key } = newPairing();

    expect(encrypt(key, { a: 1 })).not.toEqual(encrypt(key, { a: 1 }));
  });

  it('pairing codes round-trip channel, key, and relay', () => {
    const { channel, key } = newPairing();
    const code = encodePairingCode({ channel, key, relay: 'wss://relay.example' });

    const decoded = decodePairingCode(code);

    expect(decoded.channel).toBe(channel);
    expect(decoded.key.equals(key)).toBe(true);
    expect(decoded.relay).toBe('wss://relay.example');
  });

  it('gives a readable error for junk pairing codes', () => {
    expect(() => decodePairingCode('definitely-not-a-code')).toThrow(/pairing code/i);
    expect(() => decodePairingCode('')).toThrow(/pairing code/i);
  });
});

describe('tunnel path gate', () => {
  it('allows only the dashboard API surface', () => {
    expect(isAllowedPath('/api/health')).toBe(true);
    expect(isAllowedPath('/api/workspaces/ws-1/approve')).toBe(true);
    expect(isAllowedPath('/api/tickets')).toBe(true);
  });

  it('refuses everything that is not /api/*', () => {
    expect(isAllowedPath('/')).toBe(false);
    expect(isAllowedPath('/index.html')).toBe(false);
    expect(isAllowedPath('/api/../etc/passwd')).toBe(false);
    expect(isAllowedPath('/apix/health')).toBe(false);
    expect(isAllowedPath('http://evil.example/api/health')).toBe(false);
    expect(isAllowedPath(null)).toBe(false);
    expect(isAllowedPath('/api/health?x=<script>')).toBe(false);
  });
});

describe('pairing store', () => {
  const origHome = process.env.HOME;
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-remote-'));
    process.env.HOME = tmpHome;
  });
  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('creates once, then returns the same pairing for the same project', () => {
    const first = loadOrCreatePairing('/some/project');
    const second = loadOrCreatePairing('/some/project');

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.channel).toBe(first.channel);
    expect(second.key.equals(first.key)).toBe(true);
    // Lives under HOME, never under the project.
    expect(first.file.startsWith(path.join(tmpHome, '.bobby', 'remote'))).toBe(true);
  });

  it('different projects get different channels', () => {
    const a = loadOrCreatePairing('/project-a');
    const b = loadOrCreatePairing('/project-b');

    expect(a.channel).not.toBe(b.channel);
  });

  it('rotate cuts old phones off — new channel, new key', () => {
    const first = loadOrCreatePairing('/some/project');
    const rotated = loadOrCreatePairing('/some/project', { rotate: true });

    expect(rotated.channel).not.toBe(first.channel);
    expect(rotated.key.equals(first.key)).toBe(false);
  });
});

describe('tunnel request proxy', () => {
  // A stand-in for the local dashboard: records what reaches it.
  let local; let localPort; let seen;

  beforeAll((done) => {
    local = http.createServer((req, res) => {
      seen.push({ method: req.method, url: req.url });
      if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'nope' }));
      }
    }).listen(0, '127.0.0.1', () => {
      localPort = local.address().port;
      done();
    });
  });
  afterAll((done) => {
    // Keep-alive sockets from proxied requests would hold close() open forever.
    local.closeAllConnections?.();
    local.close(done);
  });
  beforeEach(() => { seen = []; });

  function tunnelWithCapturedFrames() {
    const { key } = newPairing();
    const sent = [];
    const waiters = [];
    const tunnel = new RemoteTunnel({
      relayUrl: 'ws://unused.invalid', channel: 'test', key, localPort,
    });
    // Capture instead of hitting the network, and let tests await a frame
    // rather than sleeping — the proxy is a real HTTP round trip, so any
    // fixed delay is a race under parallel test load.
    tunnel.sendFrame = (obj) => {
      sent.push(obj);
      for (const resolve of waiters.splice(0)) resolve(obj);
    };
    const nextFrame = () => (sent.length
      ? Promise.resolve(sent[sent.length - 1])
      : new Promise((resolve) => waiters.push(resolve)));
    return { tunnel, sent, nextFrame };
  }

  it('proxies an allowed request and returns the response', async () => {
    const { tunnel, sent, nextFrame } = tunnelWithCapturedFrames();

    await tunnel.handleFrame({ t: 'req', id: 'r1', method: 'GET', path: '/api/health' });
    await nextFrame();

    expect(seen).toEqual([{ method: 'GET', url: '/api/health' }]);
    expect(sent).toEqual([{ t: 'res', id: 'r1', status: 200, body: { ok: true } }]);
  });

  it('refuses a disallowed path without touching the local server', async () => {
    const { tunnel, sent } = tunnelWithCapturedFrames();

    await tunnel.handleFrame({ t: 'req', id: 'r2', method: 'GET', path: '/etc/passwd' });

    expect(seen).toEqual([]);
    expect(sent).toEqual([{ t: 'res', id: 'r2', status: 403, body: { error: 'not allowed' } }]);
  });

  it('refuses non-GET/POST methods', async () => {
    const { tunnel, sent } = tunnelWithCapturedFrames();

    await tunnel.handleFrame({ t: 'req', id: 'r3', method: 'DELETE', path: '/api/health' });

    expect(seen).toEqual([]);
    expect(sent[0].status).toBe(403);
  });
});

describe('tunnel notify (BOB-130)', () => {
  // The relay must be able to hand something to Apple/Google while staying
  // unable to read the E2E frames, so notify is the ONE plaintext payload the
  // host sends besides `attach`. These tests assert on the serialized bytes,
  // because the bytes are the contract — and the leak budget.
  function tunnelWithStubbedSocket(readyState = 1 /* OPEN */) {
    const { key } = newPairing();
    const raw = [];
    const tunnel = new RemoteTunnel({
      relayUrl: 'ws://unused.invalid', channel: 'test', key, localPort: 1,
    });
    tunnel.ws = { readyState, send: (s) => raw.push(s) };
    return { tunnel, raw };
  }

  // TC-A
  it('puts exactly {type,kind} on the wire and nothing else', () => {
    const { tunnel, raw } = tunnelWithStubbedSocket();

    tunnel.sendNotify('needs_you');

    expect(raw).toHaveLength(1);
    const parsed = JSON.parse(raw[0]);
    // No workspace id, ticket id, stage, agent, branch or error string. Ever.
    expect(Object.keys(parsed).sort()).toEqual(['kind', 'type']);
    expect(parsed.type).toBe('notify');
    expect(parsed.kind).toBe('needs_you');
  });

  it('sends the failed kind too', () => {
    const { tunnel, raw } = tunnelWithStubbedSocket();

    tunnel.sendNotify('failed');

    expect(JSON.parse(raw[0])).toEqual({ type: 'notify', kind: 'failed' });
  });

  // TC-B — a frame-wrapped notify would be ciphertext the relay cannot read,
  // so it would be dropped forever: this bug wearing a different hat.
  it('never routes through the encrypting sendFrame path', () => {
    const { tunnel, raw } = tunnelWithStubbedSocket();
    tunnel.sendFrame = () => { throw new Error('sendNotify must not encrypt'); };

    expect(() => tunnel.sendNotify('needs_you')).not.toThrow();
    expect(raw[0]).toContain('notify');
    expect(JSON.parse(raw[0]).data).toBeUndefined();
  });

  // TC-C
  it('sends nothing when the socket is not OPEN', () => {
    const connecting = tunnelWithStubbedSocket(0 /* CONNECTING */);
    connecting.tunnel.sendNotify('needs_you');
    expect(connecting.raw).toEqual([]);

    const closed = tunnelWithStubbedSocket(3 /* CLOSED */);
    closed.tunnel.sendNotify('needs_you');
    expect(closed.raw).toEqual([]);

    const gone = tunnelWithStubbedSocket();
    gone.tunnel.ws = null;
    expect(() => gone.tunnel.sendNotify('needs_you')).not.toThrow();
    expect(gone.raw).toEqual([]);
  });

  // TC-D — `done` is deliberately unsupported by the host (see plan, Out of
  // scope): the only status that would map to it is `merged`, which is always
  // human-initiated.
  it('sends nothing for a kind outside needs_you | failed', () => {
    const { tunnel, raw } = tunnelWithStubbedSocket();

    tunnel.sendNotify('done');
    tunnel.sendNotify('pwned; DROP');
    tunnel.sendNotify(undefined);
    tunnel.sendNotify({ kind: 'needs_you' });

    expect(raw).toEqual([]);
  });
});
