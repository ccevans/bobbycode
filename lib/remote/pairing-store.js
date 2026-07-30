// lib/remote/pairing-store.js
// Where a project's remote pairing lives: under the user's home, never inside
// the repo. `.bobby/` is committed (tickets are meant to be); the channel key
// must not be, so it does not get the choice.
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
