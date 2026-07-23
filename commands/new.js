// commands/new.js
// The 0 -> 1 on-ramp: turn a one-line idea into a scaffolded project with an
// MVP epic, ready to build. Reuses the exact `bobby init` scaffolding, then
// captures the idea as an epic and hands off to the feature workflow.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { scaffoldProject, loadStack } from './init.js';
import { aggregateAreas, aggregateHealthChecks } from '../lib/services.js';
import { renderTemplate } from '../lib/template.js';
import { createTicket, slugify, readTicket, writeTicket } from '../lib/tickets.js';
import { applyStarter } from '../lib/starters.js';
import { success, warn, error, bold, dim } from '../lib/colors.js';

// Stacks with a built-in runnable starter come first (they're the point of `new`);
// framework stacks scaffold Bobby only until they get a starter.
const STACKS = ['node', 'web', 'nextjs', 'rails-react', 'django', 'python-flask', 'go', 'rust', 'polyglot', 'generic'];

// Bake the idea into the epic's description so the plan/build agents know the goal.
function injectIdea(ticketDir, idea) {
  const t = readTicket(ticketDir);
  if (!t) return;
  const body = t.content.replace(
    /## Description\n\n\[[^\]]*\]/,
    `## Description\n\n**The idea:** ${idea}\n\nThis is the MVP epic. Break it into the smallest set of tickets that make the ` +
    `idea real and runnable, then build them. Favor the shortest path to something a user can actually try.`
  );
  writeTicket(ticketDir, t.data, body);
}

export function registerNew(program) {
  program
    .command('new <idea...>')
    .description('Spin up a brand-new project from an idea — scaffolds Bobby, creates the MVP epic, hands off to build')
    .option('--dir <name>', 'Directory to create (default: a slug of the idea)')
    .option('--stack <stack>', `Stack preset: ${STACKS.join(' | ')}`, 'node')
    .action((ideaWords, opts) => {
      try {
        const idea = ideaWords.join(' ').trim();
        if (!idea) throw new Error('Give me an idea: bobby new "a habit tracker for runners"');
        if (!STACKS.includes(opts.stack)) {
          throw new Error(`Unknown stack "${opts.stack}". Valid: ${STACKS.join(', ')}`);
        }

        const dirName = (opts.dir || slugify(idea)).slice(0, 50).replace(/-+$/, '') || 'new-project';
        const root = path.resolve(process.cwd(), dirName);
        if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
          throw new Error(`"${dirName}" already exists and isn't empty. Pick a name with --dir <name>.`);
        }
        fs.mkdirSync(root, { recursive: true });

        const stack = loadStack(opts.stack, root) || loadStack('generic', root);

        const bobbyDir = '.bobby';
        const configBase = {
          project: dirName,
          stack: opts.stack,
          target: 'claude-code',
          bobby_dir: bobbyDir,
          tickets_dir: `${bobbyDir}/tickets`,
          sessions_dir: `${bobbyDir}/sessions`,
          health_checks: stack.health_checks,
          areas: stack.areas,
          ticket_prefix: 'TKT',
          commands: { ...stack.commands },
          testing_tools: stack.testing_tools || ['curl'],
          max_retries: 3,
        };
        const config = {
          ...configBase,
          areas: aggregateAreas(configBase),
          health_checks: aggregateHealthChecks(configBase),
        };

        // Scaffold Bobby (identical to `bobby init`): .bobby/, .claude/, config, git init.
        scaffoldProject(root, config);

        // Lay down a runnable app skeleton if this stack has a built-in starter.
        const starter = applyStarter(opts.stack, root, { project: dirName, idea });

        // New-project niceties: .gitignore + README seeded with the idea.
        try {
          fs.writeFileSync(path.join(root, '.gitignore'), renderTemplate('gitignore.ejs', { stack: opts.stack }), 'utf8');
        } catch { /* gitignore is best-effort */ }
        const readmePath = path.join(root, 'README.md');
        if (!fs.existsSync(readmePath)) {
          fs.writeFileSync(readmePath, `# ${dirName}\n\n> ${idea}\n`, 'utf8');
        }

        // Capture the idea as the MVP epic.
        const ticketsDir = path.join(root, config.tickets_dir);
        const epic = createTicket(ticketsDir, {
          prefix: config.ticket_prefix,
          title: idea,
          type: 'epic',
          priority: 'high',
          author: 'new',
        });
        injectIdea(epic.path, idea);

        // Initial commit (best-effort — mirrors init).
        try {
          execSync('git add -A', { cwd: root, stdio: 'pipe' });
          execSync(`git commit -m ${JSON.stringify(`Scaffold ${epic.id}: ${idea}`)}`, { cwd: root, stdio: 'pipe' });
        } catch (e) {
          warn(`Could not create initial commit: ${e.message.split('\n')[0]}`);
        }

        console.log('');
        success(`New project ready in ./${dirName}/`);
        if (starter) {
          console.log(`  ${dim(`${starter.label} skeleton scaffolded — it runs right now.`)}`);
        }
        console.log(`  ${dim(`Epic ${epic.id} captures your idea — the MVP grows from here.`)}`);
        console.log('');
        console.log(`    ${bold(`cd ${dirName}`)}`);
        if (starter) {
          console.log(`    ${bold(starter.dev)}   ${dim(`# run it now → ${starter.url}`)}`);
        }
        console.log(`    ${bold(`bobby run plan ${epic.id}`)}      ${dim('# break the idea into MVP tickets')}`);
        console.log(`    ${bold(`bobby run feature ${epic.id}`)}   ${dim('# then build them on one branch')}`);
        console.log('');
        console.log(`  ${dim('More ideas: bobby idea "..."   ·   see the board: bobby ticket list')}`);
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
