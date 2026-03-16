// lib/license.js
import fs from 'fs';
import path from 'path';
import os from 'os';

function bobbyDir() { return path.join(process.env.HOME || os.homedir(), '.bobby'); }
function licenseFile() { return path.join(bobbyDir(), 'license'); }
function cacheFile() { return path.join(bobbyDir(), 'license-cache.json'); }
const PRO_COMMANDS = ['dashboard', 'velocity', 'report', 'skills'];
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_HARD_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class LicenseError extends Error {
  constructor(message) { super(message); this.name = 'LicenseError'; }
}

export function readLicenseKey() {
  if (!fs.existsSync(licenseFile())) return null;
  return fs.readFileSync(licenseFile(), 'utf8').trim() || null;
}

export function saveLicenseKey(key) {
  fs.mkdirSync(bobbyDir(), { recursive: true });
  fs.writeFileSync(licenseFile(), key, 'utf8');
}

async function validateKeyOnline(key) {
  // TODO: Hit Lemonsqueezy API to validate
  // For now, accept any non-empty key
  return key && key.length > 0;
}

function readCache() {
  if (!fs.existsSync(cacheFile())) return null;
  try {
    return JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
  } catch { return null; }
}

function writeCache(valid) {
  fs.mkdirSync(bobbyDir(), { recursive: true });
  fs.writeFileSync(cacheFile(), JSON.stringify({ valid, timestamp: Date.now() }), 'utf8');
}

async function validateKey(key) {
  const cache = readCache();
  if (cache) {
    const age = Date.now() - cache.timestamp;
    if (age < CACHE_TTL_MS) return cache.valid;
    // Stale cache — try online, fall back to cache if offline (within hard expire)
    try {
      const valid = await validateKeyOnline(key);
      writeCache(valid);
      return valid;
    } catch {
      if (age < CACHE_HARD_EXPIRE_MS) return cache.valid;
      return false;
    }
  }
  // No cache — must validate online
  try {
    const valid = await validateKeyOnline(key);
    writeCache(valid);
    return valid;
  } catch {
    return false;
  }
}

export async function proGuard(cmd) {
  if (!PRO_COMMANDS.includes(cmd)) return true;
  const key = readLicenseKey();
  if (!key) {
    throw new LicenseError('Pro feature. Get a license at bobby.dev\nThen run: bobby activate <key>');
  }
  if (!await validateKey(key)) {
    throw new LicenseError('License expired or invalid. Renew at bobby.dev');
  }
  return true;
}
