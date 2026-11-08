// End-to-end: `bobby conductor next|queue` in a temp studio, with fake claude, vm_stat and
// sysctl on PATH so no real session list or machine state is touched.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { listTickets } from '../../lib/tickets.js';
import { makeStudio, writeConductorYml, validYml, seedTickets, vmStatText } from '../lib/conductor/helpers.js';

const bobby = path.resolve('bin/bobby.js');

describe('bobby conductor next / queue', () => {
  let root;
  let hookDir;
  let fakeBin;
  let agentsFile;
  let vmFile;
  let ids;

  const bg = (id, name, state) => ({ id, sessionId: `${id}-0000-4000-8000-000000000000`, name, cwd: '/studio', kind: 'background', startedAt: 1, state, pid: 5 });
  const setAgents = (list) => fs.writeFileSync(agentsFile, JSON.stringify(list));
  const setQueue = (list) => fs.writeFileSync(path.join(root, '.bobby', 'conductor-queue.yml'), list.length ? `queue:\n${list.map(i => `  - ${i}`).join('\n')}\n` : 'queue: []\n');
  const bobbyIn = (args, { cpu = 'Apple M4 Max' } = {}) => {
    const env = { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, FAKE_AGENTS_FILE: agentsFile, FAKE_VM_FILE: vmFile, FAKE_CPU: cpu, HOME: root };
    delete env.BOBBY_PROJECT;
    return spawnSync('node', [bobby, 'conductor', ...args], { cwd: root, encoding: 'utf8', env });
  };

  beforeEach(() => {
    ({ root, hookDir } = makeStudio());
    fakeBin = path.join(root, 'fakebin');
    fs.mkdirSync(fakeBin);
    agentsFile = path.join(root, 'agents.json');
    vmFile = path.join(root, 'vm.txt');
    setAgents([]);
    fs.writeFileSync(vmFile, vmStatText({ freeMb: 9000, specMb: 0, purgeMb: 0, inactiveMb: 0, fileMb: 0 }));
    fs.writeFileSync(path.join(fakeBin, 'claude'), '#!/bin/sh\n[ "$1 $2 $3" = "agents --json --all" ] || exit 2\ncat "$FAKE_AGENTS_FILE"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(fakeBin, 'vm_stat'), '#!/bin/sh\ncat "$FAKE_VM_FILE"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(fakeBin, 'sysctl'), '#!/bin/sh\ncase "$*" in\n  "-n hw.memsize") echo 51539607552 ;;\n  "-n machdep.cpu.brand_string") echo "$FAKE_CPU" ;;\n  *) exit 2 ;;\nesac\n', { mode: 0o755 });
    writeConductorYml(root, validYml(hookDir));
    seedTickets(root, 'alpha', [{ title: 'ship me', stage: 'shipping' }, { title: 'plan me', stage: 'planning' }]);
    ids = {};
    for (const t of listTickets(path.join(root, '.bobby', 'alpha', 'tickets'))) ids[t.title] = t.id;
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('an empty queue prints "queue empty" and exits 0', () => {
    setQueue([]);
    const r = bobbyIn(['next']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('queue empty');
    expect(bobbyIn(['queue']).stdout.trim()).toBe('queue empty');
  });

  test('a missing queue file exits non-zero naming the file', () => {
    for (const cmd of ['next', 'queue']) {
      const r = bobbyIn([cmd]);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/conductor-queue\.yml does not exist/);
    }
  });

  test('a conductor.yml without wip.max_lanes is an error naming the key', () => {
    setQueue([ids['ship me']]);
    writeConductorYml(root, validYml(hookDir).replace(/wip:\n {2}max_lanes: 6\n/, ''));
    const r = bobbyIn(['next']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/key "wip\.max_lanes" is missing/);
  });

  test('next prints the finish-first ticket and its run command, then the next one', () => {
    setQueue([ids['plan me'], ids['ship me']]);
    const first = bobbyIn(['next', '--lane', 'lane A']);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain(`${ids['ship me']}  shipping  (queue #2, project alpha)`);
    expect(first.stdout).toContain(`BOBBY_PROJECT=alpha bobby run ship ${ids['ship me']}`);
    const second = bobbyIn(['next']);
    expect(second.stdout).toContain(`${ids['plan me']}  planning`);
    const claims = fs.readFileSync(path.join(root, '.bobby', 'conductor', 'claims.yml'), 'utf8');
    expect(claims).toContain('lane: lane A');
  });

  test('next refuses with the count and the cap at six live lanes (exit 1)', () => {
    setQueue([ids['ship me']]);
    setAgents(Array.from({ length: 6 }, (_, i) => bg(`a${i}`, `lane ${i}`, 'working')));
    const r = bobbyIn(['next']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/6 live lane session\(s\).*>= wip\.max_lanes 6/);
  });

  test('next refuses with the governor reason when RAM is short (exit 1)', () => {
    setQueue([ids['ship me']]);
    fs.writeFileSync(vmFile, vmStatText({ freeMb: 100, specMb: 0, purgeMb: 0, inactiveMb: 0, fileMb: 0 }));
    const r = bobbyIn(['next']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/free RAM 100 MB < min 4096 MB/);
  });

  test('next refuses on a host that is not the M4; queue still reads', () => {
    setQueue([ids['ship me']]);
    expect(bobbyIn(['next'], { cpu: 'Intel(R) Core(TM) i7' }).stderr).toMatch(/M4 only/);
    expect(bobbyIn(['queue'], { cpu: 'Intel(R) Core(TM) i7' }).status).toBe(0);
    expect(fs.existsSync(path.join(root, '.bobby', 'conductor', 'claims.yml'))).toBe(false);
  });

  test('queue prints each ticket with its stage and lane', () => {
    setQueue([ids['ship me'], ids['plan me']]);
    setAgents([bg('a1', `${ids['plan me']} planning`, 'blocked')]);
    const r = bobbyIn(['queue']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`${ids['ship me']}  shipping  (no lane)`);
    expect(r.stdout).toContain(`${ids['plan me']}  planning  (lane waiting_on_cc)`);
  });

  test('an unknown ticket ID in the queue exits non-zero', () => {
    setQueue(['ZZ-9']);
    const r = bobbyIn(['queue']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/ZZ-9, which is not on any conductor board/);
  });
});
