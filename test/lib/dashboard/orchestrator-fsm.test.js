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
// its own prompt and runs that move. A real `bobby ticket move` writes to the
// MAIN checkout's board (resolveTicketsDir redirects there from inside any
// worktree), so the fake writes there too and never touches the worktree. If
// the prompt does not name the workflow's stage, the chain stalls here exactly
// as it does in production.
//
// TKT-051: this harness used to write the stage into the WORKTREE's ticket.md,
// which no real agent can do — so the whole approve → next-agent chain was
// green here and dead in production. Every fixture below now models the real
// shape: the ticket lives on the shared board, and the worktree holds no
// tickets at all (it forked from a branch the ticket was never on).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Orchestrator, DEFAULT_MAX_CONCURRENT } from '../../../lib/dashboard/orchestrator.js';
import { WorkspaceStore, newWorkspace } from '../../../lib/dashboard/state.js';
import { resolveWorkflow, nextStageForAgent } from '../../../lib/workflow.js';
import { STAGES } from '../../../lib/stages.js';
import { createTicket, findTicket, moveTicket, writeTicket } from '../../../lib/tickets.js';

let tmp;

/**
 * A workspace whose ticket lives on the SHARED board in the main checkout, and
 * whose worktree contains an empty `.bobby/tickets` — exactly what a worktree
 * forked from main looks like for a ticket created on a feature branch.
 */
function seedWorkspace(o, { id, ticketId, stage, pipeline }) {
  // Seed the counter so createTicket mints exactly the requested id.
  fs.writeFileSync(path.join(o.ticketsDir, '.counter'), String(Number(ticketId.split('-')[1]) - 1));
  createTicket(o.ticketsDir, { prefix: 'TKT', title: `Work for ${id}`, author: 'dev', area: '' });
  moveTicket(o.ticketsDir, ticketId, stage, 'test');

  const worktreePath = path.join(tmp, 'wt', id);
  fs.mkdirSync(worktreeTicketsDir(worktreePath), { recursive: true });

  const ws = newWorkspace({ id, ticketId, worktreePath, branch: `bobby/${id}`, agent: null, pipeline });
  ws.stage = stage;
  o.store.create(ws);
  return ws;
}

function worktreeTicketsDir(worktreePath) {
  return path.join(worktreePath, '.bobby', 'tickets');
}

/** Read the stage off the shared board — the only copy anything may trust. */
function readBoardStage(o, ticketId) {
  return findTicket(o.ticketsDir, ticketId).data.stage;
}

/**
 * Plant a stale copy of a ticket inside a worktree, at a stage the board does
 * not have. Production code that reads the worktree fails loudly against this.
 */
function plantStaleWorktreeCopy(o, worktreePath, ticketId, stage) {
  const dir = worktreeTicketsDir(worktreePath);
  const found = findTicket(o.ticketsDir, ticketId);
  const dest = path.join(dir, found.dirname);
  fs.mkdirSync(dest, { recursive: true });
  writeTicket(dest, { ...found.data, stage }, found.content);
}

/**
 * Pull the ticket-file path a prompt tells the agent to read, then resolve it
 * the way the agent would: from ITS cwd, expanding the `TKT-001*` glob segment.
 * Returns the real file path, or null if nothing matches from there.
 *
 * Deliberately not a string comparison — the question is whether the agent can
 * open the file, and only the filesystem answers that (TKT-052).
 */
function resolveTicketPathFromPrompt(prompt, ticketId, cwd) {
  // PRO-029: known-id prompts now name the EXACT resolved folder (no glob), so
  // open it directly; the legacy `TKT-001*` glob form is still expanded for
  // backward compatibility with builders that fall back to it.
  const m = new RegExp('`([^`]*' + ticketId + '[^`]*/ticket\\.md)`').exec(prompt);
  if (!m) return null;
  const abs = path.resolve(cwd, m[1]);              // resolved <parent>/TKT-001--slug/ticket.md, or glob
  if (m[1].includes('*')) {
    const parent = path.dirname(path.dirname(abs));
    if (!fs.existsSync(parent)) return null;
    const hit = fs.readdirSync(parent).find(e => e.startsWith(ticketId));
    if (!hit) return null;
    const file = path.join(parent, hit, 'ticket.md');
    return fs.existsSync(file) ? file : null;
  }
  return fs.existsSync(abs) ? abs : null;
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
    const record = { agent, prompt, movedTo, worktreePath };
    o.launched.push(record);

    const ticketId = /on ticket (\S+)\./.exec(prompt)?.[1];
    const finish = () => {
      // A real agent obeys its prompt by running `bobby ticket move`, which
      // lands on the MAIN checkout's board no matter which worktree it is
      // invoked from. The worktree copy is never written — nothing an agent
      // can do reaches it. If the prompt names no stage, the agent falls back
      // to whatever its agent file says — the bug TKT-048 was about — so the
      // fake simply leaves the ticket where it is.
      if (movedTo) moveTicket(o.ticketsDir, ticketId, movedTo, `bobby-${agent}`);
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
    seedWorkspace(o, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });

    const ran = await driveToEnd(o, 'ws1', 'plan');

    expect(ran).toEqual(['plan', 'build', 'review', 'test']);
    expect(o.store.get('ws1').status).toBe('ready_to_merge');
  });

  it('approving after each agent queues the next one, never the one after it', async () => {
    const o = makeOrchestrator();
    const ws = seedWorkspace(o, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });

    // after plan → build (not review)
    await o.runAgent('ws1', { agentOverride: 'plan' });
    await settle(o);
    expect(readBoardStage(o, 'TKT-001')).toBe('building');
    expect(findTicket(worktreeTicketsDir(ws.worktreePath), 'TKT-001')).toBeNull();
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
    seedWorkspace(o, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });

    await driveToEnd(o, 'ws1', 'plan');

    expect(o.launched.map(r => r.movedTo))
      .toEqual(['building', 'reviewing', 'testing', 'shipping']);
  });
});

// Tickets are SHARED state living in the main checkout; a worktree isolates
// CODE only. Everything below states that from the orchestrator's side — the
// symptom (a run that would not start) and the root cause (a stage change no
// agent could ever make visible).
describe('tickets are shared state, worktrees isolate code only (TKT-051)', () => {
  it('starts a run for a ticket that is on the board but not in the worktree', async () => {
    // 'manual' keeps the agent in flight, so `running` is the status of a run
    // that genuinely started rather than one that already finished.
    const o = makeOrchestrator({ behaviour: 'manual' });
    const ws = seedWorkspace(o, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });

    // The exact shape that failed: worktrees fork from main, so a ticket created
    // on a feature branch is simply not in the worktree.
    expect(findTicket(worktreeTicketsDir(ws.worktreePath), 'TKT-001')).toBeNull();

    await expect(o.runAgent('ws1', { agentOverride: 'plan' })).resolves.toBeDefined();
    expect(o.launched[0].prompt).toContain('TKT-001');
    expect(o.store.get('ws1').status).toBe('running');
  });

  it('detects a stage change written the way `bobby ticket move` writes it, and approving queues the next agent', async () => {
    const o = makeOrchestrator();
    seedWorkspace(o, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });

    await o.runAgent('ws1', { agentOverride: 'plan' });
    await settle(o);

    // The move went to the shared board — and that is where advancement is read.
    expect(readBoardStage(o, 'TKT-001')).toBe('building');
    expect(o.store.get('ws1').stage).toBe('building');
    expect(o.store.get('ws1').status).toBe('awaiting_approval');

    await o.approve('ws1');
    expect(o.launched.map(r => r.agent)).toEqual(['plan', 'build']);
  });

  it('a stale ticket copy left inside the worktree is ignored', async () => {
    const o = makeOrchestrator();
    const ws = seedWorkspace(o, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });
    // A worktree forked when the ticket was already at `done` would otherwise
    // send the run straight to ready_to_merge without an agent doing anything.
    plantStaleWorktreeCopy(o, ws.worktreePath, 'TKT-001', 'done');

    await o.runAgent('ws1', { agentOverride: 'plan' });
    await settle(o);

    expect(o.store.get('ws1').stage).toBe('building');
    expect(o.store.get('ws1').status).toBe('awaiting_approval');
  });

  it('drives plan → build → review → test with an executor that only ever touches the shared board', async () => {
    const o = makeOrchestrator();
    const ws = seedWorkspace(o, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });

    const ran = await driveToEnd(o, 'ws1', 'plan');

    expect(ran).toEqual(['plan', 'build', 'review', 'test']);
    expect(readBoardStage(o, 'TKT-001')).toBe('shipping');
    expect(o.store.get('ws1').status).toBe('ready_to_merge');
    // The worktree's board stayed empty for the whole run. If this ever needs
    // seeding to make the chain advance, the production code is reading the
    // wrong copy again.
    expect(fs.readdirSync(worktreeTicketsDir(ws.worktreePath))).toEqual([]);
    expect(o.launched.every(r => r.worktreePath === ws.worktreePath)).toBe(true);
  });

  // TKT-052: starting the run was only half of it. The prompt still handed the
  // agent a relative `.bobby/tickets/...`, which resolves against the agent's
  // cwd — its worktree — where an unmerged ticket does not exist.
  it('the prompt names a ticket path the agent can actually open from its worktree', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    const ws = seedWorkspace(o, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });

    // Precondition: the worktree genuinely has no copy of this ticket.
    expect(findTicket(worktreeTicketsDir(ws.worktreePath), 'TKT-001')).toBeNull();

    await o.runAgent('ws1', { agentOverride: 'plan' });

    const file = resolveTicketPathFromPrompt(o.launched[0].prompt, 'TKT-001', ws.worktreePath);
    expect(file).not.toBeNull();
    expect(fs.readFileSync(file, 'utf8')).toContain('TKT-001');
  });

  it('the prompt path is the same board the orchestrator reads and an agent writes', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    const ws = seedWorkspace(o, { id: 'ws1', ticketId: 'TKT-002', stage: 'building', pipeline: 'default' });

    await o.runAgent('ws1', { agentOverride: 'build' });

    // Not just "some readable file" — the agent's plan.md/progress.md writes
    // have to land in the folder the orchestrator reads the stage back from.
    const file = resolveTicketPathFromPrompt(o.launched[0].prompt, 'TKT-002', ws.worktreePath);
    expect(path.dirname(file)).toBe(path.join(o.ticketsDir, findTicket(o.ticketsDir, 'TKT-002').dirname));
  });

  it('a genuinely missing ticket names branch topology, not just "not found"', async () => {
    const o = makeOrchestrator();
    seedWorkspace(o, { id: 'ws1', ticketId: 'TKT-001', stage: 'planning', pipeline: 'default' });
    o.store.update('ws1', { ticketId: 'TKT-404' });

    await expect(o.runAgent('ws1', { agentOverride: 'plan' }))
      .rejects.toThrow(/TKT-404 not found[\s\S]*branch/i);
    await expect(async () => o.createWorkspace({ ticketId: 'TKT-404' }))
      .rejects.toThrow(/TKT-404 not found[\s\S]*branch/i);
  });
});

describe('non-default workflows run to the end (TKT-048)', () => {
  it('a quick ticket runs plan → build → test and does NOT stop after build', async () => {
    const o = makeOrchestrator({ pipelineName: 'default' });
    seedWorkspace(o, { id: 'wsq', ticketId: 'TKT-001', stage: 'planning', pipeline: 'quick' });

    const ran = await driveToEnd(o, 'wsq', 'plan');

    expect(ran).toEqual(['plan', 'build', 'test']);
    expect(ran).not.toContain('review');
  });

  it('a quick build is told to move to testing, not the reviewing stage quick lacks', async () => {
    const o = makeOrchestrator();
    seedWorkspace(o, { id: 'wsq', ticketId: 'TKT-001', stage: 'building', pipeline: 'quick' });

    await o.runAgent('wsq', { agentOverride: 'build' });
    await settle(o);

    const build = o.launched.find(r => r.agent === 'build');
    expect(build.movedTo).toBe('testing');
    expect(build.prompt).toContain('bobby ticket move TKT-001 testing');
    expect(build.prompt).not.toContain('bobby ticket move TKT-001 reviewing');
  });

  it('a secure ticket runs plan → build → security → review → test end to end', async () => {
    const o = makeOrchestrator();
    seedWorkspace(o, { id: 'wss', ticketId: 'TKT-001', stage: 'planning', pipeline: 'secure' });

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
    seedWorkspace(o, { id: 'wss', ticketId: 'TKT-001', stage: 'security', pipeline: 'secure' });

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
    seedWorkspace(o, { id: 'wsa', ticketId: 'TKT-001', stage: 'planning', pipeline: 'secure' });

    await o.runAgent('wsa', { agentOverride: 'plan' });
    await settleUntilQuiet(o);

    expect(o.launched.map(r => r.agent)).toEqual(['plan', 'build', 'security', 'review', 'test']);
    expect(o.store.get('wsa').status).toBe('ready_to_merge');
  });

  it('a custom workflow from .bobbyrc.yml runs its extra stage', async () => {
    const o = makeOrchestrator({
      config: { workflows: { thorough: ['plan', 'build', 'security', 'test'] } },
    });
    seedWorkspace(o, { id: 'wst', ticketId: 'TKT-001', stage: 'planning', pipeline: 'thorough' });

    const ran = await driveToEnd(o, 'wst', 'plan');

    expect(ran).toEqual(['plan', 'build', 'security', 'test']);
  });
});

describe('dashboard.max_concurrent caps agents in flight (TKT-015)', () => {
  const seedRunning = (o, n) => {
    for (let i = 1; i <= n; i += 1) {
      const id = `ws${i}`;
      seedWorkspace(o, { id, ticketId: `TKT-00${i}`, stage: 'building', pipeline: 'default' });
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
  // This case lands within a few milliseconds of Jest's 5s default on every
  // Node version we test (~5.05s locally on both 18 and 22), so which CI leg
  // fails is a coin flip rather than a real difference. The assertion itself is
  // instant; the time goes on the HTTP round trip and teardown. Give it an
  // explicit budget so the result is deterministic instead of marginal.
  }, 20000);
});
