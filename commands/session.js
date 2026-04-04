// commands/session.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot, resolveSessionsDir } from '../lib/config.js';
import { listSessions, readSession, sessionSummary } from '../lib/session.js';
import { bold, dim, error } from '../lib/colors.js';
import chalk from 'chalk';

const TYPE_COLORS = {
  session_start: chalk.blue,
  move: chalk.yellow,
  assign: chalk.cyan,
  comment: chalk.gray,
  create: chalk.green,
};

const TYPE_LABELS = {
  session_start: 'START',
  move: 'MOVE',
  assign: 'ASSIGN',
  comment: 'COMMENT',
  create: 'CREATE',
};

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatEntry(entry) {
  const time = formatTime(entry.ts);
  const type = entry.type || 'unknown';
  const colorFn = TYPE_COLORS[type] || chalk.white;
  const label = (TYPE_LABELS[type] || type.toUpperCase()).padEnd(8);

  let detail = '';
  switch (type) {
    case 'session_start':
      detail = `pipeline on ${(entry.tickets || []).join(', ') || 'no tickets'}`;
      break;
    case 'move': {
      const arrow = `${entry.from} → ${entry.to}`;
      const isRejection = entry.detail?.startsWith('REJECTED');
      detail = entry.ticket
        ? `${entry.ticket}  ${isRejection ? chalk.red(arrow) : arrow}${entry.detail ? `  ${isRejection ? chalk.red(entry.detail) : dim(entry.detail)}` : ''}`
        : arrow;
      break;
    }
    case 'assign':
      detail = `${entry.ticket} → ${chalk.cyan(entry.agent)}`;
      break;
    case 'comment':
      detail = `${entry.ticket}  ${dim(truncate(entry.detail || '', 80))}`;
      break;
    case 'create':
      detail = `${entry.ticket} — ${entry.title || ''}${entry.parent ? ` (child of ${entry.parent})` : ''}`;
      break;
    default:
      detail = JSON.stringify(entry);
  }

  return `  ${dim(time)}  ${colorFn(label)}  ${detail}`;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

export function registerSession(program) {
  const cmd = program
    .command('session')
    .description('View and analyze agent session logs');

  // bobby session list
  cmd
    .command('list')
    .description('List recent sessions')
    .option('-n, --limit <n>', 'Number of sessions to show', '20')
    .action((opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const sessionsDir = resolveSessionsDir(root, config);
        const sessions = listSessions(sessionsDir);

        if (sessions.length === 0) {
          console.log('  No sessions found.');
          return;
        }

        const limit = parseInt(opts.limit, 10) || 20;
        const shown = sessions.slice(0, limit);

        console.log('');
        console.log(`  ${bold('SESSIONS')}`);
        console.log('');
        console.log(`  ${'ID'.padEnd(26)} ${'Agent'.padEnd(12)} ${'Tickets'.padEnd(24)} ${'Events'.padEnd(8)} ${'Duration'.padEnd(10)}`);
        console.log(`  ${'─'.repeat(26)} ${'─'.repeat(12)} ${'─'.repeat(24)} ${'─'.repeat(8)} ${'─'.repeat(10)}`);

        for (const s of shown) {
          const tickets = s.tickets.length > 0 ? s.tickets.join(', ') : dim('none');
          const ticketStr = truncate(typeof tickets === 'string' ? tickets : s.tickets.join(', '), 24);
          console.log(`  ${s.id.padEnd(26)} ${(s.agent || '-').padEnd(12)} ${ticketStr.padEnd(24)} ${String(s.events).padEnd(8)} ${s.durationLabel.padEnd(10)}`);
        }

        if (sessions.length > limit) {
          console.log(dim(`  ... and ${sessions.length - limit} more`));
        }
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  // bobby session view <id>
  cmd
    .command('view <id>')
    .description('Show formatted timeline of a session')
    .action((id) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const sessionsDir = resolveSessionsDir(root, config);
        const entries = readSession(sessionsDir, id);

        if (entries.length === 0) {
          error(`Session ${id} not found or empty`);
          process.exit(1);
        }

        const start = entries[0];
        const last = entries[entries.length - 1];
        const duration = new Date(last.ts) - new Date(start.ts);

        console.log('');
        console.log(`  ${bold(`SESSION ${id}`)}`);
        console.log(`  ${dim(`Agent: ${start.agent || '-'}  |  Tickets: ${(start.tickets || []).join(', ') || 'none'}  |  Started: ${formatTime(start.ts)}  |  Duration: ${formatDurationMs(duration)}`)}`);
        console.log('');

        for (const entry of entries) {
          console.log(formatEntry(entry));
        }
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  // bobby session tail <id>
  cmd
    .command('tail <id>')
    .description('Follow a session log in real-time')
    .action((id) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const sessionsDir = resolveSessionsDir(root, config);
        const filePath = path.join(sessionsDir, `${id}.jsonl`);

        if (!fs.existsSync(filePath)) {
          error(`Session ${id} not found`);
          process.exit(1);
        }

        // Print existing entries
        const existing = readSession(sessionsDir, id);
        console.log('');
        console.log(`  ${bold(`TAILING SESSION ${id}`)}  ${dim('(Ctrl+C to stop)')}`);
        console.log('');
        for (const entry of existing) {
          console.log(formatEntry(entry));
        }

        // Watch for new entries
        let lineCount = existing.length;
        fs.watchFile(filePath, { interval: 500 }, () => {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.trim().split('\n').filter(Boolean);
          if (lines.length > lineCount) {
            const newLines = lines.slice(lineCount);
            for (const line of newLines) {
              try {
                const entry = JSON.parse(line);
                console.log(formatEntry(entry));
              } catch {
                // skip malformed lines
              }
            }
            lineCount = lines.length;
          }
        });

        // Keep process alive
        process.on('SIGINT', () => {
          fs.unwatchFile(filePath);
          console.log('');
          process.exit(0);
        });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  // bobby session stats <id>
  cmd
    .command('stats <id>')
    .description('Show aggregate stats for a session')
    .action((id) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const sessionsDir = resolveSessionsDir(root, config);
        const summary = sessionSummary(sessionsDir, id);

        if (!summary) {
          error(`Session ${id} not found or empty`);
          process.exit(1);
        }

        console.log('');
        console.log(`  ${bold(`SESSION STATS — ${id}`)}`);
        console.log('');
        console.log(`  Duration:        ${summary.durationLabel}`);
        console.log(`  Tickets:         ${summary.tickets.join(', ') || 'none'}`);
        console.log(`  Total events:    ${summary.totalEvents}`);
        console.log(`  Stage moves:     ${summary.moves}`);
        console.log(`  Rejections:      ${summary.rejections}`);
        console.log(`  Blocks:          ${summary.blocks}`);
        console.log(`  Assignments:     ${summary.assigns}`);
        console.log(`  Tickets created: ${summary.creates}`);
        console.log(`  Comments:        ${summary.comments}`);

        if (Object.keys(summary.rejectionReasons).length > 0) {
          console.log('');
          console.log(`  ${bold('Rejection Reasons:')}`);
          for (const [reason, count] of Object.entries(summary.rejectionReasons)) {
            console.log(`    ${chalk.red(`${count}x`)}  ${reason}`);
          }
        }

        if (Object.keys(summary.avgTimePerStage).length > 0) {
          console.log('');
          console.log(`  ${bold('Avg Time per Stage:')}`);
          for (const [stage, data] of Object.entries(summary.avgTimePerStage)) {
            console.log(`    ${stage.padEnd(14)} ${data.label} (${data.count} transition${data.count !== 1 ? 's' : ''})`);
          }
        }

        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}

function formatDurationMs(ms) {
  if (ms < 1000) return '0s';
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}
