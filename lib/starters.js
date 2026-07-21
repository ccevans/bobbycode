// lib/starters.js
// Built-in project starters — tiny, dependency-free app skeletons Bobby drops
// into a new project so `bobby new` produces something that actually runs.
// Each starter maps 1:1 to a stack preset (stacks/<name>.json) that configures
// matching dev/test commands. Add a starter by creating templates/starters/<name>/
// plus stacks/<name>.json and an entry here.
import { renderTemplateDir } from './template.js';

export const STARTERS = {
  node: {
    label: 'Node HTTP API',
    dev: 'npm run dev',
    test: 'npm test',
    url: 'http://localhost:3000',
    summary: 'A dependency-free Node HTTP server with GET / and GET /health, plus tests.',
  },
  web: {
    label: 'Static web page',
    dev: 'npm run dev',
    test: 'npm test',
    url: 'http://localhost:3000',
    summary: 'A static index.html served by a tiny dependency-free Node server, plus a smoke test.',
  },
};

export function hasStarter(name) {
  return Object.prototype.hasOwnProperty.call(STARTERS, name);
}

export function getStarter(name) {
  return STARTERS[name] || null;
}

/**
 * Render the starter's files into the project root. `vars` supplies EJS values
 * (project, idea). No-op for stacks without a built-in starter.
 * Returns the starter metadata, or null if none applied.
 */
export function applyStarter(name, root, vars) {
  if (!hasStarter(name)) return null;
  renderTemplateDir(`starters/${name}`, root, vars);
  return STARTERS[name];
}
