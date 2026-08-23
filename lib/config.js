// lib/config.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import YAML from 'yaml';
// Safe: target adapters depend only on fs/path, never on config.
import { getTarget } from './targets/index.js';

const CONFIG_FILE = '.bobbyrc.yml';

const DEFAULTS = {
  bobby_dir: '.bobby',
  ticket_prefix: 'TKT',
  target: 'claude-code',
  health_checks: [],
  areas: [],
  backlog_limit: null,
  backlog_stale_days: 30,
  parallel_isolation: 'none',
  testing_tools: ['curl'],
  git_conventions: {
    feature_branch_prefix: 'feature',
    ticket_branch_prefix: 'tkt',
    worktree_prefix: 'bobby',
  },
  dashboard: {
    port: 7777,
    worktree_root: '../bobby-wt',
    auto_approve_stages: [],
    // How many agents may run at once. Each is a CLI subprocess spending real
    // tokens, so a run past the cap is refused (never queued) with a message
    // naming what holds the slots. Mirrored by DEFAULT_MAX_CONCURRENT in
    // lib/dashboard/orchestrator.js, which covers configs that predate this key.
    max_concurrent: 4,
    // PERMISSION POSTURE, PER KIND OF RUN. Two keys and not one, because the
    // two kinds of run are not equally risky and a single default would have to
    // be wrong for one of them (TKT-062).
    //
    // A WORKTREE run works on a ticket inside a throwaway git worktree. That
    // copy IS the sandbox — if an agent goes wrong you delete the directory and
    // the main checkout never saw it — so the posture here is the one that
    // actually works end to end. Anything less does not merely slow the agent
    // down: `claude -p` is headless, so a permission prompt has nobody to answer
    // it, and the agent retries until it gives up and exits 0 having written
    // nothing. Measured: 88 turns, 9m14s, $2.97, zero files.
    worktree_permission_mode: 'bypassPermissions',
    // A REPO run (freeform agents: ux, arch, docs, ship, …) works in the USER'S
    // REAL CHECKOUT. None of the sandbox reasoning applies, so this one is
    // deliberately more conservative: file edits go through, and they are
    // reviewable and revertable with git, but arbitrary commands are not run
    // unattended in a directory the user cannot restore by deleting it. Agents
    // that genuinely need a shell there — ship, for one — need the user to
    // raise this key on purpose. That is the trade, and it is the right way
    // round.
    repo_permission_mode: 'acceptEdits',
    // permission_mode (singular) is the older key and stays unset on purpose:
    // set, it overrides BOTH of the above, which is how a config written before
    // this split keeps meaning what it meant. Listing it here with a value would
    // make it impossible to tell "the user asked for this" from "nobody said".
    //
    // executor is intentionally unset: left undefined it is derived from
    // `target` (cursor -> cursor-agent, everything else -> claude). Setting it
    // here would make an explicit `executor: claude` indistinguishable from
    // the default, so the derivation could never fire.
  },
};

export function readConfig(rootDir) {
  const merged = readBaseConfig(rootDir);

  // Studio: a single studio holds many projects, each with its own board under
  // .bobby/<project>/. The `studio:` key marks it. Resolve the active project
  // and cascade its config over the studio defaults. Legacy single-board
  // projects (no `studio` key) fall straight through unchanged.
  if (merged.studio) return applyProjectContext(rootDir, merged);

  return merged;
}

/**
 * Everything `readConfig` does EXCEPT the studio project cascade: the file, the
 * defaults, the deep merges, the derived dirs. Kept separate so `configForProject`
 * can cascade a chosen project over a pristine studio base rather than over a
 * config that already has some other project merged into it.
 */
function readBaseConfig(rootDir) {
  const configPath = path.join(rootDir, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error('Not a Bobby project. Run `bobby init` first.');
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = YAML.parse(raw) || {};
  const merged = { ...DEFAULTS, ...parsed };

  // Deep-merge nested objects so partial overrides work
  merged.git_conventions = { ...DEFAULTS.git_conventions, ...(parsed.git_conventions || {}) };
  merged.dashboard = { ...DEFAULTS.dashboard, ...(parsed.dashboard || {}) };

  // Derive tickets_dir, sessions_dir, and sprints_dir from bobby_dir unless explicitly set
  const bobbyDir = merged.bobby_dir;
  if (!parsed.tickets_dir) merged.tickets_dir = `${bobbyDir}/tickets`;
  if (!parsed.sessions_dir) merged.sessions_dir = `${bobbyDir}/sessions`;
  if (!parsed.sprints_dir) merged.sprints_dir = `${bobbyDir}/sprints`;

  return merged;
}

/**
 * Studio only. List the projects in a studio — every .bobby/<name>/ that carries
 * its own .bobbyrc.yml.
 */
export function listStudioProjects(rootDir) {
  const dir = path.join(rootDir, '.bobby');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(n => fs.existsSync(path.join(dir, n, CONFIG_FILE)))
    .sort();
}

/**
 * Studio only. Which project a command targets. Precedence:
 *   explicit arg  >  BOBBY_PROJECT env  >  .bobby/active-project file  >
 *   the sole project if there's exactly one  >  null (caller must prompt).
 * Never throws — a null result means "ask the user to pick".
 */
export function resolveActiveProject(rootDir, explicit) {
  if (explicit) return explicit;
  if (process.env.BOBBY_PROJECT) return process.env.BOBBY_PROJECT;
  const activeFile = path.join(rootDir, '.bobby', 'active-project');
  if (fs.existsSync(activeFile)) {
    const v = fs.readFileSync(activeFile, 'utf8').trim();
    if (v) return v;
  }
  const all = listStudioProjects(rootDir);
  if (all.length === 1) return all[0];
  return null;
}

function applyProjectContext(studioRoot, studioCfg) {
  return cascadeProject(studioRoot, studioCfg, resolveActiveProject(studioRoot));
}

/**
 * Studio only. The fully-cascaded config for ONE NAMED project, read fresh off
 * disk — what `readConfig` would have returned had that project been the active
 * one.
 *
 * This exists so a long-running process that MOVES between projects (the app's
 * ProjectContext, TKT-022) can ask for another project's config instead of
 * approximating one. Approximating it is a bug factory: the cascade is not a
 * spread — `ticket_prefix` has its own precedence, `git_conventions`/`dashboard`/
 * `workflows` deep-merge, `project_repos` comes from the project and `repo_group`
 * from the studio. A hand-rolled `{...studioCfg, ...projectCfg}` gets each of
 * those wrong, and if it starts from an ALREADY-cascaded config it also carries
 * the previous project's keys into the next one.
 */
export function configForProject(studioRoot, project) {
  return cascadeProject(studioRoot, readBaseConfig(studioRoot), project);
}

function cascadeProject(studioRoot, studioCfg, project) {
  studioCfg.repo_group = studioCfg.repos || {};   // name -> {path, stack, commands}
  studioCfg._studio = studioCfg.studio || path.basename(studioRoot);
  if (!project) { studioCfg._project = null; return studioCfg; }

  const pcPath = path.join(studioRoot, '.bobby', project, CONFIG_FILE);
  const pc = fs.existsSync(pcPath) ? (YAML.parse(fs.readFileSync(pcPath, 'utf8')) || {}) : {};
  const merged = { ...studioCfg, ...pc };
  merged.git_conventions = { ...(studioCfg.git_conventions || {}), ...(pc.git_conventions || {}) };
  merged.dashboard = { ...(studioCfg.dashboard || {}), ...(pc.dashboard || {}) };
  merged.workflows = { ...(studioCfg.workflows || {}), ...(pc.workflows || {}) };
  merged.studio = studioCfg.studio;                      // keep the studio marker after the project merge
  merged.repo_group = studioCfg.repos || {};
  merged.project_repos = pc.repos || [];                 // subset of the group this project uses
  merged.ticket_prefix = pc.prefix || pc.ticket_prefix || studioCfg.ticket_prefix || 'TKT';
  merged._project = project;
  merged._studio = studioCfg._studio;
  merged.tickets_dir = `.bobby/${project}/tickets`;
  merged.sessions_dir = `.bobby/${project}/sessions`;
  return merged;
}

/**
 * Studio only. Absolute path to a repo in the studio's group. Relative paths in
 * the group (the default `repos/<name>` layout) resolve against the studio
 * root; absolute paths (an external repo you didn't relocate) pass through.
 */
export function resolveRepoPath(studioRoot, config, name) {
  const group = config.repo_group || config.repos || {};
  const entry = group[name];
  if (!entry) throw new Error(`Repo '${name}' is not in the studio's repo group`);
  const p = typeof entry === 'string' ? entry : entry.path;
  return path.isAbsolute(p) ? p : path.join(studioRoot, p);
}

export function writeConfig(rootDir, config) {
  const configPath = path.join(rootDir, CONFIG_FILE);
  const content = YAML.stringify(config, { lineWidth: 120 });
  fs.writeFileSync(configPath, content, 'utf8');
}

export function writeConfigCommented(rootDir, config) {
  const configPath = path.join(rootDir, CONFIG_FILE);
  const lines = [];
  let skillsDir = '.claude/skills/';
  try {
    skillsDir = `${getTarget(config.target || 'claude-code').paths().skills}/`;
  } catch { /* unknown target — the comment is cosmetic, keep the default */ }

  lines.push('# Bobby Configuration');
  lines.push('# Generated by: npx bobbycode init');
  lines.push('# Docs: https://github.com/ccevans/bobbycode');
  lines.push('');

  // Project name
  lines.push('# Project name (used in ticket board headers and PR titles)');
  lines.push(`project: ${config.project}`);
  lines.push('');

  // Stack
  lines.push('# Tech stack preset. Determines default commands, areas, and health checks.');
  lines.push('# Options: nextjs | rails-react | django | python-flask | go | rust | polyglot | generic');
  lines.push(`stack: ${config.stack}`);
  lines.push('');

  // Target
  lines.push('# AI target. Determines where skills/agents/commands are scaffolded.');
  lines.push('# Options: claude-code | cursor | cline | codex | agents-md');
  lines.push(`target: ${config.target || 'claude-code'}`);
  lines.push('');

  // Directories
  lines.push('# Directory where Bobby stores tickets, sessions, and metadata.');
  lines.push(`bobby_dir: ${config.bobby_dir || '.bobby'}`);
  lines.push(`tickets_dir: ${config.tickets_dir}`);
  lines.push(`sessions_dir: ${config.sessions_dir}`);
  lines.push('');

  // Ticket prefix
  lines.push('# Prefix for ticket IDs (e.g., TKT-001, PROJ-001)');
  lines.push(`ticket_prefix: ${config.ticket_prefix || 'TKT'}`);
  lines.push('');

  // Default workflow (BOB-090) — near the top so the choice is visible.
  if (config.default_workflow) {
    lines.push('# Default workflow. This project has no dev server and no health checks —');
    lines.push('# there is no live app for the test stage to exercise, so tickets run the');
    lines.push('# `library` workflow: plan → build → review (review runs the test suite).');
    lines.push('# Delete this line to return to the standard default, or add health_checks');
    lines.push('# if this project does grow a live app.');
    lines.push(`default_workflow: ${config.default_workflow}`);
    lines.push('');
  }

  // Health checks
  lines.push('# Health check URLs verified before agents start work.');
  lines.push('# Add your dev server URL(s) so agents can confirm the app is running.');
  if (config.health_checks && config.health_checks.length > 0) {
    lines.push('health_checks:');
    for (const hc of config.health_checks) {
      lines.push(`  - name: ${hc.name}`);
      lines.push(`    url: ${hc.url}`);
      if (hc.description) lines.push(`    description: ${hc.description}`);
    }
  } else {
    lines.push('health_checks: []');
  }
  lines.push('');

  // Areas
  lines.push('# Feature areas for categorizing tickets. Used by `bobby ticket create --area`.');
  if (config.areas && config.areas.length > 0) {
    lines.push('areas:');
    for (const area of config.areas) {
      lines.push(`  - ${area}`);
    }
  } else {
    lines.push('areas: []');
  }
  lines.push('');

  // Commands
  lines.push('# Shell commands Bobby uses for dev, test, lint, and build.');
  const cmds = config.commands || {};
  lines.push('commands:');
  lines.push(`  dev: ${cmds.dev || ''}`);
  lines.push(`  test: ${cmds.test || ''}`);
  lines.push(`  lint: ${cmds.lint || ''}`);
  lines.push(`  build: ${cmds.build || ''}`);
  lines.push('');

  // Testing tools
  lines.push('# Tools available for the test agent (e.g., playwright, curl)');
  const tools = config.testing_tools || ['curl'];
  lines.push('testing_tools:');
  for (const tool of tools) {
    lines.push(`  - ${tool}`);
  }
  lines.push('');

  // Max retries
  lines.push('# Max retry loops when review/test rejects code (per ticket)');
  lines.push(`max_retries: ${config.max_retries || 3}`);
  lines.push('');

  // Repos (if present)
  if (config.repos && config.repos.length > 0) {
    lines.push('# Multi-repo shipping (PR created per repo)');
    lines.push('repos:');
    for (const repo of config.repos) {
      lines.push(`  - name: ${repo.name}`);
      lines.push(`    path: ${repo.path}`);
    }
    lines.push('');
  }

  // Services (if present)
  if (config.services && Object.keys(config.services).length > 0) {
    lines.push('# Multi-service configuration (per-service commands and health checks)');
    lines.push(YAML.stringify({ services: config.services }, { lineWidth: 120 }).trim());
    lines.push('');
  }

  // Build skills (if present)
  if (config.build_skills && config.build_skills.length > 0) {
    lines.push('# Project-specific skills the build agent should follow.');
    lines.push('build_skills:');
    for (const skill of config.build_skills) {
      lines.push(`  - ${skill}`);
    }
    lines.push('');
  }

  // --- Optional sections (commented out) ---
  lines.push('# ──────────────────────────────────────────────────────────');
  lines.push('# Optional configuration — uncomment and customize as needed');
  lines.push('# ──────────────────────────────────────────────────────────');
  lines.push('');

  if (!config.workflows && !config.pipelines) {
    lines.push('# Workflows — the ordered stages a ticket runs through. Built-in: default,');
    lines.push('# secure, quick, library, library-secure. Add or override your own here,');
    lines.push('# then: bobby run <name> <ticket>');
    lines.push('# workflows:');
    lines.push('#   default: [plan, build, review, test]');
    lines.push('#   secure: [plan, build, security, review, test]');
    lines.push('#   quick: [plan, build, test]');
    lines.push('');
  }

  if (!config.build_skills) {
    lines.push('# Project-specific skills the build agent should follow.');
    lines.push(`# These are non-bobby skills in your ${skillsDir} directory.`);
    lines.push('# build_skills:');
    lines.push('#   - api-patterns');
    lines.push('#   - component-library');
    lines.push('');
  }

  lines.push('# Backlog management');
  lines.push('# backlog_limit: 50          # Warn when backlog exceeds this count');
  lines.push('# backlog_stale_days: 30     # Days before a ticket is considered stale');
  lines.push('');

  if (!config.repos) {
    lines.push('# Multi-repo shipping (for monorepo or multi-repo projects)');
    lines.push('# repos:');
    lines.push('#   - name: api');
    lines.push('#     path: backend-api');
    lines.push('#   - name: ui');
    lines.push('#     path: frontend-ui');
    lines.push('');
  }

  lines.push('# Parallel isolation mode for batch operations');
  lines.push('# parallel_isolation: none   # Options: none | worktree');
  lines.push('');

  lines.push('# Git branch naming conventions');
  lines.push('# git_conventions:');
  lines.push('#   feature_branch_prefix: feature  # Epic branches: feature/{id}-{slug}');
  lines.push('#   ticket_branch_prefix: tkt        # Ticket branches: tkt-{id}');
  lines.push('#   worktree_prefix: bobby            # Worktree branches: bobby/{id}-{stage}');
  lines.push('');

  lines.push('# Dashboard configuration (bobby dashboard)');
  lines.push('# dashboard:');
  lines.push('#   port: 7777                       # Web UI port');
  lines.push('#   worktree_root: ../bobby-wt       # Where worktrees are created');
  lines.push('#   auto_approve_stages: []           # Stages to auto-advance (e.g., [reviewing])');
  lines.push('#   max_concurrent: 4                 # Agents allowed to run at once. Past the');
  lines.push('#                                     # cap a run is refused, not queued.');
  lines.push('#   executor: claude                  # claude | cursor-agent (default: from target)');
  lines.push('#   model: null                       # Passed through as --model. For names,');
  lines.push('#                                     # run: cursor-agent --list-models');
  lines.push('#   worktree_permission_mode: bypassPermissions');
  lines.push('#                                     # Ticket runs, in a throwaway git worktree.');
  lines.push('#                                     # The worktree IS the sandbox — delete it and');
  lines.push('#                                     # the main checkout never saw the agent. A');
  lines.push('#                                     # headless run cannot answer a permission');
  lines.push('#                                     # prompt, so a stricter posture here does not');
  lines.push('#                                     # make it careful, it makes it do nothing.');
  lines.push('#   repo_permission_mode: acceptEdits');
  lines.push('#                                     # Freeform runs (ux, arch, docs, ship, …) work');
  lines.push('#                                     # in YOUR checkout, not a copy. Edits yes —');
  lines.push('#                                     # git can undo them. Arbitrary commands no,');
  lines.push('#                                     # unless you raise this yourself.');
  lines.push('#                                     # Either key: bypassPermissions | acceptEdits');
  lines.push('#                                     # | plan | default ("default" = ask, which');
  lines.push('#                                     # headless means: refuse).');
  lines.push('#   permission_mode: null             # Older single key. Set, it overrides both.');
  lines.push('');

  lines.push('# Conductor.build integration (set to false to skip conductor.json generation)');
  lines.push('# conductor: false');
  lines.push('');

  // Local dev profiles (if present)
  if (config.local && Object.keys(config.local).length > 0) {
    lines.push('# Local dev profiles. Run `/bobby-local <profile>` to start a named environment.');
    lines.push('local:');
    for (const [name, profile] of Object.entries(config.local)) {
      lines.push(`  ${name}:`);
      if (profile.subdomain) lines.push(`    subdomain: ${profile.subdomain}`);
      if (profile.compose_project) lines.push(`    compose_project: ${profile.compose_project}`);
      if (profile.description) lines.push(`    description: ${profile.description}`);
      if (profile.ports && Object.keys(profile.ports).length > 0) {
        const portParts = Object.entries(profile.ports).map(([k, v]) => `${k}: ${v}`);
        lines.push(`    ports: { ${portParts.join(', ')} }`);
      }
      if (profile.health_checks && profile.health_checks.length > 0) {
        lines.push('    health_checks:');
        for (const hc of profile.health_checks) {
          lines.push(`      - name: ${hc.name}`);
          lines.push(`        url: ${hc.url}`);
          if (hc.description) lines.push(`        description: ${hc.description}`);
        }
      }
    }
    lines.push('');
  }

  fs.writeFileSync(configPath, lines.join('\n') + '\n', 'utf8');
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

/**
 * If `dir` is inside a git worktree, return the main worktree's root.
 * Returns null if not in a worktree or git unavailable.
 *
 * `dir` MUST be the directory being resolved (not process.cwd()): git is run
 * with it as cwd, and git's relative --git-dir/--git-common-dir outputs are
 * resolved against it. Cross-project callers (e.g. `bobby projects`) resolve
 * other repos' dirs while cwd sits elsewhere, so an implicit cwd would inspect
 * the wrong repository.
 */
export function findMainWorktreeRoot(dir = process.cwd()) {
  try {
    const opts = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], cwd: dir };
    const gitDir = execSync('git rev-parse --git-dir', opts).trim();
    const gitCommonDir = execSync('git rev-parse --git-common-dir', opts).trim();
    const absGitDir = path.resolve(dir, gitDir);
    const absCommonDir = path.resolve(dir, gitCommonDir);
    if (absGitDir !== absCommonDir) {
      return path.resolve(absCommonDir, '..');
    }
  } catch { /* not in git repo */ }
  return null;
}

/**
 * Resolve the tickets directory — always points to the main worktree's copy.
 */
export function resolveTicketsDir(root, config) {
  if (config && config.studio) return studioBoardDir(root, config, 'tickets');
  const mainRoot = findMainWorktreeRoot(root);
  const effectiveRoot = (mainRoot && mainRoot !== root) ? mainRoot : root;
  return path.join(effectiveRoot, config.tickets_dir);
}

// Studio: the active project's board lives at .bobby/<project>/<leaf>. If no
// project is selected we can't know which board — fail with an actionable message.
function studioBoardDir(root, config, leaf) {
  if (!config._project) {
    const all = listStudioProjects(root);
    const hint = all.length
      ? `Select a project: \`bobby project use <name>\` or pass --project. Projects: ${all.join(', ')}`
      : 'No projects yet. Create one: `bobby project new <name>`';
    throw new Error(hint);
  }
  return path.join(root, '.bobby', config._project, leaf);
}

/**
 * Resolve the sessions directory — always points to the main worktree's copy.
 */
export function resolveSessionsDir(root, config) {
  if (config && config.studio) return studioBoardDir(root, config, 'sessions');
  const mainRoot = findMainWorktreeRoot(root);
  const effectiveRoot = (mainRoot && mainRoot !== root) ? mainRoot : root;
  return path.join(effectiveRoot, config.sessions_dir);
}

/**
 * Resolve the product-definition directory (.bobby/product) — always the main
 * worktree's copy, so definition artifacts written from a worktree land where
 * every agent looks for them.
 */
export function resolveProductDir(root, config) {
  const mainRoot = findMainWorktreeRoot(root);
  const effectiveRoot = (mainRoot && mainRoot !== root) ? mainRoot : root;
  return path.join(effectiveRoot, config.bobby_dir || '.bobby', 'product');
}

/**
 * Resolve the sprints directory — always points to the main worktree's copy.
 */
export function resolveSprintsDir(root, config) {
  const mainRoot = findMainWorktreeRoot(root);
  const effectiveRoot = (mainRoot && mainRoot !== root) ? mainRoot : root;
  return path.join(effectiveRoot, config.sprints_dir || `${config.bobby_dir || '.bobby'}/sprints`);
}

/**
 * Resolve the architectural decision log — always the main worktree's copy.
 * Decisions are shared state the way tickets are: an agent working in a
 * throwaway worktree must record into the board everyone reads, not into a
 * copy that disappears with the branch.
 */
export function resolveDecisionsFile(root, config) {
  if (config && config.studio) return path.join(studioBoardDir(root, config, ''), 'decisions.yaml');
  const mainRoot = findMainWorktreeRoot(root);
  const effectiveRoot = (mainRoot && mainRoot !== root) ? mainRoot : root;
  return path.join(effectiveRoot, config.bobby_dir || '.bobby', 'decisions.yaml');
}

/**
 * Resolve the ideas file — always points to the main worktree's copy.
 */
export function resolveIdeasFile(root, config) {
  const mainRoot = findMainWorktreeRoot(root);
  const effectiveRoot = (mainRoot && mainRoot !== root) ? mainRoot : root;
  return path.join(effectiveRoot, `${config.bobby_dir || '.bobby'}/ideas.yml`);
}
