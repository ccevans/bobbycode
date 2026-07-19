// commands/sprint.js
import path from 'path';
import {
  readConfig, findProjectRoot, resolveTicketsDir, resolveSprintsDir, resolveSessionsDir,
} from '../lib/config.js';
import { findTicket } from '../lib/tickets.js';
import { resolvePipeline, listPipelines, buildSprintPrompt } from '../lib/pipeline.js';
import {
  createSprint, findSprint, listSprints, addTicketsToSprint,
  removeTicketsFromSprint, setSprintStatus, SPRINT_STATUSES,
} from '../lib/sprint.js';
import { initSession, tryLogEntry } from '../lib/session.js';
import { getTarget } from '../lib/targets/index.js';
import { stageColor } from '../lib/stages.js';
import { success, error, warn, bold, dim } from '../lib/colors.js';

/** Throw if any ticket ID does not resolve to an existing ticket. */
function assertTicketsExist(ticketsDir, ids) {
  const missing = ids.filter(id => !findTicket(ticketsDir, id));
  if (missing.length > 0) {
    throw new Error(`Ticket(s) not found: ${missing.join(', ')}. Create them first with \`bobby create\`.`);
  }
}

export function registerSprint(program) {
  const cmd = program
    .command('sprint')
    .description('Batch related tickets onto one branch and work them one-by-one — bigger-than-one-ticket changes without dirtying main');

  cmd
    .command('new <name> [ticketIds...]')
    .description('Create a sprint (e.g., bobby sprint new "Auth overhaul" TKT-004 TKT-007)')
    .option('--goal <goal>', 'What finishing this batch delivers')
    .option('--pipeline <name>', 'Pipeline each ticket runs through', 'default')
    .action((name, ticketIds, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const sprintsDir = resolveSprintsDir(root, config);

        const pipelineName = opts.pipeline || 'default';
        if (pipelineName !== 'default' && !listPipelines(config).includes(pipelineName)) {
          throw new Error(`Unknown pipeline '${pipelineName}'. Available: ${listPipelines(config).join(', ')}`);
        }
        assertTicketsExist(ticketsDir, ticketIds || []);

        const result = createSprint(sprintsDir, {
          name,
          goal: opts.goal || '',
          pipeline: pipelineName,
          tickets: ticketIds || [],
          branchPrefix: config.git_conventions?.feature_branch_prefix || 'feature',
        });

        success(`Created ${result.id} — ${result.data.name}`);
        console.log(`  → ${config.sprints_dir}/${path.basename(result.path)}/`);
        console.log(`  Branch:  ${result.data.branch}`);
        console.log(`  Tickets: ${result.data.tickets.length > 0 ? result.data.tickets.join(', ') : dim('(none — add with `bobby sprint add`)')}`);
        console.log(`  Run it:  bobby sprint run ${result.id}`);
        tryLogEntry(root, config, { type: 'sprint_create', sprint: result.id, tickets: result.data.tickets });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('list')
    .alias('ls')
    .description('List all sprints')
    .action(() => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const sprintsDir = resolveSprintsDir(root, config);
        const ticketsDir = resolveTicketsDir(root, config);
        const sprints = listSprints(sprintsDir);

        console.log('');
        console.log(`  ${bold('Sprints')}`);
        console.log('');
        if (sprints.length === 0) {
          console.log(`  ${dim('No sprints yet. Create one: bobby sprint new "Sprint name" TKT-001')}`);
          console.log('');
          return;
        }
        for (const s of sprints) {
          const tickets = s.tickets || [];
          const done = tickets.filter(id => findTicket(ticketsDir, id)?.data.stage === 'done').length;
          console.log(`  ${bold(s.id)}  ${s.name}  ${dim(`[${s.status}]`)}`);
          console.log(`    ${dim(`${tickets.length} ticket(s) · ${done} done · branch ${s.branch}`)}`);
          console.log('');
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('view <id>')
    .description('Show a sprint and its tickets')
    .action((id) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const sprintsDir = resolveSprintsDir(root, config);
        const ticketsDir = resolveTicketsDir(root, config);
        const sprint = findSprint(sprintsDir, id);
        if (!sprint) throw new Error(`Sprint ${id} not found`);
        const d = sprint.data;

        console.log('');
        console.log(`  ${bold(`${d.id} — ${d.name}`)}  ${dim(`[${d.status}]`)}`);
        if (d.goal) console.log(`  ${dim('Goal:')}     ${d.goal}`);
        console.log(`  ${dim('Branch:')}   ${d.branch}`);
        console.log(`  ${dim('Pipeline:')} ${d.pipeline || 'default'}`);
        console.log('');
        const tickets = d.tickets || [];
        if (tickets.length === 0) {
          console.log(`  ${dim(`No tickets. Add: bobby sprint add ${d.id} TKT-001`)}`);
        } else {
          tickets.forEach((tid, i) => {
            const t = findTicket(ticketsDir, tid);
            if (!t) {
              console.log(`  ${i + 1}. ${bold(tid)}  ${dim('(ticket not found)')}`);
            } else {
              const stage = t.data.stage || 'backlog';
              console.log(`  ${i + 1}. ${bold(tid)}  ${stageColor(stage)(`[${stage.toUpperCase()}]`)}  ${t.data.title}`);
            }
          });
        }
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('add <id> <ticketIds...>')
    .description('Add ticket(s) to a sprint')
    .action((id, ticketIds) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const sprintsDir = resolveSprintsDir(root, config);
        assertTicketsExist(ticketsDir, ticketIds);

        const { sprint, added } = addTicketsToSprint(sprintsDir, id, ticketIds);
        if (added.length === 0) {
          warn(`No new tickets added — all already in ${sprint.id}.`);
        } else {
          success(`Added ${added.join(', ')} to ${sprint.id} (${sprint.tickets.length} ticket(s) total)`);
        }
        tryLogEntry(root, config, { type: 'sprint_add', sprint: sprint.id, tickets: added });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('remove <id> <ticketIds...>')
    .alias('rm')
    .description('Remove ticket(s) from a sprint')
    .action((id, ticketIds) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const sprintsDir = resolveSprintsDir(root, config);
        const { sprint, removed } = removeTicketsFromSprint(sprintsDir, id, ticketIds);
        if (removed === 0) {
          warn(`No tickets removed — none of those are in ${sprint.id}.`);
        } else {
          success(`Removed ${removed} ticket(s) from ${sprint.id} (${sprint.tickets.length} remaining)`);
        }
        tryLogEntry(root, config, { type: 'sprint_remove', sprint: sprint.id, tickets: ticketIds });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('status <id> <status>')
    .description(`Set sprint status (${SPRINT_STATUSES.join(' | ')})`)
    .action((id, status) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const sprintsDir = resolveSprintsDir(root, config);
        const d = setSprintStatus(sprintsDir, id, status);
        success(`Sprint ${d.id} is now ${d.status}`);
        tryLogEntry(root, config, { type: 'sprint_status', sprint: d.id, status: d.status });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  cmd
    .command('run <id>')
    .description('Run a sprint — work each ticket through its pipeline on the shared branch')
    .option('--max-retries <n>', 'Max retry loops on rejection per ticket', '3')
    .option('--max-iterations <n>', 'Max total agent invocations across all tickets')
    .action((id, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const sprintsDir = resolveSprintsDir(root, config);
        const ticketsDir = resolveTicketsDir(root, config);

        const sprint = findSprint(sprintsDir, id);
        if (!sprint) throw new Error(`Sprint ${id} not found`);
        const d = sprint.data;
        const ticketIds = d.tickets || [];
        if (ticketIds.length === 0) {
          throw new Error(`Sprint ${d.id} has no tickets. Add some: bobby sprint add ${d.id} TKT-001`);
        }

        // Resolve each ticket's current data — fail fast on dangling references.
        const sprintTickets = [];
        const missing = [];
        for (const tid of ticketIds) {
          const t = findTicket(ticketsDir, tid);
          if (!t) { missing.push(tid); continue; }
          sprintTickets.push({
            id: tid,
            title: t.data.title || tid,
            stage: t.data.stage || 'backlog',
            priority: t.data.priority || 'medium',
          });
        }
        if (missing.length > 0) {
          throw new Error(`Sprint ${d.id} references missing ticket(s): ${missing.join(', ')}. Remove them: bobby sprint remove ${d.id} ${missing.join(' ')}`);
        }

        const pipeline = resolvePipeline(config, d.pipeline || 'default');
        const target = getTarget(config.target || 'claude-code');
        const agentsPath = target.paths().agents;
        const hasServices = !!(config.services && Object.keys(config.services).length > 0);
        const maxRetries = parseInt(opts.maxRetries, 10) || 3;
        const maxIterations = opts.maxIterations ? parseInt(opts.maxIterations, 10) : undefined;

        const sessionsDir = resolveSessionsDir(root, config);
        const sessionId = initSession(sessionsDir, { ticketIds, agent: 'sprint', pipeline: d.pipeline || 'default' });

        const sprintPlanPath = `${config.sprints_dir}/${path.basename(sprint.path)}/sprint-plan.md`;
        const prompt = buildSprintPrompt(d, sprintTickets, pipeline, {
          maxRetries,
          ticketsDir: config.tickets_dir,
          maxIterations,
          agentsPath,
          hasServices,
          sprintPlanPath,
        });

        console.log('');
        console.log(`  ${bold(`Bobby Sprint — ${d.id}: ${d.name}`)}  ${dim(`Session: ${sessionId}`)}`);
        console.log(`  ${dim(`${sprintTickets.length} ticket(s) → ${d.branch}`)}`);
        console.log(`  ${dim(target.promptHint())}`);
        console.log(`  ${dim('Launch with: isolation: "worktree" (keeps main clean)')}`);
        console.log('');
        console.log(
          `**Session tracking:** Before running any bobby commands, set the session env var:\n` +
          `\`export BOBBY_SESSION_ID=${sessionId}\`\n\n${prompt}`
        );
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
