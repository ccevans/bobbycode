// lib/studio-workspace.js
// Editor scaffolding for a studio (BOB-153).
//
// Bobby scaffolds for agents — lib/targets covers claude-code, cursor, copilot
// and the rest — but never for the editor the human sits in. For a studio that
// matters: the useful VS Code config is non-obvious (git has to scan two levels
// deep or repos under repos/ never reach Source Control; watcher excludes are
// what keep a studio with large repos usable) and there is no single place that
// lists what the studio holds. This module derives all of it from .bobbyrc.yml
// and the boards, so it stays true as the studio changes. Re-runnable.
import fs from 'fs';
import path from 'path';
import { listStudioProjects } from './config.js';
import { readStudioConfig, readProjectConfig, getActiveProject, listRepos } from './studio.js';
import { listTickets } from './tickets.js';

// Per-stack noise. Every stack gets the shared set; a stack adds what its
// toolchain leaves lying around. Search and watcher get the same list — a path
// not worth searching is not worth watching either.
const SHARED_NOISE = ['**/node_modules', '**/dist', '**/build', '**/coverage', '**/tmp', '**/test-evidence', '**/.bobby/*/sessions'];
const STACK_NOISE = {
  nextjs: ['**/.next', '**/*.tsbuildinfo'],
  rails: ['**/vendor/bundle', '**/log', '**/storage'],
  'rails-react': ['**/vendor/bundle', '**/log', '**/storage', '**/.next'],
  django: ['**/__pycache__', '**/.venv', '**/staticfiles'],
  'python-flask': ['**/__pycache__', '**/.venv'],
  go: ['**/bin'],
  rust: ['**/target'],
};

// Extension recommendations by stack. Kept to the widely-used, first-party or
// de-facto-standard ones — a recommendation the user has to dismiss is worse
// than none.
const SHARED_EXTENSIONS = ['anthropic.claude-code', 'redhat.vscode-yaml'];
const STACK_EXTENSIONS = {
  nextjs: ['dbaeumer.vscode-eslint', 'esbenp.prettier-vscode'],
  rails: ['shopify.ruby-lsp'],
  'rails-react': ['shopify.ruby-lsp', 'dbaeumer.vscode-eslint', 'esbenp.prettier-vscode'],
  django: ['ms-python.python'],
  'python-flask': ['ms-python.python'],
  go: ['golang.go'],
  rust: ['rust-lang.rust-analyzer'],
};

const uniq = (arr) => [...new Set(arr)];

/** Every stack in the repo group, deduped. */
function stacksOf(root) {
  return uniq(listRepos(root).map(r => r.stack).filter(s => s && s !== '—'));
}

/**
 * The VS Code settings a studio wants. Pure — takes the studio root, returns an
 * object — so it can be tested without touching .vscode/.
 */
export function buildSettings(root) {
  const noise = uniq([...SHARED_NOISE, ...stacksOf(root).flatMap(s => STACK_NOISE[s] || [])]).sort();
  const toMap = (globs, suffix = '') => Object.fromEntries(globs.map(g => [g + suffix, true]));
  return {
    // Repos live at repos/<name>: one level down. Default scan depth is 1, which
    // finds nothing under repos/ and leaves Source Control empty for every repo.
    'git.repositoryScanMaxDepth': 2,
    'git.autoRepositoryDetection': true,
    'git.detectSubmodules': false,
    'search.exclude': toMap(noise),
    'files.watcherExclude': { ...toMap(noise, '/**'), '**/.git/objects/**': true },
    'search.followSymlinks': false,
    'explorer.fileNesting.enabled': true,
    'explorer.fileNesting.patterns': {
      'package.json': 'package-lock.json, bun.lock, yarn.lock, pnpm-lock.yaml',
      'tsconfig.json': 'tsconfig.*.json, *.tsbuildinfo',
      '.bobbyrc.yml': 'STUDIO.md, conductor.json, CLAUDE.md, AGENTS.md',
    },
  };
}

export function buildExtensions(root) {
  return { recommendations: uniq([...SHARED_EXTENSIONS, ...stacksOf(root).flatMap(s => STACK_EXTENSIONS[s] || [])]) };
}

/**
 * Everything the studio holds, as data. This is the source for STUDIO.md and
 * is exported on its own so a dashboard or a test can use the same view.
 */
export function studioIndex(root) {
  const cfg = readStudioConfig(root);
  const active = getActiveProject(root);
  const repos = listRepos(root).map(r => {
    const e = cfg.repos[r.name];
    return { name: r.name, stack: r.stack, path: r.path, url: (e && e.url) || null };
  });
  const projects = listStudioProjects(root).map(name => {
    const pc = readProjectConfig(root, name);
    const tickets = listTickets(path.join(root, '.bobby', name, 'tickets'));
    const byStage = {};
    for (const t of tickets) byStage[t.stage || 'unknown'] = (byStage[t.stage || 'unknown'] || 0) + 1;
    return { name, prefix: pc.prefix || null, repos: pc.repos || [], active: name === active, tickets: tickets.length, byStage };
  });
  return { studio: cfg.studio, projects, repos };
}

// Stage order for the per-project breakdown. Anything not listed trails, sorted.
const STAGE_ORDER = ['backlog', 'planning', 'building', 'reviewing', 'testing', 'shipping', 'done', 'blocked'];

function stageLine(byStage) {
  const known = STAGE_ORDER.filter(s => byStage[s]).map(s => `${s} ${byStage[s]}`);
  const rest = Object.keys(byStage).filter(s => !STAGE_ORDER.includes(s)).sort().map(s => `${s} ${byStage[s]}`);
  return [...known, ...rest].join(' · ') || '—';
}

/** STUDIO.md — the human-readable index. Regenerated in full each run. */
export function renderIndex(index) {
  const lines = [];
  lines.push(`# ${index.studio}`);
  lines.push('');
  lines.push(`_Generated by \`bobby studio workspace\` — re-run it after adding a project or repo. Do not edit by hand._`);
  lines.push('');
  lines.push(`## Projects (${index.projects.length})`);
  lines.push('');
  lines.push('| | Project | Prefix | Tickets | By stage | Repos |');
  lines.push('|---|---|---|---|---|---|');
  for (const p of index.projects) {
    lines.push(`| ${p.active ? '★' : ''} | **${p.name}** | \`${p.prefix || '—'}\` | ${p.tickets} | ${stageLine(p.byStage)} | ${p.repos.map(r => `\`${r}\``).join(', ') || '—'} |`);
  }
  lines.push('');
  lines.push('★ = active project (`bobby project use <name>` to switch)');
  lines.push('');
  lines.push(`## Repo group (${index.repos.length})`);
  lines.push('');
  lines.push('| Repo | Stack | Path | Origin |');
  lines.push('|---|---|---|---|');
  for (const r of index.repos) {
    lines.push(`| **${r.name}** | ${r.stack} | \`${r.path}\` | ${r.url ? `\`${r.url}\`` : '_none — cannot be restored by `bobby studio setup`_'} |`);
  }
  lines.push('');
  lines.push('## Layout');
  lines.push('');
  lines.push('```');
  lines.push(`${index.studio}/`);
  lines.push('├── .bobby/<project>/   one board per project (tickets, sessions, docs, sprints)');
  lines.push('├── repos/<name>/       the shared repo group — every project draws from it');
  lines.push('└── worktrees/          where agents work; never inside a repo');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

/** Read JSON if present, else {}. Comments are not supported — settings written here have none. */
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

/**
 * Write the workspace. Idempotent: settings.json is MERGED (Bobby's keys win,
 * everything else the user added is kept), extensions are unioned, STUDIO.md is
 * regenerated whole because it is entirely derived.
 * Returns what was written so the command can report it.
 */
export function writeWorkspace(root, { dryRun = false } = {}) {
  const vscode = path.join(root, '.vscode');
  const settingsPath = path.join(vscode, 'settings.json');
  const extPath = path.join(vscode, 'extensions.json');
  const indexPath = path.join(root, 'STUDIO.md');

  const settings = { ...readJson(settingsPath), ...buildSettings(root) };
  const existingExt = readJson(extPath).recommendations || [];
  const extensions = { recommendations: uniq([...existingExt, ...buildExtensions(root).recommendations]) };
  const index = studioIndex(root);
  const md = renderIndex(index);

  if (!dryRun) {
    fs.mkdirSync(vscode, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    fs.writeFileSync(extPath, JSON.stringify(extensions, null, 2) + '\n');
    fs.writeFileSync(indexPath, md);
  }
  return {
    files: [path.relative(root, settingsPath), path.relative(root, extPath), path.relative(root, indexPath)],
    index, settings, extensions,
  };
}
