// lib/config.js
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

const CONFIG_FILE = '.bobbyrc.yml';

const DEFAULTS = {
  bobby_dir: '.bobby',
  ticket_prefix: 'TKT',
  idea_prefix: 'IDEA',
  health_checks: [],
  areas: [],
  skill_routing: {},
};

export function readConfig(rootDir) {
  const configPath = path.join(rootDir, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error('Not a Bobby project. Run `bobby init` first.');
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = YAML.parse(raw) || {};
  const merged = { ...DEFAULTS, ...parsed };

  // Derive tickets_dir and runs_dir from bobby_dir unless explicitly set
  const bobbyDir = merged.bobby_dir;
  if (!parsed.tickets_dir) merged.tickets_dir = `${bobbyDir}/tickets`;
  if (!parsed.runs_dir) merged.runs_dir = `${bobbyDir}/runs`;

  return merged;
}

export function writeConfig(rootDir, config) {
  const configPath = path.join(rootDir, CONFIG_FILE);
  const content = YAML.stringify(config, { lineWidth: 120 });
  fs.writeFileSync(configPath, content, 'utf8');
}

export function configExists(rootDir) {
  return fs.existsSync(path.join(rootDir, CONFIG_FILE));
}

export function findProjectRoot(startDir = process.cwd()) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, CONFIG_FILE))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('Not a Bobby project. Run `bobby init` first.');
}
