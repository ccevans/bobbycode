// commands/app.js
//
// `bobby app` — one command, two tiers, no hostages:
//
//   Free (no key): serves the classic dashboard at / — exactly what
//     `bobby dashboard` always served, free forever as published.
//   Bobby Pro: serves the Bobby App — the full-loop UI (brief,
//     do-this-next, board, needs-you queue) — with classic at /classic/.
//
// The app UI ships in @bobbycode/pro-dashboard (installed by
// `bobby pro install`), never in this MIT package — a paywall on MIT-licensed
// files would be theatre. BOBBY_APP_DIR overrides the UI location for
// development of the app itself.

import fs from 'fs';
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
import { loadDashboardPlugins, pluginStatusLine, findExtension, PRO_DASHBOARD_PACKAGE } from '../lib/dashboard/plugins.js';
import { isGitRepo } from '../lib/dashboard/worktree.js';
import { checkPro, PRO_BUY_URL } from '../lib/license.js';
import { resolveWorkflow } from './run.js';
import { bold, dim, success, error, warn } from '../lib/colors.js';

/**
 * Where the Bobby App UI lives, or null → free tier (classic dashboard).
 * Returns { dir, note } — note is the one line we print about the decision.
 */
function resolveAppDir(repoRoot) {
  if (process.env.BOBBY_APP_DIR) {
    const dir = path.resolve(process.env.BOBBY_APP_DIR);
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return { dir, note: `App UI from BOBBY_APP_DIR (dev): ${dir}` };
    }
    return { dir: null, note: `BOBBY_APP_DIR set but no index.html in it — serving the classic dashboard.` };
  }
  const pro = checkPro();
  if (!pro.active) {
    return { dir: null, note: `Classic dashboard (free). The Bobby App is part of Bobby Pro: ${PRO_BUY_URL}` };
  }
  // The Pro package carries the App in app/ (ui/ is its classic-dashboard
  // add-on assets, mounted separately by the extension seam).
  const ext = findExtension(PRO_DASHBOARD_PACKAGE, { repoRoot });
  if (ext && fs.existsSync(path.join(ext.dir, 'app', 'index.html'))) {
    return { dir: path.join(ext.dir, 'app'), note: `Bobby App ${ext.version ? `v${ext.version} ` : ''}(Pro)` };
  }
  return { dir: null, note: 'Pro is active but the app package is not installed — bobby pro install <tarball> (from your purchase).' };
}

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

        // Conversational planning (TKT-021): chat records live alongside the
        // workspace store, one file per repository.
        const chatManager = new ChatManager({
          orchestrator,
          filePath: path.join(root, config.bobby_dir || '.bobby', 'chats.json'),
        });

        const { plugins, status: pluginStatus } = await loadDashboardPlugins({ repoRoot: root });
        const app = resolveAppDir(root);
        const server = buildServer({
          orchestrator, store, sseHub, config, repoRoot: root, ticketsDir,
          chatManager,
          plugins, pluginStatus, appDir: app.dir, sprintsDir,
          // One ideas list per repository, like the ticket board: resolved
          // against the MAIN worktree so `bobby app` run from inside a worktree
          // still shows and writes the ideas `bobby idea` captured (TKT-018).
          ideasFile: resolveIdeasFile(root, config),
        });

        server.listen(port, host, () => {
          const url = `http://${host}:${port}`;
          console.log('');
          console.log(`  ${bold('Bobby')} — ${config.project || path.basename(root)}`);
          console.log(`  ${dim(`Executor: ${executor.bin}${executorReady ? '' : ' — NOT FOUND'}`)}`);
          console.log(`  ${dim(pluginStatusLine(pluginStatus))}`);
          console.log(`  ${dim(app.note)}`);
          console.log('');
          success(`  Running at ${url}`);
          if (app.dir) console.log(`  ${dim(`Classic dashboard: ${url}/classic/`)}`);
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
