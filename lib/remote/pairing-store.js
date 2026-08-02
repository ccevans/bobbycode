// lib/remote/pairing-store.js
// Where remote pairings live: under the user's home, never inside the repo.
// `.bobby/` is committed (tickets are meant to be); the channel key must not
// be, so it does not get the choice.
//
// Two shapes coexist here:
//   - studio.yml            ONE channel+key for the whole machine. Pair a
//                           phone once and every project rides that channel
//                           (frames carry a projectId — see tunnel.js).
//   - <hash(project)>.yml   the legacy per-project pairing. Kept readable so
//                           an already-paired phone survives the upgrade: the
//                           first project to run `bobby remote` donates its
//                           channel+key as the studio identity.
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import YAML from 'yaml';
import { newPairing } from './crypto.js';

function homeDir() {
  return process.env.HOME || os.homedir();
}

function fileFor(root) {
  const hash = crypto.createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
  return path.join(homeDir(), '.bobby', 'remote', `${hash}.yml`);
}

/** Load this project's pairing, creating one on first use. */
export function loadOrCreatePairing(root, { rotate = false } = {}) {
  const file = fileFor(root);
  if (!rotate && fs.existsSync(file)) {
    const saved = YAML.parse(fs.readFileSync(file, 'utf8'));
    if (saved?.channel && saved?.key) {
      return { channel: saved.channel, key: Buffer.from(saved.key, 'base64'), file, created: false };
    }
  }
  const fresh = newPairing();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, YAML.stringify({
    project: path.resolve(root),
    channel: fresh.channel,
    key: fresh.key.toString('base64'),
    created: new Date().toISOString(),
  }), { mode: 0o600 });
  return { channel: fresh.channel, key: fresh.key, file, created: true };
}

function studioFile() {
  return path.join(homeDir(), '.bobby', 'remote', 'studio.yml');
}

/** Read a saved pairing file; null if absent or malformed. */
function readPairingFile(file) {
  if (!fs.existsSync(file)) return null;
  const saved = YAML.parse(fs.readFileSync(file, 'utf8'));
  if (!saved?.channel || !saved?.key) return null;
  return { channel: saved.channel, key: Buffer.from(saved.key, 'base64') };
}

/**
 * Load the machine-wide studio pairing, creating one on first use.
 *
 * Migration: if there is no studio.yml yet but `migrateFrom` (a project root)
 * has a legacy per-project pairing, that channel+key becomes the studio
 * identity — so a phone paired before pair-once keeps working untouched.
 *
 * `rotate` mints a fresh identity: every project cuts over together and every
 * previously paired phone is out. Deliberate and rare, by design.
 */
export function loadOrCreateStudioPairing({ rotate = false, migrateFrom = null } = {}) {
  const file = studioFile();
  if (!rotate) {
    const saved = readPairingFile(file);
    if (saved) return { ...saved, file, created: false, migrated: false };
    const legacy = migrateFrom ? readPairingFile(fileFor(migrateFrom)) : null;
    if (legacy) {
      writeStudioFile(file, legacy);
      return { ...legacy, file, created: true, migrated: true };
    }
  }
  const fresh = newPairing();
  writeStudioFile(file, fresh);
  return { channel: fresh.channel, key: fresh.key, file, created: true, migrated: false };
}

function writeStudioFile(file, { channel, key }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, YAML.stringify({
    channel,
    key: Buffer.from(key).toString('base64'),
    created: new Date().toISOString(),
  }), { mode: 0o600 });
}
