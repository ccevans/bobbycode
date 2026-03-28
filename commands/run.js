// commands/run.js
import path from 'path';
import inquirer from 'inquirer';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { findTicket, listTickets, getFeatureTickets, listEpics } from '../lib/tickets.js';
import { TRANSITIONS } from '../lib/stages.js';
import { DEFAULT_PIPELINE, buildOrchestrationPrompt, buildSingleAgentPrompt, buildShipPrompt, buildUxPrompt, buildPmPrompt, buildQePrompt, buildGroomPrompt, buildVetPrompt, buildNextStepPrompt, buildBatchStagePrompt, buildFeaturePrompt, buildSecurityPrompt, buildDebugPrompt, buildDocsPrompt, buildPerformancePrompt, buildWatchdogPrompt } from '../lib/pipeline.js';
import { bold, dim, success, error } from '../lib/colors.js';

const VALID_AGENTS = ['plan', 'build', 'review', 'test', 'ship', 'pipeline', 'feature', 'ux', 'pm', 'qe', 'groom', 'vet', 'next', 'security', 'debug', 'docs', 'performance', 'watchdog'];

export function registerRun(program) {
  program
    .command('run <agent> [ticketIds...]')
    .description(
      'Run an agent on ticket(s).\n' +
      '  Fast mode:  bobby run pipeline <id>   — auto-chains all agents\n' +
      '  Feature:    bobby run feature [epic]   — full epic workflow on one branch\n' +
      '  Slow mode:  bobby run next <id>       — runs next agent for current stage\n' +
      '  Batch:      bobby run plan            — runs agent on all tickets in matching stage\n' +
      '  Direct:     bobby run plan|build|review|test|ship|ux|pm <id>\n' +
      '  Vet:        bobby run vet [id]       — interrogate design before planning\n' +
      '  Security:   bobby run security <id>  — OWASP + STRIDE audit\n' +
      '  Debug:      bobby run debug <id>     — root-cause investigation\n' +
      '  Freeform:   bobby run docs|performance|watchdog — no ticket required'
    )
    .option('--max-retries <n>', 'Max retry loops on rejection per ticket', '3')
    .option('--max-iterations <n>', 'Max total agent invocations across all tickets')
    .option('--pipeline <name>', 'Named pipeline to use (from .bobbyrc.yml pipelines config)', 'default')
    .action(async (agent, ticketIds, opts) => {
      try {
        if (!VALID_AGENTS.includes(agent)) {
          error(`Unknown agent '${agent}'. Valid: ${VALID_AGENTS.join(', ')}`);
          process.exit(1);
        }

        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);
        const maxRetries = parseInt(opts.maxRetries, 10) || 3;
        const maxIterations = opts.maxIterations ? parseInt(opts.maxIterations, 10) : undefined;

        // Load pipeline config — support named pipelines from .bobbyrc.yml
        const pipelineName = opts.pipeline || 'default';
        let pipeline;
        if (config.pipelines && config.pipelines[pipelineName]) {
          const pipelineConfig = config.pipelines[pipelineName];
          // Support both full objects [{stage, agent}] and shorthand strings ['plan', 'build', 'review', 'security', 'test']
          pipeline = Array.isArray(pipelineConfig) ? pipelineConfig.map(step => {
            if (typeof step === 'string') {
              const STAGE_MAP = { plan: 'planning', build: 'building', review: 'reviewing', test: 'testing', security: 'reviewing', debug: 'building' };
              return { stage: STAGE_MAP[step] || step, agent: `bobby-${step}` };
            }
            return step;
          }) : DEFAULT_PIPELINE;
        } else if (pipelineName !== 'default') {
          error(`Unknown pipeline '${pipelineName}'. Available: ${config.pipelines ? Object.keys(config.pipelines).join(', ') : 'default'}`);
          process.exit(1);
        } else {
          pipeline = DEFAULT_PIPELINE;
        }

        if (agent === 'ship') {
          // Ship doesn't need ticket IDs
          const prompt = buildShipPrompt(config.tickets_dir, config.repos || []);
          console.log('');
          console.log(`  ${bold('Bobby Ship')}`);
          console.log(`  ${dim('Copy this prompt into Claude Code or run with a subagent:')}`);
          console.log('');
          console.log(prompt);
          return;
        }

        if (agent === 'ux' || agent === 'pm' || agent === 'qe' || agent === 'groom' || agent === 'vet') {
          // Cowork agents work without ticket IDs (freeform) or with a specific ticket
          const agentName = `bobby-${agent}`;
          const labels = { ux: 'Bobby UX', pm: 'Bobby PM', qe: 'Bobby QE', groom: 'Bobby Groom', vet: 'Bobby Vet' };
          const label = labels[agent];
          const promptFns = { ux: buildUxPrompt, pm: buildPmPrompt, qe: buildQePrompt, groom: buildGroomPrompt, vet: buildVetPrompt };
          const promptFn = promptFns[agent];
          let prompt;
          if (ticketIds.length > 0) {
            const ticketId = ticketIds[0];
            const found = findTicket(ticketsDir, ticketId);
            if (!found) { error(`Ticket ${ticketId} not found`); process.exit(1); }
            prompt = buildSingleAgentPrompt(agentName, ticketId, config.tickets_dir);
          } else {
            prompt = promptFn(config.tickets_dir);
          }
          console.log('');
          console.log(`  ${bold(label)}${ticketIds.length > 0 ? ` — ${ticketIds[0]}` : ''}`);
          console.log(`  ${dim('Copy this prompt into Claude Code or run with a subagent:')}`);
          console.log('');
          console.log(prompt);
          return;
        }

        // Ticket-required agents with custom prompts
        if (agent === 'security' || agent === 'debug') {
          if (ticketIds.length === 0) {
            error(`Usage: bobby run ${agent} <ticketId>`);
            process.exit(1);
          }
          const ticketId = ticketIds[0];
          const found = findTicket(ticketsDir, ticketId);
          if (!found) { error(`Ticket ${ticketId} not found`); process.exit(1); }
          const labels = { security: 'Bobby Security', debug: 'Bobby Debug' };
          const promptFns = { security: buildSecurityPrompt, debug: buildDebugPrompt };
          const prompt = promptFns[agent](ticketId, config.tickets_dir);
          console.log('');
          console.log(`  ${bold(labels[agent])} — ${ticketId}`);
          console.log(`  ${dim('Copy this prompt into Claude Code or run with a subagent:')}`);
          console.log('');
          console.log(prompt);
          return;
        }

        // Freeform agents (no ticket required)
        if (agent === 'docs' || agent === 'performance' || agent === 'watchdog') {
          const labels = { docs: 'Bobby Docs', performance: 'Bobby Performance', watchdog: 'Bobby Watchdog' };
          const promptFns = { docs: buildDocsPrompt, performance: buildPerformancePrompt, watchdog: buildWatchdogPrompt };
          const prompt = promptFns[agent](config.tickets_dir);
          console.log('');
          console.log(`  ${bold(labels[agent])}`);
          console.log(`  ${dim('Copy this prompt into Claude Code or run with a subagent:')}`);
          console.log('');
          console.log(prompt);
          return;
        }

        if (agent === 'pipeline') {
          let ids = ticketIds;

          if (ids.length === 0) {
            // Auto-discover: backlog + all pipeline stages
            const pipelineStages = pipeline.map(s => s.stage);
            const discoveryStages = ['backlog', ...pipelineStages];
            const allTickets = listTickets(ticketsDir);
            const available = allTickets.filter(t =>
              discoveryStages.includes(t.stage) && !t.assigned
            );
            if (available.length === 0) {
              error('No unassigned tickets in backlog or pipeline stages.');
              process.exit(1);
            }
            ids = available.map(t => t.id);
          }

          // Validate all tickets exist
          for (const id of ids) {
            const found = findTicket(ticketsDir, id);
            if (!found) { error(`Ticket ${id} not found`); process.exit(1); }
          }

          const prompt = buildOrchestrationPrompt(ids, pipeline, maxRetries, config.tickets_dir, maxIterations, config.runs_dir);
          console.log('');
          console.log(`  ${bold('Bobby Pipeline')} — ${ids.length} ticket(s)`);
          console.log(`  ${dim('Copy this prompt into Claude Code or run with a subagent:')}`);
          console.log('');
          console.log(prompt);
          return;
        }

        if (agent === 'feature') {
          let epicId;

          if (ticketIds.length === 0) {
            // Interactive epic selection
            const epics = listEpics(ticketsDir);
            if (epics.length === 0) {
              error('No epics found. Create one with: bobby create -t "Feature name" --epic');
              process.exit(1);
            }
            const { selected } = await inquirer.prompt([{
              type: 'list',
              name: 'selected',
              message: 'Select an epic to work on:',
              choices: epics.map(e => ({
                name: `${e.id} — ${e.title} (${e.childCount} tickets: ${e.stageSummary})`,
                value: e.id,
              })),
            }]);
            epicId = selected;
          } else {
            epicId = ticketIds[0];
          }

          const { epic, children } = getFeatureTickets(ticketsDir, epicId);
          if (children.length === 0) {
            error(`Epic ${epicId} has no child tickets. Create children with: bobby create -t "..." --parent ${epicId}`);
            process.exit(1);
          }

          const prompt = buildFeaturePrompt(epicId, epic.data.title, children, pipeline, maxRetries, config.tickets_dir, maxIterations, config.runs_dir);
          const childIds = children.map(t => t.id);
          const needsPlanning = children.filter(t => ['backlog', 'planning'].includes(t.stage));
          const pastPlanning = children.filter(t => !['backlog', 'planning'].includes(t.stage));
          console.log('');
          console.log(`  ${bold('Bobby Feature')} — ${epicId}: ${epic.data.title}`);
          if (needsPlanning.length > 0) {
            console.log(`  ${dim(`Phase 1: Plan ${needsPlanning.length} ticket(s) → Phase 2: Execute ${childIds.join(' → ')}`)}`);
          } else {
            console.log(`  ${dim(`All planned → Execute ${childIds.join(' → ')}`)}`);
          }
          console.log(`  ${dim('Copy this prompt into Claude Code or run with a subagent:')}`);
          console.log('');
          console.log(prompt);
          return;
        }

        if (agent === 'next') {
          if (ticketIds.length === 0) {
            error('Usage: bobby run next <ticketId>');
            process.exit(1);
          }
          const ticketId = ticketIds[0];
          const prompt = buildNextStepPrompt(ticketId, pipeline, ticketsDir, config.tickets_dir);
          const found = findTicket(ticketsDir, ticketId);
          const stageLabel = found ? ` [${found.data.stage}]` : '';
          console.log('');
          console.log(`  ${bold('Bobby Next')} — ${ticketId}${stageLabel}`);
          console.log(`  ${dim('Copy this prompt into Claude Code or run with a subagent:')}`);
          console.log('');
          console.log(prompt);
          return;
        }

        // Single agent run
        if (ticketIds.length === 0) {
          // No ticket IDs — batch mode: find all tickets in the matching stage
          const stage = TRANSITIONS[agent];
          if (!stage) {
            error(`Usage: bobby run ${agent} <ticketId>`);
            process.exit(1);
          }
          const stageTickets = listTickets(ticketsDir, { stage });
          const available = stageTickets.filter(t => !t.assigned);
          if (available.length === 0) {
            const assignedCount = stageTickets.length;
            if (assignedCount > 0) {
              error(`No available tickets in "${stage}" stage (${assignedCount} assigned).`);
            } else {
              error(`No tickets in "${stage}" stage.`);
            }
            process.exit(1);
          }
          const ids = available.map(t => t.id);
          const agentName = `bobby-${agent}`;
          const prompt = buildBatchStagePrompt(agentName, ids, config.tickets_dir);
          console.log('');
          console.log(`  ${bold(`Bobby ${agent}`)} — ${ids.length} ticket(s) in ${stage}`);
          console.log(`  ${dim('Copy this prompt into Claude Code or run with a subagent:')}`);
          console.log('');
          console.log(prompt);
          return;
        }

        const ticketId = ticketIds[0];
        const found = findTicket(ticketsDir, ticketId);
        if (!found) { error(`Ticket ${ticketId} not found`); process.exit(1); }

        const agentName = `bobby-${agent}`;
        const prompt = buildSingleAgentPrompt(agentName, ticketId, config.tickets_dir);
        console.log('');
        console.log(`  ${bold(`Bobby ${agent}`)} — ${ticketId}`);
        console.log(`  ${dim('Copy this prompt into Claude Code or run with a subagent:')}`);
        console.log('');
        console.log(prompt);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
