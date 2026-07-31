// commands/app.js
//
// `bobby app` — the Bobby app: your whole team in one simple page.
//
// Same server and API as the classic dashboard, serving templates/app/ — the
// full-loop UI (brief, do-this-next, board, needs-you queue) instead of the
// workspace monitor. The classic UI stays at /classic/ for one release.

import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { readConfig, findProjectRoot, resolveTicketsDir, resolveSessionsDir } from '../lib/config.js';
import { getTarget } from '../lib/targets/index.js';
import { WorkspaceStore } from '../lib/dashboard/state.js';
import { SSEHub } from '../lib/dashboard/sse.js';
import { Orchestrator } from '../lib/dashboard/orchestrator.js';
import { buildServer } from '../lib/dashboard/server.js';
import { resolveExecutor, commandExists, EXECUTOR_NAMES } from '../lib/dashboard/executor.js';
import { loadDashboardPlugins, pluginStatusLine } from '../lib/dashboard/plugins.js';
import { isGitRepo } from '../lib/dashboard/worktree.js';
import { resolveWorkflow } from './run.js';
import { bold, dim, success, error, warn } from '../lib/colors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '../templates/app');

function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start ""'
    : 'xdg-open';
  exec(`${cmd} ${JSON.stringify(url)}`, () => { /* best-effort */ });
}

export function registerApp(program) {
  program
    .command('app')
    .alias('dashboard')
    .description('The Bobby app — your whole team in one page (local web UI)')
    .option('--port <n>', 'Port to bind (default: from config or 7777)')
    .option('--host <host>', 'Host to bind (default: 127.0.0.1)', '127.0.0.1')
    .option('--no-open', 'Do not auto-open the browser')
    .option('--workflow <name>', 'Default workflow for agent chaining', 'default')
    .action(async (opts) => {
      try {
        if (process.argv[2] === 'dashboard') {
          console.log(`  ${dim('`bobby dashboard` is now `bobby app` — same server, new UI. The old UI lives at /classic/ for one release.')}`);
        }
        const root = findProjectRoot();
        const config = readConfig(root);

        if (!isGitRepo(root)) {
          error('The Bobby app requires a git repository (worktrees are git-based).');
          process.exit(1);
        }

        const target = getTarget(config.target || 'claude-code');
        const agentsPath = target.paths().agents;

        const executor = resolveExecutor(config);
        const executorReady = commandExists(executor.bin);
        if (!executorReady) {
          warn(`Executor '${executor.bin}' not found — running agents will fail.`);
          console.log(`  ${dim(`Install it, or set dashboard.executor in .bobbyrc.yml (${EXECUTOR_NAMES.join(' | ')}).`)}`);
        }

        const ticketsDir = resolveTicketsDir(root, config);
        const sessionsDir = resolveSessionsDir(root, config);
        const sprintsDir = path.join(root, config.sprints_dir || '.bobby/sprints');
        const pipeline = resolveWorkflow(config, opts.workflow || 'default');

        const port = parseInt(opts.port || config?.dashboard?.port || 7777, 10);
        const host = opts.host || '127.0.0.1';
        if (host !== '127.0.0.1' && host !== 'localhost') {
          warn(`App binding to ${host} — there is no authentication. Anyone who can reach this host can run agents as you.`);
        }

        const stateFile = path.join(root, config.bobby_dir || '.bobby', 'workspaces.json');
        const store = new WorkspaceStore(stateFile).load();
        store.reconcileAfterRestart();
        const sseHub = new SSEHub();
        const orchestrator = new Orchestrator({
          repoRoot: root, config, ticketsDir, sessionsDir, agentsPath,
          store, sseHub, pipeline, pipelineName: opts.workflow || 'default',
        });
        store.subscribe((event, workspace) => {
          const payload = { type: 'store', event, workspace, at: new Date().toISOString() };
          sseHub.broadcast('global', payload);
          sseHub.broadcast(`workspace:${workspace.id}`, payload);
        });

        const { plugins, status: pluginStatus } = await loadDashboardPlugins({ repoRoot: root });
        const server = buildServer({
          orchestrator, store, sseHub, config, repoRoot: root, ticketsDir,
          plugins, pluginStatus, appDir: APP_DIR, sprintsDir,
        });

        server.listen(port, host, () => {
          const url = `http://${host}:${port}`;
          console.log('');
          console.log(`  ${bold('Bobby')} — ${config.project || path.basename(root)}`);
          console.log(`  ${dim(`Executor: ${executor.bin}${executorReady ? '' : ' — NOT FOUND'}`)}`);
          console.log(`  ${dim(pluginStatusLine(pluginStatus))}`);
          console.log('');
          success(`  Running at ${url}`);
          console.log(`  ${dim(`Classic dashboard: ${url}/classic/`)}`);
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

        const shutdown = async () => {
          console.log('');
          console.log(`  ${dim('Shutting down — stopping agents...')}`);
          await orchestrator.stopAll();
          server.close(() => process.exit(0));
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
