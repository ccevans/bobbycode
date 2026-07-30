// lib/license.js
// Offline license verification for Bobby Pro and commercial packs.
//
// Bobby itself is MIT and always will be — this exists so *Pro content* (packs
// and skills, which are separate products) can be sold without a license
// server, an account, or a network call. A key is a signed statement;
// verification is a signature check against a public key we ship.
//
//   key = base64url(payload) + "." + base64url(ed25519 signature)
//
// There is one SKU: Bobby Pro. One key unlocks every paid pack, now and later.
// A pack may still carry its own key (sold standalone), and that keeps working.
//
// The threat model is honest: this stops casual copying and gives buyers a
// clean activation step. Anyone determined can patch an MIT CLI, and that is
// fine — the value is the content and its updates, not the lock.
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import YAML from 'yaml';

/**
 * Resolved per call, not at import — the home directory is not a constant.
 * HOME wins over homedir() so a sandboxed run (tests, CI) cannot write a key
 * into the real user's home. Same rule as lib/studio.js.
 */
export function licenseFile() {
  return path.join(process.env.HOME || os.homedir(), '.bobby', 'licenses.yml');
}

/** The one subscription. Its private key never leaves the seller's machine. */
export const PRO_PRODUCT = 'bobby-pro';
export const PRO_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAQC78iSPoWKCacUuRGIm/5K3/hGsGxV0foSPpPGCL5T8=
-----END PUBLIC KEY-----`;
export const PRO_BUY_URL = 'https://ccevans.gumroad.com/l/bobby-pro';

function b64urlDecode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Verifies a key against a public key. Returns the payload on success, or
 * throws with a message a buyer can act on.
 *
 * `allowExpired` returns the payload for a lapsed-but-genuine key instead of
 * throwing — Pro keeps what you already paid for (see checkPro).
 */
export function verifyKey(key, publicKeyPem, { product = null, allowExpired = false } = {}) {
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
    throw new Error('License key signature could not be checked (is the public key intact?).');
  }
  if (!valid) throw new Error('License key is not valid for this pack.');

  if (product && payload.product !== product) {
    throw new Error(`That key is for "${payload.product}", not "${product}".`);
  }
  if (!allowExpired && payload.expires && new Date(payload.expires) < new Date()) {
    throw new Error(`That license expired on ${payload.expires}.`);
  }
  return payload;
}

/**
 * Is Bobby Pro activated on this machine?
 *
 * A subscription that has lapsed stays `active` — you keep everything your
 * subscription paid for, forever. `lapsed` only means: no new content. That
 * promise is what makes an offline key honest rather than a hostage.
 */
export function checkPro({ proPublicKey = PRO_PUBLIC_KEY } = {}) {
  const stored = readLicenses()[PRO_PRODUCT];
  if (!stored) return { active: false, reason: 'Bobby Pro is not activated on this machine' };
  try {
    const payload = verifyKey(stored, proPublicKey, { product: PRO_PRODUCT, allowExpired: true });
    const until = payload.expires || null;
    return {
      active: true,
      lapsed: Boolean(until && new Date(until) < new Date()),
      until,
      buyer: payload.buyer || null,
      payload,
    };
  } catch (e) {
    return { active: false, reason: e.message };
  }
}

/** Did this pack ship after a lapsed subscription stopped paying for updates? */
function releasedAfter(pack, until) {
  if (!pack.released || !until) return false;
  return new Date(pack.released) > new Date(until);
}

export function readLicenses() {
  try {
    return YAML.parse(fs.readFileSync(licenseFile(), 'utf8')) || {};
  } catch {
    return {};
  }
}

export function saveLicense(product, key) {
  const file = licenseFile();
  const licenses = readLicenses();
  licenses[product] = key;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, YAML.stringify(licenses), 'utf8');
  return file;
}

/**
 * Is this pack usable here? Free packs always are. Paid ones open with a Bobby
 * Pro key (one subscription, every pack) or with their own standalone key.
 */
export function checkPackLicense(pack, { proPublicKey = PRO_PUBLIC_KEY } = {}) {
  const spec = pack.license;
  if (!spec || !(spec.publicKey || spec.pro)) return { ok: true, required: false };

  const product = spec.product || pack.id;

  const pro = checkPro({ proPublicKey });
  if (pro.active) {
    if (!pro.lapsed || !releasedAfter(pack, pro.until)) {
      return { ok: true, required: true, product, via: 'pro', lapsed: pro.lapsed, until: pro.until };
    }
    return {
      ok: false, required: true, product, via: 'pro', pro: true, buy: PRO_BUY_URL,
      reason: `your Bobby Pro updates ended ${pro.until}, and ${pack.id} v${pack.version} shipped after that`,
    };
  }

  // A standalone key for this one pack still works.
  if (spec.publicKey) {
    const stored = readLicenses()[product];
    if (stored) {
      try {
        const payload = verifyKey(stored, spec.publicKey, { product });
        return { ok: true, required: true, product, via: 'pack', payload };
      } catch (e) {
        return { ok: false, required: true, product, reason: e.message, buy: spec.buy || PRO_BUY_URL };
      }
    }
  }

  return {
    ok: false, required: true, product, pro: Boolean(spec.pro),
    reason: spec.pro ? pro.reason : 'no license key activated',
    buy: spec.buy || PRO_BUY_URL,
  };
}

/** The message shown when paid content is used without a key. */
export function licenseHelp(status) {
  const lines = [
    status.pro
      ? `Bobby Pro unlocks this pack — ${status.reason}.`
      : `This pack requires a license — ${status.reason}.`,
  ];
  if (status.buy) lines.push(status.pro ? `Get Bobby Pro: ${status.buy}` : `Buy a key: ${status.buy}`);
  lines.push(status.pro ? 'Then run: bobby pro activate <key>' : 'Then run: bobby pack activate <key>');
  return lines.join('\n  ');
}

/**
 * Activates a key: Bobby Pro first, then any installed pack that claims it.
 * Returns what was unlocked; throws a message naming every thing it tried.
 */
export function activateKey(key, packs = [], { proPublicKey = PRO_PUBLIC_KEY } = {}) {
  const tried = [];
  try {
    const payload = verifyKey(key, proPublicKey, { product: PRO_PRODUCT, allowExpired: true });
    return { pro: true, product: PRO_PRODUCT, payload, file: saveLicense(PRO_PRODUCT, key) };
  } catch (e) {
    tried.push(`Bobby Pro: ${e.message}`);
  }

  for (const pack of packs.filter((p) => p.license && p.license.publicKey)) {
    const product = pack.license.product || pack.id;
    try {
      const payload = verifyKey(key, pack.license.publicKey, { product });
      return { pro: false, product, pack, payload, file: saveLicense(product, key) };
    } catch (e) {
      tried.push(`${pack.id}: ${e.message}`);
    }
  }

  throw new Error(`That key did not match Bobby Pro or any installed pack.\n  ${tried.join('\n  ')}`);
}
