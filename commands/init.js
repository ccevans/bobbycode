// commands/init.js
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { writeConfig, writeConfigCommented, readConfig, configExists } from '../lib/config.js';
import { renderTemplate, renderSkillTemplates } from '../lib/template.js';
import { success, warn, error, bold } from '../lib/colors.js';
import { getTarget, TARGETS } from '../lib/targets/index.js';
import { detectServices, aggregateAreas, aggregateHealthChecks } from '../lib/services.js';
import { runLocalProfileWizard, saveLocalProfile } from './local-init.js';
import { detectProjectContext, detectGitIdentity } from '../lib/detect.js';
import { mergeRulesContent, isBobbyGenerated } from '../lib/rules-merge.js';
import { execSync } from 'child_process';

// Load stack configs
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STACKS_DIR = path.join(__dirname, '..', 'stacks');
const AGENT_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'agents');
const COMMAND_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'commands');
const HOOKS_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'hooks');
const BOBBY_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'bobby');

export function loadStack(stackName, projectRoot, bobbyDir) {
  // Check project-local stacks first
  if (projectRoot) {
    const dir = bobbyDir || '.bobby';
    const localStackFile = path.join(projectRoot, dir, 'stacks', `${stackName}.json`);
    if (fs.existsSync(localStackFile)) {
      return JSON.parse(fs.readFileSync(localStackFile, 'utf8'));
    }
  }
  // Fall back to bundled stacks
  const stackFile = path.join(STACKS_DIR, `${stackName}.json`);
  if (!fs.existsSync(stackFile)) return null;
  return JSON.parse(fs.readFileSync(stackFile, 'utf8'));
}

function detectCustomStacks(projectRoot, bobbyDir) {
  const localStacksDir = path.join(projectRoot, bobbyDir || '.bobby', 'stacks');
  if (!fs.existsSync(localStacksDir)) return [];
  return fs.readdirSync(localStacksDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(localStacksDir, f), 'utf8'));
        return { name: `${data.display || data.name} (custom)`, value: data.name };
      } catch { return null; }
    })
    .filter(Boolean);
}

function ensureGitRepo(rootDir) {
  const gitDir = path.join(rootDir, '.git');
  if (fs.existsSync(gitDir)) return false;
  execSync('git init', { cwd: rootDir, stdio: 'pipe' });
  return true;
}

export function scaffoldProject(rootDir, config) {
  // Derive bobby_dir, sessions_dir if not explicitly provided
  const bobbyDir = config.bobby_dir || '.bobby';
  if (!config.tickets_dir) config.tickets_dir = `${bobbyDir}/tickets`;
  if (!config.sessions_dir) config.sessions_dir = `${bobbyDir}/sessions`;

  // Resolve target adapter
  const target = getTarget(config.target || 'claude-code');
  const targetPaths = target.paths();

  const ticketsDir = path.join(rootDir, config.tickets_dir);

  // Create single tickets directory (no stage folders)
  fs.mkdirSync(ticketsDir, { recursive: true });
  fs.mkdirSync(path.join(ticketsDir, 'retrospectives'), { recursive: true });

  // Create sessions directory for session logs
  const sessionsDir = path.join(rootDir, config.sessions_dir);
  fs.mkdirSync(sessionsDir, { recursive: true });

  // Ensure the project directory is a git repo
  const gitInitialized = ensureGitRepo(rootDir);

  // Write config (commented version for init, plain for programmatic updates)
  writeConfigCommented(rootDir, config);

  // Build template data with target paths
  const templateData = {
    ...config,
    commands: config.commands || {},
    build_skills: config.build_skills || [],
    services: config.services || {},
    paths: targetPaths,
    target: config.target || 'claude-code',
  };

  // Render and write rules file (CLAUDE.md or .clinerules/rules.md)
  const rulesContent = renderTemplate('CLAUDE.md.ejs', templateData);
  const rulesPath = path.join(rootDir, targetPaths.rules);
  fs.mkdirSync(path.dirname(rulesPath), { recursive: true });

  // Merge with existing rules file instead of overwriting user content
  if (fs.existsSync(rulesPath)) {
    const existing = fs.readFileSync(rulesPath, 'utf8');
    if (isBobbyGenerated(existing)) {
      // Entirely Bobby-generated — safe to overwrite
      fs.writeFileSync(rulesPath, rulesContent, 'utf8');
    } else {
      // Has user content — backup first time, then merge
      const bakPath = rulesPath + '.pre-bobby';
      if (!fs.existsSync(bakPath)) {
        fs.writeFileSync(bakPath, existing, 'utf8');
      }
      const merged = mergeRulesContent(existing, rulesContent);
      fs.writeFileSync(rulesPath, merged, 'utf8');
    }
  } else {
    fs.writeFileSync(rulesPath, rulesContent, 'utf8');
  }

  // Render and write conductor.json for Conductor.build users (skip if disabled)
  if (config.conductor !== false) {
    const conductorJson = renderTemplate('conductor.json.ejs', templateData);
    fs.writeFileSync(path.join(rootDir, 'conductor.json'), conductorJson, 'utf8');
  }

  // Render and write WORKFLOW.md
  const workflowMd = renderTemplate('WORKFLOW.md.ejs', templateData);
  fs.writeFileSync(path.join(ticketsDir, 'WORKFLOW.md'), workflowMd, 'utf8');

  // Create tickets/README.md
  const readmePath = path.join(ticketsDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, `# ${config.project} — Tickets\n\nManaged by [Bobby](https://github.com/ccevans/bobby). Run \`bobby list\` to see the board.\n`, 'utf8');
  }

  // Initialize counter (only if it doesn't exist)
  const counterFile = path.join(ticketsDir, '.counter');
  if (!fs.existsSync(counterFile)) {
    fs.writeFileSync(counterFile, '0', 'utf8');
  }

  // Render skills to target-specific path
  const skillsDir = path.join(rootDir, targetPaths.skills);
  renderSkillTemplates(skillsDir, templateData);

  // Scaffold agent definitions to target-specific path
  const agentsDir = path.join(rootDir, targetPaths.agents);
  fs.mkdirSync(agentsDir, { recursive: true });

  const agentFiles = ['bobby-plan', 'bobby-build', 'bobby-review', 'bobby-test', 'bobby-ship', 'bobby-ux', 'bobby-pm', 'bobby-qe', 'bobby-vet', 'bobby-strategy', 'bobby-security', 'bobby-debug', 'bobby-docs', 'bobby-performance', 'bobby-watchdog', 'bobby-arch', 'bobby-ticket-intake'];
  for (const agent of agentFiles) {
    const agentTemplate = path.join(AGENT_TEMPLATES_DIR, `${agent}.md.ejs`);
    if (fs.existsSync(agentTemplate)) {
      const content = renderTemplate(`agents/${agent}.md.ejs`, templateData);
      fs.writeFileSync(path.join(agentsDir, `${agent}.md`), content, 'utf8');
    }
  }

  // Scaffold slash commands / workflows to target-specific path (now EJS-rendered)
  const commandsDir = path.join(rootDir, targetPaths.commands);
  fs.mkdirSync(commandsDir, { recursive: true });

  const commandFiles = fs.readdirSync(COMMAND_TEMPLATES_DIR).filter(f => f.endsWith('.md.ejs'));
  for (const file of commandFiles) {
    const content = renderTemplate(`commands/${file}`, templateData);
    const outName = file.replace('.ejs', '');
    fs.writeFileSync(path.join(commandsDir, outName), content, 'utf8');
  }

  // Scaffold hooks/ directory (claude-code target only)
  if ((config.target || 'claude-code') === 'claude-code' && fs.existsSync(HOOKS_TEMPLATES_DIR)) {
    const hooksDir = path.join(rootDir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    for (const hookFile of fs.readdirSync(HOOKS_TEMPLATES_DIR)) {
      const src = path.join(HOOKS_TEMPLATES_DIR, hookFile);
      const dest = path.join(hooksDir, hookFile.replace('.ejs', ''));
      if (!fs.existsSync(dest)) {
        if (hookFile.endsWith('.ejs')) {
          const content = renderTemplate(`hooks/${hookFile}`, templateData);
          fs.writeFileSync(dest, content, 'utf8');
        } else {
          fs.copyFileSync(src, dest);
        }
        fs.chmodSync(dest, 0o755);
      }
    }

    // Scaffold .claude/settings.json with hooks (do not overwrite if exists)
    const settingsPath = path.join(rootDir, '.claude', 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      const settingsContent = renderTemplate('settings.json.ejs', templateData);
      fs.writeFileSync(settingsPath, settingsContent, 'utf8');
    }
  }

  // Scaffold .bobby/docs/ for user-contributed context (arch agent reads this)
  const docsDir = path.join(rootDir, bobbyDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  const docsReadme = path.join(docsDir, 'README.md');
  if (!fs.existsSync(docsReadme)) {
    fs.writeFileSync(docsReadme, `# ${config.project} — Architecture Docs\n\nDrop any diagrams, ADRs, domain notes, or external system contracts here.\nThe \`bobby-arch\` agent reads everything in this directory before writing \`.bobby/architecture.md\`.\n`, 'utf8');
  }

  // Scaffold .bobby/decisions.yaml stub (if not already present)
  const decisionsPath = path.join(rootDir, bobbyDir, 'decisions.yaml');
  if (!fs.existsSync(decisionsPath)) {
    const decisionsTemplate = path.join(BOBBY_TEMPLATES_DIR, 'decisions.yaml');
    if (fs.existsSync(decisionsTemplate)) {
      fs.copyFileSync(decisionsTemplate, decisionsPath);
    }
  }

  // Scaffold .bobby/architecture-wakeup.md stub (if not already present)
  const wakeupPath = path.join(rootDir, bobbyDir, 'architecture-wakeup.md');
  if (!fs.existsSync(wakeupPath)) {
    fs.writeFileSync(wakeupPath, `# Architecture Wakeup\n\n_Not yet generated. Run \`bobby run arch\` to discover and document this codebase._\n`, 'utf8');
  }

  // Target-specific extras (e.g., .clineignore for Cline)
  target.scaffoldExtras(rootDir);

  return { gitInitialized };
}

export function registerInit(program) {
  program
    .command('init')
    .description('Initialize a new Bobby project')
    .action(async () => {
      try {
        const rootDir = process.cwd();

        // Check for existing project
        let existingConfig = null;
        if (configExists(rootDir)) {
          existingConfig = readConfig(rootDir);

          console.log('');
          console.log(`  ${bold('Bobby')} is already set up in this project.`);
          console.log('');
          console.log(`    Project:  ${existingConfig.project}`);
          console.log(`    Stack:    ${existingConfig.stack}`);
          console.log(`    Target:   ${existingConfig.target || 'claude-code'}`);
          console.log('');

          const { reinitMode } = await inquirer.prompt([{
            type: 'list',
            name: 'reinitMode',
            message: 'What would you like to do?',
            choices: [
              { name: 'Re-scaffold — regenerate skills, agents, and commands from current config', value: 'rescaffold' },
              { name: 'Reconfigure — change project settings (full setup wizard)', value: 'reconfigure' },
              { name: 'Cancel', value: 'cancel' },
            ],
            default: 'rescaffold',
          }]);

          if (reinitMode === 'cancel') { console.log('Cancelled.'); return; }

          if (reinitMode === 'rescaffold') {
            scaffoldProject(rootDir, existingConfig);

            const targetAdapter = getTarget(existingConfig.target || 'claude-code');
            const tp = targetAdapter.paths();
            console.log('');
            success(`Re-scaffolded from existing .bobbyrc.yml (tickets preserved)`);
            success(`Updated ${tp.skills}/, ${tp.agents}/, ${tp.commands}/, ${tp.rules}`);
            console.log('');
            return;
          }
          // reconfigure: fall through to full wizard below
        }

        console.log('');
        console.log(`  Welcome to ${bold('Bobby')} — your pair programmer.`);
        console.log('');

        // Check git identity before anything else
        let gitInitializedEarly = false;
        const gitId = detectGitIdentity(rootDir);
        if (gitId.warnings.length > 0) {
          console.log('');
          for (const w of gitId.warnings) {
            warn(`⚠  ${w}`);
          }
          console.log('');
          const { fixEmail } = await inquirer.prompt([{
            type: 'confirm',
            name: 'fixEmail',
            message: 'Set your git identity now?',
            default: true,
          }]);
          if (fixEmail) {
            const hasGitDir = fs.existsSync(path.join(rootDir, '.git'));
            const { scope } = await inquirer.prompt([{
              type: 'list',
              name: 'scope',
              message: 'Apply to:',
              choices: [
                { name: 'Globally (all projects on this machine)', value: 'global' },
                { name: 'This project only', value: 'local' },
              ],
              default: hasGitDir ? 'local' : 'global',
            }]);
            const { email } = await inquirer.prompt([{
              type: 'input',
              name: 'email',
              message: 'Git email (should match your GitHub account):',
              validate: v => v.includes('@') || 'Enter a valid email',
            }]);
            const { name } = await inquirer.prompt([{
              type: 'input',
              name: 'name',
              message: 'Git name:',
              default: gitId.name || '',
              validate: v => v.length > 0 || 'Required',
            }]);
            try {
              const scopeFlag = scope === 'global' ? '--global ' : '';
              if (scope === 'local' && !hasGitDir) {
                execSync('git init', { cwd: rootDir, stdio: 'pipe' });
                gitInitializedEarly = true;
              }
              execSync(`git config ${scopeFlag}user.email "${email}"`, { cwd: rootDir, stdio: 'pipe' });
              execSync(`git config ${scopeFlag}user.name "${name}"`, { cwd: rootDir, stdio: 'pipe' });
              success(scope === 'global' ? 'Git identity configured globally' : 'Git identity configured for this repo');
            } catch (e) {
              warn(`Could not set git identity: ${e.message.split('\n')[0]}`);
              warn('Continuing — you can set it later with: git config user.email "..."');
            }
            console.log('');
          }
        }

        // Detect project context
        const detected = detectProjectContext(rootDir);

        // Determine project type: existing project vs. new/empty project
        let projectType = 'existing';
        if (detected.isEmpty) {
          projectType = 'new';
        } else if (!existingConfig) {
          // Has files but no Bobby config — ask to confirm
          const { initType } = await inquirer.prompt([{
            type: 'list',
            name: 'initType',
            message: 'What are you setting up?',
            choices: [
              { name: 'Add Bobby to this existing project', value: 'existing' },
              { name: 'Start a new project from scratch', value: 'new' },
            ],
            default: 'existing',
          }]);
          projectType = initType;
        }

        // Show detection results for existing projects
        if (projectType === 'existing' && !existingConfig) {
          const parts = [];
          if (detected.stack) parts.push(`stack: ${detected.stack}`);
          if (Object.keys(detected.commands).length > 0) parts.push(`commands: ${Object.keys(detected.commands).join(', ')}`);
          if (detected.hasExistingRules) parts.push(`existing rules: ${detected.hasExistingRules}`);
          if (parts.length > 0) {
            console.log(`  ${bold('Detected:')} ${parts.join(' · ')}`);
            console.log('');
          }
        }

        // Setup mode: quick or full
        const { setupMode } = await inquirer.prompt([{
          type: 'list',
          name: 'setupMode',
          message: 'Setup mode:',
          choices: [
            { name: 'Quick — project name + stack, sensible defaults for everything else', value: 'quick' },
            { name: 'Full — configure health checks, areas, services, and more', value: 'full' },
          ],
          default: 'quick',
        }]);

        // Detect custom stacks and prepend to choices
        const existingBobbyDir = existingConfig?.bobby_dir || '.bobby';
        const customStacks = detectCustomStacks(rootDir, existingBobbyDir);
        const stackChoices = [
          ...customStacks,
          { name: 'Next.js — npm commands, health check on :3000', value: 'nextjs' },
          { name: 'Rails + React — multi-repo, Docker + npm', value: 'rails-react' },
          { name: 'Django — manage.py commands, health check on :8000', value: 'django' },
          { name: 'Python / Flask — pytest, ruff, Flask on :5000', value: 'python-flask' },
          { name: 'Go — go test, golangci-lint, health check on :8080', value: 'go' },
          { name: 'Rust — cargo test, cargo clippy, health check on :8080', value: 'rust' },
          { name: 'Polyglot / Multi-Service — auto-detects services, per-service commands', value: 'polyglot' },
          { name: 'Other — empty defaults, configure manually in .bobbyrc.yml', value: 'generic' },
        ];

        // Use detected values as smart defaults
        const defaultProject = existingConfig?.project || detected.name;
        const defaultStack = existingConfig?.stack || detected.stack;

        const answers = await inquirer.prompt([
          { type: 'input', name: 'project', message: 'Project name:', default: defaultProject, validate: v => v.length > 0 || 'Required' },
          {
            type: 'list', name: 'stack', message: 'Stack:',
            choices: stackChoices,
            default: defaultStack,
          },
        ]);

        const stack = loadStack(answers.stack, rootDir, existingBobbyDir) || loadStack('generic', rootDir, existingBobbyDir);

        // Ask for AI target
        const { targetName } = await inquirer.prompt([{
          type: 'list',
          name: 'targetName',
          message: 'AI target:',
          choices: [
            { name: 'Claude Code — scaffolds to .claude/ (agents, skills, commands, CLAUDE.md)', value: 'claude-code' },
            { name: 'Cline (VS Code) — scaffolds to .clinerules/ (agents, skills, workflows)', value: 'cline' },
          ],
          default: existingConfig?.target || 'claude-code',
        }]);

        let devUrl;
        let bobbyDir;

        // Build default dev URL — prefer detected port, then existing config, then stack default
        const detectedPort = detected.devPort;
        const defaultDevUrl = detectedPort
          ? `http://localhost:${detectedPort}`
          : existingConfig?.health_checks?.[0]?.url || stack.health_checks[0]?.url || 'http://localhost:3000';

        if (setupMode === 'full') {
          // Ask for dev URL override
          ({ devUrl } = await inquirer.prompt([{
            type: 'input', name: 'devUrl', message: `Dev server URL:`, default: defaultDevUrl,
          }]));

          // Ask for Bobby directory
          ({ bobbyDir } = await inquirer.prompt([{
            type: 'input',
            name: 'bobbyDir',
            message: 'Bobby directory (tickets, runs, etc.):',
            default: existingConfig?.bobby_dir || '.bobby',
          }]));
        } else {
          // Quick mode: use best defaults
          devUrl = defaultDevUrl;
          bobbyDir = existingConfig?.bobby_dir || '.bobby';
        }

        // Update health check URL if changed
        if (stack.health_checks[0]) {
          stack.health_checks[0].url = devUrl;
        }

        // Auto-detect repos for multi-repo stacks (full mode only)
        let repos = [];
        if (setupMode === 'full' && stack.repos && stack.repos.length > 0) {
          // Find subdirectories with .git/
          const subdirs = fs.readdirSync(rootDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && fs.existsSync(path.join(rootDir, d.name, '.git')))
            .map(d => d.name);

          // Match against stack hints
          const detectedRepos = [];
          for (const hint of stack.repos) {
            const match = subdirs.find(d => d.includes(hint.path_hint));
            if (match) detectedRepos.push({ name: hint.name, path: match });
          }

          if (detectedRepos.length > 0) {
            console.log('');
            console.log(`  ${bold('Detected repos:')}`);
            detectedRepos.forEach(r => console.log(`    ${r.name}: ${r.path}`));
            console.log('');

            const { useDetected } = await inquirer.prompt([{
              type: 'confirm',
              name: 'useDetected',
              message: 'Use these repos for multi-repo shipping (PR per repo)?',
              default: true,
            }]);

            if (useDetected) repos = detectedRepos;
          }
        }

        // Service definition flow for polyglot stacks (full mode only)
        let services = existingConfig?.services || undefined;
        if (setupMode === 'full' && (stack.services || answers.stack === 'polyglot')) {
          const detectedServices = detectServices(rootDir);
          if (detectedServices.length > 0) {
            console.log('');
            console.log(`  ${bold('Detected services:')}`);
            detectedServices.forEach(s => console.log(`    ${s.name} (${s.language}) — ${s.path}`));
            console.log('');

            const { useDetected } = await inquirer.prompt([{
              type: 'confirm',
              name: 'useDetected',
              message: 'Use these detected services?',
              default: true,
            }]);

            if (useDetected) {
              services = {};
              for (const svc of detectedServices) {
                const svcAnswers = await inquirer.prompt([
                  { type: 'input', name: 'name', message: `Service name for ${svc.path}:`, default: svc.name },
                  { type: 'input', name: 'test', message: `  Test command:`, default: svc.commands.test },
                  { type: 'input', name: 'lint', message: `  Lint command:`, default: svc.commands.lint },
                  { type: 'input', name: 'build', message: `  Build command:`, default: svc.commands.build },
                  { type: 'input', name: 'healthUrl', message: `  Health check URL (blank to skip):`, default: '' },
                  { type: 'input', name: 'areas', message: `  Areas (comma-separated):`, default: '' },
                ]);
                services[svcAnswers.name] = {
                  path: svc.path,
                  language: svc.language,
                  commands: {
                    test: svcAnswers.test,
                    lint: svcAnswers.lint,
                    build: svcAnswers.build,
                  },
                  ...(svcAnswers.healthUrl ? { health_checks: [{ name: svcAnswers.name, url: svcAnswers.healthUrl }] } : {}),
                  ...(svcAnswers.areas ? { areas: svcAnswers.areas.split(',').map(a => a.trim()).filter(Boolean) } : {}),
                };
              }
            }
          }

          // Allow adding services manually
          let addMore = detectedServices.length === 0;
          if (detectedServices.length === 0) {
            console.log('');
            console.log(`  No services auto-detected. You can add them manually.`);
            services = services || {};
          }
          if (!addMore && detectedServices.length > 0) {
            const { wantMore } = await inquirer.prompt([{
              type: 'confirm', name: 'wantMore', message: 'Add more services manually?', default: false,
            }]);
            addMore = wantMore;
          }
          while (addMore) {
            services = services || {};
            const manual = await inquirer.prompt([
              { type: 'input', name: 'name', message: 'Service name (blank to finish):', default: '' },
            ]);
            if (!manual.name) break;
            const details = await inquirer.prompt([
              { type: 'input', name: 'path', message: `  Path (relative to root):`, default: manual.name },
              { type: 'list', name: 'language', message: `  Language:`, choices: ['dotnet', 'ruby', 'python', 'javascript', 'go', 'rust', 'java', 'other'] },
              { type: 'input', name: 'test', message: `  Test command:`, default: '' },
              { type: 'input', name: 'lint', message: `  Lint command:`, default: '' },
              { type: 'input', name: 'build', message: `  Build command:`, default: '' },
              { type: 'input', name: 'healthUrl', message: `  Health check URL (blank to skip):`, default: '' },
              { type: 'input', name: 'areas', message: `  Areas (comma-separated):`, default: '' },
            ]);
            services[manual.name] = {
              path: details.path,
              language: details.language,
              commands: { test: details.test, lint: details.lint, build: details.build },
              ...(details.healthUrl ? { health_checks: [{ name: manual.name, url: details.healthUrl }] } : {}),
              ...(details.areas ? { areas: details.areas.split(',').map(a => a.trim()).filter(Boolean) } : {}),
            };
          }
        }

        // Auto-detect project skills for the build agent
        const targetAdapter = getTarget(targetName);
        let buildSkills = [];
        if (setupMode === 'full') {
          const skillsDir = path.join(rootDir, targetAdapter.paths().skills);
          if (fs.existsSync(skillsDir)) {
            const projectSkills = fs.readdirSync(skillsDir, { withFileTypes: true })
              .filter(d => d.isDirectory() && !d.name.startsWith('bobby-'))
              .filter(d => fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')))
              .map(d => d.name);

            if (projectSkills.length > 0) {
              const { selectedSkills } = await inquirer.prompt([{
                type: 'checkbox',
                name: 'selectedSkills',
                message: 'Which project skills should the build agent follow?',
                choices: projectSkills.map(s => ({ name: s, checked: true })),
              }]);
              buildSkills = selectedSkills;
            }
          }
        }

        // Merge commands: detected project commands override stack defaults
        const mergedCommands = { ...stack.commands };
        if (projectType === 'existing' && Object.keys(detected.commands).length > 0) {
          Object.assign(mergedCommands, detected.commands);
        }

        const configBase = {
          project: answers.project,
          stack: answers.stack,
          target: targetName,
          bobby_dir: bobbyDir,
          tickets_dir: `${bobbyDir}/tickets`,
          sessions_dir: `${bobbyDir}/sessions`,
          health_checks: stack.health_checks,
          areas: stack.areas,
          ticket_prefix: 'TKT',
          commands: mergedCommands,
          repos: repos.length > 0 ? repos : undefined,
          services: services && Object.keys(services).length > 0 ? services : undefined,
          build_skills: buildSkills.length > 0 ? buildSkills : undefined,
          testing_tools: stack.testing_tools || ['curl'],
          max_retries: 3,
        };

        // Aggregate areas and health checks from services
        const config = {
          ...configBase,
          areas: aggregateAreas(configBase),
          health_checks: aggregateHealthChecks(configBase),
        };

        const scaffoldResult = scaffoldProject(rootDir, config);
        const gitInitialized = gitInitializedEarly || scaffoldResult?.gitInitialized;

        // Generate .gitignore for new projects (or if none exists)
        if (projectType === 'new' && !detected.hasGitignore) {
          const gitignoreContent = renderTemplate('gitignore.ejs', { stack: answers.stack });
          fs.writeFileSync(path.join(rootDir, '.gitignore'), gitignoreContent, 'utf8');
        }

        // Stub a README.md for new projects (only if none exists)
        let readmeCreated = false;
        if (projectType === 'new') {
          const readmePath = path.join(rootDir, 'README.md');
          if (!fs.existsSync(readmePath)) {
            fs.writeFileSync(readmePath, `# ${answers.project}\n`, 'utf8');
            readmeCreated = true;
          }
        }

        const tp = targetAdapter.paths();
        console.log('');

        // Notify about rules file backup
        if (detected.hasExistingRules) {
          const bakPath = path.join(rootDir, detected.hasExistingRules + '.pre-bobby');
          if (fs.existsSync(bakPath)) {
            warn(`Existing ${detected.hasExistingRules} backed up to ${detected.hasExistingRules}.pre-bobby`);
          }
        }
        if (gitInitialized) {
          success('Initialized git repo');
        }
        if (projectType === 'new') {
          success('Created .gitignore');
        }
        if (readmeCreated) {
          success('Created README.md');
        }
        success(`Created ${config.tickets_dir}/ (single directory, frontmatter-based stages)`);
        success(`Created ${config.sessions_dir}/ (session logs)`);
        success('Created .bobbyrc.yml');
        success(`Created ${tp.skills}/ with 21 workflow skills`);
        success(`Created ${tp.agents}/ with 17 agent definitions`);
        success(`Created ${tp.commands}/ with 20 slash commands`);
        success(`Created ${tp.rules} with Bobby workflow instructions`);
        if (config.conductor !== false) {
          success('Created conductor.json (for Conductor.build parallel workspaces)');
        }
        if ((targetName || 'claude-code') === 'claude-code') {
          success('Created hooks/precompact.sh + hooks/stop.sh (context checkpoint + learning capture)');
          success('Created .claude/settings.json (hooks configured)');
        }
        success(`Created ${bobbyDir || '.bobby'}/docs/ (drop diagrams and ADRs here for \`bobby run arch\`)`);
        success(`Created ${bobbyDir || '.bobby'}/decisions.yaml (architectural decision log)`);
        success(`Created ${bobbyDir || '.bobby'}/architecture-wakeup.md (run \`bobby run arch\` to populate)`);
        console.log('');
        // Offer local dev profile setup
        const localResult = await runLocalProfileWizard(rootDir, config);
        if (localResult) {
          saveLocalProfile(rootDir, config, localResult.profileName, localResult.profile);
          success(`Local profile "${localResult.profileName}" added to .bobbyrc.yml`);
        }

        // Offer an initial commit for new projects
        if (projectType === 'new' && fs.existsSync(path.join(rootDir, '.git'))) {
          const { makeCommit } = await inquirer.prompt([{
            type: 'confirm',
            name: 'makeCommit',
            message: 'Make an initial commit?',
            default: true,
          }]);
          if (makeCommit) {
            try {
              execSync('git add -A', { cwd: rootDir, stdio: 'pipe' });
              execSync('git commit -m "Initial commit: scaffold project with Bobby"', { cwd: rootDir, stdio: 'pipe' });
              success('Created initial commit');
              console.log('');
            } catch (e) {
              warn(`Could not create initial commit: ${e.message.split('\n')[0]}`);
              console.log('');
            }
          }
        }

        console.log("  You're ready! Here's how to get started:");
        console.log('');
        console.log('    bobby create -t "Build login"          # Create a ticket');
        console.log('    bobby create -t "Big feature" --epic   # Create an epic');
        console.log('    bobby list                             # See your board');
        console.log('    bobby run pipeline TKT-001             # Run the full pipeline');
        console.log('');
        console.log('  Tell Claude: "work tickets" and it\'ll pick up from the queue.');
        console.log('');
        if (localResult) {
          console.log(`  Local dev: /bobby-local ${localResult.profileName}`);
          console.log('');
        }
        console.log('  Want to learn more?');
        console.log('    .bobbyrc.yml                           # All config options (with comments)');
        console.log('    docs/CUSTOMIZING.md                    # Add agents, skills, pipelines');
        console.log('    docs/MIGRATING.md                      # Adopt Bobby incrementally');
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
