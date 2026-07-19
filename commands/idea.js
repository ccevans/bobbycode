// commands/idea.js
import { readConfig, findProjectRoot, resolveTicketsDir, resolveIdeasFile } from '../lib/config.js';
import { addIdea, listIdeas, findIdea, markPromoted, removeIdea } from '../lib/ideas.js';
import { createTicket } from '../lib/tickets.js';
import { tryLogEntry } from '../lib/session.js';
import { success, warn, error, bold, dim } from '../lib/colors.js';

function ctx() {
  const root = findProjectRoot();
  const config = readConfig(root);
  return { root, config, ideasFile: resolveIdeasFile(root, config) };
}

function printIdeas(ideas, { all }) {
  console.log('');
  console.log(`  ${bold('Ideas')}`);
  console.log('');
  if (ideas.length === 0) {
    console.log(`  ${dim('No open ideas. Capture one: bobby idea "your idea here"')}`);
    console.log('');
    return;
  }
  for (const i of ideas) {
    const tag = i.promoted ? dim(`→ ${i.promoted}`) : '';
    console.log(`  ${bold(`#${i.n}`)}  ${i.text}  ${dim(i.created)} ${tag}`);
  }
  console.log('');
  if (!all) console.log(`  ${dim('Promote one into a ticket: bobby idea promote <n>')}`);
  console.log('');
}

export function registerIdea(program) {
  const cmd = program
    .command('idea')
    .description('Capture ideas that arrive mid-task, before they become tickets')
    .argument('[text...]', 'Idea text — captures it instantly')
    .action((text) => {
      try {
        const { root, config, ideasFile } = ctx();
        if (!text || text.length === 0) {
          printIdeas(listIdeas(ideasFile), { all: false });
          return;
        }
        const idea = addIdea(ideasFile, text.join(' '));
        success(`Captured idea #${idea.n}`);
        console.log(`  ${dim(idea.text)}`);
        tryLogEntry(root, config, { type: 'idea_add', n: idea.n, text: idea.text });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('list')
    .alias('ls')
    .description('List open ideas (--all to include promoted)')
    .option('--all', 'Include ideas already promoted to tickets')
    .action((opts) => {
      try {
        const { ideasFile } = ctx();
        printIdeas(listIdeas(ideasFile, { all: !!opts.all }), { all: !!opts.all });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('promote <n>')
    .description('Turn an idea into a backlog ticket')
    .option('-p, --priority <priority>', 'Priority (critical, high, medium, low)', 'medium')
    .option('--area <area>', 'Feature area')
    .option('--epic', 'Create as an epic (bobby-plan will break it down)')
    .action((n, opts) => {
      try {
        const { root, config, ideasFile } = ctx();
        const num = parseInt(n, 10);
        const idea = findIdea(ideasFile, num);
        if (!idea) throw new Error(`Idea #${n} not found. See open ideas: bobby idea list`);
        if (idea.promoted) {
          warn(`Idea #${num} was already promoted to ${idea.promoted}.`);
          return;
        }
        const ticketsDir = resolveTicketsDir(root, config);
        const result = createTicket(ticketsDir, {
          prefix: config.ticket_prefix,
          title: idea.text,
          type: opts.epic ? 'epic' : 'feature',
          priority: opts.priority,
          author: 'idea',
          area: opts.area || '',
        });
        markPromoted(ideasFile, num, result.id);
        success(`Promoted idea #${num} → ${result.id}`);
        console.log(`  → ${config.tickets_dir}/${result.dirname}/`);
        if (opts.epic) console.log(`  → Type: epic — run 'bobby run plan ${result.id}' to break it down`);
        tryLogEntry(root, config, { type: 'idea_promote', n: num, ticket: result.id });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('rm <n>')
    .alias('remove')
    .description('Delete an idea')
    .action((n) => {
      try {
        const { root, config, ideasFile } = ctx();
        const num = parseInt(n, 10);
        const removed = removeIdea(ideasFile, num);
        success(`Removed idea #${num}`);
        console.log(`  ${dim(removed.text)}`);
        tryLogEntry(root, config, { type: 'idea_remove', n: num });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
