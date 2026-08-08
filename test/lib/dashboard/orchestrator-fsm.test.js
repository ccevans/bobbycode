// test/lib/dashboard/orchestrator-fsm.test.js
//
// Drives the REAL orchestrator state machine — runAgent → _onExit → approve →
// runAgent → … — with a fake agent CLI, and asserts the chain of agents a
// ticket actually runs through.
//
// Testing the FSM rather than _resolveNextAgent in isolation is the point.
// The previous suite called the helper directly and so agreed with an
// off-by-one that skipped an agent at every step (TKT-047), and it could not
// have seen the agent files hardcoding their exit stage at all (TKT-048).
//
// The fake agent is what makes the second one visible: it does what a real
// subagent does — reads the stage out of `bobby ticket move <id> <stage>` in
// its own prompt and writes that stage into the worktree's ticket.md. So if
// the prompt does not name the workflow's stage, the chain stalls here exactly
// as it does in production.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Orchestrator, DEFAULT_MAX_CONCURRENT } from '../../../lib/dashboard/orchestrator.js';
import { WorkspaceStore, newWorkspace } from '../../../lib/dashboard/state.js';
import { resolveWorkflow, nextStageForAgent } from '../../../lib/workflow.js';
import { STAGES } from '../../../lib/stages.js';
import { createTicket, findTicket, writeTicket } from '../../../lib/tickets.js';

let tmp;

/** A workspace whose "worktree" is a plain directory holding a ticket board. */
function seedWorkspace(store, { id, ticketId, stage, pipeline }) {
  const worktreePath = path.join(tmp, 'wt', id);
  const wtTickets = path.join(worktreePath, '.bobby', 'tickets');
  fs.mkdirSync(wtTickets, { recursive: true });
  // Seed the counter so createTicket mints exactly the requested id — each
  // workspace has its own board, so they would all start at TKT-001 otherwise.
  fs.writeFileSync(path.join(wtTickets, '.counter'), String(Number(ticketId.split('-')[1]) - 1));
  createTicket(wtTickets, { prefix: 'TKT', title: `Work for ${id}`, author: 'dev', area: '' });
  setWorktreeStage(worktreePath, ticketId, stage);

  const ws = newWorkspace({ id, ticketId, worktreePath, branch: `bobby/${id}`, agent: null, pipeline });
  ws.stage = stage;
  store.create(ws);
  return ws;
}

function worktreeTicketsDir(worktreePath) {
  return path.join(worktreePath, '.bobby', 'tickets');
}

function setWorktreeStage(worktreePath, ticketId, stage) {
  const dir = worktreeTicketsDir(worktreePath);
  const found = findTicket(dir, ticketId);
  writeTicket(found.path, { ...found.data, stage }, found.content);
}

function readWorktreeStage(worktreePath, ticketId) {
  return findTicket(worktreeTicketsDir(worktreePath), ticketId).data.stage;
}

/**
 * An orchestrator wired to real files but a fake executor. `behaviour` decides
 * what the fake agent does on each run; the default obeys the prompt.
 */
function makeOrchestrator({ config = {}, pipelineName = 'default', behaviour } = {}) {
  const store = new WorkspaceStore(path.join(tmp, 'workspaces.json'));
  const ticketsDir = path.join(tmp, 'main', '.bobby', 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });
  const sessionsDir = path.join(tmp, 'main', '.bobby', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  const o = new Orchestrator({
    repoRoot: path.join(tmp, 'main'),
    config,
    ticketsDir,
    sessionsDir,
    agentsPath: '.claude/agents',
    store,
    sseHub: null,
    pipeline: resolveWorkflow(config, pipelineName),
    pipelineName,
  });

  o.launched = [];       // [{ agent, prompt, movedTo }]
  o.pendingExits = [];   // resolvers, when behaviour is 'manual'

  o._runExecutor = ({ prompt, worktreePath }) => {
    // Which agent this is, and where its prompt tells it to leave the ticket.
    const agent = /Run the bobby-(\S+) agent/.exec(prompt)?.[1] || 'unknown';
    const movedTo = /bobby ticket move \S+ ([a-z-]+)/.exec(prompt)?.[1] || null;
    const record = { agent, prompt, movedTo };
    o.launched.push(record);

    const ticketId = /on ticket (\S+)\./.exec(prompt)?.[1];
    const finish = () => {
      // A real agent obeys its prompt. If the prompt names no stage, it falls
      // back to whatever its agent file says — which is the bug under test, so
      // the fake simply leaves the ticket where it is.
      if (movedTo) setWorktreeStage(worktreePath, ticketId, movedTo);
      return { exitCode: 0, signal: null };
    };

    if (behaviour === 'manual') {
      let release;
      const done = new Promise((resolve) => { release = () => resolve(finish()); });
      o.pendingExits.push(release);
      return { pid: 1234, stop: () => release(), done };
    }
    return { pid: 1234, stop: () => {}, done: Promise.resolve(finish()) };
  };

  return o;
}

/**
 * Run the workspace to completion the way the app does: run the queued agent,
 * then approve, then approve again… Returns the ordered agent keys that ran.
 */
async function driveToEnd(o, wsId, firstAgent, maxSteps = 10) {
  await o.runAgent(wsId, { agentOverride: firstAgent });
  await settle(o);

  for (let i = 0; i < maxSteps; i += 1) {
    const ws = o.store.get(wsId);
    if (ws.status === 'ready_to_merge' || ws.status === 'failed') break;
    const before = o.launched.length;
    await o.approve(wsId);
    await settle(o);
    // approve() that launched nothing has parked the workspace; stop looping.
    if (o.launched.length === before) break;
  }
  return o.launched.map(r => r.agent);
}

/** Let the queued _onExit handler (attached via .then) run. */
async function settle(o) {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
  return o;
}

/**
 * Settle repeatedly until a round launches nothing new — how a run that
 * auto-approves itself reaches its end without anyone calling approve().
 * `maxRounds` is the loop guard: a stage that hands off to itself never goes
 * quiet, so the cap turns a hang into a failed assertion on `o.launched`.
 */
async function settleUntilQuiet(o, maxRounds = 50) {
  let last = -1;
  for (let i = 0; i < maxRounds && o.launched.length !== last; i += 1) {
    last = o.launched.length;
    await settle(o);
  }
  return o;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-fsm-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the FSM drives the default workflow one stage at a time (TKT-047)', () => {
  it('runs plan → build → review → test, then has nothing left', async () => {
    const o = makeOrchestrator();
    seedWorkspace(o.store, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });

    const ran = await driveToEnd(o, 'ws1', 'plan');

    expect(ran).toEqual(['plan', 'build', 'review', 'test']);
    expect(o.store.get('ws1').status).toBe('ready_to_merge');
  });

  it('approving after each agent queues the next one, never the one after it', async () => {
    const o = makeOrchestrator();
    const ws = seedWorkspace(o.store, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });

    // after plan → build (not review)
    await o.runAgent('ws1', { agentOverride: 'plan' });
    await settle(o);
    expect(readWorktreeStage(ws.worktreePath, 'TKT-001')).toBe('building');
    expect(o.store.get('ws1').status).toBe('awaiting_approval');
    expect(o._resolveNextAgent(o.store.get('ws1'))).toBe('build');

    // after build → review (not test)
    await o.approve('ws1');
    await settle(o);
    expect(o._resolveNextAgent(o.store.get('ws1'))).toBe('review');

    // after review → test (not null — the run is NOT ready to merge yet)
    await o.approve('ws1');
    await settle(o);
    expect(o._resolveNextAgent(o.store.get('ws1'))).toBe('test');
    expect(o.store.get('ws1').status).not.toBe('ready_to_merge');

    // after test → nothing left
    await o.approve('ws1');
    await settle(o);
    expect(o._resolveNextAgent(o.store.get('ws1'))).toBeNull();
  });

  it('the CLI-facing agent chain for default is unchanged: the same four stages', async () => {
    const o = makeOrchestrator();
    seedWorkspace(o.store, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });

    await driveToEnd(o, 'ws1', 'plan');

    expect(o.launched.map(r => r.movedTo))
      .toEqual(['building', 'reviewing', 'testing', 'shipping']);
  });
});

describe('non-default workflows run to the end (TKT-048)', () => {
  it('a quick ticket runs plan → build → test and does NOT stop after build', async () => {
    const o = makeOrchestrator({ pipelineName: 'default' });
    seedWorkspace(o.store, { id: 'wsq', ticketId: 'TKT-001', stage: 'planning', pipeline: 'quick' });

    const ran = await driveToEnd(o, 'wsq', 'plan');

    expect(ran).toEqual(['plan', 'build', 'test']);
    expect(ran).not.toContain('review');
  });

  it('a quick build is told to move to testing, not the reviewing stage quick lacks', async () => {
    const o = makeOrchestrator();
    seedWorkspace(o.store, { id: 'wsq', ticketId: 'TKT-001', stage: 'building', pipeline: 'quick' });

    await o.runAgent('wsq', { agentOverride: 'build' });
    await settle(o);

    const build = o.launched.find(r => r.agent === 'build');
    expect(build.movedTo).toBe('testing');
    expect(build.prompt).toContain('bobby ticket move TKT-001 testing');
    expect(build.prompt).not.toContain('bobby ticket move TKT-001 reviewing');
  });

  it('a secure ticket runs plan → build → security → review → test end to end', async () => {
    const o = makeOrchestrator();
    seedWorkspace(o.store, { id: 'wss', ticketId: 'TKT-001', stage: 'planning', pipeline: 'secure' });

    const ran = await driveToEnd(o, 'wss', 'plan');

    expect(ran).toEqual(['plan', 'build', 'security', 'review', 'test']);
    expect(o.store.get('wss').status).toBe('ready_to_merge');
    expect(o.launched.map(r => r.movedTo))
      .toEqual(['building', 'security', 'reviewing', 'testing', 'shipping']);
  });

  // Was a pinned KNOWN LIMITATION (TKT-049). STAGE_MAP used to send both
  // `security` and `review` to the `reviewing` stage, so `secure` had two steps
  // sharing one stage. A stage-keyed FSM cannot tell those apart — the lookup
  // finds the first — so a secure run reached security and could never leave:
  // security's own handoff stage computed to `reviewing`, the stage it already
  // occupied. `security` now has a stage of its own in lib/stages.js, and this
  // test asserts the fix from the other side.
  it('security and review each own their stage, and security hands off to review', async () => {
    const o = makeOrchestrator();
    seedWorkspace(o.store, { id: 'wss', ticketId: 'TKT-001', stage: 'security', pipeline: 'secure' });

    const secure = resolveWorkflow({}, 'secure');
    expect(secure.filter(s => s.stage === 'reviewing').map(s => s.agent)).toEqual(['bobby-review']);
    expect(secure.filter(s => s.stage === 'security').map(s => s.agent)).toEqual(['bobby-security']);

    // The security stage resolves to security, whose handoff is the NEXT stage
    // — never itself. That is what makes bobby-review reachable.
    expect(o._resolveNextAgent(o.store.get('wss'))).toBe('security');
    expect(nextStageForAgent('bobby-security', secure)).toBe('reviewing');
    expect(nextStageForAgent('bobby-security', secure)).not.toBe('security');

    // And the reviewing stage now resolves to review, not to security.
    o.store.update('wss', { stage: 'reviewing' });
    expect(o._resolveNextAgent(o.store.get('wss'))).toBe('review');
  });

  // THE SHARP EDGE this ticket existed for. With `dashboard.auto_approve_stages`
  // set, nothing waits for a human between stages, so a stage that hands off to
  // itself re-launches the same agent forever and spends real tokens. The
  // concurrency cap does not bound it — the loop is sequential, one agent at a
  // time. Bounded here by settle rounds so the loop shape fails as a readable
  // diff (['plan','build','security','security',…]) instead of hanging the suite.
  it('auto-approving every stage drives secure to the end instead of looping (TKT-049)', async () => {
    const o = makeOrchestrator({ config: { dashboard: { auto_approve_stages: STAGES } } });
    seedWorkspace(o.store, { id: 'wsa', ticketId: 'TKT-001', stage: 'planning', pipeline: 'secure' });

    await o.runAgent('wsa', { agentOverride: 'plan' });
    await settleUntilQuiet(o);

    expect(o.launched.map(r => r.agent)).toEqual(['plan', 'build', 'security', 'review', 'test']);
    expect(o.store.get('wsa').status).toBe('ready_to_merge');
  });

  it('a custom workflow from .bobbyrc.yml runs its extra stage', async () => {
    const o = makeOrchestrator({
      config: { workflows: { thorough: ['plan', 'build', 'security', 'test'] } },
    });
    seedWorkspace(o.store, { id: 'wst', ticketId: 'TKT-001', stage: 'planning', pipeline: 'thorough' });

    const ran = await driveToEnd(o, 'wst', 'plan');

    expect(ran).toEqual(['plan', 'build', 'security', 'test']);
  });
});

describe('dashboard.max_concurrent caps agents in flight (TKT-015)', () => {
  const seedRunning = (o, n) => {
    for (let i = 1; i <= n; i += 1) {
      const id = `ws${i}`;
      seedWorkspace(o.store, { id, ticketId: `TKT-00${i}`, stage: 'building', pipeline: 'default' });
    }
  };

  const startAll = async (o, ids, agent = 'build') => {
    for (const id of ids) await o.runAgent(id, { agentOverride: agent });
  };

  it('defaults to 4 when nothing is configured', () => {
    const o = makeOrchestrator();
    expect(o._maxConcurrent()).toBe(DEFAULT_MAX_CONCURRENT);
    expect(o._maxConcurrent()).toBe(4);
  });

  it('refuses the 5th run and names what is already running', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    seedRunning(o, 5);
    await startAll(o, ['ws1', 'ws2', 'ws3', 'ws4']);

    await expect(o.runAgent('ws5', { agentOverride: 'build' }))
      .rejects.toThrow(/4 agents are already running/);

    // The message has to be usable on its own: what is running, and the way out.
    const err = await o.runAgent('ws5', { agentOverride: 'build' }).catch(e => e);
    expect(err.message).toContain('TKT-001 build');
    expect(err.message).toContain('TKT-004 build');
    expect(err.message).toContain('Stop one, or raise dashboard.max_concurrent');

    // Refused, not queued: nothing was launched for ws5, and it is still idle.
    expect(o.launched).toHaveLength(4);
    expect(o.store.get('ws5').status).toBe('idle');
  });

  it('allows the run again once one of the four finishes', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    seedRunning(o, 5);
    await startAll(o, ['ws1', 'ws2', 'ws3', 'ws4']);

    await expect(o.runAgent('ws5', { agentOverride: 'build' })).rejects.toThrow(/already running/);

    o.pendingExits.shift()();      // ws1's agent exits
    await settle(o);

    await expect(o.runAgent('ws5', { agentOverride: 'build' })).resolves.toBeDefined();
    expect(o.launched).toHaveLength(5);
    expect(o.store.get('ws5').status).toBe('running');
  });

  it('honours a configured cap', async () => {
    const o = makeOrchestrator({ config: { dashboard: { max_concurrent: 1 } }, behaviour: 'manual' });
    seedRunning(o, 2);
    await startAll(o, ['ws1']);

    await expect(o.runAgent('ws2', { agentOverride: 'build' }))
      .rejects.toThrow(/1 agent is already running: TKT-001 build\./);
  });

  it('falls back to the default for a nonsense cap rather than blocking every run', () => {
    for (const max_concurrent of [0, -3, 'lots', null]) {
      const o = makeOrchestrator({ config: { dashboard: { max_concurrent } } });
      expect(o._maxConcurrent()).toBe(DEFAULT_MAX_CONCURRENT);
    }
  });

  it('surfaces the refusal as a 400 through POST /api/workspaces/:id/run', async () => {
    const { buildServer } = await import('../../../lib/dashboard/server.js');
    const o = makeOrchestrator({ config: { dashboard: { max_concurrent: 1 } }, behaviour: 'manual' });
    seedRunning(o, 2);
    await startAll(o, ['ws1']);

    const server = buildServer({
      orchestrator: o,
      store: { list: () => [], get: (id) => o.store.get(id), subscribe: () => {} },
      sseHub: { connect: () => () => {}, broadcast: () => {} },
      config: { ticket_prefix: 'TKT' },
      repoRoot: path.join(tmp, 'main'),
      ticketsDir: path.join(tmp, 'main', '.bobby', 'tickets'),
      sprintsDir: path.join(tmp, 'main', '.bobby', 'sprints'),
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/workspaces/ws2/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'build' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/already running: TKT-001 build/);
    } finally {
      await new Promise(r => server.close(r));
    }
  });
});
