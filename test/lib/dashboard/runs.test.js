// test/lib/dashboard/runs.test.js
//
// Run history as a first-class resource (TKT-017), the per-run cost that hangs
// off it (TKT-019), and the merge timestamp a child ticket row needs (TKT-013).
// One suite because they are one record: 017 defines the shape, 019 adds a
// field to it, 013 records the moment a workspace stops producing runs.
//
// Everything here drives the REAL Orchestrator against a REAL git repo, and
// reads /api/runs over REAL HTTP from the REAL store. Only `_runExecutor` is
// faked, so no `claude` is ever spawned — the same seam the FSM and repo-run
// suites use. Calling `listRuns` directly and calling it done is how TKT-047
// stayed hidden: the helper was right and the machine that used it was not.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { runAgent } from '../../../lib/dashboard/executor.js';
import { WorkspaceStore } from '../../../lib/dashboard/state.js';
import { buildServer } from '../../../lib/dashboard/server.js';
import { resolveWorkflow } from '../../../lib/workflow.js';
import { createTicket, moveTicket, findTicket } from '../../../lib/tickets.js';

let tmp;
let repoRoot;
let server;
let base;

const git = (cwd, cmd) => execSync(`git ${cmd}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init -q -b main');
  git(dir, 'config user.email test@example.com');
  git(dir, 'config user.name Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  git(dir, 'add .');
  git(dir, 'commit -q -m initial');
  return dir;
}

/**
 * A real orchestrator on a real repo with a fake agent CLI.
 *
 * `costQueue` is what the EXECUTOR reports, one entry per launch. An entry of
 * `undefined` means this executor said nothing about cost — which is the
 * degrade-honestly case, not a zero.
 */
function makeOrchestrator({ config = {} } = {}) {
  const ticketsDir = path.join(repoRoot, '.bobby', 'tickets');
  const sessionsDir = path.join(repoRoot, '.bobby', 'sessions');
  fs.mkdirSync(ticketsDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });

  const o = new Orchestrator({
    repoRoot,
    config,
    ticketsDir,
    sessionsDir,
    agentsPath: '.claude/agents',
    store: new WorkspaceStore(path.join(tmp, 'workspaces.json')),
    sseHub: null,
    pipeline: resolveWorkflow(config, 'default'),
    pipelineName: 'default',
  });

  o.costQueue = [];
  o.exitQueue = [];   // { exitCode, signal } per launch; defaults to a clean exit
  o.launchCount = 0;  // makes each fake agent's output differ from the last

  o._runExecutor = ({ worktreePath }) => {
    // A real agent leaves something behind, and since TKT-062 that is the
    // difference between a `completed` run and a `no_op` one. A fake that wrote
    // nothing would quietly turn every fixture here into the silent-burn case
    // and stop being a fixture for run history at all. Worktree runs only — a
    // repo run's cwd is the user's own checkout, which nothing here may dirty.
    if (worktreePath && worktreePath !== repoRoot) {
      fs.writeFileSync(path.join(worktreePath, 'work.txt'), `${o.launchCount++}\n`);
    }
    const outcome = o.exitQueue.length ? o.exitQueue.shift() : { exitCode: 0, signal: null };
    const result = { ...outcome };
    // Present only when the executor actually reported a figure — an executor
    // that does not report cost omits the key entirely, exactly as the real one
    // does when the CLI never emits total_cost_usd.
    if (o.costQueue.length) {
      const cost = o.costQueue.shift();
      if (cost !== undefined) result.costUsd = cost;
    }
    return { pid: 4321, stop: () => {}, done: Promise.resolve(result) };
  };

  return o;
}

/** Seed a ticket on the shared board so a worktree run has something to run on. */
function seedTicket(o, { id, stage, title, parent }) {
  fs.writeFileSync(path.join(o.ticketsDir, '.counter'), String(Number(id.split('-')[1]) - 1));
  createTicket(o.ticketsDir, {
    prefix: 'TKT',
    title: title || `Work for ${id}`,
    author: 'dev',
    area: '',
    parent: parent || null,
  });
  if (stage) moveTicket(o.ticketsDir, id, stage, 'test');
  return id;
}

/** Let the queued _onExit handler (attached via .then) run. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
}

/** Create a workspace for a ticket and run one agent in it to completion. */
async function runOnce(o, { ticketId, agent = 'build', stage = 'building' }) {
  seedTicket(o, { id: ticketId, stage });
  const ws = o.createWorkspace({ ticketId, agent });
  await o.runAgent(ws.id);
  await settle();
  return o.store.get(ws.id);
}

/** A real HTTP server over the orchestrator's real store. */
async function serve(o) {
  server = buildServer({
    orchestrator: o,
    store: o.store,
    sseHub: { connect: () => () => {}, broadcast: () => {} },
    config: { ticket_prefix: 'TKT' },
    repoRoot,
    ticketsDir: o.ticketsDir,
    sprintsDir: path.join(repoRoot, '.bobby', 'sprints'),
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

const api = async (method, p) => {
  const res = await fetch(base + p, { method });
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-runs-'));
  repoRoot = initRepo(path.join(tmp, 'main'));
  server = null;
});

afterEach(async () => {
  if (server) {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe('GET /api/runs — run history across the project (TKT-017)', () => {
  it('lists a completed run with its agent, timing and outcome', async () => {
    const o = makeOrchestrator();
    const ws = await runOnce(o, { ticketId: 'TKT-001', agent: 'build' });
    await serve(o);

    const { status, body } = await api('GET', '/api/runs');

    expect(status).toBe(200);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({
      workspaceId: ws.id,
      kind: 'worktree',
      ticketId: 'TKT-001',
      agent: 'build',
      status: 'completed',
      exitCode: 0,
      signal: null,
      error: null,
    });
    // Identity, timing and a duration the caller does not have to compute.
    expect(body.runs[0].id).toBe(`${ws.id}-run-1`);
    expect(body.runs[0].sessionId).toBeTruthy();
    expect(Date.parse(body.runs[0].startedAt)).not.toBeNaN();
    expect(Date.parse(body.runs[0].endedAt)).not.toBeNaN();
    expect(body.runs[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('lists a repo run as a first-class run, with a null ticket id', async () => {
    const o = makeOrchestrator();
    const run = o.createRepoRun({ agent: 'ux' });
    await o.runAgent(run.id);
    await settle();
    await serve(o);

    const { body } = await api('GET', '/api/runs');

    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({
      workspaceId: run.id,
      kind: 'repo',
      ticketId: null,
      agent: 'ux',
      status: 'completed',
    });
  });

  it('filters by ticket', async () => {
    const o = makeOrchestrator();
    await runOnce(o, { ticketId: 'TKT-001' });
    await runOnce(o, { ticketId: 'TKT-002' });
    const repo = o.createRepoRun({ agent: 'docs' });
    await o.runAgent(repo.id);
    await settle();
    await serve(o);

    const { body } = await api('GET', '/api/runs?ticket=TKT-002');

    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].ticketId).toBe('TKT-002');
    expect(body.total).toBe(1);
    // The unfiltered list still has all three, repo run included.
    expect((await api('GET', '/api/runs')).body.total).toBe(3);
  });

  it('filters by status', async () => {
    const o = makeOrchestrator();
    o.exitQueue = [{ exitCode: 0, signal: null }];
    await runOnce(o, { ticketId: 'TKT-001' });
    o.exitQueue = [{ exitCode: 2, signal: null }];
    await runOnce(o, { ticketId: 'TKT-002' });
    o.exitQueue = [{ exitCode: null, signal: 'SIGTERM' }];
    await runOnce(o, { ticketId: 'TKT-003' });
    await serve(o);

    expect((await api('GET', '/api/runs?status=completed')).body.runs.map(r => r.ticketId)).toEqual(['TKT-001']);
    expect((await api('GET', '/api/runs?status=failed')).body.runs.map(r => r.ticketId)).toEqual(['TKT-002']);
    expect((await api('GET', '/api/runs?status=stopped')).body.runs.map(r => r.ticketId)).toEqual(['TKT-003']);
  });

  it('refuses an unknown status instead of quietly returning nothing', async () => {
    const o = makeOrchestrator();
    await serve(o);

    const { status, body } = await api('GET', '/api/runs?status=sideways');

    expect(status).toBe(400);
    expect(body.error).toMatch(/completed/);
    expect(body.error).toMatch(/failed/);
  });

  it('orders newest first and paginates, with totals over the whole filtered set', async () => {
    const o = makeOrchestrator();
    await runOnce(o, { ticketId: 'TKT-001' });
    await runOnce(o, { ticketId: 'TKT-002' });
    await runOnce(o, { ticketId: 'TKT-003' });
    await serve(o);

    const { body } = await api('GET', '/api/runs?limit=2');

    expect(body.runs).toHaveLength(2);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
    // Newest first: TKT-003 ran last.
    expect(body.runs.map(r => r.ticketId)).toEqual(['TKT-003', 'TKT-002']);
    // `total` describes everything that matched, not the page.
    expect(body.total).toBe(3);
    expect(body.totals.runs).toBe(3);

    const page2 = await api('GET', '/api/runs?limit=2&offset=2');
    expect(page2.body.runs.map(r => r.ticketId)).toEqual(['TKT-001']);
    expect(page2.body.total).toBe(3);
  });

  it('bounds the page even when the caller asks for everything', async () => {
    const o = makeOrchestrator();
    await runOnce(o, { ticketId: 'TKT-001' });
    await serve(o);

    // A list that grows for the life of the project must never be unbounded.
    const { body } = await api('GET', '/api/runs?limit=999999');
    expect(body.limit).toBeLessThanOrEqual(500);

    // Nonsense falls back to the default rather than returning nothing.
    expect((await api('GET', '/api/runs?limit=0')).body.runs).toHaveLength(1);
    expect((await api('GET', '/api/runs?limit=lots')).body.runs).toHaveLength(1);
  });

  it('normalizes runs recorded before the run record had a shape', async () => {
    const o = makeOrchestrator();
    // A workspaces.json written by an older build: runs carry no id, no
    // workspaceId, no ticketId, no duration, no status and no cost.
    const legacy = {
      version: 1,
      workspaces: {
        'ws-TKT-009-build-old': {
          id: 'ws-TKT-009-build-old',
          ticketId: 'TKT-009',
          status: 'merged',
          runs: [{
            agent: 'build',
            sessionId: 'ses-old',
            startedAt: '2026-01-01T10:00:00.000Z',
            endedAt: '2026-01-01T10:05:00.000Z',
            exitCode: 0,
            signal: null,
            error: null,
          }],
        },
      },
    };
    fs.writeFileSync(path.join(tmp, 'workspaces.json'), JSON.stringify(legacy), 'utf8');
    o.store.load();
    await serve(o);

    const { body } = await api('GET', '/api/runs');

    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({
      id: 'ws-TKT-009-build-old-run-1',
      workspaceId: 'ws-TKT-009-build-old',
      kind: 'worktree',        // records predating `kind` were all worktree runs
      ticketId: 'TKT-009',
      agent: 'build',
      status: 'completed',
      durationMs: 300000,      // derived from the timestamps it does have
      costUsd: null,           // never recorded, so absent — not free
    });
  });
});

describe('per-run cost (TKT-019)', () => {
  it('records the cost the executor reported, per run', async () => {
    const o = makeOrchestrator();
    o.costQueue = [0.0432];
    const ws = await runOnce(o, { ticketId: 'TKT-001' });
    await serve(o);

    expect(ws.runs[0].costUsd).toBe(0.0432);
    expect((await api('GET', '/api/runs')).body.runs[0].costUsd).toBe(0.0432);
  });

  it('records null — never 0 — for an executor that does not report cost', async () => {
    const o = makeOrchestrator();
    const ws = await runOnce(o, { ticketId: 'TKT-001' });
    await serve(o);

    expect(ws.runs[0].costUsd).toBeNull();
    const run = (await api('GET', '/api/runs')).body.runs[0];
    expect(run.costUsd).toBeNull();
    expect(run.costUsd).not.toBe(0);
  });

  it('keeps a genuinely-free run at 0, distinct from an unreported one', async () => {
    const o = makeOrchestrator();
    o.costQueue = [0];
    await runOnce(o, { ticketId: 'TKT-001' });
    await serve(o);

    expect((await api('GET', '/api/runs')).body.runs[0].costUsd).toBe(0);
  });

  it('totals cost per ticket and says how many runs it could not account for', async () => {
    const o = makeOrchestrator();
    o.costQueue = [0.10];
    await runOnce(o, { ticketId: 'TKT-001', agent: 'build' });
    o.costQueue = [0.20];
    await runOnce(o, { ticketId: 'TKT-002', agent: 'build' });
    o.costQueue = [undefined];   // this executor reported nothing
    await runOnce(o, { ticketId: 'TKT-003', agent: 'build' });
    await serve(o);

    const { body } = await api('GET', '/api/runs');

    // The aggregate never presents a partial sum as if it were complete.
    expect(body.totals).toEqual({
      runs: 3,
      costUsd: 0.3,
      runsWithCost: 2,
      runsWithoutCost: 1,
    });

    // Per ticket, which is the total a ticket/feature view wants.
    const one = await api('GET', '/api/runs?ticket=TKT-001');
    expect(one.body.totals).toEqual({ runs: 1, costUsd: 0.1, runsWithCost: 1, runsWithoutCost: 0 });
  });

  it('reports a total of null, not 0, when nothing could be accounted for', async () => {
    const o = makeOrchestrator();
    await runOnce(o, { ticketId: 'TKT-001' });
    await runOnce(o, { ticketId: 'TKT-002' });
    await serve(o);

    const { body } = await api('GET', '/api/runs');

    // Summing an empty set gives 0, and 0 would be a lie about two real runs.
    expect(body.totals.costUsd).toBeNull();
    expect(body.totals.runsWithoutCost).toBe(2);
  });
});

describe('merge timestamps (TKT-013)', () => {
  /** A workspace with a real worktree, a real branch and a real commit to merge. */
  async function workspaceReadyToMerge(o, ticketId = 'TKT-001', parent = null) {
    seedTicket(o, { id: ticketId, stage: 'building', parent });
    const ws = o.createWorkspace({ ticketId, agent: 'build' });
    fs.writeFileSync(path.join(ws.worktreePath, `${ticketId}.txt`), 'done\n');
    git(ws.worktreePath, 'add -A');
    git(ws.worktreePath, 'commit -q -m "feature"');
    return o.store.get(ws.id);
  }

  it('records a merge timestamp on the ticket and on the workspace', async () => {
    const o = makeOrchestrator();
    const ws = await workspaceReadyToMerge(o);
    const before = Date.now();

    const merged = await o.merge(ws.id);

    expect(merged.status).toBe('merged');
    // On the workspace: when the dashboard did the merge.
    expect(Date.parse(merged.mergedAt)).toBeGreaterThanOrEqual(before - 1000);
    // On the ticket: the durable, user-visible fact, as a full timestamp — the
    // date-only `updated` field it sits beside cannot carry a time.
    const ticket = findTicket(o.ticketsDir, 'TKT-001');
    expect(Date.parse(ticket.data.mergedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(ticket.data.mergedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(ticket.data.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('serves the merge time on a feature child so the row can render a relative time', async () => {
    const o = makeOrchestrator();
    seedTicket(o, { id: 'TKT-001', title: 'Payments' });
    const epicPath = findTicket(o.ticketsDir, 'TKT-001').path;
    fs.writeFileSync(
      path.join(epicPath, 'ticket.md'),
      fs.readFileSync(path.join(epicPath, 'ticket.md'), 'utf8').replace('type: feature', 'type: epic'),
      'utf8'
    );
    const ws = await workspaceReadyToMerge(o, 'TKT-002', 'TKT-001');
    await o.merge(ws.id);
    await serve(o);

    const { status, body } = await api('GET', '/api/features/TKT-001');

    expect(status).toBe(200);
    const child = body.children.find(c => c.id === 'TKT-002');
    expect(Date.parse(child.mergedAt)).not.toBeNaN();
  });

  it('reports mergedAt as null — never a 1970 date — for a ticket merged before this change', async () => {
    const o = makeOrchestrator();
    seedTicket(o, { id: 'TKT-001', title: 'Payments' });
    const epicPath = findTicket(o.ticketsDir, 'TKT-001').path;
    fs.writeFileSync(
      path.join(epicPath, 'ticket.md'),
      fs.readFileSync(path.join(epicPath, 'ticket.md'), 'utf8').replace('type: feature', 'type: epic'),
      'utf8'
    );
    // Merged by an older build: stage says done, frontmatter has no mergedAt.
    seedTicket(o, { id: 'TKT-002', stage: 'done', parent: 'TKT-001' });
    await serve(o);

    const { body } = await api('GET', '/api/features/TKT-001');
    const child = body.children.find(c => c.id === 'TKT-002');

    // The bug this guards: `new Date(null)` is the epoch, which renders as
    // "merged 56 years ago"; `new Date(undefined)` renders "Invalid Date".
    expect(child.mergedAt).toBeNull();
    expect(new Date(0).getUTCFullYear()).toBe(1970); // what null would have meant
  });

  it('discards a hand-edited mergedAt that is not a date, rather than passing it on', async () => {
    const o = makeOrchestrator();
    seedTicket(o, { id: 'TKT-001', title: 'Payments' });
    const epicPath = findTicket(o.ticketsDir, 'TKT-001').path;
    fs.writeFileSync(
      path.join(epicPath, 'ticket.md'),
      fs.readFileSync(path.join(epicPath, 'ticket.md'), 'utf8').replace('type: feature', 'type: epic'),
      'utf8'
    );
    seedTicket(o, { id: 'TKT-002', stage: 'done', parent: 'TKT-001' });
    // Frontmatter is user-visible and hand-editable — that is the cost of
    // putting the timestamp there, so nothing downstream may trust it.
    const childPath = findTicket(o.ticketsDir, 'TKT-002').path;
    const raw = fs.readFileSync(path.join(childPath, 'ticket.md'), 'utf8');
    fs.writeFileSync(path.join(childPath, 'ticket.md'), raw.replace('---\n\n##', "mergedAt: last tuesday\n---\n\n##"), 'utf8');
    await serve(o);

    const { body } = await api('GET', '/api/features/TKT-001');

    expect(body.children.find(c => c.id === 'TKT-002').mergedAt).toBeNull();
  });
});

describe('a failed run names the executor that actually ran (BOB-136)', () => {
  // `lastError` is the line a user reads in the App when a run goes red. It
  // hardcoded `claude` from 6c01c85 until BOB-136, so a failed opencode run
  // sent the user to the wrong binary, the wrong docs and the wrong auth.
  it('blames opencode when opencode is what ran', async () => {
    const o = makeOrchestrator({ config: { dashboard: { executor: 'opencode' } } });
    o.exitQueue = [{ exitCode: 1, signal: null }];

    const ws = await runOnce(o, { ticketId: 'TKT-001' });

    expect(ws.lastError).toBe('opencode exited with code 1');
    // The positive assertion alone would still pass if the name were swapped
    // for another hardcode; this is the one that pins the bug.
    expect(ws.lastError).not.toMatch(/claude/);
  });

  it.each(['claude', 'cursor-agent', 'codex', 'opencode'])(
    'names %s when %s is the configured executor',
    async (flavor) => {
      const o = makeOrchestrator({ config: { dashboard: { executor: flavor } } });
      o.exitQueue = [{ exitCode: 2, signal: null }];

      const ws = await runOnce(o, { ticketId: 'TKT-001' });

      expect(ws.lastError).toBe(`${flavor} exited with code 2`);
    }
  );

  // The AC's "meaningful rather than a bare path" case: a custom binary is
  // named by its CLI, not by the 40 characters of path the user already typed.
  it('names a custom absolute-path executor by its binary', async () => {
    const o = makeOrchestrator({
      config: { dashboard: { executor: '/opt/tools/node_modules/.bin/opencode' } },
    });
    o.exitQueue = [{ exitCode: 1, signal: null }];

    const ws = await runOnce(o, { ticketId: 'TKT-001' });

    expect(ws.lastError).toBe('opencode exited with code 1');
    expect(ws.lastError).not.toContain('/opt/tools');
    expect(ws.lastError).not.toMatch(/claude/);
  });

  // The branch immediately above the fix: a crash has its own message and must
  // not be rewritten into a bogus "exited with code null".
  it('leaves a spawn failure with its own message', async () => {
    const o = makeOrchestrator({ config: { dashboard: { executor: 'opencode' } } });
    o.exitQueue = [{ exitCode: null, signal: null, error: 'spawn opencode ENOENT' }];

    const ws = await runOnce(o, { ticketId: 'TKT-001' });

    expect(ws.lastError).toBe('spawn opencode ENOENT');
  });
});

// BOB-137. The flavor resolution rule, driven through the REAL orchestrator to
// a REAL spawn. Everything above fakes `_runExecutor` wholesale, which is
// exactly the seam that hid this bug: the argv and the binary are decided
// BELOW that fake.
describe('an absolute-path executor is driven with its own CLI (BOB-137)', () => {
  const OPENCODE_PATH = '/opt/tools/node_modules/.bin/opencode';

  /**
   * Like `makeOrchestrator`, but `_runExecutor` delegates to the REAL
   * `runAgent` with only `spawn` faked — so the recorded `[bin, args]` is what
   * the production path would really have executed.
   */
  function makeSpawnRecordingOrchestrator(config) {
    const o = makeOrchestrator({ config });
    o.spawned = []; // [[bin, args]]
    const fakeSpawn = (bin, args) => {
      o.spawned.push([bin, args]);
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      child.killed = false;
      child.exitCode = null;
      child.pid = 4242;
      setTimeout(() => {
        child.exitCode = 0;
        child.emit('exit', 0, null);
      }, 0);
      return child;
    };
    o._runExecutor = (opts) => runAgent({ ...opts, spawn: fakeSpawn });
    return o;
  }

  it('spawns the ABSOLUTE PATH, not the bare flavor bin (TC9)', async () => {
    const o = makeSpawnRecordingOrchestrator({ dashboard: { executor: OPENCODE_PATH } });

    await runOnce(o, { ticketId: 'TKT-001' });

    expect(o.spawned).toHaveLength(1);
    const [bin, args] = o.spawned[0];
    // `_launch` passes the resolved FLAVOR name, and `runAgent` would otherwise
    // re-derive the bin from the registry and spawn a bare `opencode` — which
    // is precisely the not-on-PATH binary the user was working around. Removing
    // `claudeBin: executor.bin` from `_launch` must turn this red.
    expect(bin).toBe(OPENCODE_PATH);
    expect(bin).not.toBe('opencode');
    // ...and it gets OPENCODE's argv, never claude's.
    expect(args[0]).toBe('run');
    expect(args).not.toContain('-p');
    expect(args).not.toContain('--permission-mode');
    expect(typeof args[args.length - 1]).toBe('string');
    expect(args[args.length - 1]).toContain('TKT-001');
  });

  it('a refusing config fails the run without stranding the workspace (TC10)', async () => {
    const o = makeSpawnRecordingOrchestrator({ dashboard: { executor: '/opt/bin/mystery' } });
    seedTicket(o, { id: 'TKT-001', stage: 'building' });
    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'build' });

    await expect(o.runAgent(ws.id)).rejects.toThrow(/dashboard\.executor/);
    await settle();

    // Resolution runs BEFORE anything is mutated. Left where it was — after
    // initSession, the running mark and the run_start broadcast — a throw here
    // wedges the workspace in `running` forever with no process, which is a
    // worse bug than the one being fixed.
    const stored = o.store.get(ws.id);
    expect(stored.status).not.toBe('running');
    expect(stored.pid).toBeFalsy();
    expect(stored.sessionId).toBeFalsy();
    expect(o.spawned).toHaveLength(0);
    expect(fs.readdirSync(o.sessionsDir)).toHaveLength(0);
  });
});
