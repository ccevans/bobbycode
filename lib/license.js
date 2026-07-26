// lib/license.js
// Offline license verification for commercial packs.
//
// Bobby itself is MIT and always will be — this exists so *packs* (which are
// separate products) can be sold without a license server, an account, or a
// network call. A key is a signed statement; verification is a signature check
// against the public key the pack itself carries.
//
//   key = base64url(payload) + "." + base64url(ed25519 signature)
//
// The threat model is honest: this stops casual copying and gives buyers a
// clean activation step. Anyone determined can patch an MIT CLI, and that is
// fine — the pack's value is the content and its updates, not the lock.
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import YAML from 'yaml';

export const LICENSE_FILE = path.join(os.homedir(), '.bobby', 'licenses.yml');

function b64urlDecode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Verifies a key against a pack's public key. Returns the payload on success,
 * or throws with a message a buyer can act on.
 */
export function verifyKey(key, publicKeyPem, { product = null } = {}) {
  if (typeof key !== 'string' || !key.includes('.')) {
    throw new Error('That does not look like a license key (expected <payload>.<signature>).');
  }
  const [payloadPart, signaturePart] = key.trim().split('.');

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(payloadPart).toString('utf8'));
  } catch {
    throw new Error('License key is malformed — check for a truncated or wrapped copy/paste.');
  }

  let valid = false;
  try {
    valid = crypto.verify(
      null,
      Buffer.from(payloadPart),
      crypto.createPublicKey(publicKeyPem),
      b64urlDecode(signaturePart),
    );
  } catch {
    throw new Error('License key signature could not be checked (is the pack\'s public key intact?).');
  }
  if (!valid) throw new Error('License key is not valid for this pack.');

  if (product && payload.product !== product) {
    throw new Error(`That key is for "${payload.product}", not "${product}".`);
  }
  if (payload.expires && new Date(payload.expires) < new Date()) {
    throw new Error(`That license expired on ${payload.expires}.`);
  }
  return payload;
}

export function readLicenses() {
  try {
    return YAML.parse(fs.readFileSync(LICENSE_FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

export function saveLicense(product, key) {
  const licenses = readLicenses();
  licenses[product] = key;
  fs.mkdirSync(path.dirname(LICENSE_FILE), { recursive: true });
  fs.writeFileSync(LICENSE_FILE, YAML.stringify(licenses), 'utf8');
  return LICENSE_FILE;
}

/**
 * Is this pack usable here? Unlicensed packs are always usable; licensed ones
 * need a stored key that verifies against the pack's own public key.
 */
export function checkPackLicense(pack) {
  const spec = pack.license;
  if (!spec || !spec.publicKey) return { ok: true, required: false };

  const product = spec.product || pack.id;
  const stored = readLicenses()[product];
  if (!stored) {
    return { ok: false, required: true, product, reason: 'no license key activated', buy: spec.buy || null };
  }
  try {
    const payload = verifyKey(stored, spec.publicKey, { product });
    return { ok: true, required: true, product, payload };
  } catch (e) {
    return { ok: false, required: true, product, reason: e.message, buy: spec.buy || null };
  }
}

/** The message shown when a licensed pack is used without a key. */
export function licenseHelp(status) {
  const lines = [`This pack requires a license — ${status.reason}.`];
  if (status.buy) lines.push(`Buy a key: ${status.buy}`);
  lines.push(`Then run: bobby pack activate <key>`);
  return lines.join('\n  ');
}
