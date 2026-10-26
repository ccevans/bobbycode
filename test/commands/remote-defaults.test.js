// test/commands/remote-defaults.test.js — BOB-091.
//
// The shipped defaults are the hosted relay: TLS at the edge, one origin
// serving both the app and the wss:// channel. This pins the BOB-064 promise
// so an insecure default can never ship again — the exact failure that cost
// forty minutes on a real iPhone was a default no phone could ever use.
import { isSecureContextUrl, pairingBlocker } from '../../lib/remote/reachability.js';

describe('bobby remote shipped defaults (BOB-091)', () => {
  let DEFAULT_RELAY, DEFAULT_APP;

  beforeAll(async () => {
    // The constants read these env vars at import time; a developer's local
    // overrides must not decide what this test pins.
    delete process.env.BOBBY_RELAY_URL;
    delete process.env.BOBBY_APP_URL;
    ({ DEFAULT_RELAY, DEFAULT_APP } = await import('../../commands/remote.js'));
  });

  test('both defaults are secure-context URLs a phone can use', () => {
    expect(isSecureContextUrl(DEFAULT_RELAY)).toBe(true);
    expect(isSecureContextUrl(DEFAULT_APP)).toBe(true);
  });

  test('the default pair survives the BOB-064 blocker a real link runs through', () => {
    expect(pairingBlocker({ appUrl: DEFAULT_APP + '/#x', relayUrl: DEFAULT_RELAY })).toBeNull();
  });

  test('the defaults are the HOSTED relay, not loopback — wss/https, one origin', () => {
    // Loopback ws:// is also a secure context, which is exactly how an
    // unusable default could sneak back in under the two checks above.
    expect(new URL(DEFAULT_RELAY).protocol).toBe('wss:');
    expect(new URL(DEFAULT_APP).protocol).toBe('https:');
    // Single-origin deploy: the relay serves the app from the same host, so
    // one TLS endpoint covers both surfaces (hq/fly.toml).
    expect(new URL(DEFAULT_APP).host).toBe(new URL(DEFAULT_RELAY).host);
  });
});
