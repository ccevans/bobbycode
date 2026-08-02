// commands/remote.js
//
// `bobby remote` — run your agent team from your phone.
//
// Starts the same dashboard the local UI uses, bound to 127.0.0.1 on an
// ephemeral port, then opens ONE outbound, end-to-end-encrypted WebSocket to a
// relay. Your phone connects to the same relay with the pairing code and gets
// exactly the dashboard's API — approve, reject, run, logs — nothing more.
//
// Pairing is per DEVICE, not per project: one studio channel+key for the whole
// machine (~/.bobby/remote/studio.yml). Scan one QR and every project rides
// that channel — frames are addressed by projectId (lib/remote/tunnel.js).
// `--studio` serves every registered project from one daemon; the relay allows
// only one host per channel, so multi-project is multiplexed, never parallel
// daemons.
//
// The trust story in one breath: inference stays here, on your machine, on
// your subscription. The relay routes ciphertext it cannot read. The phone
// holds the key, delivered by QR — never through the relay.

import path from 'path';
import qrcode from 'qrcode-terminal';
import { readConfig, findProjectRoot, resolveTicketsDir, resolveSessionsDir } from '../lib/config.js';
import { getTarget } from '../lib/targets/index.js';
import { WorkspaceStore } from '../lib/dashboard/state.js';
import { SSEHub } from '../lib/dashboard/sse.js';
import { Orchestrator } from '../lib/dashboard/orchestrator.js';
import { buildServer } from '../lib/dashboard/server.js';
import { resolveExecutor, commandExists, EXECUTOR_NAMES } from '../lib/dashboard/executor.js';
import { loadDashboardPlugins } from '../lib/dashboard/plugins.js';
import { isGitRepo } from '../lib/dashboard/worktree.js';
import { listProjects } from '../lib/studio.js';
import { resolveWorkflow } from './run.js';
import { RemoteTunnel, projectIdFor } from '../lib/remote/tunnel.js';
import { encodePairingCode } from '../lib/remote/crypto.js';
import { loadOrCreateStudioPairing } from '../lib/remote/pairing-store.js';
import { bold, dim, success, error, warn } from '../lib/colors.js';

const DEFAULT_RELAY = process.env.BOBBY_RELAY_URL || 'ws://127.0.0.1:8790';
const DEFAULT_APP = process.env.BOBBY_APP_URL || 'http://127.0.0.1:8791';

/**
 * Boot one project's dashboard on a loopback ephemeral port. The same wiring
 * whether it is the only project (`bobby remote` in a repo) or one of many
 * (`--studio`): store, orchestrator, plugins, server — the tunnel is the only
 * way in. Throws on anything unbootable; --studio catches and skips.
 */
async function bootProject(root, { workflowName }) {
  const config = readConfig(root);
  if (!isGitRepo(root)) throw new Error('not a git repository (worktrees are git-based)');

  const target = getTarget(config.target || 'claude-code');
  const agentsPath = target.paths().agents;

  const executor = resolveExecutor(config);
  if (!commandExists(executor.bin)) {
    warn(`Executor '${executor.bin}' not found — running agents will fail.`);
    console.log(`  ${dim(`Install it, or set dashboard.executor in .bobbyrc.yml (${EXECUTOR_NAMES.join(' | ')}).`)}`);
  }

  const ticketsDir = resolveTicketsDir(root, config);
  const sessionsDir = resolveSessionsDir(root, config);
  const pipeline = resolveWorkflow(config, workflowName);

  const stateFile = path.join(root, config.bobby_dir || '.bobby', 'workspaces.json');
  const store = new WorkspaceStore(stateFile).load();
  store.reconcileAfterRestart();
  const sseHub = new SSEHub();
  const orchestrator = new Orchestrator({
    repoRoot: root, config, ticketsDir, sessionsDir, agentsPath,
    store, sseHub, pipeline, pipelineName: workflowName,
  });
  store.subscribe((event, workspace) => {
    const payload = { type: 'store', event, workspace, at: new Date().toISOString() };
    sseHub.broadcast('global', payload);
    sseHub.broadcast(`workspace:${workspace.id}`, payload);
  });

  const { plugins, status: pluginStatus } = await loadDashboardPlugins({ repoRoot: root });
  const server = buildServer({
    orchestrator, store, sseHub, config, repoRoot: root, ticketsDir,
    plugins, pluginStatus,
  });

  // Ephemeral port, loopback only.
  const port = await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

  const name = config.project || path.basename(root);
  return {
    root, name, config, server, orchestrator, port,
    projectId: projectIdFor(name, root),
  };
}

export function registerRemote(program) {
  program
    .command('remote')
    .description('Run your agent team from your phone — outbound, end-to-end encrypted')
    .option('--relay <url>', `Relay to connect through (default: ${DEFAULT_RELAY})`)
    .option('--app <url>', 'Web app URL used in the QR link')
    .option('--studio', 'Serve every registered project from this one daemon')
    .option('--new-code', 'Rotate the studio pairing — old phones are cut off, all projects together')
    .option('--no-qr', 'Skip the QR code (print only the pairing code)')
    .option('--workflow <name>', 'Workflow to use for agent chaining', 'default')
    .action(async (opts) => {
      try {
        const workflowName = opts.workflow || 'default';

        // Where are we? In a project: serve it (unless --studio asks for all).
        // Outside any project: --studio is the only thing `remote` can mean.
        let root = null;
        try { root = findProjectRoot(); } catch { /* not in a project */ }
        const studioMode = !!opts.studio || root === null;

        const projects = [];
        if (studioMode) {
          const registered = listProjects();
          if (registered.length === 0) {
            error('No registered projects. Run a bobby command inside a project first.');
            process.exit(1);
          }
          for (const p of registered) {
            try {
              projects.push(await bootProject(p.path, { workflowName }));
            } catch (e) {
              warn(`Skipping ${p.name} (${p.path}): ${e.message}`);
            }
          }
          if (projects.length === 0) {
            error('No project could be started.');
            process.exit(1);
          }
        } else {
          projects.push(await bootProject(root, { workflowName }));
        }

        const first = projects[0];
        const relay = opts.relay || first.config?.remote?.relay || DEFAULT_RELAY;
        const appUrl = opts.app || first.config?.remote?.app || DEFAULT_APP;

        // ONE identity for the whole machine. If this project was paired
        // before pair-once existed, its channel+key becomes the studio
        // identity so the phone in your pocket never notices the upgrade.
        const pairing = loadOrCreateStudioPairing({
          rotate: !!opts.newCode,
          migrateFrom: root,
        });
        const code = encodePairingCode({ channel: pairing.channel, key: pairing.key, relay });
        // The code rides in the URL fragment: browsers do not send fragments
        // over the network, so the key reaches only the app's own JS.
        const link = `${appUrl.replace(/\/$/, '')}/#${code}`;

        const tunnel = new RemoteTunnel({
          relayUrl: relay,
          channel: pairing.channel,
          key: pairing.key,
          projects: projects.map((p) => ({
            projectId: p.projectId, name: p.name, localPort: p.port,
          })),
          version: program.version() || '',
          log: (m) => console.log(`  ${dim(m)}`),
        });
        tunnel.connect();

        console.log('');
        console.log(`  ${bold('Bobby Remote')} — ${studioMode ? `studio (${projects.length} project${projects.length === 1 ? '' : 's'})` : first.name}`);
        console.log(`  ${dim(`Relay:    ${relay}`)}`);
        for (const p of projects) {
          console.log(`  ${dim(`Local:    127.0.0.1:${p.port} (loopback only) — ${p.name}`)}`);
        }
        console.log(`  ${dim(`Pairing:  ${pairing.file} (studio-wide)${opts.newCode ? '  (rotated — old phones are out)' : ''}`)}`);
        if (pairing.migrated) {
          console.log(`  ${dim('Migrated your existing per-project pairing to the studio — paired phones keep working.')}`);
        }
        console.log('');
        if (opts.qr !== false) {
          qrcode.generate(link, { small: true }, (q) => {
            console.log(q.replace(/^/gm, '  '));
          });
          console.log(`  ${dim('Scan with your phone camera, or open:')}`);
        }
        console.log(`  ${link}`);
        console.log('');
        console.log(`  ${dim('Pairing code (paste into the app if you prefer):')}`);
        console.log(`  ${code}`);
        console.log('');
        success('  Team is reachable. Press Ctrl+C to stop.');
        console.log('');

        const shutdown = async () => {
          console.log('');
          console.log(`  ${dim('Shutting down — stopping agents...')}`);
          tunnel.close();
          await Promise.allSettled(projects.map((p) => p.orchestrator.stopAll()));
          let open = projects.length;
          for (const p of projects) {
            p.server.close(() => { if (--open === 0) process.exit(0); });
          }
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
