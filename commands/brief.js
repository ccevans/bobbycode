// commands/brief.js
import { readConfig, findProjectRoot, resolveTicketsDir, resolveSprintsDir, resolveProductDir } from '../lib/config.js';
import { buildBrief } from '../lib/brief.js';
import { listProjects } from '../lib/studio.js';
import { stageColor } from '../lib/stages.js';
import { bold, dim, error } from '../lib/colors.js';

function studioBrief() {
  const projects = listProjects();
  console.log('');
  console.log(`  ${bold('All projects — where you left off')}`);
  console.log('');
  if (projects.length === 0) {
    console.log(`  ${dim('No projects registered yet. Run any bobby command inside a project first.')}`);
    console.log('');
    return;
  }
  for (const p of projects) {
    let line;
    let next = null;
    try {
      const config = readConfig(p.path);
      const b = buildBrief(resolveTicketsDir(p.path, config), resolveSprintsDir(p.path, config), { productDir: resolveProductDir(p.path, config) });
      const parts = [];
      if (b.inFlight.length > 0) parts.push(`${b.inFlight.length} in flight`);
      if (b.blocked.length > 0) parts.push(`${b.blocked.length} blocked`);
      parts.push(`${b.backlogCount} backlog`);
      line = dim(parts.join(' · '));
      next = b.nextAction;
    } catch {
      line = dim('(unreadable)');
    }
    console.log(`  ${bold(p.name)}  ${line}`);
    if (next) {
      console.log(`    ${dim(`next: ${next.reason}`)}`);
      console.log(`    ${next.command}  ${dim(`(in ${p.path.replace(process.env.HOME || '', '~')})`)}`);
    }
    console.log('');
  }
}

export function registerBrief(program) {
  program
    .command('brief')
    .description('Where was I? — in-flight work, blockers, and the next action')
    .option('--all', 'Brief across every registered project (automatic when outside a project)')
    .action((opts) => {
      try {
        let root = null;
        try { root = findProjectRoot(); } catch { /* outside any project */ }

        // Cross-project mode: asked for, or nowhere else to look.
        if (opts.all || !root) {
          studioBrief();
          return;
        }

        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const sprintsDir = resolveSprintsDir(root, config);
        const b = buildBrief(ticketsDir, sprintsDir, { productDir: resolveProductDir(root, config) });

        console.log('');
        console.log(`  ${bold(`${config.project || 'Bobby'} — where you left off`)}`);
        console.log('');

        // In flight
        console.log(`  ${bold('In flight')}`);
        if (b.inFlight.length === 0) {
          console.log(`    ${dim('Nothing started.')}`);
        } else {
          for (const t of b.inFlight) {
            console.log(`    ${stageColor(t.stage)(`[${t.stage.toUpperCase()}]`)}  ${bold(t.id)}  ${t.title}  ${dim(t.priority)}`);
          }
        }
        console.log('');

        // Blocked
        if (b.blocked.length > 0) {
          console.log(`  ${bold('Blocked')}`);
          for (const t of b.blocked) {
            const why = t.blocked_reason ? dim(`— ${t.blocked_reason}`) : '';
            console.log(`    ${stageColor('blocked')('[BLOCKED]')}  ${bold(t.id)}  ${t.title}  ${why}`);
          }
          console.log('');
        }

        // Sprints
        if (b.sprints.length > 0) {
          console.log(`  ${bold('Active sprints')}`);
          for (const s of b.sprints) {
            console.log(`    ${bold(s.id)}  ${s.name}  ${dim(`${s.done}/${s.total} done · ${s.status}`)}`);
          }
          console.log('');
        }

        // Backlog snapshot
        console.log(`  ${bold('Backlog')}  ${dim(`(${b.backlogCount} total)`)}`);
        if (b.backlogTop.length === 0) {
          console.log(`    ${dim('Empty.')}`);
        } else {
          for (const t of b.backlogTop) {
            console.log(`    ${dim('·')} ${bold(t.id)}  ${t.title}  ${dim(t.priority)}`);
          }
          if (b.backlogCount > b.backlogTop.length) {
            console.log(`    ${dim(`… and ${b.backlogCount - b.backlogTop.length} more — bobby ticket list backlog`)}`);
          }
        }
        console.log('');

        // Next action
        console.log(`  ${bold('Next')}  ${dim(`— ${b.nextAction.reason}`)}`);
        console.log(`    ${b.nextAction.command}`);
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
