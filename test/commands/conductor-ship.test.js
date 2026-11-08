// End-to-end: `bobby conductor ship claim|release` and the status SHIP LANES section in a temp studio, with fake claude, vm_stat and
// sysctl on PATH so no real session list or machine state is touched.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createTicket, moveTicket } from '../../lib/tickets.js';
import { makeStudio, writeConductorYml, validYml, vmStatText } from '../lib/conductor/helpers.js';

const bobby = path.resolve('bin/bobby.js');

describe('bobby conductor ship / status SHIP LANES', () => {
  let root;
  let hookDir;
  let fakeBin;
  let agentsFile;
  let vmFile;
  let shipId;

  const bg = (id, name, state) => ({ id, sessionId: `${id}-0000-4000-8000-000000000000`, name, cwd: '/studio', kind: 'background', startedAt: 1, state, pid: 5 });
  const setAgents = (list) => fs.writeFileSync(agentsFile, JSON.stringify(list));
  const bobbyIn = (args, { cpu = 'Apple M4 Max', session } = {}) => {
    const env = { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, FAKE_AGENTS_FILE: agentsFile, FAKE_VM_FILE: vmFile, FAKE_CPU: cpu, HOME: root, ...(session ? { CLAUDE_CODE_SESSION_ID: `${session}-0000-4000-8000-000000000000` } : {}) };
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
    const dir = path.join(root, '.bobby', 'alpha', 'tickets');
    ({ id: shipId } = createTicket(dir, { prefix: 'AL', title: 'ship me', repos: ['api'] }));
    moveTicket(dir, shipId, 'shipping', 'test');
    fs.writeFileSync(path.join(root, '.bobby', 'conductor-queue.yml'), 'queue: []\n');
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('claim prints the batch, a second session is refused with exit 1, release frees it', () => {
    setAgents([bg('aaaa1111', 'lane a', 'working'), bg('bbbb2222', 'lane b', 'working')]);
    const ok = bobbyIn(['ship', 'claim', 'api'], { session: 'aaaa1111' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(new RegExp(`claimed by lane a[\\s\\S]*1\\. ${shipId}  ship me[\\s\\S]*BOBBY_PROJECT=alpha bobby run ship ${shipId}`));
    const second = bobbyIn(['ship', 'claim', 'api'], { session: 'bbbb2222' });
    expect(second.status).toBe(1);
    expect(second.stderr).toMatch(/held by lane a .*working/);
    const refused = bobbyIn(['ship', 'release', 'api'], { session: 'bbbb2222' });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/--force/);
    expect(bobbyIn(['ship', 'release', 'api'], { session: 'aaaa1111' }).stdout).toMatch(/Released ship lane api/);
    expect(bobbyIn(['ship', 'claim', 'api'], { session: 'bbbb2222' }).status).toBe(0);
  });

  test('a stale lock exits 1 naming the holder; --force release reports the override; unknown repo exits 1', () => {
    setAgents([bg('aaaa1111', 'lane a', 'working'), bg('bbbb2222', 'lane b', 'working')]);
    expect(bobbyIn(['ship', 'claim', 'api'], { session: 'aaaa1111' }).status).toBe(0);
    setAgents([bg('bbbb2222', 'lane b', 'working')]);
    const stale = bobbyIn(['ship', 'claim', 'api'], { session: 'bbbb2222' });
    expect(stale.status).toBe(1);
    expect(stale.stderr).toMatch(/stale lock held by lane a/);
    const forced = bobbyIn(['ship', 'release', 'api', '--force'], { session: 'bbbb2222' });
    expect(forced.status).toBe(0);
    expect(forced.stdout).toMatch(/overrode: held by lane a.*stale/);
    const unknown = bobbyIn(['ship', 'claim', 'nope'], { session: 'bbbb2222' });
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toMatch(/Unknown repo "nope"/);
  });

  test('ship refuses to run on a machine that is not the M4', () => {
    setAgents([bg('aaaa1111', 'lane a', 'working')]);
    const r = bobbyIn(['ship', 'claim', 'api'], { session: 'aaaa1111', cpu: 'Intel Core i7' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/M4 only/);
  });

  test('status has a SHIP LANES section and a ship_lanes key (holder, stale flag, batch size); it needs no queue file', () => {
    setAgents([bg('aaaa1111', 'lane a', 'working')]);
    fs.rmSync(path.join(root, '.bobby', 'conductor-queue.yml'));
    expect(bobbyIn(['status']).stdout).toMatch(/SHIP LANES \(1\)\s+api\s+free\s+1 ready to ship/);
    fs.writeFileSync(path.join(root, '.bobby', 'conductor-queue.yml'), 'queue: []\n');
    bobbyIn(['ship', 'claim', 'api'], { session: 'aaaa1111' });
    expect(bobbyIn(['status']).stdout).toMatch(/api\s+held by lane a .*1 ready to ship/);
    const data = JSON.parse(bobbyIn(['status', '--json']).stdout);
    expect(data.ship_lanes).toEqual([expect.objectContaining({ repo: 'api', batch: 1, holder: expect.objectContaining({ name: 'lane a', live: true }) })]);
    setAgents([]);
    expect(bobbyIn(['status']).stdout).toMatch(/api\s+held by lane a .*stale lock/);
  });
});
