// test/lib/dashboard/per-stage-model.test.js
//
// Per-stage models, read off the options the orchestrator actually hands the
// executor (BOB-135).
//
// lib/models.js is unit-tested on its own; the risk this suite covers is the
// wiring. `dashboard.model` was one value read once at the launch site, and a
// resolution function that is never called with the right agent key — or is
// called before the executor flavor is known — resolves perfectly and changes
// nothing. So the assertions here are on the launch opts, in the same spirit
// as permissions.test.js: what reaches the CLI is the only thing that counts.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { WorkspaceStore } from '../../../lib/dashboard/state.js';
import { resolveWorkflow } from '../../../lib/workflow.js';
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

/** A real orchestrator whose executor only records the options it was given. */
function makeOrchestrator(config = {}) {
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

  o.launches = [];
  o._runExecutor = (opts) => {
    o.launches.push(opts);
    return { pid: 4321, stop: () => {}, done: Promise.resolve({ exitCode: 0, signal: null }) };
  };
  return o;
}

function seedTicket(o, { id, stage }) {
  fs.writeFileSync(path.join(o.ticketsDir, '.counter'), String(Number(id.split('-')[1]) - 1));
  createTicket(o.ticketsDir, { prefix: 'TKT', title: `Work for ${id}`, author: 'dev', area: '' });
  moveTicket(o.ticketsDir, id, stage, 'test');
  return id;
}

// A fresh ticket id per call. A workspace CLAIMS its ticket for the length of
// the run, and these runs are never let finish — so two calls in one test on
// one id is the claim doing its job, not a bug worth working around.
let nextTicket = 0;

/** The model a run of `agent` on a ticket in `stage` was launched with. */
function modelForStage(config, { agent, stage }) {
  nextTicket += 1;
  const o = makeOrchestrator(config);
  const id = seedTicket(o, { id: `TKT-${String(nextTicket).padStart(3, '0')}`, stage });
  const ws = o.createWorkspace({ ticketId: id, agent });
  o.runAgent(ws.id);
  return o.launches[0].model;
}

beforeEach(() => {
  nextTicket = 0;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-model-'));
  repoRoot = initRepo(path.join(tmp, 'main'));
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe('the stage decides the model', () => {
  it('launches review on the judgment tier and build on the execution tier', () => {
    expect(modelForStage({}, { agent: 'review', stage: 'reviewing' })).toBe('opus');
    expect(modelForStage({}, { agent: 'build', stage: 'building' })).toBe('sonnet');
  });

  // The regression this whole change is about: one value for the whole board.
  it('does not hand every stage the same model', () => {
    const review = modelForStage({}, { agent: 'review', stage: 'reviewing' });
    const build = modelForStage({}, { agent: 'build', stage: 'building' });
    expect(review).not.toBe(build);
  });

  it('lets a project name the model for one stage', () => {
    const config = { models: { build: 'my-build-model' } };
    expect(modelForStage(config, { agent: 'build', stage: 'building' })).toBe('my-build-model');
    // …without disturbing the stages it said nothing about.
    expect(modelForStage(config, { agent: 'review', stage: 'reviewing' })).toBe('opus');
  });

  it('keeps an existing dashboard.model governing every stage', () => {
    const config = { dashboard: { model: 'global-model' } };
    expect(modelForStage(config, { agent: 'review', stage: 'reviewing' })).toBe('global-model');
    expect(modelForStage(config, { agent: 'build', stage: 'building' })).toBe('global-model');
  });
});

describe('tier aliases and the executor flavor', () => {
  // `opus` is a name cursor-agent does not have. Passing it would not degrade
  // the run, it would kill it — so an unconfigured cursor project gets no model
  // flag at all, exactly as it did before per-stage models existed.
  it('withholds the shipped tiers from a CLI that takes full model names', () => {
    for (const executor of ['cursor-agent', 'codex', 'opencode']) {
      const config = { dashboard: { executor } };
      expect(modelForStage(config, { agent: 'review', stage: 'reviewing' })).toBeNull();
    }
  });

  it('still passes a model that project named for itself', () => {
    const config = {
      dashboard: { executor: 'opencode' },
      models: { review: 'anthropic/claude-opus-4-5' },
    };
    expect(modelForStage(config, { agent: 'review', stage: 'reviewing' }))
      .toBe('anthropic/claude-opus-4-5');
  });

  // A custom binary is driven with claude-style flags, so it speaks the same
  // vocabulary — including the aliases.
  it('treats a custom executor binary as claude-compatible', () => {
    const config = { dashboard: { executor: '/opt/bin/my-claude' } };
    expect(modelForStage(config, { agent: 'review', stage: 'reviewing' })).toBe('opus');
  });
});
