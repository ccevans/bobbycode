// commands/create.js
import path from 'path';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { createTicket, listTickets } from '../lib/tickets.js';
import { success, warn, error } from '../lib/colors.js';
import { tryLogEntry } from '../lib/session.js';

export function registerCreate(program) {
  program
    .command('create')
    .description('Create a new ticket in backlog')
    .requiredOption('-t, --title <title>', 'Ticket title')
    .option('--type <type>', 'Ticket type (bug, feature, improvement, task)', 'feature')
    .option('-p, --priority <priority>', 'Priority (critical, high, medium, low)', 'medium')
    .option('-a, --author <author>', 'Created by', 'unknown')
    .option('--area <area>', 'Feature area')
    .option('--epic', 'Create as an epic (bobby-plan will break it down)')
    .option('--parent <id>', 'Parent epic ticket ID')
    .option('--services <names>', 'Comma-separated service names this ticket touches')
    .option('--repos <names>', 'Comma-separated repos from the project group this ticket touches (v2)')
    .option('--workflow <name>', 'Named workflow to run this ticket through (default, secure, quick, or your own)')
    .option('--feature <id>', 'Feature-map row this ticket implements (e.g. F1.2) — see .bobby/product/feature-map.md')
    .option('--persona <id>', 'Persona this ticket serves (e.g. P1) — see .bobby/product/personas.md')
    .action((opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);

        // v2: which repos this ticket touches. Explicit --repos wins; otherwise
        // default to the project's whole repo subset. Validate against it so a
        // typo can't point work at a repo the project doesn't use.
        let repos = null;
        if (config.studio) {
          const allowed = config.project_repos || [];
          repos = opts.repos ? opts.repos.split(',').map(s => s.trim()).filter(Boolean) : allowed;
          const bad = repos.filter(r => !allowed.includes(r));
          if (bad.length) {
            error(`Ticket repos not in project '${config._project}' (${allowed.join(', ') || 'none'}): ${bad.join(', ')}`);
            process.exit(1);
          }
        }

        const result = createTicket(ticketsDir, {
          prefix: config.ticket_prefix,
          title: opts.title.trim(),
          type: opts.epic ? 'epic' : opts.type,
          priority: opts.priority,
          author: opts.author,
          area: opts.area || '',
          parent: opts.parent || null,
          services: opts.services ? opts.services.split(',').map(s => s.trim()) : null,
          repos,
          workflow: opts.workflow || null,
          feature: opts.feature || null,
          persona: opts.persona || null,
        });
        success(`Created ${result.id} — ${opts.title}`);
        console.log(`  → ${config.tickets_dir}/${result.dirname}/`);
        tryLogEntry(root, config, { type: 'create', ticket: result.id, title: opts.title, ticketType: opts.epic ? 'epic' : opts.type, parent: opts.parent || null });
        if (opts.epic) {
          console.log(`  → Type: epic — run 'bobby run plan ${result.id}' to break it down`);
        }

        // Backlog cap warning
        if (config.backlog_limit) {
          const backlogCount = listTickets(ticketsDir, { stage: 'backlog' }).length;
          if (backlogCount > config.backlog_limit) {
            warn(`Backlog has ${backlogCount} items (limit: ${config.backlog_limit}). Run: bobby ticket triage`);
          }
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
