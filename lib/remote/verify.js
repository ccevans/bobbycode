// lib/remote/verify.js — prove the path instead of asserting it (BOB-064).
//
// The old code printed "Team is reachable" straight after tunnel.connect(),
// which does not block, so the verdict landed two lines before "relay
// connected" in its own log. If the relay was down it still printed, with a QR
// underneath.
//
// This is the ~30 lines that had to be written by hand on the night the bug was
// found, just to learn the truth: attach to the relay as a CLIENT, exactly as a
// phone does, and complete one encrypted round trip against /api/health. It uses
// the same crypto and the same frame shape as lib/remote/tunnel.js, so a pass
// means the phone's path works end to end — relay reachable, host attached,
// key correct, and the local API answering.
//
// A green tick that is printed rather than earned is worse than no tick: it
// sends the user looking for the problem somewhere else.
import { WebSocket } from 'ws';
import { encrypt, decrypt } from './crypto.js';

export const VERIFY_TIMEOUT_MS = 8000;

/**
 * Complete one encrypted round trip as a client would.
 *
 * @returns {Promise<{ok: true, status: number} | {ok: false, reason: string, detail?: string}>}
 *
 * Never throws and never rejects: every failure is a reason the CLI prints. The
 * reasons are distinguished because their fixes are different — a relay that is
 * down is a hosting problem, a host that never attaches means `bobby remote` is
 * not actually serving, and a round trip that times out means frames are not
 * getting through.
 */
export function verifyRoundTrip({ relayUrl, channel, key, timeoutMs = VERIFY_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    let ws;
    let settled = false;
    let sawHost = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws?.close(); } catch { /* already gone */ }
      resolve(result);
    };

    const timer = setTimeout(() => {
      // Which stage we reached decides which of three different problems it is.
      if (!ws || ws.readyState !== WebSocket.OPEN) return done({ ok: false, reason: 'relay-unreachable' });
      if (!sawHost) return done({ ok: false, reason: 'no-host' });
      done({ ok: false, reason: 'no-response' });
    }, timeoutMs);

    try { ws = new WebSocket(relayUrl); }
    catch (e) { return done({ ok: false, reason: 'relay-unreachable', detail: e.message }); }

    ws.on('error', (e) => done({ ok: false, reason: 'relay-unreachable', detail: e.message }));

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'attach', channel, role: 'client', v: 1 }));
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }

      if (msg.type === 'error') return done({ ok: false, reason: 'relay-refused', detail: msg.error });

      // The relay reports whether the host is attached. No host means nothing
      // will ever answer, so say that rather than waiting out the timeout.
      if (msg.type === 'presence') {
        if (!msg.host) return;             // wait: `bobby remote` may still be attaching
        if (sawHost) return;
        sawHost = true;
        ws.send(JSON.stringify({
          type: 'frame',
          data: encrypt(key, { t: 'req', id: 'verify', method: 'GET', path: '/api/health' }),
        }));
        return;
      }

      if (msg.type === 'frame') {
        let frame;
        // A decrypt failure here is the one thing that cannot be a network
        // problem: the frame arrived and the key does not match it.
        try { frame = decrypt(key, msg.data); }
        catch { return done({ ok: false, reason: 'key-mismatch' }); }
        if (frame.t === 'res' && frame.id === 'verify') {
          return done(frame.status === 200
            ? { ok: true, status: frame.status }
            : { ok: false, reason: 'api-error', detail: `local API answered ${frame.status}` });
        }
      }
    });
  });
}

/** What the CLI should say for each failure. Separate so it can be tested. */
export function verifyMessage(result) {
  if (result.ok) return null;
  const detail = result.detail ? ` (${result.detail})` : '';
  switch (result.reason) {
    case 'relay-unreachable':
      return `The relay could not be reached${detail}. Nothing can pair until it is up — ` +
        'check the address, or start one with `bobby remote --relay`.';
    case 'relay-refused':
      return `The relay refused the connection${detail}.`;
    case 'no-host':
      return 'The relay is up but this machine never attached as the host, so a phone ' +
        'would connect to an empty channel. This is a bug in `bobby remote` itself — ' +
        'please report it with the log above.';
    case 'no-response':
      return 'The relay and the host are both connected, but an encrypted round trip ' +
        'did not come back. Frames are not getting through.';
    case 'key-mismatch':
      return 'A frame came back that this pairing key cannot decrypt — the channel is ' +
        'in use by a different pairing. Rotate with `bobby remote --new-code`.';
    case 'api-error':
      return `The relay path works, but the local API did not answer${detail}. ` +
        'Is `bobby app` running on this machine?';
    default:
      return `Could not verify the connection${detail}.`;
  }
}
