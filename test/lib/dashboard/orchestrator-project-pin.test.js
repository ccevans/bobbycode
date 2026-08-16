// test/lib/dashboard/orchestrator-project-pin.test.js
//
// TKT-022 / AC3: a run started in project A is undisturbed by a switch to
// project B — including its EXIT.
//
// The first version of AC3's test asserted only that switching leaves the
// process map and the workspace record alone. That is true, and it is not what
// AC3 says: a run takes minutes, the switch lands in the middle of it, and the
// damage happens afterwards, when the orchestrator asks a board how the run
// went. `this.ticketsDir` has moved by then. So every test here lets the alpha
// run actually EXIT while the UI sits on beta, and asserts on what the exit
// recorded.
//
// Faithfully faked: real boards on disk, real ProjectContext, real store, real
// _onExit. Only the CLI is fake — and it does what a real agent does, running
// the `bobby ticket move` its prompt names against the board it was handed. The
// worktrees are plain directories: git ops fail soft (checkpointError) and
// `headSha` returns null, which the exit path already treats as "cannot tell".

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { ProjectContext } from '../../../lib/dashboard/project-context.js';
import { WorkspaceStore, newWorkspace } from '../../../lib/dashboard/state.js';
import { resolveWorkflow } from '../../../lib/workflow.js';
import YAML from 'yaml';
import { createTicket, moveTicket, findTicket } from '../../../lib/tickets.js';

const git = (cwd, cmd) => execSync(`git ${cmd}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

const boardOf = (root, project) => path.join(root, '.bobby', project, 'tickets');
const sessionsOf = (root, project) => path.join(root, '.bobby', project, 'sessions');

/**
 * A studio with alpha + beta boards, both empty. `studioConfig` is written into
 * the studio's OWN .bobbyrc.yml, not passed to a constructor: in a studio the
 * orchestrator reads its config live off the project context, which builds it
 * from disk, so settings that only exist on a constructor object are correctly
 * ignored. On disk at the studio root means both projects inherit it.
 */
function makeStudio(tmp, studioConfig = {}) {
  const root = path.join(tmp, 'studio');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '.bobbyrc.yml'), YAML.stringify({ studio: 'teststudio', ...studioConfig }));
  for (const name of ['alpha', 'beta']) {
    fs.mkdirSync(boardOf(root, name), { recursive: true });
    fs.mkdirSync(sessionsOf(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, '.bobby', name, '.bobbyrc.yml'), `project: ${name}\n`);
  }
  return root;
}

/**
 * A studio orchestrator on alpha, with a fake CLI that holds its exit open
 * until the test releases it — which is what makes "switch mid-run" testable.
 */
function wire(tmp, { config: extra = {} } = {}) {
  const root = makeStudio(tmp, extra);
  const config = { studio: 'teststudio', project: 'alpha', _project: 'alpha', ...extra };
  const projectContext = new ProjectContext(root, config);
  const store = new WorkspaceStore(path.join(root, '.bobby', 'workspaces.json'));

  const o = new Orchestrator({
    repoRoot: root,
    config,
    ticketsDir: projectContext.ticketsDir,
    sessionsDir: projectContext.sessionsDir,
    agentsPath: '.claude/agents',
    store,
    sseHub: null,
    pipeline: resolveWorkflow(config, 'default'),
    pipelineName: 'default',
    projectContext,
  });

  o.launched = [];
  o.pendingExits = [];
  o.emitEvent = null;      // set per launch — lets a test push an exec event

  o._runExecutor = ({ prompt, onEvent }) => {
    // The agent obeys its prompt: it reads the board the prompt names — the
    // absolute `<ticketsDir>/<folder>/ticket.md` of step 2 — and performs the
    // move the prompt names there, exactly as `bobby ticket move` would.
    const ticketsDir = /Read `(.+)\/[^/`]+\/ticket\.md`/.exec(prompt)?.[1];
    const ticketId = /on ticket (\S+)\./.exec(prompt)?.[1];
    const movedTo = /bobby ticket move \S+ ([a-z-]+)/.exec(prompt)?.[1] || null;
    o.launched.push({ prompt, ticketsDir, ticketId, movedTo });
    o.emitEvent = onEvent;

    let release;
    const done = new Promise((resolve) => {
      release = () => {
        if (movedTo && ticketsDir) moveTicket(ticketsDir, ticketId, movedTo, 'bobby-plan');
        resolve({ exitCode: 0, signal: null });
      };
    });
    o.pendingExits.push(release);
    return { pid: 4242, stop: () => release(), done };
  };

  return { root, o, store, projectContext };
}

/** Seed a ticket on a project's board and a workspace pinned to that board. */
function seed(root, o, { project, prefix, title = 'work', stage = 'planning', wsId }) {
  const ticketsDir = boardOf(root, project);
  const { id } = createTicket(ticketsDir, { prefix, title });
  moveTicket(ticketsDir, id, stage, 'test');

  const worktreePath = path.join(root, 'wt', wsId);
  fs.mkdirSync(worktreePath, { recursive: true });

  const ws = newWorkspace({
    id: wsId,
    ticketId: id,
    worktreePath,
    branch: `bobby/${wsId}`,
    agent: null,
    pipeline: 'default',
    // What createWorkspace pins (asserted directly against the real thing in
    // the createWorkspace tests below). The project NAME is the source of the
    // other two, and what the run's config is read from.
    project,
    ticketsDir,
    sessionsDir: sessionsOf(root, project),
  });
  ws.stage = stage;
  o.store.create(ws);
  return { ticketId: id, ws };
}

/** Let the queued exit handler (attached via .then) run. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

/** Start the run, switch the UI to beta, then let the run exit. */
async function runThenSwitchThenExit(o, wsId, { agent = 'plan' } = {}) {
  await o.runAgent(wsId, { agentOverride: agent });
  o.switchProject('beta');
  o.pendingExits.pop()();
  await settle();
}

describe('AC3: a run stays bound to the project it started in (TKT-022)', () => {
  let tmp;
  beforeEach(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-projpin-'))); });
  afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

  // The failure the earlier TC-7 could not see: with the UI on beta, the exit
  // read beta's board for an alpha ticket, found nothing, and recorded a
  // successful run as a no-op — the workspace never reached awaiting_approval
  // and the user's finished work looked like it had failed.
  test('a run that EXITS after a switch reads its stage from its own board', async () => {
    const { root, o } = wire(tmp);
    const { ticketId } = seed(root, o, { project: 'alpha', prefix: 'AL', wsId: 'ws-al' });

    await runThenSwitchThenExit(o, 'ws-al');

    // The agent's move landed on alpha, and the exit read it from alpha.
    expect(findTicket(boardOf(root, 'alpha'), ticketId).data.stage).toBe('building');
    const ws = o.store.get('ws-al');
    expect(ws.stage).toBe('building');
    expect(ws.status).toBe('awaiting_approval');
    expect(ws.runs.at(-1).status).toBe('completed');

    // And the UI did move — the switch itself was not quietly undone.
    expect(o.ticketsDir).toBe(boardOf(root, 'beta'));
  });

  // The prefix-collision variant. Both boards hold a ticket with the SAME id,
  // at different stages. Reading the wrong one is not a missing record but a
  // wrong one: beta's copy sits in `shipping`, which would promote the alpha
  // workspace to ready_to_merge on work that was only just planned.
  test('a same-id ticket on the other board cannot be mistaken for this run\'s', async () => {
    const { root, o } = wire(tmp);
    const { ticketId } = seed(root, o, { project: 'alpha', prefix: 'X', title: 'alpha work', wsId: 'ws-al' });

    // Beta's own X-001 — same id, different ticket, further along.
    const betaBoard = boardOf(root, 'beta');
    const beta = createTicket(betaBoard, { prefix: 'X', title: 'beta work' });
    expect(beta.id).toBe(ticketId);              // the collision is real
    moveTicket(betaBoard, beta.id, 'shipping', 'test');

    await runThenSwitchThenExit(o, 'ws-al');

    const ws = o.store.get('ws-al');
    expect(ws.stage).toBe('building');           // alpha's stage, not 'shipping'
    expect(ws.status).toBe('awaiting_approval'); // not ready_to_merge
    // Beta's ticket was never touched by a run that had nothing to do with it.
    expect(findTicket(betaBoard, beta.id).data.stage).toBe('shipping');
  });

  // The same hazard one step further on: with auto-approve configured, a wrong
  // stage read does not just mis-record, it LAUNCHES the next agent — against
  // the other project's board.
  test('auto-approve after a switch runs the next agent against the run\'s own board', async () => {
    // auto_approve_stages is matched against the stage the workspace was IN when
    // the run started, which is where the ticket sat at launch: planning.
    const { root, o } = wire(tmp, { config: { dashboard: { auto_approve_stages: ['planning'] } } });
    const { ticketId } = seed(root, o, { project: 'alpha', prefix: 'X', wsId: 'ws-al' });

    const betaBoard = boardOf(root, 'beta');
    const beta = createTicket(betaBoard, { prefix: 'X', title: 'beta work' });
    moveTicket(betaBoard, beta.id, 'reviewing', 'test');

    await runThenSwitchThenExit(o, 'ws-al');
    await settle();

    // The build agent that auto-approve launched was pointed at alpha.
    expect(o.launched.length).toBe(2);
    expect(o.launched[1].ticketsDir).toBe(boardOf(root, 'alpha'));
    expect(o.launched[1].ticketId).toBe(ticketId);
  });

  // A session whose header is in one project and whose tail is in another is a
  // log with a hole in it, on both sides.
  test('exec events after a switch append to the session file the run opened', async () => {
    const { root, o } = wire(tmp);
    seed(root, o, { project: 'alpha', prefix: 'AL', wsId: 'ws-al' });

    await o.runAgent('ws-al', { agentOverride: 'plan' });
    const sessionId = o.store.get('ws-al').sessionId;

    o.switchProject('beta');
    o.emitEvent({ type: 'assistant', text: 'after the switch' });
    o.pendingExits.pop()();
    await settle();

    const alphaLog = path.join(sessionsOf(root, 'alpha'), `${sessionId}.jsonl`);
    expect(fs.readFileSync(alphaLog, 'utf8')).toContain('after the switch');
    expect(fs.existsSync(path.join(sessionsOf(root, 'beta'), `${sessionId}.jsonl`))).toBe(false);
    // And the dashboard tails the file where it actually is.
    expect(o.readLatestSessionFile('ws-al')).toBe(alphaLog);
  });

  // The pin is what all of the above rests on, so assert createWorkspace sets
  // it — through the real thing, with real git, not a hand-built record.
  test('createWorkspace pins the board the workspace was created from', () => {
    // A worktree_root under the studio root — the studio guard (PRO-027) refuses
    // anything outside it, and here the launch repo IS the studio root.
    const { root, o } = wire(tmp, { config: { dashboard: { worktree_root: 'wt' } } });
    git(root, 'init -q -b main');
    git(root, 'config user.email test@example.com');
    git(root, 'config user.name Test');
    fs.writeFileSync(path.join(root, 'README.md'), '# studio\n');
    git(root, 'add README.md');
    git(root, 'commit -q -m initial');

    const { id } = createTicket(boardOf(root, 'alpha'), { prefix: 'AL', title: 'alpha work' });
    moveTicket(boardOf(root, 'alpha'), id, 'planning', 'test');

    const ws = o.createWorkspace({ ticketId: id, agent: 'plan' });
    expect(ws.ticketsDir).toBe(boardOf(root, 'alpha'));
    expect(ws.sessionsDir).toBe(sessionsOf(root, 'alpha'));

    // Still alpha's after the UI has moved on.
    o.switchProject('beta');
    expect(o.store.get(ws.id).ticketsDir).toBe(boardOf(root, 'alpha'));
    expect(o._ticketsDirFor(o.store.get(ws.id))).toBe(boardOf(root, 'alpha'));
  });

  // The pin covers CONFIG too, because .bobbyrc.yml is per project. A run's
  // permission posture, workflow, services and git conventions all come from
  // there, and a run that started on alpha must keep alpha's.
  test('a run reads its own project\'s config, while the UI reads the new one', () => {
    const { root, o } = wire(tmp);
    fs.appendFileSync(path.join(root, '.bobby', 'alpha', '.bobbyrc.yml'), 'prefix: AL\n');
    fs.appendFileSync(path.join(root, '.bobby', 'beta', '.bobbyrc.yml'), 'prefix: BE\n');
    const { ws } = seed(root, o, { project: 'alpha', prefix: 'AL', wsId: 'ws-al' });

    o.switchProject('beta');

    expect(o.config.ticket_prefix).toBe('BE');          // the UI followed
    expect(o._configFor(ws).ticket_prefix).toBe('AL');  // the run did not
  });

  // B3, the worst of them: `project_repos` is a PROJECT key and decides which
  // repository a ticket's worktree is cut from. Reading it off the boot config
  // gave a beta ticket a worktree of ALPHA's repo — an agent editing the wrong
  // codebase, with nothing in the UI to suggest it.
  test('a workspace created after a switch is cut from the NEW project\'s repo', () => {
    const initRepo = (dir, marker) => {
      fs.mkdirSync(dir, { recursive: true });
      git(dir, 'init -q -b main');
      git(dir, 'config user.email test@example.com');
      git(dir, 'config user.name Test');
      fs.writeFileSync(path.join(dir, 'MARKER.txt'), marker);
      git(dir, 'add -A');
      git(dir, 'commit -q -m initial');
      return dir;
    };

    // A studio whose two projects use two different repos from the group.
    const { root, o } = wire(tmp, {
      config: {
        repos: { appa: { path: 'repos/appa' }, appb: { path: 'repos/appb' } },
        dashboard: { worktree_root: 'wt' },
      },
    });
    const appa = initRepo(path.join(root, 'repos', 'appa'), 'this is appa');
    const appb = initRepo(path.join(root, 'repos', 'appb'), 'this is appb');
    fs.appendFileSync(path.join(root, '.bobby', 'alpha', '.bobbyrc.yml'), 'repos:\n  - appa\n');
    fs.appendFileSync(path.join(root, '.bobby', 'beta', '.bobbyrc.yml'), 'repos:\n  - appb\n');

    const { id } = createTicket(boardOf(root, 'beta'), { prefix: 'BE', title: 'beta work' });
    moveTicket(boardOf(root, 'beta'), id, 'planning', 'test');

    o.switchProject('beta');
    const ws = o.createWorkspace({ ticketId: id, agent: 'plan' });

    expect(ws.project).toBe('beta');
    expect(ws.repoRoot).toBe(appb);
    expect(ws.repoRoot).not.toBe(appa);
    // The worktree really is beta's repository, not merely labelled as one.
    expect(fs.readFileSync(path.join(ws.worktreePath, 'MARKER.txt'), 'utf8')).toBe('this is appb');
  });

  // C2 — the pin, one process further out. The agent runs `bobby ticket move`,
  // which resolves its board through resolveActiveProject; that falls back to
  // .bobby/active-project, which the UI rewrites on every switch. BOBBY_PROJECT
  // is the top of that chain, so the run names its own project for the child.
  test('the agent is launched with BOBBY_PROJECT set to the run\'s project', async () => {
    const { root, o } = wire(tmp);
    seed(root, o, { project: 'alpha', prefix: 'AL', wsId: 'ws-al' });

    let spawnedEnv = null;
    const inner = o._runExecutor.bind(o);
    o._runExecutor = (opts) => { spawnedEnv = opts.env; return inner(opts); };

    await o.runAgent('ws-al', { agentOverride: 'plan' });
    o.switchProject('beta');
    o.pendingExits.pop()();
    await settle();

    expect(spawnedEnv).toEqual(expect.objectContaining({ BOBBY_PROJECT: 'alpha' }));
  });

  // Records written before the pin existed, and every single-project dashboard,
  // have no pinned board — those keep reading the one board there is.
  test('a record with no pinned board falls back to the live board', () => {
    const { root, o } = wire(tmp);
    const legacy = { id: 'ws-old', ticketId: 'AL-001', kind: 'worktree', status: 'idle', runs: [] };
    expect(o._ticketsDirFor(legacy)).toBe(boardOf(root, 'alpha'));
    expect(o._sessionsDirFor(legacy)).toBe(sessionsOf(root, 'alpha'));
  });
});
