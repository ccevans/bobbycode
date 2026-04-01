// commands/list.js
import path from 'path';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { STAGES, stageColor } from '../lib/stages.js';
import { listTickets, backlogHealth } from '../lib/tickets.js';
import { bold, dim, warn, error } from '../lib/colors.js';

const ACTIVE_STAGES = ['planning', 'building', 'reviewing', 'testing'];

function renderBoard(ticketsDir, filterStages, opts, config) {
  const filters = {};
  if (opts.blocked) filters.blocked = true;
  if (opts.epic) filters.epic = opts.epic;
  if (opts.area) filters.area = opts.area;
  if (opts.priority) filters.priority = opts.priority;
  if (opts.type) filters.type = opts.type;
  if (opts.stale) filters.staleDays = parseInt(opts.stale, 10);
  if (opts.sort) filters.sort = opts.sort;

  // When filtering by stage via positional args, apply stage filter in listTickets
  // only when a single stage is selected (otherwise we group manually)
  const singleStage = filterStages.length === 1 ? filterStages[0] : null;
  if (singleStage) filters.stage = singleStage;

  const tickets = listTickets(ticketsDir, filters);

  console.log('');
  console.log(`  ${bold('TICKET BOARD')}`);
  console.log('  ═══════════════════════════════════════════════════');

  // Show active filters
  const activeFilters = [];
  if (opts.area) activeFilters.push(`area: ${opts.area}`);
  if (opts.priority) activeFilters.push(`priority: ${opts.priority}`);
  if (opts.type) activeFilters.push(`type: ${opts.type}`);
  if (opts.stale) activeFilters.push(`stale: >${opts.stale} days`);
  if (opts.sort) activeFilters.push(`sort: ${opts.sort}`);
  if (activeFilters.length > 0) {
    console.log(`  ${dim('Filters: ' + activeFilters.join(' · '))}`);
  }
  console.log('');

  // When --sort is active, render a flat list with stage tags
  if (opts.sort) {
    if (tickets.length === 0) {
      console.log(`    ${dim('No tickets match filters.')}`);
    } else {
      for (const t of tickets) {
        const colorFn = stageColor(t.stage || 'backlog');
        const stageTag = colorFn(`[${(t.stage || 'backlog').toUpperCase()}]`);
        const priority = t.priority || '';
        const assigned = t.assigned || '—';
        const parent = t.parent ? ` ${dim(`[${t.parent}]`)}` : '';
        const blockedTag = t.blocked ? ` ${dim('🚫 ' + (t.blocked_reason || 'blocked'))}` : '';
        console.log(`    ${bold(t.id)}  ${stageTag}  ${t.title}  ${dim(`[${priority}]`)}  ${dim(`→ ${assigned}`)}${parent}${blockedTag}`);
      }
    }
    console.log('');
    return;
  }

  // Standard grouped-by-stage view
  const byStage = {};
  for (const t of tickets) {
    const s = t.stage || 'backlog';
    if (!byStage[s]) byStage[s] = [];
    byStage[s].push(t);
  }

  const stagesToShow = filterStages.length > 0 ? filterStages : STAGES;

  for (const stage of stagesToShow) {
    const stageTickets = byStage[stage] || [];
    // Hide archived tickets from done column unless --archived is set
    const visible = stage === 'done' && !opts.archived
      ? stageTickets.filter(t => !t.archived)
      : stageTickets;
    const colorFn = stageColor(stage);

    console.log(`  ${colorFn(bold(`▎ ${stage.toUpperCase()}`))} ${dim(`(${visible.length})`)}`);

    if (visible.length === 0) {
      console.log(`    ${dim('(empty)')}`);
    } else {
      for (const t of visible) {
        const priority = t.priority || '';
        const assigned = t.assigned || '—';
        const parent = t.parent ? ` ${dim(`[${t.parent}]`)}` : '';
        const blockedTag = t.blocked ? ` ${dim('🚫 ' + (t.blocked_reason || 'blocked'))}` : '';
        console.log(`    ${bold(t.id)}  ${t.title}  ${dim(`[${priority}]`)}  ${dim(`→ ${assigned}`)}${parent}${blockedTag}`);
      }
    }
    console.log('');
  }

  // Backlog health metrics (only when backlog is visible)
  const showBacklog = filterStages.length === 0 || filterStages.includes('backlog');
  if (showBacklog) {
    const staleDays = config.backlog_stale_days || 30;
    const health = backlogHealth(ticketsDir, staleDays);
    if (health.total > 0) {
      const parts = [`${health.total} items`];
      if (health.stale > 0) parts.push(`${health.stale} older than ${health.staleDays} days`);
      if (health.noAcceptanceCriteria > 0) parts.push(`${health.noAcceptanceCriteria} missing acceptance criteria`);

      console.log(`  ${bold('BACKLOG HEALTH')}  ${dim(parts.join(' · '))}`);

      const cap = config.backlog_limit;
      if (cap && health.total > cap) {
        warn(`Backlog exceeds limit (${health.total}/${cap}). Run: bobby triage`);
      }
      console.log('');
    }
  }
}

export function registerList(program) {
  program
    .command('list [stages...]')
    .description('Show ticket board (optionally filter by stages)')
    .option('--blocked', 'Show only blocked tickets')
    .option('--epic <id>', 'Show children of an epic')
    .option('--active', 'Show active stages: planning, building, reviewing, testing')
    .option('--area <area>', 'Filter by feature area')
    .option('-p, --priority <priority>', 'Filter by priority (critical, high, medium, low)')
    .option('--type <type>', 'Filter by ticket type (bug, feature, improvement, task, epic)')
    .option('--stale <days>', 'Show only tickets older than N days')
    .option('--sort <order>', 'Sort tickets: newest, oldest, updated, priority')
    .option('--archived', 'Include archived tickets in done column')
    .option('-w, --watch [seconds]', 'Auto-refresh the board')
    .action((stages, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);

        const filterStages = opts.active ? ACTIVE_STAGES : (stages || []);

        if (opts.watch !== undefined) {
          const interval = (parseInt(opts.watch, 10) || 3) * 1000;
          // Enter alternate screen buffer (like top/htop)
          process.stdout.write('\x1B[?1049h\x1B[?25l');
          const render = () => {
            process.stdout.write('\x1B[H\x1B[2J');
            renderBoard(ticketsDir, filterStages, opts, config);
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
          renderBoard(ticketsDir, filterStages, opts, config);
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
