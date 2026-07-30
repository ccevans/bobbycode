// lib/remote/crypto.js
// End-to-end encryption for `bobby remote`.
//
// The relay between your phone and this machine is a dumb pipe by design: it
// forwards ciphertext it cannot read. That is not a nicety — it means the
// relay operator (us, someday) is not a party you have to trust with a channel
// that can run agents on your machine.
//
// Scheme: a 256-bit key is generated here and travels to the phone inside the
// pairing code (QR / copy-paste) — out of band, never through the relay. Every
// frame is AES-256-GCM with a fresh random nonce. No handshake, no accounts,
// nothing stored server-side.
import crypto from 'crypto';

const VERSION = 1;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const fromB64url = (str) => Buffer.from(str, 'base64url');

/** A new channel identity: id (public, routes frames) + key (secret). */
export function newPairing() {
  return {
    channel: crypto.randomBytes(12).toString('hex'),
    key: crypto.randomBytes(32),
  };
}

/**
 * The string the phone receives. Self-contained: version, channel, key, and
 * the relay to meet at — so pairing is one paste even off the default relay.
 */
export function encodePairingCode({ channel, key, relay }) {
  return b64url(JSON.stringify({ v: VERSION, c: channel, k: b64url(key), r: relay }));
}

export function decodePairingCode(code) {
  let parsed;
  try {
    parsed = JSON.parse(fromB64url(String(code).trim()).toString('utf8'));
  } catch {
    throw new Error('That does not look like a pairing code.');
  }
  if (parsed.v !== VERSION) throw new Error(`Pairing code version ${parsed.v} is not supported.`);
  if (!parsed.c || !parsed.k || !parsed.r) throw new Error('Pairing code is missing fields.');
  return { channel: parsed.c, key: fromB64url(parsed.k), relay: parsed.r };
}

/** obj → base64url( nonce(12) | tag(16) | ciphertext ). */
export function encrypt(key, obj) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return b64url(Buffer.concat([nonce, cipher.getAuthTag(), ct]));
}

/** Inverse of encrypt. Throws on tamper — GCM authenticates before revealing. */
export function decrypt(key, data) {
  const buf = fromB64url(data);
  if (buf.length < 29) throw new Error('Frame too short to be genuine.');
  const nonce = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  let plain;
  try {
    plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('Frame failed authentication — wrong key or tampered data.');
  }
  return JSON.parse(plain.toString('utf8'));
}
