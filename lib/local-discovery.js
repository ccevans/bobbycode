// lib/local-discovery.js
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

/**
 * Parse a docker-compose.yml and extract service info (names, ports, image hints).
 * Returns { composeProject, services: [{ name, ports, image }] }
 */
export function parseComposeFile(composePath) {
  const raw = fs.readFileSync(composePath, 'utf8');
  const doc = YAML.parse(raw);
  if (!doc || !doc.services) return null;

  // Try to detect compose project name from top-level `name:` field
  const composeProject = doc.name || null;

  const services = [];
  for (const [name, svc] of Object.entries(doc.services)) {
    const ports = [];
    if (svc.ports) {
      for (const p of svc.ports) {
        const parsed = parsePortMapping(p);
        if (parsed) ports.push(parsed);
      }
    }
    services.push({
      name,
      image: svc.image || null,
      build: svc.build ? true : false,
      ports,
    });
  }

  return { composeProject, services };
}

/**
 * Parse a docker-compose port mapping like "3010:3000" or "5433:5432/tcp"
 * Returns { host, container } or null
 */
function parsePortMapping(portSpec) {
  const str = typeof portSpec === 'object' ? `${portSpec.published}:${portSpec.target}` : String(portSpec);
  // Strip protocol suffix (e.g., /tcp)
  const clean = str.replace(/\/(tcp|udp)$/, '');
  // Match "host:container" or "host:container" with optional bind address
  const match = clean.match(/(?:[\d.]+:)?(\d+):(\d+)/);
  if (match) return { host: parseInt(match[1], 10), container: parseInt(match[2], 10) };
  // Single port (container only)
  const single = clean.match(/^(\d+)$/);
  if (single) return { host: parseInt(single[1], 10), container: parseInt(single[1], 10) };
  return null;
}

/**
 * Scan a directory for docker-compose files.
 * Returns array of { path, parsed } where parsed is the result of parseComposeFile.
 */
export function findComposeFiles(rootDir) {
  const names = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
  const results = [];

  // Check root
  for (const name of names) {
    const fp = path.join(rootDir, name);
    if (fs.existsSync(fp)) {
      const parsed = parseComposeFile(fp);
      if (parsed) results.push({ path: fp, relativeTo: '.', ...parsed });
    }
  }

  // Check immediate subdirectories (repo dirs)
  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return results;
  }

  const skipDirs = new Set(['node_modules', '.git', '.bobby', '.claude', 'vendor', 'dist', 'build']);
  for (const entry of entries) {
    if (!entry.isDirectory() || skipDirs.has(entry.name) || entry.name.startsWith('.')) continue;
    for (const name of names) {
      const fp = path.join(rootDir, entry.name, name);
      if (fs.existsSync(fp)) {
        const parsed = parseComposeFile(fp);
        if (parsed) results.push({ path: fp, relativeTo: entry.name, ...parsed });
      }
    }
  }

  return results;
}

/**
 * Detect the UI dev server setup from package.json files.
 * Returns { path, devCommand, framework } or null.
 */
export function detectUiProject(rootDir, repos) {
  // Check repo paths first (from .bobbyrc.yml repos config)
  const candidates = [];
  if (repos && repos.length > 0) {
    for (const repo of repos) {
      const repoPath = typeof repo === 'string' ? repo : repo.path;
      candidates.push(repoPath);
    }
  }
  // Also check immediate subdirectories
  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        if (!candidates.includes(entry.name)) candidates.push(entry.name);
      }
    }
  } catch { /* ignore */ }

  // Check root too
  candidates.unshift('.');

  for (const candidate of candidates) {
    const pkgPath = path.join(rootDir, candidate, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;

    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { continue; }

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    let framework = null;
    if (deps.next) framework = 'nextjs';
    else if (deps['react-scripts']) framework = 'create-react-app';
    else if (deps.vite) framework = 'vite';
    else if (deps.react) framework = 'react';

    if (framework) {
      const devCommand = pkg.scripts?.dev ? 'npm run dev' : pkg.scripts?.start ? 'npm start' : null;
      return { path: candidate, devCommand, framework };
    }
  }

  return null;
}

/**
 * Classify compose services into roles (db, redis, web/api, worker).
 */
export function classifyServices(composeServices) {
  const classified = { api: null, db: null, redis: null, workers: [] };

  for (const svc of composeServices) {
    const name = svc.name.toLowerCase();
    const image = (svc.image || '').toLowerCase();

    if (image.includes('postgres') || image.includes('pgvector') || image.includes('mysql') || image.includes('mariadb') || name === 'db' || name === 'database') {
      classified.db = svc;
    } else if (image.includes('redis') || name === 'redis') {
      classified.redis = svc;
    } else if (name === 'web' || name === 'api' || name === 'app' || name === 'server') {
      classified.api = svc;
    } else if (name.includes('worker') || name.includes('sidekiq') || name.includes('celery')) {
      classified.workers.push(svc);
    }
  }

  return classified;
}

/**
 * Build a local profile from discovered infrastructure.
 * Returns a profile object ready for .bobbyrc.yml local block.
 */
export function buildProfileFromDiscovery({ composeResult, classified, uiProject, profileName }) {
  const profile = {
    ports: {},
  };

  // Compose project
  if (composeResult.composeProject) {
    profile.compose_project = composeResult.composeProject;
  }

  // API port from web/api service — prefer common web ports, fall back to first available
  if (classified.api) {
    const commonWebPorts = [3000, 8080, 5000, 4000, 8000, 9000];
    const webPort = classified.api.ports.find(p => commonWebPorts.includes(p.container));
    if (webPort) {
      profile.ports.api = webPort.host;
    } else if (classified.api.ports.length > 0) {
      profile.ports.api = classified.api.ports[0].host;
    }
  }

  // DB port
  if (classified.db) {
    const dbPort = classified.db.ports.find(p => p.host !== p.container);
    if (dbPort) {
      profile.ports.db = dbPort.host;
    } else if (classified.db.ports.length > 0) {
      profile.ports.db = classified.db.ports[0].host;
    }
  }

  // UI port — default to 3001, but use 3002 if API is on 3001, etc.
  if (uiProject) {
    const usedPorts = new Set(Object.values(profile.ports));
    let uiPort = 3001;
    while (usedPorts.has(uiPort)) uiPort++;
    profile.ports.ui = uiPort;
  }

  // Subdomain
  profile.subdomain = profileName;

  return profile;
}

/**
 * Run full discovery on a project root.
 * Returns { composeFiles, uiProject, suggestedProfile } or null if nothing found.
 */
export function discoverLocalSetup(rootDir, config) {
  const composeFiles = findComposeFiles(rootDir);
  const uiProject = detectUiProject(rootDir, config?.repos);

  if (composeFiles.length === 0 && !uiProject) return null;

  // Use the first compose file as primary
  const primary = composeFiles[0] || null;
  let classified = null;
  if (primary) {
    classified = classifyServices(primary.services);
  }

  return {
    composeFiles,
    uiProject,
    primary,
    classified,
  };
}
