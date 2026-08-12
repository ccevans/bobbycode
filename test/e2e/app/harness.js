// test/e2e/app/harness.js
//
// One fixture, shared by both app e2e suites: a real .bobby project on disk,
// the real dashboard server (lib/dashboard/server.js), the real SSE hub — and a
// stub in place of the orchestrator.
//
// The stub is the whole safety story. Everything that would fork a `claude`
// process lives behind `Orchestrator`, so replacing it means these suites can
// never spawn an executor and can never spend a token, in CI or on a laptop.
// The stub records what it was asked to do; the assertions are made against
// that record.
//
// Deliberately NOT stubbed: tickets, stages, workflows, the brief, the HTTP
// routing and the static file serving. Those are the things that regress.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildServer } from '../../../lib/dashboard/server.js';
import { SSEHub } from '../../../lib/dashboard/sse.js';
import { createTicket, getFeatureTickets } from '../../../lib/tickets.js';

/**
 * Poll until `fn` returns something truthy.
 *
 * The only waiting primitive these suites get. A fixed sleep is either too
 * short (flake) or too long (a suite nobody runs) — every wait here is on a
 * condition, and names itself in the timeout message.
 */
export async function waitFor(fn, { timeout = 10000, interval = 10, what = 'a condition' } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() >= deadline) throw new Error(`Timed out after ${timeout}ms waiting for ${what}`);
    await new Promise((resolve) => { setTimeout(resolve, interval); });
  }
}

/**
 * Start a Bobby app server against a throwaway project.
 *
 * @param {object}  opts
 * @param {object}  opts.config  - extra .bobbyrc config (workflows, project, …)
 * @param {?string} opts.appDir  - the app UI to serve at /. null = API only.
 */
export async function startApp({ config = {}, appDir = null } = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-app-e2e-'));
  const ticketsDir = path.join(repoRoot, '.bobby', 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });

  /** Every orchestrator call, in order: ['create', ticketId, agent], ['run', id], … */
  const calls = [];
  const workspaces = new Map();
  let seq = 0;

  const now = () => new Date().toISOString();
  const get = (id) => {
    const ws = workspaces.get(id);
    if (!ws) throw new Error(`Workspace ${id} not found`);
    return ws;
  };

  // Approve and reject record the call and leave `status` alone. The real
  // orchestrator advances the run; here the UI's state is set by the test that
  // wants it, so a decision button stays on screen and can be exercised twice.
  const orchestrator = {
    readLatestSessionFile: () => null,

    createWorkspace({ ticketId, agent, pipelineName }) {
      calls.push(['create', ticketId, agent]);
      seq += 1;
      const ws = {
        id: `ws-${seq}`,
        ticketId,
        agent,
        status: 'idle',
        stage: null,
        pipeline: pipelineName || null,
        branch: `tkt/${String(ticketId).toLowerCase()}`,
        createdAt: now(),
        updatedAt: now(),
      };
      workspaces.set(ws.id, ws);
      return ws;
    },

    async runAgent(id) {
      calls.push(['run', id]);
      const ws = get(id);
      ws.status = 'running';
      ws.updatedAt = now();
      return ws;
    },

    async stop(id) {
      calls.push(['stop', id]);
      const ws = get(id);
      ws.status = 'stopped';
      ws.updatedAt = now();
      return ws;
    },

    async approve(id) {
      calls.push(['approve', id]);
      return get(id);
    },

    async reject(id, { reason } = {}) {
      calls.push(['reject', id, reason]);
      return get(id);
    },

    async merge(id, { message } = {}) {
      calls.push(['merge', id, message]);
      const ws = get(id);
      ws.status = 'merged';
      ws.updatedAt = now();
      return ws;
    },

    async discard(id) {
      calls.push(['discard', id]);
      workspaces.delete(id);
      return { id, status: 'discarded' };
    },

    // Mirrors the real method: resolve the workspace's ticket, then read the
    // SHARED board. Children only ever advance via `bobby ticket move`, which
    // writes to the main checkout from inside any worktree (TKT-051).
    featureProgress(id) {
      return getFeatureTickets(ticketsDir, get(id).ticketId);
    },
  };

  const store = {
    list: () => [...workspaces.values()],
    get: (id) => workspaces.get(id) || null,
    subscribe: () => {},
  };

  const sseHub = new SSEHub();
  const server = buildServer({
    orchestrator,
    store,
    sseHub,
    config: { ticket_prefix: 'TKT', project: 'e2e-app', ...config },
    repoRoot,
    ticketsDir,
    sprintsDir: path.join(repoRoot, '.bobby', 'sprints'),
    appDir,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    repoRoot,
    ticketsDir,
    calls,
    server,

    /** Seed a ticket. Returns its id. */
    ticket(opts) {
      return createTicket(ticketsDir, { prefix: 'TKT', ...opts }).id;
    },

    /** Seed a workspace in a given state, without going through the UI. */
    openWorkspace({ ticketId, agent = 'workflow', status = 'idle', stage = null, pipeline = null }) {
      const ws = orchestrator.createWorkspace({ ticketId, agent, pipelineName: pipeline });
      Object.assign(ws, { status, stage, updatedAt: now() });
      calls.length = 0;   // seeding is not a call the test made
      return ws;
    },

    async api(method, p, body) {
      const res = await fetch(base + p, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },

    /**
     * Wait until a client is actually listening on /api/events. Broadcasting
     * before the EventSource has connected drops the message on the floor —
     * this is the difference between a live-update test and a flaky one.
     */
    waitForLiveClient() {
      return waitFor(() => (sseHub.channels.get('global')?.size || 0) > 0, {
        what: 'the app to open its /api/events stream',
      });
    },

    /** The event the real store emits on any change — the app refetches on it. */
    notifyStore() {
      sseHub.broadcast('global', { type: 'store', event: 'updated', at: now() });
    },

    async stop() {
      sseHub.closeAll();
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(repoRoot, { recursive: true, force: true });
    },
  };
}
