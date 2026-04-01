// commands/init.js
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { writeConfig, readConfig, configExists } from '../lib/config.js';
import { renderTemplate, renderSkillTemplates } from '../lib/template.js';
import { success, warn, error, bold } from '../lib/colors.js';
import { getTarget, TARGETS } from '../lib/targets/index.js';
import { detectServices, aggregateAreas, aggregateHealthChecks } from '../lib/services.js';

// Load stack configs
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STACKS_DIR = path.join(__dirname, '..', 'stacks');
const AGENT_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'agents');
const COMMAND_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'commands');

function loadStack(stackName) {
  const stackFile = path.join(STACKS_DIR, `${stackName}.json`);
  if (!fs.existsSync(stackFile)) return null;
  return JSON.parse(fs.readFileSync(stackFile, 'utf8'));
}

export function scaffoldProject(rootDir, config) {
  // Derive bobby_dir, runs_dir if not explicitly provided
  const bobbyDir = config.bobby_dir || '.bobby';
  if (!config.tickets_dir) config.tickets_dir = `${bobbyDir}/tickets`;
  if (!config.runs_dir) config.runs_dir = `${bobbyDir}/runs`;

  // Resolve target adapter
  const target = getTarget(config.target || 'claude-code');
  const targetPaths = target.paths();

  const ticketsDir = path.join(rootDir, config.tickets_dir);

  // Create single tickets directory (no stage folders)
  fs.mkdirSync(ticketsDir, { recursive: true });
  fs.mkdirSync(path.join(ticketsDir, 'retrospectives'), { recursive: true });

  // Create runs directory for pipeline run logs
  const runsDir = path.join(rootDir, config.runs_dir);
  fs.mkdirSync(runsDir, { recursive: true });

  // Write config
  writeConfig(rootDir, config);

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
  fs.writeFileSync(rulesPath, rulesContent, 'utf8');

  // Render and write conductor.json for Conductor.build users
  const conductorJson = renderTemplate('conductor.json.ejs', templateData);
  fs.writeFileSync(path.join(rootDir, 'conductor.json'), conductorJson, 'utf8');

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

  const agentFiles = ['bobby-plan', 'bobby-build', 'bobby-review', 'bobby-test', 'bobby-ship', 'bobby-ux', 'bobby-pm', 'bobby-qe', 'bobby-vet', 'bobby-strategy', 'bobby-security', 'bobby-debug', 'bobby-docs', 'bobby-performance', 'bobby-watchdog'];
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

  // Target-specific extras (e.g., .clineignore for Cline)
  target.scaffoldExtras(rootDir);
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
          const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Bobby is already set up. Re-initialize? (Config and skills regenerated, tickets preserved)',
            default: false,
          }]);
          if (!confirm) { console.log('Cancelled.'); return; }
        }

        console.log('');
        console.log(`  Welcome to ${bold('Bobby')} — your pair programmer.`);
        console.log('');

        const stackChoices = [
          { name: 'Next.js', value: 'nextjs' },
          { name: 'Rails + React', value: 'rails-react' },
          { name: 'Python / Flask', value: 'python-flask' },
          { name: 'Polyglot / Multi-Service', value: 'polyglot' },
          { name: 'Other (configure manually)', value: 'generic' },
        ];

        const answers = await inquirer.prompt([
          { type: 'input', name: 'project', message: 'Project name:', default: existingConfig?.project, validate: v => v.length > 0 || 'Required' },
          {
            type: 'list', name: 'stack', message: 'Stack:',
            choices: stackChoices,
            default: existingConfig?.stack,
          },
        ]);

        const stack = loadStack(answers.stack) || loadStack('generic');

        // Ask for AI target
        const { targetName } = await inquirer.prompt([{
          type: 'list',
          name: 'targetName',
          message: 'AI target:',
          choices: [
            { name: 'Claude Code', value: 'claude-code' },
            { name: 'Cline (VS Code)', value: 'cline' },
          ],
          default: existingConfig?.target || 'claude-code',
        }]);

        // Ask for dev URL override
        const defaultUrl = existingConfig?.health_checks?.[0]?.url || stack.health_checks[0]?.url || 'http://localhost:3000';
        const { devUrl } = await inquirer.prompt([{
          type: 'input', name: 'devUrl', message: `Dev server URL:`, default: defaultUrl,
        }]);

        // Update health check URL if changed
        if (stack.health_checks[0]) {
          stack.health_checks[0].url = devUrl;
        }

        // Ask for Bobby directory
        const { bobbyDir } = await inquirer.prompt([{
          type: 'input',
          name: 'bobbyDir',
          message: 'Bobby directory (tickets, runs, etc.):',
          default: existingConfig?.bobby_dir || '.bobby',
        }]);

        // Auto-detect repos for multi-repo stacks
        let repos = [];
        if (stack.repos && stack.repos.length > 0) {
          // Find subdirectories with .git/
          const subdirs = fs.readdirSync(rootDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && fs.existsSync(path.join(rootDir, d.name, '.git')))
            .map(d => d.name);

          // Match against stack hints
          const detected = [];
          for (const hint of stack.repos) {
            const match = subdirs.find(d => d.includes(hint.path_hint));
            if (match) detected.push({ name: hint.name, path: match });
          }

          if (detected.length > 0) {
            console.log('');
            console.log(`  ${bold('Detected repos:')}`);
            detected.forEach(r => console.log(`    ${r.name}: ${r.path}`));
            console.log('');

            const { useDetected } = await inquirer.prompt([{
              type: 'confirm',
              name: 'useDetected',
              message: 'Use these repos for multi-repo shipping (PR per repo)?',
              default: true,
            }]);

            if (useDetected) repos = detected;
          }
        }

        // Service definition flow for polyglot stacks
        let services = existingConfig?.services || undefined;
        if (stack.services || answers.stack === 'polyglot') {
          const detected = detectServices(rootDir);
          if (detected.length > 0) {
            console.log('');
            console.log(`  ${bold('Detected services:')}`);
            detected.forEach(s => console.log(`    ${s.name} (${s.language}) — ${s.path}`));
            console.log('');

            const { useDetected } = await inquirer.prompt([{
              type: 'confirm',
              name: 'useDetected',
              message: 'Use these detected services?',
              default: true,
            }]);

            if (useDetected) {
              services = {};
              for (const svc of detected) {
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
          let addMore = detected.length === 0;
          if (detected.length === 0) {
            console.log('');
            console.log(`  No services auto-detected. You can add them manually.`);
            services = services || {};
          }
          if (!addMore && detected.length > 0) {
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

        const configBase = {
          project: answers.project,
          stack: answers.stack,
          target: targetName,
          bobby_dir: bobbyDir,
          tickets_dir: `${bobbyDir}/tickets`,
          runs_dir: `${bobbyDir}/runs`,
          health_checks: stack.health_checks,
          areas: stack.areas,
          ticket_prefix: 'TKT',
          commands: stack.commands,
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

        scaffoldProject(rootDir, config);

        const tp = targetAdapter.paths();
        console.log('');
        success(`Created ${config.tickets_dir}/ (single directory, frontmatter-based stages)`);
        success(`Created ${config.runs_dir}/ (pipeline run logs)`);
        success('Created .bobbyrc.yml');
        success(`Created ${tp.skills}/ with 17 workflow skills`);
        success(`Created ${tp.agents}/ with 15 agent definitions`);
        success(`Created ${tp.commands}/ with 17 slash commands`);
        success(`Created ${tp.rules} with Bobby workflow instructions`);
        success('Created conductor.json (for Conductor.build parallel workspaces)');
        console.log('');
        console.log("  You're ready! Here's how to get started:");
        console.log('');
        console.log('    bobby create -t "Build login"          # Create a ticket');
        console.log('    bobby create -t "Big feature" --epic   # Create an epic');
        console.log('    bobby list                             # See your board');
        console.log('    bobby run pipeline TKT-001             # Run the full pipeline');
        console.log('');
        console.log('  Tell Claude: "work tickets" and it\'ll pick up from the queue.');
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
