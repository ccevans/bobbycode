// commands/run.js
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { readConfig, findProjectRoot, resolveTicketsDir, resolveSessionsDir, resolveProductDir } from '../lib/config.js';
import { getFeatureTickets, listEpics } from '../lib/tickets.js';
import { DEFAULT_WORKFLOW, buildPromptFor, resolveWorkflow, listWorkflows, assertTicketFree, omitStage } from '../lib/workflow.js';
import { findTicket } from '../lib/tickets.js';
import { VALID_AGENTS } from '../lib/agent-registry.js';
import { bold, dim, error } from '../lib/colors.js';
import { getTarget } from '../lib/targets/index.js';
import { overlayPromptClause, repoTargetingClause } from '../lib/skills.js';
import { initSession } from '../lib/session.js';

/**
 * Prepend the session env var export to a prompt so all bobby commands log to this session.
 */
function withSession(prompt, sessionId) {
  return `**Session tracking:** Before running any bobby commands, set the session env var:\n\`export BOBBY_SESSION_ID=${sessionId}\`\n\n${prompt}`;
}

// Re-export for backwards compatibility (dashboard.js imports from here)
export { resolveWorkflow } from '../lib/workflow.js';

export function registerRun(program) {
  program
    .command('run <agent> [ticketIds...]')
    .description('Run an agent on ticket(s) — workflow, feature, next, plan, build, review, test, ship, and more')
    .addHelpText('after', `
Modes:
  Workflow:   bobby run workflow <id>    — auto-chains the default workflow (or: secure, quick)
  Feature:    bobby run feature [epic]   — full epic workflow on one branch
  Slow mode:  bobby run next <id>        — runs next agent for current stage
  Batch:      bobby run plan             — runs agent on all tickets in matching stage
  Direct:     bobby run plan|build|review|test|ship|ux|pm|qe <id>
  Vet:        bobby run vet [id]         — interrogate design before planning
  Define:     bobby run define <epicId>  — product definition: brief → personas → journeys → features → mockups (optional; skip with --no-mockups) → blueprint (then: run plan)
              bobby run define-brief|define-personas|define-journeys|define-features|define-mockups|define-blueprint
  Design:     bobby run design <id>          — full chain: research → analyze → mockup → spec → build → check
              bobby run design-research|design-analyze|design-mockup|design-spec|design-build|design-check
  Strategy:   bobby run strategy [id]    — strategic validation gate
  Security:   bobby run security <id>    — OWASP + STRIDE audit
  Debug:      bobby run debug <id>       — root-cause investigation
  Freewill:   bobby run freewill <id>    — one agent, whole ticket, few instructions (Opus 5 / Fable 5)
  Freeform:   bobby run docs|performance|watchdog — no ticket required
  Workflow:   bobby run <workflow-name> <id> — run a named workflow (default, secure, quick, or your own)`)
    .option('--max-retries <n>', 'Max retry loops on rejection per ticket', '3')
    .option('--max-iterations <n>', 'Max total agent invocations across all tickets')
    .option('--workflow <name>', 'Named workflow to use (built-in or from .bobbyrc.yml workflows)', 'default')
    .option('--no-mockups', 'Skip the design mockups stage of the define workflow')
    .action(async (agent, ticketIds, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);

        // Workflow shorthand: `bobby run <workflow-name> <id>` runs that named
        // workflow through the orchestrator (the 'workflow' agent).
        const workflowNames = listWorkflows(config);
        if (!VALID_AGENTS.includes(agent) && workflowNames.includes(agent)) {
          opts.workflow = agent;
          agent = 'workflow';
        }

        // Custom agents: any `<agentsPath>/<name>.md` the user (or a pack)
        // created is runnable by name — no registry entry required. Bobby's
        // shipped agents keep their richer chain semantics; a custom agent
        // gets a generic dispatch that defers to its own file.
        let customAgent = null;
        if (!VALID_AGENTS.includes(agent)) {
          const targetEarly = getTarget(config.target || 'claude-code');
          const customPath = path.join(root, targetEarly.paths().agents, `${agent}.md`);
          if (fs.existsSync(customPath)) customAgent = agent;
        }

        if (!VALID_AGENTS.includes(agent) && !customAgent) {
          error(`Unknown agent '${agent}'. Valid: ${VALID_AGENTS.join(', ')}`);
          if (workflowNames.length > 1) {
            console.log(`  Workflows: ${workflowNames.join(', ')}`);
          }
          const targetEarly = getTarget(config.target || 'claude-code');
          const agentsDirAbs = path.join(root, targetEarly.paths().agents);
          const custom = fs.existsSync(agentsDirAbs)
            ? fs.readdirSync(agentsDirAbs)
              .filter(f => f.endsWith('.md') && !f.endsWith('.local.md') && !f.startsWith('bobby-'))
              .map(f => f.replace(/\.md$/, ''))
            : [];
          if (custom.length > 0) {
            console.log(`  Custom agents: ${custom.join(', ')}`);
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
        const hasProduct = fs.existsSync(path.join(root, config.bobby_dir || '.bobby', 'product', 'feature-map.md'));
        // Absolute, main-worktree-rooted product dir so the product hint resolves
        // from an agent whose cwd is a (possibly different-repo) worktree (PRO-026).
        const productDir = resolveProductDir(root, config);

        // Initialize session for logging
        const sessionsDir = resolveSessionsDir(root, config);
        const sessionId = initSession(sessionsDir, { ticketIds: ticketIds, agent, pipeline: opts.workflow || 'default' });

        // Resolve ticket-level workflow override (if ticket has a `workflow` field in frontmatter)
        let ticketPipeline = null;
        if (ticketIds.length > 0) {
          const ticket = findTicket(ticketsDir, ticketIds[0]);
          if (ticket && (ticket.data.workflow || ticket.data.pipeline)) {
            ticketPipeline = ticket.data.workflow || ticket.data.pipeline;
          }
        }

        // Resolve workflow: explicit flag > ticket frontmatter > default
        let pipeline = resolveWorkflow(config, opts.workflow || 'default', ticketPipeline);
        // --no-mockups: commander negation — opts.mockups is true by default,
        // false when the flag is passed. Filtering the resolved chain is the
        // whole mechanism: handoffs are computed from the array, so
        // define-features now hands straight to define-blueprint. A no-op for
        // every workflow without the stage. (An epic already PARKED in
        // define-mockups is outside the filtered chain — the orchestrator's
        // catch-all logs a warning; the gate's "skip" answer is the path for
        // parked epics.)
        if (opts.mockups === false) pipeline = omitStage(pipeline, 'define-mockups');

        // Feature mode: if no epic id provided, let user pick interactively.
        // This is the only interactive step — the dashboard will always pass an explicit epicId.
        let epicData;
        if (agent === 'feature') {
          let epicId = ticketIds[0];
          if (!epicId) {
            const epics = listEpics(ticketsDir);
            if (epics.length === 0) {
              error('No epics found. Create one with: bobby ticket create -t "Feature name" --epic');
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
            error(`Epic ${epicId} has no child tickets. Create children with: bobby ticket create -t "..." --parent ${epicId}`);
            process.exit(1);
          }
          epicData = { epicId, epic, children };
        }

        // One live run per ticket (BOB-120), guarding EVERY prompt-building
        // path below — not just the standard-agent one.
        //
        // Placed here, not inside buildPromptFor, because the ORCHESTRATOR calls
        // that builder in-process for its own agents and already holds the
        // claim. This is the CLI: a genuinely separate operator. An agent
        // launched BY the app carries its claim token in the environment, so its
        // own `bobby run <stage> <ticket>` passes.
        //
        // EVERY id, not ids[0]. The earlier rationale — "the builders act on
        // ids[0]" — is false for the one builder that consumes them all:
        // `bobby run workflow A B` orchestrates both, so checking only the first
        // meant `bobby run workflow <free> <claimed>` handed out a prompt
        // driving the claimed ticket. Order-dependent bugs are still bugs.
        for (const id of ticketIds) assertTicketFree(ticketsDir, id);
        // A feature run drives its CHILDREN, so the epic's claim says nothing
        // about whether the work is free.
        if (epicData) for (const child of epicData.children) assertTicketFree(ticketsDir, child.id);

        // Build the prompt via the unified dispatcher
        let built;
        if (customAgent) {
          const rel = `${agentsPath}/${customAgent}.md`;
          const steps = [];
          if (ticketIds.length > 0) {
            steps.push(`Claim the ticket: \`bobby ticket assign ${ticketIds[0]} ${customAgent}\``);
          }
          steps.push(`Load and follow \`${rel}\`. If \`${agentsPath}/${customAgent}.local.md\` exists, read it too — it wins on any conflict.`);
          if (ticketIds.length > 0) {
            steps.push(`The ticket is \`${ticketsDir}/${ticketIds[0]}*/ticket.md\`. When done, update its stage per the agent file's instructions.`);
          }
          built = {
            label: customAgent,
            subtitle: `custom agent · ${rel}`,
            prompt: `You are **${customAgent}**, a custom agent defined by this project.\n\n` +
              steps.map((s, i) => `${i + 1}. ${s}`).join('\n') + '\n',
          };
        } else {
          try {
            built = buildPromptFor(agent, ticketIds, {
              config,
              ticketsDir,
              // Same resolved absolute dir the lookup uses. On the CLI path cwd
              // usually IS the main checkout, so the relative path happened to
              // work — but the prompt may be pasted into an agent running
              // elsewhere, and one behaviour beats two (TKT-052).
              ticketsPath: ticketsDir,
              agentsPath,
              workflow: pipeline,
              maxRetries,
              maxIterations,
              hasServices,
              hasProduct,
              productDir,
              epicData,
              gitConventions: config.git_conventions || {},
            });
          } catch (e) {
            error(e.message);
            process.exit(1);
          }
        }

        // v2: tell the agent to honor this project's skill overlay. Appended
        // centrally so every `bobby run` variant gets it without touching the
        // individual prompt builders.
        if (built && built.prompt) built.prompt += repoTargetingClause(config) + overlayPromptClause(config);

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
