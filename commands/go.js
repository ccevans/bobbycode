// commands/go.js
// The golden path. One verb that answers "just make progress":
//   bobby go                → run the most valuable next action (from brief's logic)
//   bobby go "build login"  → create a ticket AND run the full workflow on it
//   bobby go TKT-007        → run the full workflow on that ticket
// Delegates execution by re-invoking the CLI (`bobby run …`), so go adds no
// second orchestration path — it only decides WHAT to run.
import { spawnSync } from 'child_process';
import { readConfig, findProjectRoot, resolveTicketsDir, resolveSprintsDir } from '../lib/config.js';
import { buildBrief } from '../lib/brief.js';
import { createTicket } from '../lib/tickets.js';
import { success, bold, dim, error } from '../lib/colors.js';

function looksLikeTicketId(token) {
  return /^[A-Za-z]+-\d+$/.test(token);
}

function exec(argv) {
  // Re-invoke this same CLI entry point with the resolved command.
  const result = spawnSync(process.execPath, [process.argv[1], ...argv], { stdio: 'inherit' });
  process.exit(result.status ?? 0);
}

export function registerGo(program) {
  program
    .command('go')
    .description('Make progress: no args runs the next best action; text creates a ticket and runs it; an ID runs that ticket')
    .argument('[what...]', 'Nothing, a ticket ID, or a ticket title')
    .option('-p, --priority <priority>', 'Priority when creating a ticket (critical, high, medium, low)', 'medium')
    .option('--workflow <name>', 'Workflow to run a new ticket through (default, secure, quick, or your own)')
    .action((what, opts) => {
      try {
        // Outside any project, `go` points you at the one command that starts things.
        let root;
        try {
          root = findProjectRoot();
        } catch {
          console.log('');
          console.log(`  ${bold("You're not in a Bobby project yet.")} Start one:`);
          console.log(`    ${bold('bobby new "your idea"')}   ${dim('# scaffolds a running project, then just run: bobby go')}`);
          console.log('');
          return;
        }
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);

        // bobby go TKT-007 — run the workflow on a specific ticket
        if (what.length === 1 && looksLikeTicketId(what[0])) {
          const id = what[0].toUpperCase();
          console.log(`  ${dim(`Running the workflow on ${id}…`)}`);
          exec(['run', 'workflow', id]);
          return;
        }

        // bobby go build the login page — capture + run in one step
        if (what.length > 0) {
          const title = what.join(' ').trim();
          const result = createTicket(ticketsDir, {
            prefix: config.ticket_prefix,
            title,
            priority: opts.priority,
            author: 'go',
            workflow: opts.workflow || null, // run reads this off the ticket
          });
          success(`Created ${result.id} — ${title}${opts.workflow ? `  (${opts.workflow} workflow)` : ''}`);
          console.log(`  ${dim('Now running it…')}`);
          exec(['run', 'workflow', result.id]);
          return;
        }

        // bobby go — do the most valuable next thing
        const sprintsDir = resolveSprintsDir(root, config);
        const b = buildBrief(ticketsDir, sprintsDir);
        const next = b.nextAction;
        if (!next.argv) {
          console.log('');
          console.log(`  ${bold('Nothing to do yet.')} Kick something off:`);
          console.log(`    ${bold('bobby go "describe a task"')}   ${dim('# create it and start building')}`);
          console.log(`    ${dim('or capture a thought for later:')} bobby idea "..."`);
          console.log('');
          return;
        }
        console.log(`  ${dim(`Next: ${next.reason}`)}`);
        console.log(`  ${dim(`→ ${next.command}`)}`);
        exec(next.argv);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
