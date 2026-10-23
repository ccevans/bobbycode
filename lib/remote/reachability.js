// lib/remote/reachability.js — can a phone actually use this link? (BOB-064)
//
// `bobby remote` printed "Team is reachable" unconditionally, immediately after
// tunnel.connect(), which does not block. The tool's own log had the verdict on
// line 12 and "relay connected" on line 14. Two separate claims were being made
// and neither was checked.
//
// THE EXPENSIVE ONE is the second. Every relay frame is AES-256-GCM via
// crypto.subtle, and browsers expose Web Crypto only in a SECURE CONTEXT — https
// or localhost. Measured on a real iPhone:
//
//     http://192.168.1.209:8790   isSecureContext=false   crypto.subtle=false
//     http://127.0.0.1:8790       isSecureContext=true    crypto.subtle=true
//
// So `--app http://<lan-ip>` produces a QR that cannot work on ANY phone, ever,
// and it was printed under a green tick. The phone then failed at importKey, and
// because that happens inside the pairing path the app blamed the paste — sending
// the user to re-copy a string that was always correct. Forty minutes.
//
// `bobby remote` holds both URLs at print time, so this is decidable before a
// single frame is sent. Kept pure and separate from the I/O so it can be tested
// exhaustively, the way lib/dashboard/connection.js is.

/** Hosts a browser treats as a secure context over plain http. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLoopbackHost(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  // `.localhost` is reserved for loopback and browsers honour it.
  return LOOPBACK.has(h) || h.endsWith('.localhost');
}

/**
 * Is this URL usable by a browser that needs crypto.subtle?
 *
 * https/wss always. http/ws only on loopback, where browsers grant a secure
 * context anyway — which is why testing on the same machine "works" and hides
 * this entirely.
 */
export function isSecureContextUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol === 'https:' || u.protocol === 'wss:') return true;
  if (u.protocol === 'http:' || u.protocol === 'ws:') return isLoopbackHost(u.hostname);
  return false;
}

/**
 * Why a phone cannot use this pairing link, or null when it can.
 *
 * Returns the message rather than a boolean: the whole point of the ticket is
 * that the tool knew the answer and did not say it. Naming the fix is part of
 * the answer — "this will not work" without "do this instead" is the same
 * forty minutes with a different first step.
 */
export function pairingBlocker({ appUrl, relayUrl }) {
  if (appUrl && !isSecureContextUrl(appUrl)) {
    return `That link cannot pair from a phone: ${appUrl} is http:// on the network, and ` +
      'browsers only expose the Web Crypto this uses over https (or on localhost). ' +
      'A phone will fail at the key import and blame your paste.\n' +
      '  Fix: put it behind TLS — a named tunnel (cloudflared) or a hosted relay — ' +
      'and pass that https:// address as --app.';
  }
  if (relayUrl && !isSecureContextUrl(relayUrl)) {
    return `That link cannot pair from a phone: the relay ${relayUrl} is ws:// on the ` +
      'network, and iOS App Transport Security refuses cleartext WebSockets outright.\n' +
      '  Fix: front the relay with TLS and pass the wss:// address as --relay.';
  }
  return null;
}
