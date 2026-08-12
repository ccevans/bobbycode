// test/lib/dashboard/permissions.test.js
//
// Permission posture, per kind of run (TKT-062).
//
// THE BUG THIS SUITE EXISTS FOR could not be seen by any existing test, and
// that is the interesting part. `dashboard.permission_mode` shipped unset; for
// headless `claude -p` that means "ask before writing", and in a subprocess
// with no terminal nobody can answer. A real run measured 88 turns, 9m14s and
// $2.97, wrote zero files, never moved the ticket — and exited 0. Every suite
// here stubs the executor, and a stub always "writes", so the failure was
// invisible from both ends: the default was never exercised and a clean exit
// was allowed to mean success.
//
// So this suite pins three things the stub cannot paper over:
//   1. WHICH posture each kind of run is launched with, read off the options
//      the orchestrator actually hands the executor — not off the config.
//   2. That a run being refused is STOPPED, from the real refusal shapes
//      recorded in the real session logs.
//   3. That a run which wrote nothing and moved nothing is not `completed`,
//      judged against a REAL git worktree, because "did anything change" is a
//      question only the filesystem can answer.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { Orchestrator, PERMISSION_DENIAL_LIMIT } from '../../../lib/dashboard/orchestrator.js';
import {
  resolvePermissionMode,
  isPermissionDenial,
  DEFAULT_WORKTREE_PERMISSION_MODE,
  DEFAULT_REPO_PERMISSION_MODE,
} from '../../../lib/dashboard/executor.js';
import { WorkspaceStore } from '../../../lib/dashboard/state.js';
import { resolveWorkflow } from '../../../lib/workflow.js';
import { readConfig } from '../../../lib/config.js';
import { scaffoldProject } from '../../../commands/init.js';
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
 * A real orchestrator on a real repo with a fake agent CLI.
 *
 * The fake records the FULL options it was launched with — the permission mode
 * among them — because the only thing that matters is what reaches the CLI.
 * `agentBehaviour` is what the fake agent does before it exits: nothing at all,
 * write code, move the ticket, or get refused.
 */
function makeOrchestrator({ config = {}, agentBehaviour } = {}) {
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

  o.launches = [];   // the opts each launch was given
  o.stopped = [];    // workspace ids the orchestrator stopped mid-run

  o._runExecutor = (opts) => {
    o.launches.push(opts);
    let stopped = false;
    const exit = { exitCode: 0, signal: null };
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });

    const handle = {
      pid: 4321,
      stop: () => {
        stopped = true;
        o.stopped.push(opts.prompt);
        // A stopped CLI dies on the signal, exactly as the real one does.
        resolveDone({ exitCode: null, signal: 'SIGTERM' });
      },
      done,
    };

    // Run the behaviour on the next tick so the orchestrator has registered the
    // handle — a real CLI's first event never arrives inside the spawn call.
    Promise.resolve().then(() => {
      if (agentBehaviour) agentBehaviour(o, opts);
      if (!stopped) resolveDone(exit);
    });

    return handle;
  };

  return o;
}

/** The refusal a headless claude emits when it may not write, verbatim. */
function writeRefusalEvent(filePath) {
  return {
    type: 'stdout',
    kind: 'json',
    data: {
      type: 'user',
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          is_error: true,
          tool_use_id: 'toolu_x',
          content: `Claude requested permissions to write to ${filePath}, but you haven't granted it yet.`,
        }],
      },
    },
  };
}

/** The refusal a headless claude emits when it may edit but not run commands. */
function bashRefusalEvent() {
  return {
    type: 'stdout',
    kind: 'json',
    data: {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', is_error: true, content: 'This command requires approval' }],
      },
    },
  };
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
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-permissions-'));
  repoRoot = initRepo(path.join(tmp, 'main'));
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe('the two kinds of run get different permission postures', () => {
  it('defaults a worktree run to the posture that can finish a stage', () => {
    expect(resolvePermissionMode({}, 'worktree')).toBe('bypassPermissions');
    expect(DEFAULT_WORKTREE_PERMISSION_MODE).toBe('bypassPermissions');
  });

  it('defaults a repo run to a narrower posture — it works in the real checkout', () => {
    expect(resolvePermissionMode({}, 'repo')).toBe('acceptEdits');
    expect(DEFAULT_REPO_PERMISSION_MODE).toBe('acceptEdits');
    // The whole point: the two are not the same answer.
    expect(resolvePermissionMode({}, 'repo')).not.toBe(resolvePermissionMode({}, 'worktree'));
  });

  it('lets an explicit per-kind value win, for either kind', () => {
    const config = {
      dashboard: { worktree_permission_mode: 'plan', repo_permission_mode: 'bypassPermissions' },
    };
    expect(resolvePermissionMode(config, 'worktree')).toBe('plan');
    expect(resolvePermissionMode(config, 'repo')).toBe('bypassPermissions');
  });

  it('honours "default" as a deliberate choice to go back to asking', () => {
    const config = { dashboard: { worktree_permission_mode: 'default' } };
    expect(resolvePermissionMode(config, 'worktree')).toBe('default');
  });

  it('keeps the older single permission_mode meaning what it meant — both kinds', () => {
    const config = { dashboard: { permission_mode: 'acceptEdits' } };
    expect(resolvePermissionMode(config, 'worktree')).toBe('acceptEdits');
    expect(resolvePermissionMode(config, 'repo')).toBe('acceptEdits');
  });

  it('lets a per-kind key override the older single key', () => {
    const config = {
      dashboard: { permission_mode: 'acceptEdits', worktree_permission_mode: 'bypassPermissions' },
    };
    expect(resolvePermissionMode(config, 'worktree')).toBe('bypassPermissions');
    expect(resolvePermissionMode(config, 'repo')).toBe('acceptEdits');
  });

  it('treats a null in the config as unset, not as a value', () => {
    // What an uncommented placeholder in .bobbyrc.yml parses to. Reading it as
    // a value is how the default came to be "ask, headlessly" in the first place.
    const config = { dashboard: { worktree_permission_mode: null, permission_mode: null } };
    expect(resolvePermissionMode(config, 'worktree')).toBe('bypassPermissions');
    expect(resolvePermissionMode(config, 'repo')).toBe('acceptEdits');
  });
});

describe('a project gets the working defaults without configuring anything', () => {
  it('resolves both keys from a config file that mentions neither', () => {
    fs.writeFileSync(path.join(repoRoot, '.bobbyrc.yml'), 'project: x\nstack: generic\n');
    const config = readConfig(repoRoot);

    expect(config.dashboard.worktree_permission_mode).toBe('bypassPermissions');
    expect(config.dashboard.repo_permission_mode).toBe('acceptEdits');
  });

  it('keeps a user override through readConfig, alongside the other default', () => {
    fs.writeFileSync(
      path.join(repoRoot, '.bobbyrc.yml'),
      'project: x\nstack: generic\ndashboard:\n  worktree_permission_mode: plan\n'
    );
    const config = readConfig(repoRoot);

    expect(config.dashboard.worktree_permission_mode).toBe('plan');
    expect(config.dashboard.repo_permission_mode).toBe('acceptEdits');
    expect(resolvePermissionMode(config, 'worktree')).toBe('plan');
  });

  it('gives a newly scaffolded project a posture its agents can actually work in', () => {
    // Driven through the real scaffolder, not read off the template: a new
    // project is what `bobby init` LEAVES BEHIND, and the file it writes and
    // the defaults that fill the gaps are both part of that.
    const fresh = path.join(tmp, 'fresh');
    fs.mkdirSync(fresh, { recursive: true });
    scaffoldProject(fresh, {
      project: 'fresh-app',
      stack: 'generic',
      health_checks: [],
      areas: [],
      commands: {},
      tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    });

    const config = readConfig(fresh);
    expect(resolvePermissionMode(config, 'worktree')).toBe('bypassPermissions');
    expect(resolvePermissionMode(config, 'repo')).toBe('acceptEdits');

    // And the file itself names both keys, so the setting is discoverable
    // without reading Bobby's source.
    const written = fs.readFileSync(path.join(fresh, '.bobbyrc.yml'), 'utf8');
    expect(written).toContain('worktree_permission_mode');
    expect(written).toContain('repo_permission_mode');
  });
});

describe('the posture that reaches the CLI', () => {
  it('launches a ticket run with the worktree default', async () => {
    const o = makeOrchestrator();
    seedTicket(o, { id: 'TKT-001', stage: 'building' });
    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'build' });
    await o.runAgent(ws.id);
    await settle();

    expect(o.launches).toHaveLength(1);
    expect(o.launches[0].permissionMode).toBe('bypassPermissions');
  });

  it('launches a repo run with the conservative repo default', async () => {
    const o = makeOrchestrator();
    const run = o.createRepoRun({ agent: 'arch' });
    await o.runAgent(run.id);
    await settle();

    expect(o.launches).toHaveLength(1);
    expect(o.launches[0].permissionMode).toBe('acceptEdits');
  });

  it('carries a configured override all the way to the launch, per kind', async () => {
    const o = makeOrchestrator({
      config: { dashboard: { worktree_permission_mode: 'plan', repo_permission_mode: 'bypassPermissions' } },
    });
    seedTicket(o, { id: 'TKT-001', stage: 'building' });
    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'build' });
    await o.runAgent(ws.id);
    await settle();
    const repo = o.createRepoRun({ agent: 'arch' });
    await o.runAgent(repo.id);
    await settle();

    expect(o.launches.map(l => l.permissionMode)).toEqual(['plan', 'bypassPermissions']);
  });
});

describe('recognising a refusal in the stream', () => {
  it('matches the refusals a real headless run collected', () => {
    expect(isPermissionDenial(writeRefusalEvent('/tmp/plan.md'))).toBe(true);
    expect(isPermissionDenial(bashRefusalEvent())).toBe(true);
    expect(isPermissionDenial({
      type: 'stdout',
      kind: 'json',
      data: {
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            is_error: true,
            content: 'This Bash command contains multiple operations. The following part requires approval: bobby ticket move TKT-1 building',
          }],
        },
      },
    })).toBe(true);
  });

  it('ignores everything that is not a refusal', () => {
    // An ordinary failing command is not a permission problem, and neither is a
    // successful tool result — telling someone to raise a permission key over
    // a failing test would send them somewhere with no fix in it.
    const ordinaryFailure = {
      type: 'stdout',
      kind: 'json',
      data: {
        type: 'user',
        message: { content: [{ type: 'tool_result', is_error: true, content: 'Exit code 1: npm test failed' }] },
      },
    };
    const success = {
      type: 'stdout',
      kind: 'json',
      data: { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
    };

    expect(isPermissionDenial(ordinaryFailure)).toBe(false);
    expect(isPermissionDenial(success)).toBe(false);
    expect(isPermissionDenial({ type: 'stderr', text: 'requires approval' })).toBe(false);
    expect(isPermissionDenial({ type: 'stdout', kind: 'text', data: 'requires approval' })).toBe(false);
    expect(isPermissionDenial(null)).toBe(false);
  });
});

describe('an agent that cannot work is stopped, not left to spend', () => {
  it('stops a worktree run after the third refusal and names the key to change', async () => {
    const o = makeOrchestrator({
      agentBehaviour: (orch, opts) => {
        // More refusals than the limit: the real run collected twenty-odd.
        for (let i = 0; i < PERMISSION_DENIAL_LIMIT + 5; i += 1) {
          opts.onEvent(writeRefusalEvent(`${opts.worktreePath}/plan.md`));
        }
      },
    });
    seedTicket(o, { id: 'TKT-001', stage: 'planning' });
    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'plan' });
    await o.runAgent(ws.id);
    await settle();

    const after = o.store.get(ws.id);
    // Stopped, so it is not recorded as a run that completed.
    expect(o.stopped).toHaveLength(1);
    expect(after.status).toBe('stopped');
    expect(after.runs[0].status).toBe('stopped');
    // The message is the whole point: what happened, and the key to change.
    expect(after.lastError).toContain('permission refusals');
    expect(after.lastError).toContain('dashboard.worktree_permission_mode');
    expect(after.lastError).toContain('bypassPermissions');
  });

  it('names the repo key when it is a repo run being refused', async () => {
    const o = makeOrchestrator({
      agentBehaviour: (orch, opts) => {
        for (let i = 0; i < PERMISSION_DENIAL_LIMIT; i += 1) opts.onEvent(bashRefusalEvent());
      },
    });
    const run = o.createRepoRun({ agent: 'docs' });
    await o.runAgent(run.id);
    await settle();

    const after = o.store.get(run.id);
    expect(after.status).toBe('stopped');
    expect(after.lastError).toContain('dashboard.repo_permission_mode');
  });

  it('leaves a run alone while refusals stay below the limit', async () => {
    const o = makeOrchestrator({
      agentBehaviour: (orch, opts) => {
        for (let i = 0; i < PERMISSION_DENIAL_LIMIT - 1; i += 1) opts.onEvent(bashRefusalEvent());
        // …and then it gets on with the work.
        fs.writeFileSync(path.join(opts.worktreePath, 'work.txt'), 'done\n');
      },
    });
    seedTicket(o, { id: 'TKT-001', stage: 'building' });
    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'build' });
    await o.runAgent(ws.id);
    await settle();

    expect(o.stopped).toHaveLength(0);
    expect(o.store.get(ws.id).runs[0].status).toBe('completed');
  });
});

describe('a run that achieved nothing is not recorded as completed', () => {
  it('records a clean exit with no writes and no stage change as no_op', async () => {
    const o = makeOrchestrator();  // fake agent does nothing at all
    seedTicket(o, { id: 'TKT-001', stage: 'planning' });
    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'plan' });
    await o.runAgent(ws.id);
    await settle();

    const after = o.store.get(ws.id);
    expect(after.runs[0].exitCode).toBe(0);      // the CLI said it was fine…
    expect(after.runs[0].status).toBe('no_op');  // …and it was not
    expect(after.status).toBe('no_op');
    expect(after.status).not.toBe('idle');
    // The message names the likely cause and where to change it.
    expect(after.lastError).toMatch(/permission posture/);
    expect(after.lastError).toContain('dashboard.worktree_permission_mode');
    expect(after.runs[0].error).toBe(after.lastError);
  });

  it('records a run that wrote code as completed, even with the stage unmoved', async () => {
    const o = makeOrchestrator({
      agentBehaviour: (orch, opts) => {
        fs.writeFileSync(path.join(opts.worktreePath, 'feature.js'), 'export const x = 1;\n');
      },
    });
    seedTicket(o, { id: 'TKT-001', stage: 'building' });
    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'build' });
    await o.runAgent(ws.id);
    await settle();

    const after = o.store.get(ws.id);
    expect(after.runs[0].status).toBe('completed');
    expect(after.status).toBe('idle');
    expect(after.lastError).toBeNull();
  });

  it('records a run that committed its own work as completed', async () => {
    // A build agent commits as it goes, so the checkpoint commit finds nothing
    // to do. "Nothing was committed just now" would be the wrong question.
    const o = makeOrchestrator({
      agentBehaviour: (orch, opts) => {
        fs.writeFileSync(path.join(opts.worktreePath, 'feature.js'), 'export const x = 1;\n');
        git(opts.worktreePath, 'add -A');
        git(opts.worktreePath, 'commit -q -m "TKT-001: work"');
      },
    });
    seedTicket(o, { id: 'TKT-001', stage: 'building' });
    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'build' });
    await o.runAgent(ws.id);
    await settle();

    expect(o.store.get(ws.id).runs[0].status).toBe('completed');
  });

  it('records a run that advanced the ticket as completed, code or no code', async () => {
    const o = makeOrchestrator({
      agentBehaviour: (orch) => { moveTicket(orch.ticketsDir, 'TKT-001', 'building', 'bobby-plan'); },
    });
    seedTicket(o, { id: 'TKT-001', stage: 'planning' });
    const ws = o.createWorkspace({ ticketId: 'TKT-001', agent: 'plan' });
    await o.runAgent(ws.id);
    await settle();

    const after = o.store.get(ws.id);
    expect(after.runs[0].status).toBe('completed');
    expect(after.status).toBe('awaiting_approval');
  });

  it('does not judge a repo run this way — several are meant to write nothing', async () => {
    // ux, pm and qe report in the log by design. A blanket no_op verdict there
    // would cry wolf on every review, and there is no branch to judge anyway.
    const o = makeOrchestrator();
    const run = o.createRepoRun({ agent: 'ux' });
    await o.runAgent(run.id);
    await settle();

    const after = o.store.get(run.id);
    expect(after.runs[0].status).toBe('completed');
    expect(after.status).toBe('idle');
  });
});
