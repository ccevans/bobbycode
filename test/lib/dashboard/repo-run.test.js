// test/lib/dashboard/repo-run.test.js
//
// Repo runs (TKT-014): a freeform agent against the MAIN CHECKOUT, with no
// worktree, and the lock that stops one colliding with a merge.
//
// Everything here drives the REAL Orchestrator against a REAL git repo. Only
// two things are faked, and both for the same reason the FSM suite fakes them:
// `_runExecutor`, so no `claude` is ever spawned, and — in one test —
// `_mergeToMain`, so the test can stand inside the window during which the
// merge holds the lock. The lock itself, the git repo, the worktrees and the
// store are all real. Poking the lock helpers directly would prove nothing:
// TKT-047 hid for exactly as long as its tests called the helper instead of
// the machine that used it.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { WorkspaceStore, isRepoRun } from '../../../lib/dashboard/state.js';
import { resolveWorkflow } from '../../../lib/workflow.js';
import { REPO_AGENTS, AGENT_REGISTRY, runsWithoutTicket } from '../../../lib/agent-registry.js';
import { resolveWorktreeRoot } from '../../../lib/dashboard/worktree.js';
import { STALE_AFTER_MS, readLock } from '../../../lib/dashboard/main-checkout-lock.js';
import { createTicket, moveTicket } from '../../../lib/tickets.js';

let tmp;
let repoRoot;

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
 * A real orchestrator on a real repo, with a fake agent CLI.
 *
 * `behaviour: 'manual'` keeps each launched agent in flight until the test
 * releases it — which is how "while a repo run is running" becomes a state a
 * test can actually be in, rather than a comment.
 */
function makeOrchestrator({ config = {}, behaviour, exit } = {}) {
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

  o.launched = [];      // [{ prompt, worktreePath }]
  o.pendingExits = [];  // release fns, when behaviour is 'manual'

  o._runExecutor = ({ prompt, worktreePath }) => {
    o.launched.push({ prompt, worktreePath });
    const finish = () => ({ exitCode: 0, signal: null, ...exit });
    if (behaviour === 'manual') {
      let release;
      const done = new Promise((resolve) => { release = () => resolve(finish()); });
      o.pendingExits.push(release);
      return { pid: 4321, stop: () => release(), done };
    }
    return { pid: 4321, stop: () => {}, done: Promise.resolve(finish()) };
  };

  return o;
}

/** Seed a ticket on the shared board so a worktree run has something to run on. */
function seedTicket(o, { id, stage }) {
  fs.writeFileSync(path.join(o.ticketsDir, '.counter'), String(Number(id.split('-')[1]) - 1));
  createTicket(o.ticketsDir, { prefix: 'TKT', title: `Work for ${id}`, author: 'dev', area: '' });
  moveTicket(o.ticketsDir, id, stage, 'test');
  return id;
}

/** Let the queued _onExit handler (attached via .then) run. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
}

const lockFileOf = (o) => o.lockFile;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-repo-run-'));
  repoRoot = initRepo(path.join(tmp, 'main'));
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe('a repo run works in the main checkout and creates no worktree', () => {
  it('runs a freeform agent with the main checkout as its cwd', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });

    const run = o.createRepoRun({ agent: 'ux' });
    expect(isRepoRun(run)).toBe(true);
    expect(run.worktreePath).toBeNull();
    expect(run.branch).toBeNull();
    expect(run.ticketId).toBeNull();

    await o.runAgent(run.id);

    expect(o.store.get(run.id).status).toBe('running');
    expect(o.launched).toHaveLength(1);
    expect(o.launched[0].worktreePath).toBe(repoRoot);
    expect(o.launched[0].prompt).toContain('bobby-ux');
  });

  it('creates no worktree — the directory and the git registration both stay absent', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });

    const run = o.createRepoRun({ agent: 'arch' });
    await o.runAgent(run.id);

    // Nothing under the worktree root, and git still knows about one worktree.
    expect(fs.existsSync(resolveWorktreeRoot(repoRoot, {}))).toBe(false);
    expect(git(repoRoot, 'worktree list').split('\n')).toHaveLength(1);
    expect(git(repoRoot, 'branch --list').split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('streams events and lands back on idle, with the run recorded', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    const events = [];
    o.sseHub = { broadcast: (channel, payload) => { if (channel === 'global') events.push(payload.event); } };

    const run = o.createRepoRun({ agent: 'docs' });
    await o.runAgent(run.id);
    o.pendingExits.shift()();
    await settle();

    const after = o.store.get(run.id);
    expect(after.status).toBe('idle');
    expect(after.pid).toBeNull();
    expect(after.runs).toHaveLength(1);
    expect(after.runs[0]).toMatchObject({ agent: 'docs', exitCode: 0 });
    expect(after.sessionId).toBeTruthy();
    expect(events).toEqual(expect.arrayContaining(['run_start', 'run_end']));
  });

  it('makes no checkpoint commit — the user\'s working tree is left exactly as the agent left it', async () => {
    const o = makeOrchestrator();
    // In-progress work the user has not committed, of the kind `git add -A`
    // would sweep into a commit on whatever branch main happens to be on.
    fs.writeFileSync(path.join(repoRoot, 'wip.txt'), 'half a thought\n');
    const headBefore = git(repoRoot, 'rev-parse HEAD');

    const run = o.createRepoRun({ agent: 'ux' });
    await o.runAgent(run.id);
    await settle();

    expect(git(repoRoot, 'rev-parse HEAD')).toBe(headBefore);
    expect(git(repoRoot, 'status --porcelain')).toContain('wip.txt');
    expect(o.store.get(run.id).checkpoints).toEqual([]);
  });

  it('refuses an agent that needs a ticket, and names the ones that do not', () => {
    const o = makeOrchestrator();
    expect(() => o.createRepoRun({ agent: 'security' })).toThrow(/works on a ticket/);
    expect(() => o.createRepoRun({ agent: 'build' })).toThrow(/works on a ticket/);
    expect(() => o.createRepoRun({ agent: 'security' })).toThrow(/ux/);
    expect(() => o.createRepoRun({ agent: 'nonsense' })).toThrow(/Unknown agent 'nonsense'/);
  });

  // runAgent takes an agentOverride, so the check at creation is not the last
  // word — re-running a repo run as `build` would otherwise reach the batch
  // branch of buildPromptFor and fail talking about tickets in a stage.
  it('refuses a ticket agent supplied as an override on an existing repo run', async () => {
    const o = makeOrchestrator();
    const run = o.createRepoRun({ agent: 'ux' });

    await expect(o.runAgent(run.id, { agentOverride: 'build' })).rejects.toThrow(/works on a ticket/);
    await expect(o.runAgent(run.id, { agentOverride: 'nope' })).rejects.toThrow(/Unknown agent 'nope'/);

    // Refused before the lock was taken, and nothing was spawned.
    expect(fs.existsSync(lockFileOf(o))).toBe(false);
    expect(o.launched).toHaveLength(0);

    // A repo-runnable override is fine.
    await expect(o.runAgent(run.id, { agentOverride: 'pm' })).resolves.toBeDefined();
  });
});

describe('a repo run and a merge cannot overlap (the main-checkout lock)', () => {
  /** A workspace with a real worktree, a real branch and a real commit to merge. */
  async function workspaceReadyToMerge(o, ticketId = 'TKT-001') {
    seedTicket(o, { id: ticketId, stage: 'building' });
    const ws = o.createWorkspace({ ticketId, agent: 'build' });
    fs.writeFileSync(path.join(ws.worktreePath, 'feature.txt'), 'done\n');
    git(ws.worktreePath, 'add -A');
    git(ws.worktreePath, 'commit -q -m "feature"');
    return o.store.get(ws.id);
  }

  it('refuses the merge while a repo run holds the checkout, naming the holder', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    const ws = await workspaceReadyToMerge(o);

    const run = o.createRepoRun({ agent: 'ux' });
    await o.runAgent(run.id);

    await expect(o.merge(ws.id)).rejects.toThrow(/The main checkout is in use by bobby-ux \(repo run repo-ux-/);
    // Usable on its own: who holds it, and the way out.
    const err = await o.merge(ws.id).catch(e => e);
    expect(err.message).toMatch(/pid \d+/);
    expect(err.message).toContain('Wait for it to finish, or stop it.');

    // Refused, not queued — main is untouched and the branch is unmerged.
    expect(git(repoRoot, 'branch --show-current')).toBe('main');
    expect(fs.existsSync(path.join(repoRoot, 'feature.txt'))).toBe(false);
  });

  it('refuses a repo run while a merge holds the checkout, naming the holder', async () => {
    const o = makeOrchestrator();
    const ws = await workspaceReadyToMerge(o);

    // Stand inside the merge's lock window and try to start a repo run there.
    // This is the race the ticket exists for: the merge stashes and swaps
    // branches in the very directory the agent would be editing.
    let refusal = null;
    const attempts = [];
    const realMerge = o._mergeToMain.bind(o);
    o._mergeToMain = (branch, opts) => {
      const run = o.createRepoRun({ agent: 'ux' });
      // runAgent is async, so a refusal arrives as a rejection — but the lock is
      // taken before the first await, so whether it is refused is already
      // decided by the time this line returns.
      attempts.push(o.runAgent(run.id).catch((e) => { refusal = e.message; }));
      return realMerge(branch, opts);
    };

    await o.merge(ws.id);
    await Promise.all(attempts);

    expect(refusal).toMatch(/The main checkout is in use by merge of bobby\/tkt-001-build/);
    expect(refusal).toContain('Wait for it to finish, or stop it.');
    expect(o.launched).toHaveLength(0);
    // The merge itself still went through.
    expect(o.store.get(ws.id).status).toBe('merged');
    expect(fs.existsSync(path.join(repoRoot, 'feature.txt'))).toBe(true);
  });

  it('releases the lock when the repo run exits, so the merge then succeeds', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    const ws = await workspaceReadyToMerge(o);

    const run = o.createRepoRun({ agent: 'ux' });
    await o.runAgent(run.id);
    expect(fs.existsSync(lockFileOf(o))).toBe(true);

    await expect(o.merge(ws.id)).rejects.toThrow(/main checkout is in use/);

    o.pendingExits.shift()();
    await settle();

    expect(fs.existsSync(lockFileOf(o))).toBe(false);
    await expect(o.merge(ws.id)).resolves.toBeDefined();
    expect(fs.existsSync(lockFileOf(o))).toBe(false);
  });

  it('releases the lock when a merge throws, instead of stranding the checkout', async () => {
    const o = makeOrchestrator();
    const ws = await workspaceReadyToMerge(o);
    o._mergeToMain = () => { throw new Error('merge conflict in README.md'); };

    await expect(o.merge(ws.id)).rejects.toThrow(/merge conflict/);

    expect(fs.existsSync(lockFileOf(o))).toBe(false);
    // And the next thing that wants the checkout can have it.
    const run = o.createRepoRun({ agent: 'ux' });
    await expect(o.runAgent(run.id)).resolves.toBeDefined();
  });

  it('does not block a second repo run once the first has finished', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });

    const first = o.createRepoRun({ agent: 'ux' });
    await o.runAgent(first.id);
    const second = o.createRepoRun({ agent: 'pm' });
    await expect(o.runAgent(second.id)).rejects.toThrow(/main checkout is in use by bobby-ux/);

    o.pendingExits.shift()();
    await settle();

    await expect(o.runAgent(second.id)).resolves.toBeDefined();
  });
});

describe('a stale lock does not block forever', () => {
  /**
   * A pid that is certainly not running: spawn a process that exits, then reuse
   * its number. The kernel does not hand it out again this quickly.
   */
  const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;

  const writeLock = (o, record) => {
    fs.mkdirSync(path.dirname(lockFileOf(o)), { recursive: true });
    fs.writeFileSync(lockFileOf(o), JSON.stringify(record), 'utf8');
  };

  it('reclaims a lock whose holder process is gone, without waiting out the timeout', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    writeLock(o, {
      holder: 'bobby-ux (repo run repo-ux-old)',
      pid: deadPid(),
      host: os.hostname(),
      token: 'stale-token',
      startedAt: new Date().toISOString(), // fresh: only the dead pid says stale
    });

    const run = o.createRepoRun({ agent: 'ux' });
    await expect(o.runAgent(run.id)).resolves.toBeDefined();

    // The lock is now ours, not the corpse's.
    expect(readLock(lockFileOf(o)).token).not.toBe('stale-token');
    expect(readLock(lockFileOf(o)).pid).toBe(process.pid);
  });

  it('reclaims a lock older than the age ceiling even when its pid is alive', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    writeLock(o, {
      holder: 'a merge that never finished',
      pid: process.pid,               // unmistakably alive
      host: os.hostname(),
      token: 'ancient-token',
      startedAt: new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString(),
    });

    const run = o.createRepoRun({ agent: 'ux' });
    await expect(o.runAgent(run.id)).resolves.toBeDefined();
    expect(readLock(lockFileOf(o)).token).not.toBe('ancient-token');
  });

  it('reclaims a lock file that is corrupt rather than wedging the repo on it', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    fs.mkdirSync(path.dirname(lockFileOf(o)), { recursive: true });
    fs.writeFileSync(lockFileOf(o), 'not json at all', 'utf8');

    const run = o.createRepoRun({ agent: 'ux' });
    await expect(o.runAgent(run.id)).resolves.toBeDefined();
  });

  it('still refuses a live, recent lock — staleness must not mean "always take it"', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    writeLock(o, {
      holder: 'bobby-arch (repo run repo-arch-xyz)',
      pid: process.pid,
      host: os.hostname(),
      token: 'live-token',
      startedAt: new Date().toISOString(),
    });

    const run = o.createRepoRun({ agent: 'ux' });
    await expect(o.runAgent(run.id)).rejects.toThrow(/in use by bobby-arch/);
    expect(readLock(lockFileOf(o)).token).toBe('live-token');
  });
});

describe('worktree runs are outside the lock', () => {
  it('starts a worktree run while a repo run holds the main checkout', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    seedTicket(o, { id: 'TKT-001', stage: 'building' });

    const repoRun = o.createRepoRun({ agent: 'ux' });
    await o.runAgent(repoRun.id);
    expect(fs.existsSync(lockFileOf(o))).toBe(true);

    // A worktree run never touches the main checkout, so blocking it here would
    // make the app feel broken for the case it exists to serve.
    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'build' });
    await expect(o.runAgent(ws.id)).resolves.toBeDefined();

    expect(o.store.get(ws.id).status).toBe('running');
    expect(o.launched.map(l => l.worktreePath)).toEqual([repoRoot, ws.worktreePath]);
    // …and it did not steal the lock on the way past.
    expect(readLock(lockFileOf(o)).holder).toContain('bobby-ux');
  });

  it('leaves no lock behind at all for a worktree run on its own', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    seedTicket(o, { id: 'TKT-001', stage: 'building' });

    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'build' });
    await o.runAgent(ws.id);

    expect(fs.existsSync(lockFileOf(o))).toBe(false);
  });
});

describe('the concurrency cap counts repo runs too', () => {
  it('refuses a worktree run when a repo run has taken the only slot', async () => {
    const o = makeOrchestrator({ config: { dashboard: { max_concurrent: 1 } }, behaviour: 'manual' });
    seedTicket(o, { id: 'TKT-001', stage: 'building' });

    const repoRun = o.createRepoRun({ agent: 'ux' });
    await o.runAgent(repoRun.id);

    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'build' });
    const err = await o.runAgent(ws.id).catch(e => e);

    expect(err.message).toMatch(/1 agent is already running: the main checkout ux\./);
    expect(err.message).toContain('raise dashboard.max_concurrent');
  });

  it('refuses a repo run when worktree runs have taken every slot', async () => {
    const o = makeOrchestrator({ config: { dashboard: { max_concurrent: 1 } }, behaviour: 'manual' });
    seedTicket(o, { id: 'TKT-001', stage: 'building' });

    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'build' });
    await o.runAgent(ws.id);

    const repoRun = o.createRepoRun({ agent: 'ux' });
    await expect(o.runAgent(repoRun.id)).rejects.toThrow(/1 agent is already running: TKT-001 build\./);

    // Refused before the lock was taken, not after — a cap refusal must not
    // leave the checkout looking busy.
    expect(fs.existsSync(lockFileOf(o))).toBe(false);
  });
});

describe('the worktree verbs, on something with no worktree', () => {
  const startedRun = async (o, agent = 'ux') => {
    const run = o.createRepoRun({ agent });
    await o.runAgent(run.id);
    await settle();
    return o.store.get(run.id);
  };

  it('diff and files read the main checkout working tree, including untracked output', async () => {
    const o = makeOrchestrator();
    const run = await startedRun(o);

    // What an agent leaves behind: an edit and a brand-new file.
    fs.appendFileSync(path.join(repoRoot, 'README.md'), 'a finding\n');
    fs.writeFileSync(path.join(repoRoot, 'FINDINGS.md'), 'one\ntwo\n');

    const { diff } = o.getDiff(run.id);
    expect(diff).toContain('README.md');
    expect(diff).toContain('+a finding');

    const files = o.getChangedFiles(run.id);
    expect(files.find(f => f.file === 'README.md')).toMatchObject({ added: 1, removed: 0 });
    // Untracked: listed, uncountable — git has never seen it.
    expect(files.find(f => f.file === 'FINDINGS.md')).toMatchObject({ added: null, untracked: true });
  });

  it('refuses merge, approve, reject and featureProgress with a reason, not a stack trace', async () => {
    const o = makeOrchestrator();
    const run = await startedRun(o);

    await expect(o.merge(run.id)).rejects.toThrow(/already there and there is no branch to merge/);
    await expect(o.approve(run.id)).rejects.toThrow(/no pipeline to approve it into/);
    await expect(o.reject(run.id)).rejects.toThrow(/there is no ticket here/);
    expect(() => o.featureProgress(run.id)).toThrow(/no ticket, so there is no feature progress/);
  });

  it('discard drops the record and never touches the working tree', async () => {
    const o = makeOrchestrator();
    const run = await startedRun(o);
    fs.writeFileSync(path.join(repoRoot, 'FINDINGS.md'), 'the agent\'s output\n');

    await o.discard(run.id);

    expect(o.store.get(run.id)).toBeNull();
    // The output is the user's working tree now. Discard is not an undo button.
    expect(fs.readFileSync(path.join(repoRoot, 'FINDINGS.md'), 'utf8')).toContain("agent's output");
  });

  it('discarding a running repo run stops it and hands the lock back', async () => {
    const o = makeOrchestrator({ behaviour: 'manual' });
    const run = o.createRepoRun({ agent: 'ux' });
    await o.runAgent(run.id);
    expect(fs.existsSync(lockFileOf(o))).toBe(true);

    await o.discard(run.id);
    await settle();

    expect(o.store.get(run.id)).toBeNull();
    expect(fs.existsSync(lockFileOf(o))).toBe(false);
  });
});

describe('every ticket-free agent is launchable through the API', () => {
  let server;
  let base;
  let o;

  const api = async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };

  beforeEach(async () => {
    const { buildServer } = await import('../../../lib/dashboard/server.js');
    // The cap is raised because this suite deliberately launches every agent;
    // the cap has its own tests above.
    o = makeOrchestrator({ config: { dashboard: { max_concurrent: 99 } } });
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
  });

  afterEach(async () => {
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
  });

  it('GET /api/agents marks exactly the ticket-free agents repoRunnable', async () => {
    const { body } = await api('GET', '/api/agents');

    const runnable = body.agents.filter(a => a.repoRunnable).map(a => a.key);
    expect(runnable).toEqual(REPO_AGENTS);
    // The named set from the ticket, so a registry edit that silently drops one
    // fails here rather than in the app.
    expect(runnable).toEqual(expect.arrayContaining(
      ['ux', 'pm', 'qe', 'docs', 'ship', 'arch', 'watchdog', 'performance',
        'design-research', 'design-analyze', 'design-mockup', 'design-spec',
        'design-build', 'design-check']
    ));
    expect(runnable).not.toContain('security');
    expect(runnable).not.toContain('build');
  });

  it('POST /api/repo-runs launches every one of them', async () => {
    expect(REPO_AGENTS.length).toBeGreaterThan(10);

    for (const agent of REPO_AGENTS) {
      const { status, body } = await api('POST', '/api/repo-runs', { agent });
      expect([agent, status]).toEqual([agent, 201]);
      expect(body.workspace.kind).toBe('repo');
      expect(body.workspace.agent).toBe(agent);
      // Each one really spawned, in the main checkout, with its own prompt.
      expect(o.launched[o.launched.length - 1].worktreePath).toBe(repoRoot);
      await settle();
    }

    expect(o.launched).toHaveLength(REPO_AGENTS.length);
    // And each is an ordinary record the rest of the API already addresses.
    const { body: list } = await api('GET', '/api/workspaces');
    expect(list.workspaces).toHaveLength(REPO_AGENTS.length);
  });

  it('every registry agent is either repo-runnable or has a ticket path — none is unreachable', () => {
    for (const key of Object.keys(AGENT_REGISTRY)) {
      const entry = AGENT_REGISTRY[key];
      const reachable = runsWithoutTicket(key) || entry.requiresTicket || entry.custom || !entry.promptSteps;
      expect([key, reachable]).toEqual([key, true]);
    }
  });

  it('refuses a ticket-requiring agent with 400 and leaves no orphan record', async () => {
    const { status, body } = await api('POST', '/api/repo-runs', { agent: 'security' });

    expect(status).toBe(400);
    expect(body.error).toMatch(/works on a ticket/);
    expect((await api('GET', '/api/workspaces')).body.workspaces).toHaveLength(0);
  });

  it('surfaces the main-checkout refusal as a 400 and leaves no orphan record', async () => {
    const held = makeOrchestrator({ behaviour: 'manual' });
    // Same repo, so the same lock file — which is the whole point of it being a
    // file: this second orchestrator is a stand-in for a second bobby process.
    const other = held.createRepoRun({ agent: 'arch' });
    await held.runAgent(other.id);

    const { status, body } = await api('POST', '/api/repo-runs', { agent: 'ux' });

    expect(status).toBe(400);
    expect(body.error).toMatch(/The main checkout is in use by bobby-arch/);
    expect((await api('GET', '/api/workspaces')).body.workspaces).toHaveLength(0);
  });

  it('requires an agent', async () => {
    const { status, body } = await api('POST', '/api/repo-runs', {});
    expect(status).toBe(400);
    expect(body.error).toBe('agent is required');
  });
});

describe('a failed repo run names the executor that actually ran (BOB-136)', () => {
  // `_onRepoRunExit` is its own `_lastErrorFor` call site — a fix that only
  // reached `_onExit` would leave every failed repo run still blaming claude.
  it('blames codex when codex is what ran', async () => {
    const o = makeOrchestrator({
      config: { dashboard: { executor: 'codex' } },
      exit: { exitCode: 1 },
    });

    const run = o.createRepoRun({ agent: 'ux' });
    await o.runAgent(run.id);
    await settle();

    const after = o.store.get(run.id);
    expect(after.status).toBe('failed');
    expect(after.lastError).toBe('codex exited with code 1');
    expect(after.lastError).not.toMatch(/claude/);
  });
});
