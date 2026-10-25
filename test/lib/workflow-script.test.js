// test/lib/workflow-script.test.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import YAML from 'yaml';
import {
  resolveOrchestration, buildWorkflowScript, writeWorkflowScripts, assertWorkflowScriptCurrent,
  buildWorkflowArgs, formatWorkflowInvocation, ticketSnapshot,
} from '../../lib/workflow-script.js';
import { resolveWorkflow, listWorkflows, BUILT_IN_WORKFLOWS } from '../../lib/workflow.js';
import { scaffoldProject } from '../../commands/init.js';

const AsyncFunction = (async () => {}).constructor;

// Runs a generated script the way the Workflow tool does: a function body with
// agent/phase/log/args in scope. Compiling it here is the "plain JS" check.
function runScript(src, args, agentImpl) {
  const body = src.replace(/^export const meta =/m, 'const meta =');
  const calls = [], logs = [], phases = [];
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', 'workflow', body);
  const agent = async (prompt, opts) => { calls.push({ prompt, opts }); return agentImpl(prompt, opts, calls.length); };
  return fn(agent, null, null, t => phases.push(t), m => logs.push(m), args, { total: null }, null)
    .then(result => ({ result, calls, logs, phases }));
}

const scriptFor = (name, config = {}) => buildWorkflowScript(name, resolveWorkflow(config, name));
const base = (over = {}) => ({
  mode: 'tickets', tickets: [{ id: 'TKT-1', stage: 'planning' }], maxRetries: 3, maxIterations: 20,
  readFirst: [], planReadFirst: [], finalize: null, commands: { test: null, lint: null }, hasServices: false,
  ...over,
});
const idOf = (opts) => opts.label.split(' ')[0];
const NEXT = { planning: 'building', building: 'reviewing', reviewing: 'testing', testing: 'shipping' };
const res = (id, stage, verdict = 'advanced', reason = 'ok') => ({ ticket: id, stage, verdict, reason });

// Mock agents that advance one stage per call; `override(id, agentType, n)` may return a result.
function sim(override = () => undefined) {
  const seen = {};
  return async (prompt, opts) => {
    if (!opts.agentType) return override(idOf(opts), 'extra', 0) || res(idOf(opts), 'shipping', 'passed');
    const id = idOf(opts);
    const key = `${id}:${opts.agentType}`;
    seen[key] = (seen[key] || 0) + 1;
    const o = override(id, opts.agentType, seen[key]);
    if (o !== undefined) return o;
    const stageOf = { 'bobby-plan': 'planning', 'bobby-build': 'building', 'bobby-review': 'reviewing', 'bobby-test': 'testing' }[opts.agentType];
    return res(id, NEXT[stageOf]);
  };
}

describe('resolveOrchestration', () => {
  test('unset is prompt; workflow is valid on claude-code', () => {
    expect(resolveOrchestration({})).toBe('prompt');
    expect(resolveOrchestration({ orchestration: 'workflow' })).toBe('workflow');
  });
  test('unknown value and non-claude target throw', () => {
    expect(() => resolveOrchestration({ orchestration: 'bogus' })).toThrow(/Unknown orchestration 'bogus'.*Valid: prompt, workflow/);
    expect(() => resolveOrchestration({ orchestration: 'workflow', target: 'cursor' })).toThrow(/needs target claude-code \(target: cursor\)/);
  });
});

describe('generated script (AC1)', () => {
  test('every built-in is a pure-literal meta plus plain JS, deterministic', async () => {
    for (const name of Object.keys(BUILT_IN_WORKFLOWS)) {
      const src = scriptFor(name);
      expect(src.startsWith('export const meta = ')).toBe(true);
      const meta = JSON.parse(src.match(/^export const meta = (\{[\s\S]*?\n\});/)[1]);
      expect(meta.name).toBe(`bobby-${name}`);
      expect(meta.description.length).toBeGreaterThan(0);
      for (const p of meta.phases) expect(['Plan', 'Execute', 'Finalize']).toContain(p.title);
      for (const banned of ['Date.now', 'Math.random', 'new Date(', ': string', 'interface ', 'require(']) {
        expect(src).not.toContain(banned);
      }
      expect(scriptFor(name)).toBe(src);
      // Compiles as plain JS: bad args reach the runtime's own validation error.
      await expect(runScript(src, undefined, async () => null)).rejects.toThrow(`bobby-${name}:`);
    }
  });

  test('a name that cannot be a filename throws', () => {
    expect(() => buildWorkflowScript('my flow!', [])).toThrow(/can't be a script filename/);
  });
});

describe('writeWorkflowScripts', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-wfs-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true }); });
  const listing = () => fs.readdirSync(path.join(dir, '.claude', 'workflows')).sort();

  test('writes one script per built-in and user workflow, prunes stale bobby-* and keeps user files', () => {
    const config = { orchestration: 'workflow', workflows: { fast: ['build', 'test'] } };
    writeWorkflowScripts(dir, config);
    fs.writeFileSync(path.join(dir, '.claude', 'workflows', 'my-flow.js'), '// mine');
    expect(listing()).toEqual([...listWorkflows(config).map(n => `bobby-${n}.js`), 'my-flow.js'].sort());

    const { pruned } = writeWorkflowScripts(dir, { orchestration: 'workflow' });
    expect(pruned).toEqual(['.claude/workflows/bobby-fast.js']);
    expect(listing()).not.toContain('bobby-fast.js');

    writeWorkflowScripts(dir, {});
    expect(listing()).toEqual(['my-flow.js']);
  });

  test('bad config writes nothing', () => {
    expect(() => writeWorkflowScripts(dir, { orchestration: 'workflows' })).toThrow(/Unknown orchestration 'workflows'/);
    expect(() => writeWorkflowScripts(dir, { orchestration: 'workflow', workflows: { 'my flow!': ['build'] } })).toThrow(/can't be a script filename/);
    expect(fs.existsSync(path.join(dir, '.claude', 'workflows'))).toBe(false);
  });

  test('assertWorkflowScriptCurrent names the fix for missing and stale scripts', () => {
    const config = { orchestration: 'workflow' };
    expect(() => assertWorkflowScriptCurrent(dir, config, 'default')).toThrow(/not found\. Run `bobby init --refresh`/);
    writeWorkflowScripts(dir, config);
    expect(() => assertWorkflowScriptCurrent(dir, config, 'default')).not.toThrow();
    expect(() => assertWorkflowScriptCurrent(dir, { ...config, workflows: { default: ['build', 'review'] } }, 'default'))
      .toThrow(/out of date/);
  });

  test('init --refresh writes the scripts and keeps orchestration and workflows in .bobbyrc.yml', () => {
    scaffoldProject(dir, {
      project: 't', stack: 'generic', target: 'claude-code', health_checks: [], areas: [], commands: {},
      tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    });
    execSync('git init -q && git add -A && git -c user.email=a@b.c -c user.name=t commit -qm init', { cwd: dir });
    const cfgPath = path.join(dir, '.bobbyrc.yml');
    const cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8'));
    fs.writeFileSync(cfgPath, YAML.stringify({ ...cfg, orchestration: 'workflow', workflows: { fast: ['build', 'test'] } }));
    execSync(`node ${path.resolve('bin/bobby.js')} init --refresh`, { cwd: dir, encoding: 'utf8' });
    expect(listing()).toEqual(['bobby-default.js', 'bobby-define.js', 'bobby-design.js', 'bobby-fast.js', 'bobby-freewill.js', 'bobby-quick.js', 'bobby-secure.js']);
    const after = YAML.parse(fs.readFileSync(cfgPath, 'utf8'));
    expect(after.orchestration).toBe('workflow');
    expect(after.workflows).toEqual({ fast: ['build', 'test'] });
  });
});

describe('runtime: stage loop in code (AC2)', () => {
  const def = scriptFor('default');

  test('happy path: each stage runs as its own agent type with the result schema', async () => {
    const { result, calls } = await runScript(def, base(), sim());
    expect(calls.map(c => c.opts.agentType)).toEqual(['bobby-plan', 'bobby-build', 'bobby-review', 'bobby-test']);
    for (const c of calls) {
      expect(c.opts.schema.type).toBe('object');
      expect(c.opts.schema.required).toEqual(['ticket', 'stage', 'verdict', 'reason']);
    }
    expect(calls[1].prompt).toContain('bobby ticket move TKT-1 reviewing');
    expect(result.tickets[0].status).toBe('complete');
    expect(result.iterations).toBe(4);
  });

  test('debug runs once on the 2nd rejection, before the 3rd build', async () => {
    const { result, calls } = await runScript(def, base({ tickets: [{ id: 'TKT-1', stage: 'building' }] }),
      sim((id, agent, n) => (agent === 'bobby-review' && n <= 2 ? res(id, 'building', 'rejected') : undefined)));
    expect(calls.map(c => c.opts.agentType)).toEqual(
      ['bobby-build', 'bobby-review', 'bobby-build', 'bobby-review', 'bobby-debug', 'bobby-build', 'bobby-review', 'bobby-test']);
    expect(result.tickets[0]).toMatchObject({ status: 'complete', rejections: 2 });
  });

  test('retry cap stops the ticket after 4 builds, with a log', async () => {
    const { result, calls, logs } = await runScript(def, base({ tickets: [{ id: 'TKT-1', stage: 'building' }] }),
      sim((id, agent) => (agent === 'bobby-review' ? res(id, 'building', 'rejected') : undefined)));
    const count = t => calls.filter(c => c.opts.agentType === t).length;
    expect(count('bobby-build')).toBe(4);
    expect(count('bobby-debug')).toBe(1);
    expect(result.tickets[0].status).toBe('max-retries');
    expect(logs.some(l => l.includes('TKT-1') && l.includes('retry cap of 3'))).toBe(true);
  });

  test('max-iterations backstop stops the whole run', async () => {
    const { result, calls, logs } = await runScript(def,
      base({ tickets: [{ id: 'A', stage: 'planning' }, { id: 'B', stage: 'planning' }], maxIterations: 3 }), sim());
    expect(calls).toHaveLength(3);
    expect(result.tickets.map(t => t.status)).toEqual(['iteration-cap', 'not-started']);
    expect(logs.some(l => l.includes('3/3'))).toBe(true);
  });

  test('preflight: done and blocked cost no agent; backlog is accepted by the first agent', async () => {
    const { result, calls, logs } = await runScript(def, base({
      tickets: [
        { id: 'A', stage: 'done' },
        { id: 'B', stage: 'reviewing', blocked: true, blockedReason: 'waiting on API key' },
        { id: 'C', stage: 'backlog' },
      ],
    }), sim());
    expect(result.tickets[0].status).toBe('done-on-entry');
    expect(result.tickets[1]).toMatchObject({ status: 'blocked', reason: 'waiting on API key' });
    expect(logs.some(l => l.includes('waiting on API key'))).toBe(true);
    expect(calls[0].opts.agentType).toBe('bobby-plan');
    expect(calls[0].prompt).toContain('bobby ticket move C planning');
    expect(calls.every(c => idOf(c.opts) === 'C')).toBe(true);
  });

  test('a stale snapshot is corrected by the agent mismatch report, not counted as a rejection', async () => {
    const { result, calls, logs } = await runScript(def, base(),
      sim((id, agent, n) => (agent === 'bobby-plan' && n === 1 ? res(id, 'reviewing', 'mismatch') : undefined)));
    expect(calls[1].opts.agentType).toBe('bobby-review');
    expect(logs.some(l => l.includes('reviewing'))).toBe(true);
    expect(result.tickets[0].rejections).toBe(0);
  });

  test('a dead agent stops that ticket with no substitute; the next ticket still runs', async () => {
    const { result, calls } = await runScript(def,
      base({ tickets: [{ id: 'A', stage: 'planning' }, { id: 'B', stage: 'planning' }] }),
      sim((id, agent, n) => (id === 'A' && n === 1 ? null : undefined)));
    expect(result.tickets.map(t => t.status)).toEqual(['agent-failed', 'complete']);
    expect(calls.filter(c => idOf(c.opts) === 'A')).toHaveLength(1);
  });

  test('stalled and outside-workflow tickets stop with a log', async () => {
    const stalled = await runScript(def, base(), async (p, o) => res(idOf(o), 'planning', 'incomplete', 'no plan written'));
    expect(stalled.result.tickets[0].status).toBe('stalled');
    expect(stalled.calls).toHaveLength(1);

    const outside = await runScript(def, base({ tickets: [{ id: 'A', stage: 'security' }] }), sim());
    expect(outside.result.tickets[0].status).toBe('outside-workflow');
    expect(outside.calls).toHaveLength(0);
    expect(outside.logs.some(l => l.includes('security'))).toBe(true);
  });

  test.each([
    ['undefined', undefined],
    ['bad mode', base({ mode: 'x' })],
    ['no tickets', base({ tickets: [] })],
    ['zero iterations', base({ maxIterations: 0 })],
  ])('invalid args (%s) throw before any agent runs', async (_n, bad) => {
    const calls = [];
    await expect(runScript(def, bad, async () => { calls.push(1); return null; })).rejects.toThrow(/^bobby-default:/);
    expect(calls).toHaveLength(0);
  });

  test('feature mode plans every child first, checks integration, finalizes only when all are clean', async () => {
    const args = base({
      mode: 'feature', finalize: { kind: 'epic', id: 'EP-1' }, commands: { test: 'npm test', lint: null },
      readFirst: ['/b/EP-1/feature-plan.md'], planReadFirst: ['/b/C1/plan.md', '/b/C2/plan.md'],
      tickets: [{ id: 'C1', stage: 'backlog' }, { id: 'C2', stage: 'planning' }],
    });
    let c2Integrations = 0;
    const impl = sim((id, agent) => {
      if (agent !== 'extra') return undefined;
      if (id === 'C2' && ++c2Integrations === 1) return res(id, 'building', 'failed', 'suite red');
      return res(id, 'shipping', 'passed');
    });
    const { result, calls } = await runScript(def, args, impl);
    const types = calls.map(c => c.opts.agentType);
    expect(types.indexOf('bobby-build')).toBeGreaterThan(types.lastIndexOf('bobby-plan'));
    expect(calls[0].prompt).toContain('/b/C1/plan.md');
    expect(calls[0].prompt).toContain('/b/EP-1/feature-plan.md');
    expect(calls.filter(c => c.opts.agentType === 'bobby-build' && idOf(c.opts) === 'C2')).toHaveLength(2);
    expect(result.tickets.find(t => t.id === 'C2').rejections).toBe(1);
    const fin = calls[calls.length - 1];
    expect(fin.opts.label).toBe('finalize');
    expect(fin.prompt).toContain('npm test');
    expect(fin.prompt).toContain('bobby ticket move EP-1 ship');
    expect(result.finalize.verdict).toBe('passed');

    const stuck = await runScript(def, args, sim((id, agent) => {
      if (id === 'C2' && agent === 'bobby-review') return res(id, 'building', 'rejected');
      if (agent === 'extra') return res(id, 'shipping', 'passed');
      return undefined;
    }));
    expect(stuck.result.tickets.find(t => t.id === 'C2').status).toBe('max-retries');
    expect(stuck.calls.some(c => c.opts.label === 'finalize')).toBe(false);
    expect(stuck.result.finalize).toBe('skipped');
    expect(stuck.logs.some(l => l.includes('Finalize skipped'))).toBe(true);
  });

  test('sprint finalize closes the sprint; define ends at planning without a plan agent', async () => {
    const sprint = await runScript(def, base({
      mode: 'sprint', finalize: { kind: 'sprint', id: 'SPR-1' }, tickets: [{ id: 'A', stage: 'testing' }],
    }), sim());
    expect(sprint.calls[sprint.calls.length - 1].prompt).toContain('bobby sprint status SPR-1 done');

    const define = await runScript(scriptFor('define'), base({ tickets: [{ id: 'EP-1', stage: 'define-blueprint' }] }),
      async (p, o) => res(idOf(o), 'planning'));
    expect(define.result.tickets[0]).toMatchObject({ status: 'complete', stage: 'planning' });
    expect(define.calls.map(c => c.opts.agentType)).toEqual(['bobby-define-blueprint']);
  });
});

describe('invocation helpers', () => {
  test('buildWorkflowArgs defaults match the prose prompts and stay JSON-safe', () => {
    const wf = resolveWorkflow({}, 'default');
    const tickets = [{ id: 'A', stage: 'backlog' }, { id: 'B', stage: 'building', blocked: true, blockedReason: 'x' }];
    expect(buildWorkflowArgs({ mode: 'tickets', tickets, workflow: wf }).maxIterations).toBe(20);
    expect(buildWorkflowArgs({ mode: 'feature', tickets, workflow: wf }).maxIterations).toBe(2 * 4 * 2);
    expect(buildWorkflowArgs({ mode: 'sprint', tickets, workflow: wf }).maxIterations).toBe(16);
    expect(buildWorkflowArgs({ mode: 'sprint', tickets: [tickets[0]], workflow: [wf[0]] }).maxIterations).toBe(10);
    const a = buildWorkflowArgs({ mode: 'tickets', tickets, workflow: wf, commands: { test: 'npm test' } });
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.tickets[1]).toEqual({ id: 'B', stage: 'building', blocked: true, blockedReason: 'x' });
    expect(a.commands).toEqual({ test: 'npm test', lint: null });
  });

  test('ticketSnapshot and formatWorkflowInvocation', () => {
    expect(ticketSnapshot({ id: 'T', stage: 'building', blocked: true, blocked_reason: 'r' }))
      .toEqual({ id: 'T', stage: 'building', blocked: true, blockedReason: 'r' });
    const out = formatWorkflowInvocation({ name: 'default', args: { mode: 'tickets' }, branchGuard: 'guard' });
    expect(out).toContain('**bobby-default**');
    expect(out).toContain('"mode": "tickets"');
    expect(out).toContain('resumeFromRunId');
    expect(out).toContain('.claude/workflows/bobby-default.js');
  });
});
