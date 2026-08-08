// commands/projects.js
import { listProjects } from '../lib/studio.js';
import { readConfig, resolveTicketsDir } from '../lib/config.js';
import { listTickets, daysBetween } from '../lib/tickets.js';
import { bold, dim, error } from '../lib/colors.js';

const IN_FLIGHT_STAGES = ['planning', 'building', 'security', 'reviewing', 'testing', 'shipping'];

function ago(iso) {
  if (!iso) return 'never';
  const days = daysBetween(iso.split('T')[0]);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export function registerProjects(program) {
  program
    .command('projects')
    .description('Every Bobby project on this machine, with what each one has in flight')
    .action(() => {
      try {
        const projects = listProjects();
        console.log('');
        console.log(`  ${bold('Projects')}`);
        console.log('');
        if (projects.length === 0) {
          console.log(`  ${dim('None yet. Run any bobby command inside a project and it registers itself.')}`);
          console.log('');
          return;
        }
        for (const p of projects) {
          let counts = dim('(unreadable)');
          try {
            const config = readConfig(p.path);
            const all = listTickets(resolveTicketsDir(p.path, config));
            const inFlight = all.filter(t => IN_FLIGHT_STAGES.includes(t.stage) && !t.blocked).length;
            const blocked = all.filter(t => t.blocked || t.stage === 'blocked').length;
            const backlog = all.filter(t => t.stage === 'backlog').length;
            const parts = [`${inFlight} in flight`, `${backlog} backlog`];
            if (blocked > 0) parts.push(`${blocked} blocked`);
            counts = dim(parts.join(' · '));
          } catch { /* leave as unreadable */ }
          console.log(`  ${bold(p.name)}  ${counts}  ${dim(`· ${ago(p.last_touched)}`)}`);
          console.log(`    ${dim(p.path.replace(process.env.HOME || '', '~'))}`);
        }
        console.log('');
        console.log(`  ${dim('Cross-project standup: bobby brief --all')}`);
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
