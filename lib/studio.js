// lib/studio.js
// The studio registry — one solo builder, many projects. Any bobby command
// run inside a project upserts it into ~/.bobby/projects.yml, so cross-project
// commands (bobby projects, bobby brief --all) know every board without setup.
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { findProjectRoot, readConfig } from './config.js';

function bobbyHome() {
  return path.join(process.env.HOME || os.homedir(), '.bobby');
}

export function registryFile() {
  return path.join(bobbyHome(), 'projects.yml');
}

export function inboxFile() {
  return path.join(bobbyHome(), 'inbox.yml');
}

function readRegistry() {
  const file = registryFile();
  if (!fs.existsSync(file)) return [];
  let data;
  try {
    data = YAML.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    // A corrupt registry (e.g. from a torn concurrent write) must never brick
    // every command that touches it. Treat it as empty; the next writeRegistry
    // rewrites a clean file and the project re-registers on its next command.
    return [];
  }
  return Array.isArray(data.projects) ? data.projects : [];
}

function writeRegistry(projects) {
  const dir = bobbyHome();
  fs.mkdirSync(dir, { recursive: true });
  // Write to a unique temp file, then atomically rename into place. rename(2)
  // is atomic on POSIX, so a concurrent reader always sees a whole file — never
  // the half-written state that previously corrupted ~/.bobby/projects.yml.
  const tmp = path.join(dir, `.projects.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, YAML.stringify({ projects }, { lineWidth: 120 }), 'utf8');
    fs.renameSync(tmp, registryFile());
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw err;
  }
}

/**
 * Record the current project (if any) in the studio registry.
 * Silent no-op outside a project or on any error — must never break a command.
 */
export function touchProject(startDir = process.cwd()) {
  let root, config;
  try {
    root = findProjectRoot(startDir);
    config = readConfig(root);
  } catch {
    return null; // not in a project — nothing to record
  }
  const projects = readRegistry();
  const now = new Date().toISOString();
  const existing = projects.find(p => p.path === root);
  if (existing) {
    existing.name = config.project || existing.name || path.basename(root);
    existing.last_touched = now;
  } else {
    projects.push({ name: config.project || path.basename(root), path: root, last_touched: now });
  }
  writeRegistry(projects);
  return root;
}

/**
 * List registered projects, newest-touched first. Prunes paths that no longer
 * exist (or are no longer bobby projects) and persists the pruned list.
 */
export function listProjects() {
  const projects = readRegistry();
  const alive = projects.filter(p =>
    p.path && fs.existsSync(path.join(p.path, '.bobbyrc.yml'))
  );
  if (alive.length !== projects.length) writeRegistry(alive);
  return alive.sort((a, b) => (b.last_touched || '').localeCompare(a.last_touched || ''));
}
