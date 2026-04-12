// commands/run.js
import inquirer from 'inquirer';
import { readConfig, findProjectRoot, resolveTicketsDir, resolveSessionsDir } from '../lib/config.js';
import { getFeatureTickets, listEpics } from '../lib/tickets.js';
import { DEFAULT_PIPELINE, buildPromptFor, resolvePipeline, listPipelines } from '../lib/pipeline.js';
import { findTicket } from '../lib/tickets.js';
import { VALID_AGENTS } from '../lib/agent-registry.js';
import { bold, dim, error } from '../lib/colors.js';
import { getTarget } from '../lib/targets/index.js';
import { initSession } from '../lib/session.js';

/**
 * Prepend the session env var export to a prompt so all bobby commands log to this session.
 */
function withSession(prompt, sessionId) {
  return `**Session tracking:** Before running any bobby commands, set the session env var:\n\`export BOBBY_SESSION_ID=${sessionId}\`\n\n${prompt}`;
}

// Re-export for backwards compatibility (dashboard.js imports from here)
export { resolvePipeline } from '../lib/pipeline.js';

export function registerRun(program) {
  program
    .command('run <agent> [ticketIds...]')
    .description(
      'Run an agent on ticket(s).\n' +
      '  Fast mode:  bobby run pipeline <id>   — auto-chains all agents\n' +
      '  Feature:    bobby run feature [epic]   — full epic workflow on one branch\n' +
      '  Slow mode:  bobby run next <id>       — runs next agent for current stage\n' +
      '  Batch:      bobby run plan            — runs agent on all tickets in matching stage\n' +
      '  Direct:     bobby run plan|build|review|test|ship|ux|pm|qe <id>\n' +
      '  Vet:        bobby run vet [id]       — interrogate design before planning\n' +
      '  Strategy:   bobby run strategy [id]  — strategic validation gate\n' +
      '  Security:   bobby run security <id>  — OWASP + STRIDE audit\n' +
      '  Debug:      bobby run debug <id>     — root-cause investigation\n' +
      '  Freeform:   bobby run docs|performance|watchdog — no ticket required\n' +
      '  Shorthand:  bobby run <pipeline-name> <id> — run a custom pipeline'
    )
    .option('--max-retries <n>', 'Max retry loops on rejection per ticket', '3')
    .option('--max-iterations <n>', 'Max total agent invocations across all tickets')
    .option('--pipeline <name>', 'Named pipeline to use (from .bobbyrc.yml pipelines config)', 'default')
    .action(async (agent, ticketIds, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);

        // Pipeline shorthand: if agent name matches a custom pipeline, treat as `pipeline --pipeline <name>`
        const pipelineNames = listPipelines(config);
        if (!VALID_AGENTS.includes(agent) && pipelineNames.includes(agent)) {
          opts.pipeline = agent;
          agent = 'pipeline';
        }

        if (!VALID_AGENTS.includes(agent)) {
          error(`Unknown agent '${agent}'. Valid: ${VALID_AGENTS.join(', ')}`);
          if (pipelineNames.length > 1) {
            console.log(`  Pipeline shorthands: ${pipelineNames.filter(n => n !== 'default').join(', ')}`);
          }
          process.exit(1);
        }

        const target = getTarget(config.target || 'claude-code');
        const agentsPath = target.paths().agents;
        const hint = target.promptHint();
        const ticketsDir = resolveTicketsDir(root, config);
        const maxRetries = parseInt(opts.maxRetries, 10) || 3;
        const maxIterations = opts.maxIterations ? parseInt(opts.maxIterations, 10) : undefined;
        const hasServices = !!(config.services && Object.keys(config.services).length > 0);

        // Initialize session for logging
        const sessionsDir = resolveSessionsDir(root, config);
        const sessionId = initSession(sessionsDir, { ticketIds: ticketIds, agent, pipeline: opts.pipeline || 'default' });

        // Resolve ticket-level pipeline override (if ticket has a `pipeline` field in frontmatter)
        let ticketPipeline = null;
        if (ticketIds.length > 0) {
          const ticket = findTicket(ticketsDir, ticketIds[0]);
          if (ticket && ticket.data.pipeline) {
            ticketPipeline = ticket.data.pipeline;
          }
        }

        // Resolve pipeline config: explicit flag > ticket frontmatter > default
        const pipeline = resolvePipeline(config, opts.pipeline || 'default', ticketPipeline);

        // Feature mode: if no epic id provided, let user pick interactively.
        // This is the only interactive step — the dashboard will always pass an explicit epicId.
        let epicData;
        if (agent === 'feature') {
          let epicId = ticketIds[0];
          if (!epicId) {
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
          }
          const { epic, children } = getFeatureTickets(ticketsDir, epicId);
          if (children.length === 0) {
            error(`Epic ${epicId} has no child tickets. Create children with: bobby create -t "..." --parent ${epicId}`);
            process.exit(1);
          }
          epicData = { epicId, epic, children };
        }

        // Build the prompt via the unified dispatcher
        let built;
        try {
          built = buildPromptFor(agent, ticketIds, {
            config,
            ticketsDir,
            ticketsRelDir: config.tickets_dir,
            agentsPath,
            pipeline,
            maxRetries,
            maxIterations,
            hasServices,
            epicData,
            gitConventions: config.git_conventions || {},
          });
        } catch (e) {
          error(e.message);
          process.exit(1);
        }

        // Print header + prompt
        console.log('');
        console.log(`  ${bold(built.label)}  ${dim(`Session: ${sessionId}`)}`);
        if (built.subtitle) {
          console.log(`  ${dim(built.subtitle)}`);
        }
        console.log(`  ${dim(hint)}`);
        if (agent === 'feature') {
          console.log(`  ${dim('Launch with: isolation: "worktree" (keeps main clean)')}`);
        }
        console.log('');
        console.log(withSession(built.prompt, sessionId));
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
