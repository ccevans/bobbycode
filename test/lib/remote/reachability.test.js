// test/lib/remote/reachability.test.js — BOB-064.
//
// The bug cost forty minutes on a real iPhone and every signal the tool gave was
// wrong: a green tick printed before the relay connected, over a QR that could
// never have worked. These cover the two halves — deciding a link is unusable
// before printing it, and earning the verdict with a real round trip.
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { isSecureContextUrl, pairingBlocker } from '../../../lib/remote/reachability.js';
import { verifyRoundTrip, verifyMessage } from '../../../lib/remote/verify.js';
import { newPairing } from '../../../lib/remote/crypto.js';
import { RemoteTunnel } from '../../../lib/remote/tunnel.js';
import http from 'http';

describe('secure-context detection (BOB-064)', () => {
  test('a LAN http address is not a secure context — the measured case', () => {
    // http://192.168.1.209:8790  isSecureContext=false  crypto.subtle=false
    expect(isSecureContextUrl('http://192.168.1.209:8790')).toBe(false);
    expect(isSecureContextUrl('ws://192.168.1.209:8790')).toBe(false);
  });

  test('loopback is, which is exactly why testing on this machine hides the bug', () => {
    for (const u of ['http://127.0.0.1:8790', 'http://localhost:3000',
      'http://[::1]:8790', 'http://app.localhost:8790']) {
      expect(isSecureContextUrl(u)).toBe(true);
    }
  });

  test('https and wss always are', () => {
    expect(isSecureContextUrl('https://bobby.example')).toBe(true);
    expect(isSecureContextUrl('wss://relay.example')).toBe(true);
  });

  test('junk is not a secure context rather than a crash', () => {
    for (const u of ['not a url', '', 'file:///etc/passwd', 'ftp://x.test']) {
      expect(isSecureContextUrl(u)).toBe(false);
    }
  });
});

describe('refusing a link no phone can use (BOB-064)', () => {
  test('a LAN http app URL is refused, naming the cause AND the fix', () => {
    const msg = pairingBlocker({ appUrl: 'http://192.168.1.209:8790', relayUrl: 'wss://relay.test' });
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/https/);          // names the requirement
    expect(msg).toMatch(/Fix:/);           // names the way out
    // "it will not work" without "do this instead" is the same forty minutes
    // with a different first step.
    expect(msg).toMatch(/tunnel|hosted relay/);
  });

  test('a ws:// relay is refused even when the app URL is fine', () => {
    const msg = pairingBlocker({ appUrl: 'https://bobby.example', relayUrl: 'ws://192.168.1.209:8790' });
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/relay/);
  });

  test('a fully secure pair is allowed', () => {
    expect(pairingBlocker({ appUrl: 'https://bobby.example', relayUrl: 'wss://relay.example' })).toBeNull();
  });

  test('loopback development is allowed — it genuinely works', () => {
    expect(pairingBlocker({ appUrl: 'http://127.0.0.1:8790', relayUrl: 'ws://127.0.0.1:8795' })).toBeNull();
  });
});

describe('earning the verdict with a real round trip (BOB-064)', () => {
  jest.setTimeout(30000);
  let relay, relayPort, api, apiPort, tunnel;

  const startRelay = async () => {
    const { createRelay } = await import(path.resolve('../bobbycode-pro/hq/relay/server.js'));
    relay = createRelay({});
    relayPort = await new Promise((r) => relay.httpServer.listen(0, '127.0.0.1', () => r(relay.httpServer.address().port)));
  };
  const startApi = async () => {
    api = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    apiPort = await new Promise((r) => api.listen(0, '127.0.0.1', () => r(api.address().port)));
  };

  afterEach(async () => {
    try { tunnel?.close(); } catch { /* gone */ }
    if (api) await new Promise((r) => api.close(r));
    if (relay) await relay.close();
    tunnel = api = relay = null;
  });

  const hasPro = fs.existsSync(path.resolve('../bobbycode-pro/hq/relay/server.js'));
  const maybe = hasPro ? test : test.skip;

  maybe('happy path: relay up, host attached, API answering', async () => {
    await startRelay(); await startApi();
    const { channel, key } = newPairing();
    tunnel = new RemoteTunnel({ relayUrl: `ws://127.0.0.1:${relayPort}`, channel, key, localPort: apiPort });
    tunnel.connect();

    const result = await verifyRoundTrip({ relayUrl: `ws://127.0.0.1:${relayPort}`, channel, key });
    expect(result).toEqual({ ok: true, status: 200 });
    expect(verifyMessage(result)).toBeNull();
  });

  maybe('relay DOWN: the case that printed a green tick and a QR', async () => {
    const { channel, key } = newPairing();
    // Nothing listening. Previously this still printed "Team is reachable".
    const result = await verifyRoundTrip({ relayUrl: 'ws://127.0.0.1:1', channel, key, timeoutMs: 3000 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('relay-unreachable');
    expect(verifyMessage(result)).toMatch(/relay could not be reached/i);
  });

  test('a black-holed relay times out as unreachable, not as something else', async () => {
    // The refused-connection case above resolves through the socket's error
    // event. This is the OTHER way a relay is unreachable: a firewall that drops
    // packets instead of refusing them, so the handshake just hangs. A plain TCP
    // server that accepts and never speaks WebSocket reproduces it exactly, and
    // it is the only thing that exercises the timeout's own reachability branch.
    const net = await import('net');
    const sockets = new Set();
    // Hold the sockets: server.close() waits on live connections, so without
    // destroying them the test hangs on teardown rather than on the verify —
    // the same trap as the http server's closeAllConnections.
    const silent = net.createServer((sock) => { sockets.add(sock); sock.on('close', () => sockets.delete(sock)); });
    const port = await new Promise((r) => silent.listen(0, '127.0.0.1', () => r(silent.address().port)));
    try {
      const { channel, key } = newPairing();
      const result = await verifyRoundTrip({ relayUrl: `ws://127.0.0.1:${port}`, channel, key, timeoutMs: 1500 });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('relay-unreachable');
    } finally {
      for (const sock of sockets) sock.destroy();
      await new Promise((r) => silent.close(r));
    }
  });

  maybe('relay UP but no host: a phone would meet an empty channel', async () => {
    await startRelay();
    const { channel, key } = newPairing();
    const result = await verifyRoundTrip({ relayUrl: `ws://127.0.0.1:${relayPort}`, channel, key, timeoutMs: 3000 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-host');
    expect(verifyMessage(result)).toMatch(/never attached as the host/i);
  });

  maybe('the local API failing is reported as itself, not as a relay problem', async () => {
    await startRelay();
    api = http.createServer((req, res) => { res.writeHead(503); res.end('{}'); });
    apiPort = await new Promise((r) => api.listen(0, '127.0.0.1', () => r(api.address().port)));
    const { channel, key } = newPairing();
    tunnel = new RemoteTunnel({ relayUrl: `ws://127.0.0.1:${relayPort}`, channel, key, localPort: apiPort });
    tunnel.connect();

    const result = await verifyRoundTrip({ relayUrl: `ws://127.0.0.1:${relayPort}`, channel, key, timeoutMs: 6000 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('api-error');
    expect(verifyMessage(result)).toMatch(/local API/i);
  });
});
