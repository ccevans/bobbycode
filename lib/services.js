// lib/services.js
import fs from 'fs';
import path from 'path';

/**
 * Language markers: filename patterns -> detected language + default commands
 */
const LANGUAGE_MARKERS = [
  {
    files: ['*.csproj', '*.sln'],
    language: 'dotnet',
    commands: { test: 'dotnet test', lint: 'dotnet format --check', build: 'dotnet build' },
  },
  {
    files: ['Gemfile'],
    language: 'ruby',
    commands: { test: 'bundle exec rspec', lint: 'bundle exec rubocop', build: '' },
  },
  {
    files: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
    language: 'python',
    commands: { test: 'pytest', lint: 'ruff check .', build: '' },
  },
  {
    files: ['package.json'],
    language: 'javascript',
    commands: { test: 'npm test', lint: 'npm run lint', build: 'npm run build' },
  },
  {
    files: ['go.mod'],
    language: 'go',
    commands: { test: 'go test ./...', lint: 'golangci-lint run', build: 'go build ./...' },
  },
  {
    files: ['Cargo.toml'],
    language: 'rust',
    commands: { test: 'cargo test', lint: 'cargo clippy', build: 'cargo build' },
  },
  {
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    language: 'java',
    commands: { test: 'mvn test', lint: '', build: 'mvn package' },
  },
];

/**
 * Check if a directory contains any of the given filename patterns.
 * Supports simple glob: *.ext matches any file ending in .ext
 */
function dirContainsFile(dirPath, patterns) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath);
  } catch {
    return false;
  }
  for (const pattern of patterns) {
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1); // e.g., ".csproj"
      if (entries.some(e => e.endsWith(ext))) return true;
    } else {
      if (entries.includes(pattern)) return true;
    }
  }
  return false;
}

/**
 * Detect language for a given directory
 */
function detectLanguage(dirPath) {
  for (const marker of LANGUAGE_MARKERS) {
    if (dirContainsFile(dirPath, marker.files)) {
      return { language: marker.language, commands: { ...marker.commands } };
    }
  }
  return null;
}

/**
 * Scan a project root for directories that look like services.
 * Returns an array of { name, path, language, commands }
 */
export function detectServices(rootDir) {
  const detected = [];
  const skipDirs = new Set(['node_modules', '.git', '.bobby', '.claude', 'vendor', '__pycache__', 'bin', 'obj', 'dist', 'build']);

  // Check immediate subdirectories (1 level deep)
  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return detected;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (skipDirs.has(entry.name) || entry.name.startsWith('.')) continue;

    const dirPath = path.join(rootDir, entry.name);
    const lang = detectLanguage(dirPath);
    if (lang) {
      detected.push({
        name: entry.name,
        path: entry.name,
        language: lang.language,
        commands: lang.commands,
      });
    }

    // Also check one level deeper (e.g., services/auth-api/)
    let subEntries;
    try {
      subEntries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const sub of subEntries) {
      if (!sub.isDirectory()) continue;
      if (skipDirs.has(sub.name) || sub.name.startsWith('.')) continue;

      const subPath = path.join(dirPath, sub.name);
      const subLang = detectLanguage(subPath);
      if (subLang) {
        detected.push({
          name: sub.name,
          path: path.join(entry.name, sub.name),
          language: subLang.language,
          commands: subLang.commands,
        });
      }
    }
  }

  return detected;
}

/**
 * Resolve which services a ticket touches.
 * Priority: explicit ticket.services > area-based lookup > all services
 */
export function resolveServices(config, ticketData) {
  if (!config.services || Object.keys(config.services).length === 0) return [];

  // Explicit services on ticket
  if (ticketData.services && ticketData.services.length > 0) {
    return ticketData.services
      .filter(name => config.services[name])
      .map(name => ({ name, ...config.services[name] }));
  }

  // Resolve from area
  if (ticketData.area) {
    const matched = Object.entries(config.services)
      .filter(([, svc]) => svc.areas && svc.areas.includes(ticketData.area))
      .map(([name, svc]) => ({ name, ...svc }));
    if (matched.length > 0) return matched;
  }

  // No resolution possible — return all services
  return Object.entries(config.services)
    .map(([name, svc]) => ({ name, ...svc }));
}

/**
 * Get aggregated health checks from all services + top-level config
 */
export function aggregateHealthChecks(config) {
  const topLevel = config.health_checks || [];
  if (!config.services) return topLevel;

  const serviceChecks = Object.values(config.services)
    .flatMap(svc => svc.health_checks || []);

  return [...topLevel, ...serviceChecks];
}

/**
 * Get all areas from services + top-level config (deduplicated)
 */
export function aggregateAreas(config) {
  const topLevel = config.areas || [];
  if (!config.services) return topLevel;

  const serviceAreas = Object.values(config.services)
    .flatMap(svc => svc.areas || []);

  return [...new Set([...topLevel, ...serviceAreas])];
}
