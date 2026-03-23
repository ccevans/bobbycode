// commands/list.js
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { STAGES, stageColor } from '../lib/stages.js';
import { listTickets } from '../lib/tickets.js';
import { bold, dim, error } from '../lib/colors.js';

const ACTIVE_STAGES = ['planning', 'building', 'reviewing', 'testing'];

function renderBoard(ticketsDir, filterStages, opts) {
  const filters = {};
  if (opts.blocked) filters.blocked = true;
  if (opts.epic) filters.epic = opts.epic;

  const tickets = listTickets(ticketsDir, filters);

  console.log('');
  console.log(`  ${bold('TICKET BOARD')}`);
  console.log('  ═══════════════════════════════════════════════════');
  console.log('');

  // Group by stage
  const byStage = {};
  for (const t of tickets) {
    const s = t.stage || 'backlog';
    if (!byStage[s]) byStage[s] = [];
    byStage[s].push(t);
  }

  const stagesToShow = filterStages.length > 0 ? filterStages : STAGES;

  for (const stage of stagesToShow) {
    const stageTickets = byStage[stage] || [];
    const colorFn = stageColor(stage);

    console.log(`  ${colorFn(bold(`▎ ${stage.toUpperCase()}`))} ${dim(`(${stageTickets.length})`)}`);

    if (stageTickets.length === 0) {
      console.log(`    ${dim('(empty)')}`);
    } else {
      for (const t of stageTickets) {
        const priority = t.priority || '';
        const assigned = t.assigned || '—';
        const parent = t.parent ? ` ${dim(`[${t.parent}]`)}` : '';
        const blockedTag = t.blocked ? ` ${dim('🚫 ' + (t.blocked_reason || 'blocked'))}` : '';
        console.log(`    ${bold(t.id)}  ${t.title}  ${dim(`[${priority}]`)}  ${dim(`→ ${assigned}`)}${parent}${blockedTag}`);
      }
    }
    console.log('');
  }
}

export function registerList(program) {
  program
    .command('list [stages...]')
    .description('Show ticket board (optionally filter by stages)')
    .option('--blocked', 'Show only blocked tickets')
    .option('--epic <id>', 'Show children of an epic')
    .option('--active', 'Show active stages: planning, building, reviewing, testing')
    .option('-w, --watch [seconds]', 'Auto-refresh the board')
    .action((stages, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);

        const filterStages = opts.active ? ACTIVE_STAGES : (stages || []);

        if (opts.watch !== undefined) {
          const interval = (parseInt(opts.watch, 10) || 3) * 1000;
          // Enter alternate screen buffer (like top/htop)
          process.stdout.write('\x1B[?1049h\x1B[?25l');
          const render = () => {
            process.stdout.write('\x1B[H\x1B[2J');
            renderBoard(ticketsDir, filterStages, opts);
            console.log(dim(`  Refreshing every ${interval / 1000}s — Ctrl+C to exit`));
          };
          // Restore on exit
          const cleanup = () => {
            process.stdout.write('\x1B[?25h\x1B[?1049l');
            process.exit(0);
          };
          process.on('SIGINT', cleanup);
          process.on('SIGTERM', cleanup);
          render();
          setInterval(render, interval);
        } else {
          renderBoard(ticketsDir, filterStages, opts);
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
