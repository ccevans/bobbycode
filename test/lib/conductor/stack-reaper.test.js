import fs from 'fs';
import path from 'path';
import { reapStacks, evaluateStacks, renderStackReap } from '../../../lib/conductor/stack-reaper.js';
import { moveTicket } from '../../../lib/tickets.js';
import { writeClaim } from '../../../lib/conductor/queue.js';
import { makeStudio, seedTickets, psLine } from './helpers.js';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-08T12:00:00Z');
const ago = (h) => new Date(NOW - h * HOUR).toISOString();
const sid = (id) => `${id}-0000-4000-8000-000000000000`;
const bg = (id, name, state, cwd = '/studio') => ({ id, sessionId: sid(id), name, cwd, kind: 'background', startedAt: 1, state });

/**
 * Mock exec. `stacks` maps compose project -> hours since its newest container
 * started; `agents` is the claude list (a function gets the read count). Records
 * every call so tests can assert exactly what ran.
 */
function mockRun({ stacks, agents, failStop = [], dockerDown = false }) {
  const calls = [];
  let reads = 0;
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'claude' && args.join(' ') === 'agents --json --all') {
      reads += 1;
      return JSON.stringify(typeof agents === 'function' ? agents(reads) : agents);
    }
    if (cmd === 'docker' && dockerDown) throw new Error('`docker ps --format json` failed: Cannot connect to the Docker daemon');
    const current = typeof stacks === 'function' ? stacks(reads) : stacks;
    if (cmd === 'docker' && args[0] === 'ps') {
      return Object.keys(current).map((p) => psLine(`${p}-c`, p)).join('\n');
    }
    if (cmd === 'docker' && args[0] === 'inspect') return Object.values(current).map(h => ago(h)).join('\n');
    if (cmd === 'docker' && args[0] === 'compose') {
      if (failStop.includes(args[2])) throw new Error(`\`docker compose -p ${args[2]} stop\` failed: boom`);
      return '';
    }
    throw new Error(`unexpected exec ${cmd} ${args.join(' ')}`);
  };
  return { run, calls, compose: () => calls.filter(c => c[0] === 'docker' && c[1] === 'compose') };
}

describe('conductor stack reaper', () => {
  let root;
  let hookDir;
  let config;
  beforeEach(() => {
    ({ root, hookDir } = makeStudio());
    seedTickets(root, 'alpha', [{ title: 'one' }, { title: 'two' }, { title: 'three' }, { title: 'four' }]);
    config = { projects: ['alpha'], hook_state_dir: hookDir, governor: { min_free_ram_mb: 1, max_docker_stacks: 9 }, reaper: { stack_idle_hours: 2 }, claims: { ttl_minutes: 30 } };
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  const stage = (id, to) => moveTicket(path.join(root, '.bobby', 'alpha', 'tickets'), id, to, 'test');

  const go = (mock, opts = {}) => reapStacks({ studioRoot: root, config, run: mock.run, now: NOW, ...opts });

  test('dry run lists the idle stack and runs only read probes', () => {
    const m = mockRun({ stacks: { 'al-1api': 5, 'al-2api': 5 }, agents: [bg('aaaa1111', 'AL-002 lane', 'working')] });
    const report = go(m);
    expect(report.candidates.map(c => c.project)).toEqual(['al-1api']);
    expect(report.results).toEqual([]);
    expect(m.compose()).toEqual([]);
    for (const c of m.calls) {
      expect(['claude agents --json --all', 'docker ps --format json'].includes(c.join(' ')) || c[1] === 'inspect').toBe(true);
    }
    const text = renderStackReap(report, { apply: false, idleHours: 2 });
    expect(text).toMatch(/Dry run: 1 stack\(s\) would be stopped/);
    expect(text).toContain('would stop  al-1api  AL-001');
  });

  test('--apply runs exactly `docker compose -p <project> stop` per idle stack', () => {
    const m = mockRun({ stacks: { 'al-1api': 5, 'al-3api': 9 }, agents: [] });
    const report = go(m, { apply: true });
    expect(m.compose()).toEqual([
      ['docker', 'compose', '-p', 'al-1api', 'stop'],
      ['docker', 'compose', '-p', 'al-3api', 'stop'],
    ]);
    expect(report.results.map(r => r.outcome)).toEqual(['stopped', 'stopped']);
    expect(m.calls.some(c => c.some(a => /^(down|rm|prune|volume|-v|--volumes)$/.test(a)))).toBe(false);
  });

  test('a working lane keeps its stack; a lane waiting on CC keeps its stack; an unknown-state session keeps it', () => {
    const m = mockRun({
      stacks: { 'al-1api': 8, 'al-2api': 8, 'al-3api': 8 },
      agents: [bg('aaaa1111', 'AL-001 lane', 'working'), bg('bbbb2222', 'x', 'blocked', '/studio/worktrees/AL-002'), bg('cccc3333', 'AL-003 odd', 'stopped')],
    });
    const report = go(m, { apply: true });
    expect(report.candidates).toEqual([]);
    expect(m.compose()).toEqual([]);
    expect(report.kept.map(k => k.why)).toEqual([
      'AL-001 has a working lane', 'AL-002 lane is waiting on CC', 'AL-003 has a session in an unknown state',
    ]);
  });

  test('a done lane does not keep the stack', () => {
    const m = mockRun({ stacks: { 'al-1api': 3 }, agents: [bg('aaaa1111', 'AL-001 lane', 'done')] });
    expect(go(m).candidates.map(c => c.project)).toEqual(['al-1api']);
  });

  test('a stack idle for less than reaper.stack_idle_hours is kept; exactly the limit is stopped', () => {
    const m = mockRun({ stacks: { 'al-1api': 1.9, 'al-2api': 2 }, agents: [] });
    const report = go(m);
    expect(report.candidates.map(c => c.project)).toEqual(['al-2api']);
    expect(report.kept).toEqual([expect.objectContaining({ project: 'al-1api', why: 'idle 1.9h < 2h' })]);
  });

  test('the idle limit comes from the config key', () => {
    const m = mockRun({ stacks: { 'al-1api': 5 }, agents: [] });
    config.reaper.stack_idle_hours = 6;
    expect(go(m).candidates).toEqual([]);
  });

  test.each(['reviewing', 'testing', 'shipping'])('a stack whose ticket is %s is kept however old its containers are', (to) => {
    stage('AL-001', to);
    const m = mockRun({ stacks: { 'al-1api': 40, 'al-2api': 40 }, agents: [bg('aaaa1111', 'AL-001 lane', 'done')] });
    const report = go(m, { apply: true });
    expect(m.compose().map(c => c[3])).toEqual(['al-2api']);
    expect(report.kept).toEqual([expect.objectContaining({ project: 'al-1api', why: `AL-001 is ${to}, mid-pipeline` })]);
  });

  test('stages before the test lane (building, planning) do not protect an old stack', () => {
    stage('AL-001', 'building');
    stage('AL-002', 'planning');
    const m = mockRun({ stacks: { 'al-1api': 5, 'al-2api': 5 }, agents: [] });
    expect(go(m).candidates.map(c => c.project)).toEqual(['al-1api', 'al-2api']);
  });

  test('an unexpired `conductor next` claim keeps the stack; an expired one does not', () => {
    writeClaim(root, 'AL-001', { lane: 'lane a', now: NOW - 29 * 60_000 });
    writeClaim(root, 'AL-002', { lane: 'lane b', now: NOW - 31 * 60_000 });
    const m = mockRun({ stacks: { 'al-1api': 9, 'al-2api': 9 }, agents: [] });
    const report = go(m, { apply: true });
    expect(m.compose().map(c => c[3])).toEqual(['al-2api']);
    expect(report.kept).toEqual([expect.objectContaining({ project: 'al-1api', why: 'AL-001 has a live lane claim' })]);
  });

  test('a ticket that moves into the pipeline between the plan and the stop keeps its stack', () => {
    const m = mockRun({ stacks: { 'al-1api': 5 }, agents: (reads) => { if (reads > 1) stage('AL-001', 'testing'); return []; } });
    const report = go(m, { apply: true });
    expect(report.candidates.map(c => c.project)).toEqual(['al-1api']);
    expect(m.compose()).toEqual([]);
    expect(report.results).toEqual([expect.objectContaining({ outcome: 'skipped' })]);
  });

  test('a malformed claims file is an error, never "no claims"', () => {
    fs.mkdirSync(path.join(root, '.bobby', 'conductor'), { recursive: true });
    fs.writeFileSync(path.join(root, '.bobby', 'conductor', 'claims.yml'), 'claims: [1]\n');
    const m = mockRun({ stacks: { 'al-1api': 9 }, agents: [] });
    expect(() => go(m, { apply: true })).toThrow(/claims/);
    expect(m.compose()).toEqual([]);
  });

  test('unmapped stacks, the shared main stack and promote/ship stacks are never stopped', () => {
    const m = mockRun({
      stacks: { 'listrobin_api': 99, 'promote-api-mainapi': 99, 'al-99api': 99, 'ship-1api': 99, 'promote-1api': 99 },
      agents: [],
    });
    const report = go(m, { apply: true });
    expect(report.candidates).toEqual([]);
    expect(m.compose()).toEqual([]);
    expect(report.kept.map(k => k.why).sort()).toEqual(['promote/ship stack', 'promote/ship stack', 'promote/ship stack', 'unmapped', 'unmapped']);
  });

  test('a lane that turns working between the plan and the stop keeps its stack', () => {
    const m = mockRun({
      stacks: { 'al-1api': 5, 'al-2api': 5 },
      agents: (reads) => (reads === 1 ? [] : [bg('aaaa1111', 'AL-001 lane', 'working'), bg('bbbb2222', 'AL-002 lane', 'working')]),
    });
    const report = go(m, { apply: true });
    expect(m.compose()).toEqual([]);
    expect(report.results.map(r => r.outcome)).toEqual(['skipped', 'skipped']);
  });

  test('a stack that is already gone at stop time is skipped, not stopped', () => {
    const m = mockRun({ stacks: (reads) => (reads === 1 ? { 'al-1api': 5 } : {}), agents: [] });
    const report = go(m, { apply: true });
    expect(m.compose()).toEqual([]);
    expect(report.results).toEqual([expect.objectContaining({ outcome: 'skipped', detail: 'no longer running' })]);
  });

  test('a failing stop is reported, the next stack is still tried and failed counts', () => {
    const m = mockRun({ stacks: { 'al-1api': 5, 'al-2api': 5 }, agents: [], failStop: ['al-1api'] });
    const report = go(m, { apply: true });
    expect(m.compose().map(c => c[3])).toEqual(['al-1api', 'al-2api']);
    expect(report.failed).toBe(1);
    expect(report.results.map(r => r.outcome)).toEqual(['failed', 'stopped']);
  });

  test('a failed re-read does not stop blind', () => {
    const m = mockRun({ stacks: { 'al-1api': 5 }, agents: (reads) => { if (reads > 1) throw new Error('claude is down'); return []; } });
    const report = go(m, { apply: true });
    expect(m.compose()).toEqual([]);
    expect(report.failed).toBe(1);
  });

  test('docker down throws the docker error and stops nothing', () => {
    const m = mockRun({ stacks: {}, agents: [], dockerDown: true });
    expect(() => go(m, { apply: true })).toThrow(/Cannot connect to the Docker daemon/);
    expect(m.compose()).toEqual([]);
  });

  test('evaluateStacks is pure: no lane and idle past the limit is a candidate', () => {
    const base = { containers: 2, idle_ms: 3 * HOUR, ticket: 'AL-001', unmapped: false };
    const out = evaluateStacks([{ project: 'al-1api', lane: 'none', ...base }, { project: 'x', lane: 'none', ...base, unmapped: true }], { idleHours: 2, claims: {}, claimTtlMinutes: 30, now: NOW });
    expect(out.candidates.map(c => c.project)).toEqual(['al-1api']);
    expect(out.kept.map(k => k.why)).toEqual(['unmapped']);
  });
});
