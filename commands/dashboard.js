// commands/dashboard.js
//
// `bobby dashboard` — local web dashboard for kicking off agents and watching
// workspaces. Starts an HTTP server at 127.0.0.1:<port>, opens it in a browser,
// and cleans up child processes on SIGINT.

import path from 'path';
import { exec } from 'child_process';
import { readConfig, findProjectRoot, resolveTicketsDir, resolveSessionsDir, resolveIdeasFile } from '../lib/config.js';
import { getTarget } from '../lib/targets/index.js';
import { WorkspaceStore } from '../lib/dashboard/state.js';
import { SSEHub } from '../lib/dashboard/sse.js';
import { Orchestrator } from '../lib/dashboard/orchestrator.js';
import { ChatManager } from '../lib/dashboard/chat.js';
import { buildServer } from '../lib/dashboard/server.js';
import { resolveExecutor, commandExists, EXECUTOR_NAMES } from '../lib/dashboard/executor.js';
import { loadDashboardPlugins, pluginStatusLine } from '../lib/dashboard/plugins.js';
import { isGitRepo } from '../lib/dashboard/worktree.js';
import { resolveWorkflow } from './run.js';
import { bold, dim, success, error, warn } from '../lib/colors.js';

function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start ""'
    : 'xdg-open';
  exec(`${cmd} ${JSON.stringify(url)}`, (err) => {
    if (err) {
      // Best-effort — if it fails, the user can copy the URL manually.
    }
  });
}

export function registerDashboard(program) {
  program
    .command('dashboard')
    .description('Start the Bobby workspace dashboard (local web UI)')
    .option('--port <n>', 'Port to bind (default: from config or 7777)')
    .option('--host <host>', 'Host to bind (default: 127.0.0.1)', '127.0.0.1')
    .option('--no-open', 'Do not auto-open the browser')
    .option('--workflow <name>', 'Workflow to use for agent chaining', 'default')
    .action(async (opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);

        if (!isGitRepo(root)) {
          error('Bobby dashboard requires a git repository (worktrees are git-based).');
          process.exit(1);
        }

        const target = getTarget(config.target || 'claude-code');
        const agentsPath = target.paths().agents;

        // Warn once here rather than failing per spawned agent — but don't exit:
        // reviewing diffs, approving, and merging existing workspaces all work
        // without the agent CLI installed.
        const executor = resolveExecutor(config);
        const executorReady = commandExists(executor.bin);
        if (!executorReady) {
          warn(`Executor '${executor.bin}' not found — running agents will fail.`);
          console.log(`  ${dim(`Install it, or set dashboard.executor in .bobbyrc.yml (${EXECUTOR_NAMES.join(' | ')}; an explicit path must be absolute).`)}`);
          console.log(`  ${dim('Reviewing diffs, approving, and merging still work.')}`);
        }

        const ticketsDir = resolveTicketsDir(root, config);
        const sessionsDir = resolveSessionsDir(root, config);
        const pipeline = resolveWorkflow(config, opts.workflow || 'default');

        const port = parseInt(opts.port || config?.dashboard?.port || 7777, 10);
        const host = opts.host || '127.0.0.1';

        if (host !== '127.0.0.1' && host !== 'localhost') {
          warn(`Dashboard binding to ${host} — there is no authentication. Anyone who can reach this host can run agents as you.`);
        }

        // State store
        const stateFile = path.join(root, config.bobby_dir || '.bobby', 'workspaces.json');
        const store = new WorkspaceStore(stateFile).load();
        store.reconcileAfterRestart();

        // SSE hub
        const sseHub = new SSEHub();

        // Orchestrator
        const orchestrator = new Orchestrator({
          repoRoot: root,
          config,
          ticketsDir,
          sessionsDir,
          agentsPath,
          store,
          sseHub,
          pipeline,
          pipelineName: opts.workflow || 'default',
        });

        // Wire store → SSE global broadcasts so clients see state updates
        store.subscribe((event, workspace) => {
          sseHub.broadcast('global', { type: 'store', event, workspace, at: new Date().toISOString() });
          sseHub.broadcast(`workspace:${workspace.id}`, { type: 'store', event, workspace, at: new Date().toISOString() });
        });

        // Paid dashboard extensions, if any are installed and licensed. Never
        // throws — absent or broken means free tier, which is the normal case.
        const { plugins, status: pluginStatus } = await loadDashboardPlugins({ repoRoot: root });

        // Conversational planning (TKT-021): chat records alongside the
        // workspace store, one file per repository.
        const chatManager = new ChatManager({
          orchestrator,
          filePath: path.join(root, config.bobby_dir || '.bobby', 'chats.json'),
        });

        // HTTP server
        const server = buildServer({
          orchestrator, store, sseHub, config, repoRoot: root, ticketsDir,
          chatManager,
          plugins, pluginStatus,
          // The classic UI has no Ideas screen, but the API is one surface for
          // both front ends — the routes must not resolve to a different file
          // depending on which command started the server (TKT-018).
          ideasFile: resolveIdeasFile(root, config),
        });

        server.listen(port, host, () => {
          const url = `http://${host}:${port}`;
          console.log('');
          console.log(`  ${bold('Bobby Dashboard')}`);
          console.log(`  ${dim(`Workflow: ${opts.workflow || 'default'}`)}`);
          console.log(`  ${dim(`Executor: ${executor.bin}${config.dashboard?.model ? ` (${config.dashboard.model})` : ''}${executorReady ? '' : ' — NOT FOUND'}`)}`);
          console.log(`  ${dim(`State:    ${stateFile}`)}`);
          console.log(`  ${dim(pluginStatusLine(pluginStatus))}`);
          console.log('');
          success(`  Running at ${url}`);
          console.log(`  ${dim('Press Ctrl+C to stop')}`);
          console.log('');
          if (opts.open !== false) openInBrowser(url);
        });

        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            error(`Port ${port} is already in use. Try --port <n> to pick another.`);
          } else {
            error(`Server error: ${err.message}`);
          }
          process.exit(1);
        });

        // Graceful shutdown — stop all child claude procs, persist state, close server.
        let shuttingDown = false;
        const shutdown = async () => {
          if (shuttingDown) return;
          shuttingDown = true;
          console.log('');
          console.log(dim('  Stopping running agents…'));
          try {
            await orchestrator.stopAll();
          } catch { /* best effort */ }
          try { store.save(); } catch { /* best effort */ }
          try { sseHub.closeAll(); } catch { /* best effort */ }
          server.close(() => process.exit(0));
          // Hard exit fallback
          setTimeout(() => process.exit(0), 3000).unref();
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
