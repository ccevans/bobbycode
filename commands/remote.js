// commands/remote.js
//
// `bobby remote` — run your agent team from your phone.
//
// Starts the same dashboard the local UI uses, bound to 127.0.0.1 on an
// ephemeral port, then opens ONE outbound, end-to-end-encrypted WebSocket to a
// relay. Your phone connects to the same relay with the pairing code and gets
// exactly the dashboard's API — approve, reject, run, logs — nothing more.
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
import { ProjectContext } from '../lib/dashboard/project-context.js';
import { listStudioProjects } from '../lib/config.js';
import { ChatManager } from '../lib/dashboard/chat.js';
import { buildServer } from '../lib/dashboard/server.js';
import { resolveExecutor, commandExists, EXECUTOR_NAMES } from '../lib/dashboard/executor.js';
import { loadDashboardPlugins } from '../lib/dashboard/plugins.js';
import { isGitRepo } from '../lib/dashboard/worktree.js';
import { resolveWorkflow } from './run.js';
import { RemoteTunnel } from '../lib/remote/tunnel.js';
import { createNotifier } from '../lib/remote/notifier.js';
import { encodePairingCode } from '../lib/remote/crypto.js';
import { pairingBlocker } from '../lib/remote/reachability.js';
import { verifyRoundTrip, verifyMessage } from '../lib/remote/verify.js';
import { loadOrCreatePairing } from '../lib/remote/pairing-store.js';
import { bold, dim, success, error, warn } from '../lib/colors.js';

// The shipped defaults are the hosted relay (BOB-091): TLS at Fly's edge, one
// origin serving both the app and the wss:// channel (hq/fly.toml in the pro
// repo). Local dev keeps every override: BOBBY_RELAY_URL / BOBBY_APP_URL env,
// `remote.relay` / `remote.app` in .bobbyrc.yml, or --relay/--app flags —
// loopback ws:// stays legal because browsers grant it a secure context.
// Exported so the secure-default promise is testable (an insecure default can
// never ship again — test/commands/remote-defaults.test.js).
export const DEFAULT_RELAY = process.env.BOBBY_RELAY_URL || 'wss://bobby-relay.fly.dev';
export const DEFAULT_APP = process.env.BOBBY_APP_URL || 'https://bobby-relay.fly.dev';

export function registerRemote(program) {
  program
    .command('remote')
    .description('Run your agent team from your phone — outbound, end-to-end encrypted')
    .option('--relay <url>', `Relay to connect through (default: ${DEFAULT_RELAY})`)
    .option('--app <url>', 'Web app URL used in the QR link')
    .option('--new-code', 'Rotate the pairing — old phones are cut off')
    .option('--no-qr', 'Skip the QR code (print only the pairing code)')
    .option('--workflow <name>', 'Workflow to use for agent chaining', 'default')
    .action(async (opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);

        if (!isGitRepo(root)) {
          error('bobby remote requires a git repository (worktrees are git-based).');
          process.exit(1);
        }

        const target = getTarget(config.target || 'claude-code');
        const agentsPath = target.paths().agents;

        // A `dashboard.executor` whose CLI flavor cannot be placed is refused
        // (BOB-137) — loudly, but NOT fatally. A studio serves many projects,
        // and one project's bad executor key must not stop the app that is the
        // only way to fix it (the BOB-024 boot-on-an-empty-studio posture).
        // Every run then 400s with this same message, so nothing runs silently
        // on the wrong flags. The twin of this block lives in commands/app.js,
        // which additionally keeps a null `executor` for its summary line —
        // change the two together.
        try {
          const executor = resolveExecutor(config);
          if (!commandExists(executor.bin)) {
            warn(`Executor '${executor.bin}' not found — running agents will fail.`);
            console.log(`  ${dim(`Install it, or set dashboard.executor in .bobbyrc.yml (${EXECUTOR_NAMES.join(' | ')}).`)}`);
          }
        } catch (e) {
          error(e.message);
          console.log(`  ${dim('Agent runs will refuse with this message until the config is fixed.')}`);
        }

        const ticketsDir = resolveTicketsDir(root, config);
        const sessionsDir = resolveSessionsDir(root, config);
        const pipeline = resolveWorkflow(config, opts.workflow || 'default');

        const stateFile = path.join(root, config.bobby_dir || '.bobby', 'workspaces.json');
        const store = new WorkspaceStore(stateFile).load();
        store.reconcileAfterRestart();
        const sseHub = new SSEHub();
        // Studio mode (TKT-022): switch projects from the app over the same
        // tunnel. Inert off-studio.
        const projectContext = new ProjectContext(root, config);
        const orchestrator = new Orchestrator({
          repoRoot: root, config, ticketsDir, sessionsDir, agentsPath,
          store, sseHub, pipeline, pipelineName: opts.workflow || 'default',
          projectContext,
        });
        store.subscribe((event, workspace) => {
          const payload = { type: 'store', event, workspace, at: new Date().toISOString() };
          sseHub.broadcast('global', payload);
          sseHub.broadcast(`workspace:${workspace.id}`, payload);
        });

        // Conversational planning (TKT-021), reachable over the relay like every
        // other GET/POST /api route.
        const chatManager = new ChatManager({
          orchestrator,
          filePath: path.join(root, config.bobby_dir || '.bobby', 'chats.json'),
        });

        const { plugins, status: pluginStatus } = await loadDashboardPlugins({ repoRoot: root });
        const server = buildServer({
          orchestrator, store, sseHub, config, repoRoot: root, ticketsDir,
          chatManager,
          plugins, pluginStatus,
        });

        // Ephemeral port, loopback only. The tunnel is the only way in.
        // async: the reachability verdict is now earned by an awaited round trip
        // rather than printed immediately (BOB-064).
        server.listen(0, '127.0.0.1', async () => {
          const { port } = server.address();
          const relay = opts.relay || config?.remote?.relay || DEFAULT_RELAY;
          const appUrl = opts.app || config?.remote?.app || DEFAULT_APP;
          const pairing = loadOrCreatePairing(root, { rotate: !!opts.newCode });
          const code = encodePairingCode({ channel: pairing.channel, key: pairing.key, relay });
          // The code rides in the URL fragment: browsers do not send fragments
          // over the network, so the key reaches only the app's own JS.
          const link = `${appUrl.replace(/\/$/, '')}/#${code}`;

          const tunnel = new RemoteTunnel({
            relayUrl: relay,
            channel: pairing.channel,
            key: pairing.key,
            localPort: port,
            project: config.project || path.basename(root),
            // The roster for the phone's project picker (BOB-067): one pairing
            // reaches every project this studio serves. Off-studio the list is
            // just this project, which the tunnel renders as "no picker".
            projects: (config.studio ? listStudioProjects(root) : null) || undefined,
            version: program.version() || '',
            log: (m) => console.log(`  ${dim(m)}`),
          });
          // Refuse a link no phone can use, before a QR is printed under it
          // (BOB-064). Both URLs are in hand here, so this is decidable now
          // rather than discovered on a phone forty minutes later.
          const blocker = pairingBlocker({ appUrl: link, relayUrl: relay });
          if (blocker) {
            console.log('');
            error(`  ${blocker}`);
            console.log('');
            await orchestrator.stopAll().catch(() => {});
            server.close(() => process.exit(1));
            setTimeout(() => process.exit(1), 3000).unref();
            return;
          }

          tunnel.connect();

          console.log('');
          console.log(`  ${bold('Bobby Remote')} — ${config.project || path.basename(root)}`);
          console.log(`  ${dim(`Relay:    ${relay}`)}`);
          console.log(`  ${dim(`Local:    127.0.0.1:${port} (loopback only)`)}`);
          console.log(`  ${dim(`Pairing:  ${pairing.file}${opts.newCode ? '  (rotated — old phones are out)' : ''}`)}`);
          console.log('');
          // Prove the path rather than asserting it (BOB-064). connect() does not
          // block, so the old unconditional success printed BEFORE the relay was
          // connected — its own log had the verdict two lines above "relay
          // connected", and it printed just the same when the relay was down.
          console.log(`  ${dim('Connecting…')}`);
          const verified = await verifyRoundTrip({ relayUrl: relay, channel: pairing.channel, key: pairing.key });
          if (!verified.ok) {
            console.log('');
            error(`  ${verifyMessage(verified)}`);
            console.log('');
            tunnel.close();
            await orchestrator.stopAll().catch(() => {});
            server.close(() => process.exit(1));
            setTimeout(() => process.exit(1), 3000).unref();
            return;
          }
          // Push has a producer now (BOB-130). Wired only after verifyRoundTrip
          // succeeds, for the same reason the QR is (BOB-064): a session that is
          // about to exit must not put frames on a relay it could not reach.
          // Its own subscriber, deliberately separate from the SSE fan-out
          // above — merging them would put relay-protocol knowledge into the
          // SSE path.
          const stopNotifier = createNotifier({
            store,
            send: (kind) => tunnel.sendNotify(kind),
          });

          success('  Team is reachable — verified by an encrypted round trip. Press Ctrl+C to stop.');
          console.log('');
          // The QR, link, and pairing code print only now, AFTER the verdict is
          // earned (BOB-064 rejection round). The verifier attaches to the relay
          // as its own client, so nothing needs the QR on screen first — and a
          // QR that sits scannable for the whole verify timeout while the relay
          // is down is an invitation to the exact forty minutes this ticket is
          // about. Failure paths above exit without ever printing one.
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

          const shutdown = async () => {
            console.log('');
            console.log(`  ${dim('Shutting down — stopping agents...')}`);
            stopNotifier();
            tunnel.close();
            await orchestrator.stopAll();
            server.close(() => process.exit(0));
            setTimeout(() => process.exit(0), 3000).unref();
          };
          process.on('SIGINT', shutdown);
          process.on('SIGTERM', shutdown);
        });

        server.on('error', (err) => {
          error(`Server error: ${err.message}`);
          process.exit(1);
        });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
