// commands/init.js
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { writeConfig, readConfig, configExists } from '../lib/config.js';
import { renderTemplate, renderSkillTemplates } from '../lib/template.js';
import { success, warn, error, bold } from '../lib/colors.js';

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

  const ticketsDir = path.join(rootDir, config.tickets_dir);

  // Create single tickets directory (no stage folders)
  fs.mkdirSync(ticketsDir, { recursive: true });
  fs.mkdirSync(path.join(ticketsDir, 'retrospectives'), { recursive: true });

  // Create runs directory for pipeline run logs
  const runsDir = path.join(rootDir, config.runs_dir);
  fs.mkdirSync(runsDir, { recursive: true });

  // Write config
  writeConfig(rootDir, config);

  // Build template data
  const templateData = {
    ...config,
    commands: config.commands || {},
    build_skills: config.build_skills || [],
  };

  // Render and write CLAUDE.md
  const claudeMd = renderTemplate('CLAUDE.md.ejs', templateData);
  fs.writeFileSync(path.join(rootDir, 'CLAUDE.md'), claudeMd, 'utf8');

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

  // Render skills
  const skillsDir = path.join(rootDir, '.claude', 'skills');
  renderSkillTemplates(skillsDir, templateData);

  // Scaffold agent definitions
  const agentsDir = path.join(rootDir, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  const agentFiles = ['bobby-plan', 'bobby-build', 'bobby-review', 'bobby-test', 'bobby-ship', 'bobby-ux', 'bobby-pm', 'bobby-qe'];
  for (const agent of agentFiles) {
    const agentTemplate = path.join(AGENT_TEMPLATES_DIR, `${agent}.md.ejs`);
    if (fs.existsSync(agentTemplate)) {
      const content = renderTemplate(`agents/${agent}.md.ejs`, templateData);
      fs.writeFileSync(path.join(agentsDir, `${agent}.md`), content, 'utf8');
    }
  }

  // Scaffold slash commands
  const commandsDir = path.join(rootDir, '.claude', 'commands');
  fs.mkdirSync(commandsDir, { recursive: true });

  const commandFiles = fs.readdirSync(COMMAND_TEMPLATES_DIR).filter(f => f.endsWith('.md'));
  for (const file of commandFiles) {
    const src = path.join(COMMAND_TEMPLATES_DIR, file);
    fs.writeFileSync(path.join(commandsDir, file), fs.readFileSync(src, 'utf8'), 'utf8');
  }
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

        // Auto-detect project skills for the build agent
        let buildSkills = [];
        const skillsDir = path.join(rootDir, '.claude', 'skills');
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

        const config = {
          project: answers.project,
          stack: answers.stack,
          bobby_dir: bobbyDir,
          tickets_dir: `${bobbyDir}/tickets`,
          runs_dir: `${bobbyDir}/runs`,
          health_checks: stack.health_checks,
          areas: stack.areas,
          ticket_prefix: 'TKT',
          commands: stack.commands,
          repos: repos.length > 0 ? repos : undefined,
          build_skills: buildSkills.length > 0 ? buildSkills : undefined,
          max_retries: 3,
        };

        scaffoldProject(rootDir, config);

        console.log('');
        success(`Created ${config.tickets_dir}/ (single directory, frontmatter-based stages)`);
        success(`Created ${config.runs_dir}/ (pipeline run logs)`);
        success('Created .bobbyrc.yml');
        success('Created .claude/skills/ with 9 workflow skills');
        success('Created .claude/agents/ with 8 agent definitions');
        success('Created .claude/commands/ with 10 slash commands');
        success('Created CLAUDE.md with Bobby workflow instructions');
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
