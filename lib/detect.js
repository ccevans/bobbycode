// lib/detect.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Detect project context from existing files in rootDir.
 * Returns { name, stack, commands, devPort, hasExistingRules, hasGitignore, isEmpty }
 */
export function detectProjectContext(rootDir) {
  const ctx = {
    name: path.basename(rootDir),
    stack: null,
    commands: {},
    devPort: null,
    hasExistingRules: false,
    hasGitignore: fs.existsSync(path.join(rootDir, '.gitignore')),
    isEmpty: isEmptyProject(rootDir),
  };

  // Check for existing rules files
  const rulesFiles = ['CLAUDE.md', '.claude/CLAUDE.md', '.clinerules/rules.md'];
  for (const rf of rulesFiles) {
    if (fs.existsSync(path.join(rootDir, rf))) {
      ctx.hasExistingRules = rf;
      break;
    }
  }

  // Try to read package.json for name, scripts, and stack hints
  const pkgPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) ctx.name = pkg.name;
      ctx.commands = detectCommandsFromPkg(pkg);
      ctx.stack = detectStackFromPkg(pkg);
      ctx.devPort = detectPortFromPkg(pkg);
    } catch { /* malformed package.json, skip */ }
  }

  // If no stack from package.json, try other markers
  if (!ctx.stack) {
    ctx.stack = detectStackFromMarkers(rootDir);
  }

  return ctx;
}

/**
 * Detect stack from package.json dependencies.
 */
function detectStackFromPkg(pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.next) return 'nextjs';
  if (deps.react && !deps.next) return 'generic'; // React but not Next
  return null;
}

/**
 * Detect stack from non-JS project markers.
 */
function detectStackFromMarkers(rootDir) {
  // Gemfile with a UI subdirectory → rails-react
  if (fs.existsSync(path.join(rootDir, 'Gemfile'))) {
    // Check for a UI/frontend sibling
    const entries = safeReaddir(rootDir);
    const hasUi = entries.some(e => {
      const pkgPath = path.join(rootDir, e, 'package.json');
      if (!fs.existsSync(pkgPath)) return false;
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        return deps.react || deps.next || deps.vue;
      } catch { return false; }
    });
    return hasUi ? 'rails-react' : 'generic';
  }

  // Go projects
  if (fs.existsSync(path.join(rootDir, 'go.mod'))) return 'go';

  // Rust projects
  if (fs.existsSync(path.join(rootDir, 'Cargo.toml'))) return 'rust';

  // Python markers — detect Flask/Django specifically, otherwise generic
  for (const marker of ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile']) {
    if (fs.existsSync(path.join(rootDir, marker))) {
      // Check if Django or Flask is a dependency
      if (marker === 'requirements.txt') {
        try {
          const reqs = fs.readFileSync(path.join(rootDir, marker), 'utf8');
          if (/^django\b/im.test(reqs)) return 'django';
          if (/^flask\b/im.test(reqs)) return 'python-flask';
        } catch { /* ignore */ }
      }
      if (fs.existsSync(path.join(rootDir, 'manage.py'))) return 'django';
      return 'generic';
    }
  }

  // Multiple language subdirs → polyglot
  const entries = safeReaddir(rootDir);
  const skipDirs = new Set(['node_modules', '.git', '.bobby', '.claude', 'vendor', 'dist', 'build']);
  let languageCount = 0;
  const langMarkers = {
    'package.json': 'js',
    'Gemfile': 'ruby',
    'requirements.txt': 'python',
    'go.mod': 'go',
    'Cargo.toml': 'rust',
    'pom.xml': 'java',
  };
  const seenLangs = new Set();

  for (const entry of entries) {
    if (skipDirs.has(entry) || entry.startsWith('.')) continue;
    const entryPath = path.join(rootDir, entry);
    let stat;
    try { stat = fs.statSync(entryPath); } catch { continue; }
    if (!stat.isDirectory()) continue;

    for (const [marker, lang] of Object.entries(langMarkers)) {
      if (fs.existsSync(path.join(entryPath, marker)) && !seenLangs.has(lang)) {
        seenLangs.add(lang);
        languageCount++;
      }
    }
  }

  if (languageCount >= 2) return 'polyglot';

  return null;
}

/**
 * Extract commands from package.json scripts.
 */
function detectCommandsFromPkg(pkg) {
  const scripts = pkg.scripts || {};
  const commands = {};
  if (scripts.dev) commands.dev = 'npm run dev';
  if (scripts.start && !scripts.dev) commands.dev = 'npm start';
  if (scripts.test) commands.test = 'npm test';
  if (scripts.lint) commands.lint = 'npm run lint';
  if (scripts.build) commands.build = 'npm run build';
  return commands;
}

/**
 * Try to detect the dev port from package.json scripts.
 */
function detectPortFromPkg(pkg) {
  const scripts = pkg.scripts || {};
  const devScript = scripts.dev || scripts.start || '';
  // Match patterns like "-p 3001", "--port 8080", "PORT=5000"
  const portMatch = devScript.match(/-p\s+(\d+)|--port\s+(\d+)|PORT=(\d+)/);
  if (portMatch) {
    return parseInt(portMatch[1] || portMatch[2] || portMatch[3], 10);
  }
  return null;
}

/**
 * Determine if a directory looks like an empty/new project.
 * Empty means: no source files, maybe just .git or nothing.
 */
function isEmptyProject(rootDir) {
  const entries = safeReaddir(rootDir);
  const meaningful = entries.filter(e =>
    e !== '.git' && e !== '.DS_Store' && e !== 'node_modules' && !e.startsWith('.')
  );
  return meaningful.length === 0;
}

/**
 * Detect git identity issues that could block deployments.
 * Returns { email, name, warnings[] }
 */
export function detectGitIdentity(rootDir) {
  const result = { email: null, name: null, warnings: [] };

  try {
    result.email = execSync('git config user.email', { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { /* not set */ }

  try {
    result.name = execSync('git config user.name', { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { /* not set */ }

  if (!result.email) {
    result.warnings.push('git user.email is not set — required before you can commit');
  } else if (result.email.endsWith('.local') || result.email.endsWith('.internal') || !result.email.includes('@')) {
    result.warnings.push(`git user.email "${result.email}" looks like a machine-generated address — deployments may be blocked`);
  }

  if (!result.name) {
    result.warnings.push('git user.name is not set');
  }

  return result;
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir).filter(e => {
      try { fs.statSync(path.join(dir, e)); return true; } catch { return false; }
    });
  } catch { return []; }
}
