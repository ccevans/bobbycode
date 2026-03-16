// commands/init.js
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { writeConfig, configExists } from '../lib/config.js';
import { STAGES } from '../lib/stages.js';
import { renderTemplate, renderSkillTemplates } from '../lib/template.js';
import { success, warn, error, bold } from '../lib/colors.js';

// Load stack configs
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STACKS_DIR = path.join(__dirname, '..', 'stacks');

function loadStack(stackName) {
  const stackFile = path.join(STACKS_DIR, `${stackName}.json`);
  if (!fs.existsSync(stackFile)) return null;
  return JSON.parse(fs.readFileSync(stackFile, 'utf8'));
}

export function scaffoldProject(rootDir, config) {
  const ticketsDir = path.join(rootDir, config.tickets_dir);

  // Create stage directories (don't wipe existing tickets)
  for (const stage of STAGES) {
    fs.mkdirSync(path.join(ticketsDir, stage), { recursive: true });
  }
  fs.mkdirSync(path.join(ticketsDir, 'retrospectives'), { recursive: true });
  fs.mkdirSync(path.join(ticketsDir, 'docs'), { recursive: true });

  // Write config
  writeConfig(rootDir, config);

  // Build template data
  const templateData = {
    ...config,
    commands: config.commands || {},
  };

  // Render and write CLAUDE.md
  const claudeMd = renderTemplate('CLAUDE.md.ejs', templateData);
  fs.writeFileSync(path.join(rootDir, 'CLAUDE.md'), claudeMd, 'utf8');

  // Render and write WORKFLOW.md
  const workflowMd = renderTemplate('WORKFLOW.md.ejs', templateData);
  fs.writeFileSync(path.join(ticketsDir, 'WORKFLOW.md'), workflowMd, 'utf8');

  // Render and write ticket template
  const ticketTpl = renderTemplate('ticket.md.ejs', templateData);
  fs.writeFileSync(path.join(ticketsDir, '.template.md'), ticketTpl, 'utf8');

  // Create tickets/README.md
  const readmePath = path.join(ticketsDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, `# ${config.project} — Tickets\n\nManaged by [Bobby](https://github.com/ccevans/bobby). Run \`bobby list\` to see the board.\n`, 'utf8');
  }

  // Initialize counters (only if they don't exist)
  const counterFile = path.join(ticketsDir, '.counter');
  if (!fs.existsSync(counterFile)) {
    fs.writeFileSync(counterFile, '0', 'utf8');
  }
  const ideaCounterFile = path.join(ticketsDir, '.idea-counter');
  if (!fs.existsSync(ideaCounterFile)) {
    fs.writeFileSync(ideaCounterFile, '0', 'utf8');
  }

  // Render skills
  const skillsDir = path.join(rootDir, '.claude', 'skills');
  renderSkillTemplates(skillsDir, templateData);
}

export function registerInit(program) {
  program
    .command('init')
    .description('Initialize a new Bobby project')
    .action(async () => {
      try {
        const rootDir = process.cwd();

        // Check for existing project
        if (configExists(rootDir)) {
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

        const answers = await inquirer.prompt([
          { type: 'input', name: 'project', message: 'Project name:', validate: v => v.length > 0 || 'Required' },
          {
            type: 'list', name: 'stack', message: 'Stack:',
            choices: [
              { name: 'Next.js', value: 'nextjs' },
              { name: 'Rails + React', value: 'rails-react' },
              { name: 'Python / Flask', value: 'python-flask' },
              { name: 'Other (configure manually)', value: 'generic' },
            ],
          },
        ]);

        const stack = loadStack(answers.stack) || loadStack('generic');

        // Ask for dev URL override
        const defaultUrl = stack.health_checks[0]?.url || 'http://localhost:3000';
        const { devUrl } = await inquirer.prompt([{
          type: 'input', name: 'devUrl', message: `Dev server URL:`, default: defaultUrl,
        }]);

        // Update health check URL if changed
        if (stack.health_checks[0]) {
          stack.health_checks[0].url = devUrl;
        }

        const config = {
          project: answers.project,
          stack: answers.stack,
          tickets_dir: 'tickets',
          health_checks: stack.health_checks,
          areas: stack.areas,
          skill_routing: stack.skill_routing,
          ticket_prefix: 'TKT',
          idea_prefix: 'IDEA',
          commands: stack.commands,
        };

        scaffoldProject(rootDir, config);

        console.log('');
        success('Created tickets/ with 10 lifecycle stages');
        success('Created .bobbyrc.yml');
        success('Created .claude/skills/ with 6 workflow skills');
        success('Created CLAUDE.md with Bobby workflow instructions');
        success('Created tickets/WORKFLOW.md');
        console.log('');
        console.log("  You're ready! Here's how to get started:");
        console.log('');
        console.log('    bobby idea "my first feature"     # Capture an idea');
        console.log('    bobby create -t "Build login"     # Create a ticket');
        console.log('    bobby list                        # See your board');
        console.log('');
        console.log('  Tell Claude: "work tickets" and it\'ll pick up from the queue.');
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
