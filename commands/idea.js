// commands/idea.js
import { readConfig, findProjectRoot, resolveTicketsDir, resolveIdeasFile } from '../lib/config.js';
import { addIdea, listIdeas, findIdea, markPromoted, removeIdea } from '../lib/ideas.js';
import { inboxFile } from '../lib/registry.js';
import { createTicket } from '../lib/tickets.js';
import { tryLogEntry } from '../lib/session.js';
import { success, warn, error, bold, dim } from '../lib/colors.js';

/**
 * Resolve where ideas live for this invocation. Inside a project → the
 * project's ideas file; outside any project (or with --inbox) → the global
 * inbox at ~/.bobby/inbox.yml, so a thought can be captured from anywhere.
 */
function ctx({ inbox = false } = {}) {
  let root = null;
  try { root = findProjectRoot(); } catch { /* outside any project */ }
  if (!root || inbox) {
    return { root, config: root ? readConfig(root) : null, ideasFile: inboxFile(), global: true };
  }
  const config = readConfig(root);
  return { root, config, ideasFile: resolveIdeasFile(root, config), global: false };
}

function printIdeas(ideas, { all, global: isGlobal }) {
  console.log('');
  console.log(`  ${bold(isGlobal ? 'Ideas — global inbox' : 'Ideas')}`);
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
  if (!all) {
    const hint = isGlobal
      ? 'Promote from inside a project: bobby idea promote <n> --inbox'
      : 'Promote one into a ticket: bobby idea promote <n>';
    console.log(`  ${dim(hint)}`);
  }
  console.log('');
}

export function registerIdea(program) {
  const cmd = program
    .command('idea')
    // Parent and subcommands both take --inbox; positional parsing keeps the
    // flag with whichever command it follows (see commander positional options).
    .enablePositionalOptions()
    .description('Capture ideas that arrive mid-task, before they become tickets')
    .argument('[text...]', 'Idea text — captures it instantly')
    .option('--inbox', 'Use the global inbox even when inside a project')
    .action((text, opts) => {
      try {
        const { root, config, ideasFile, global: isGlobal } = ctx({ inbox: !!opts.inbox });
        if (!text || text.length === 0) {
          printIdeas(listIdeas(ideasFile), { all: false, global: isGlobal });
          return;
        }
        const idea = addIdea(ideasFile, text.join(' '));
        success(`Captured idea #${idea.n}${isGlobal ? ' (global inbox)' : ''}`);
        console.log(`  ${dim(idea.text)}`);
        if (root && config) tryLogEntry(root, config, { type: 'idea_add', n: idea.n, text: idea.text });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('list')
    .alias('ls')
    .description('List open ideas (--all to include promoted, --inbox for the global inbox)')
    .option('--all', 'Include ideas already promoted to tickets')
    .option('--inbox', 'Show the global inbox')
    .action((opts) => {
      try {
        const { ideasFile, global: isGlobal } = ctx({ inbox: !!opts.inbox });
        printIdeas(listIdeas(ideasFile, { all: !!opts.all }), { all: !!opts.all, global: isGlobal });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('promote <n>')
    .description('Turn an idea into a backlog ticket in the current project')
    .option('-p, --priority <priority>', 'Priority (critical, high, medium, low)', 'medium')
    .option('--area <area>', 'Feature area')
    .option('--epic', 'Create as an epic (bobby-plan will break it down)')
    .option('--inbox', 'Promote from the global inbox into this project')
    .action((n, opts) => {
      try {
        const { root, config, ideasFile } = ctx({ inbox: !!opts.inbox });
        if (!root) {
          throw new Error('Promoting creates a ticket, so it needs a project. cd into one and rerun (use --inbox to pull from the global inbox).');
        }
        const num = parseInt(n, 10);
        const idea = findIdea(ideasFile, num);
        if (!idea) throw new Error(`Idea #${n} not found. See open ideas: bobby idea list${opts.inbox ? ' --inbox' : ''}`);
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
        success(`Promoted idea #${num} → ${result.id}${opts.inbox ? ' (from global inbox)' : ''}`);
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
    .option('--inbox', 'Delete from the global inbox')
    .action((n, opts) => {
      try {
        const { root, config, ideasFile } = ctx({ inbox: !!opts.inbox });
        const num = parseInt(n, 10);
        const removed = removeIdea(ideasFile, num);
        success(`Removed idea #${num}`);
        console.log(`  ${dim(removed.text)}`);
        if (root && config) tryLogEntry(root, config, { type: 'idea_remove', n: num });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
