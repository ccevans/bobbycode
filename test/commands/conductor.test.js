// End-to-end: `bobby conductor init|status` in a temp studio, with a fake `claude`
// on PATH so no real session list is touched.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { STAGES } from '../../lib/stages.js';
import { makeStudio, writeConductorYml, validYml, seedTickets, agentsFixture, vmStatText, psLine } from '../lib/conductor/helpers.js';

const bobby = path.resolve('bin/bobby.js');

describe('bobby conductor', () => {
  let root;
  let hookDir;
  let fakeBin;
  let agentsFile;
  let vmFile;
  let psFile;
  let startsFile;
  let stopsFile;
  let exitedFile;
  let composeFile;

  const setVm = (opts) => fs.writeFileSync(vmFile, vmStatText(opts));
  const setStacks = (projects) => {
    fs.writeFileSync(psFile, projects.map((p, i) => psLine(`c${i}`, p)).join('\n'));
    fs.writeFileSync(startsFile, projects.map(() => '2026-11-08T08:00:00.000000000Z').join('\n'));
  };

  const bobbyIn = (args, { cwd = root, claude = 'ok', docker = 'ok', cpu = 'Apple M4 Max', session = '', stopFail = '' } = {}) => {
    const env = {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      FAKE_AGENTS_FILE: agentsFile,
      FAKE_CLAUDE: claude,
      FAKE_VM_FILE: vmFile,
      FAKE_PS_FILE: psFile,
      FAKE_STARTS_FILE: startsFile,
      FAKE_DOCKER: docker,
      FAKE_CPU: cpu,
      FAKE_STOP_FAIL: stopFail,
      FAKE_STOPS_FILE: stopsFile,
      FAKE_EXITED_FILE: exitedFile,
      FAKE_COMPOSE_FILE: composeFile,
      HOME: root,
    };
    delete env.BOBBY_PROJECT;
    if (session) env.CLAUDE_CODE_SESSION_ID = session;
    else delete env.CLAUDE_CODE_SESSION_ID;
    return spawnSync('node', [bobby, 'conductor', ...args], { cwd, encoding: 'utf8', env });
  };

  beforeEach(() => {
    ({ root, hookDir } = makeStudio());
    fakeBin = path.join(root, 'fakebin');
    fs.mkdirSync(fakeBin);
    agentsFile = path.join(root, 'agents.json');
    fs.writeFileSync(agentsFile, JSON.stringify(agentsFixture()));
    stopsFile = path.join(root, 'stops.txt');
    fs.writeFileSync(path.join(fakeBin, 'claude'), [
      '#!/bin/sh',
      'if [ "$1" = stop ]; then',
      '  echo "$2" >> "$FAKE_STOPS_FILE"',
      '  [ -n "$FAKE_STOP_FAIL" ] && [ "$2" = "$FAKE_STOP_FAIL" ] && { echo "no such session" >&2; exit 1; }',
      '  exit 0',
      'fi',
      '[ "$1 $2 $3" = "agents --json --all" ] || { echo "unexpected args: $*" >&2; exit 2; }',
      'case "$FAKE_CLAUDE" in',
      '  fail) echo "claude is down" >&2; exit 1 ;;',
      '  garbage) echo "<html>not json</html>" ;;',
      '  *) cat "$FAKE_AGENTS_FILE" ;;',
      'esac',
    ].join('\n'), { mode: 0o755 });
    vmFile = path.join(root, 'vm.txt');
    psFile = path.join(root, 'ps.txt');
    startsFile = path.join(root, 'starts.txt');
    exitedFile = path.join(root, 'exited.txt');
    composeFile = path.join(root, 'compose.txt');
    fs.writeFileSync(exitedFile, '');
    setVm();
    setStacks([]);
    fs.writeFileSync(path.join(fakeBin, 'vm_stat'), '#!/bin/sh\ncat "$FAKE_VM_FILE"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(fakeBin, 'sysctl'), '#!/bin/sh\ncase "$*" in\n  "-n hw.memsize") echo 51539607552 ;;\n  "-n machdep.cpu.brand_string") echo "$FAKE_CPU" ;;\n  *) exit 2 ;;\nesac\n', { mode: 0o755 });
    fs.writeFileSync(path.join(fakeBin, 'docker'), [
      '#!/bin/sh',
      '[ "$FAKE_DOCKER" = fail ] && { echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock" >&2; exit 1; }',
      'case "$1" in',
      '  ps) case "$*" in *--all*) cat "$FAKE_EXITED_FILE" ;; *) cat "$FAKE_PS_FILE" ;; esac ;;',
      '  compose) echo "$*" >> "$FAKE_COMPOSE_FILE" ;;',
      '  inspect) cat "$FAKE_STARTS_FILE" ;;',
      '  *) echo "unexpected docker args: $*" >&2; exit 2 ;;',
      'esac',
    ].join('\n'), { mode: 0o755 });
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('init writes conductor.yml; a second run exits non-zero and leaves the file alone', () => {
    const first = bobbyIn(['init', '--projects', 'alpha,beta']);
    expect(first.status).toBe(0);
    const file = path.join(root, '.bobby', 'conductor.yml');
    const written = fs.readFileSync(file, 'utf8');
    expect(written).toMatch(/projects:\n {2}- alpha\n {2}- beta\n/);
    expect(written).toMatch(/hook_state_dir: \//);
    expect(written).toMatch(/governor:\n {2}min_free_ram_mb: 4096\n {2}max_docker_stacks: 4\n/);
    const second = bobbyIn(['init']);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toMatch(/already exists/);
    expect(fs.readFileSync(file, 'utf8')).toBe(written);
  });

  test('status without conductor.yml exits non-zero naming the file', () => {
    const r = bobbyIn(['status']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/conductor\.yml does not exist/);
  });

  test('status with a missing key exits non-zero naming the key', () => {
    writeConductorYml(root, `projects:\n  - alpha\n`);
    const r = bobbyIn(['status']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/key "hook_state_dir" is missing/);
  });

  describe('with a valid config', () => {
    beforeEach(() => {
      writeConductorYml(root, validYml(hookDir));
      seedTickets(root, 'alpha', [{ title: 'a' }, { title: 'b', stage: 'building' }, { title: 'c', stage: 'building', blocked: true }]);
      seedTickets(root, 'beta', [{ title: 'd', stage: 'testing' }]);
    });

    test('text status separates working, WAITING ON CC, done and unknown', () => {
      const r = bobbyIn(['status']);
      expect(r.status).toBe(0);
      const out = r.stdout;
      const at = (s) => out.indexOf(s);
      expect(at('WORKING')).toBeGreaterThan(-1);
      expect(at('WORKING')).toBeLessThan(at('WAITING ON CC'));
      expect(at('WAITING ON CC')).toBeLessThan(at('DONE'));
      expect(at('DONE')).toBeLessThan(at('UNKNOWN STATE'));
      const waiting = out.slice(at('WAITING ON CC'), at('DONE'));
      expect(waiting).toContain('lane two');
      expect(waiting).toContain('approve edit');
      expect(waiting).not.toContain('lane one');
      expect(at('INTERACTIVE')).toBeLessThan(at('UNKNOWN STATE'));
      expect(out.slice(at('DONE'), at('STOPPED'))).toContain('lane three');
      expect(out.slice(at('UNKNOWN STATE'), at('HANDOFFS'))).toContain('state: stopped');
      expect(out.slice(at('INTERACTIVE'), at('UNKNOWN STATE'))).toContain('interactive, status: none');
    });

    test('stopped/failed background sessions are counted by raw state and interactive ones listed with their status, not lumped into UNKNOWN STATE', () => {
      const agents = agentsFixture();
      agents.push({ id: 'abab0001', sessionId: 'abab0001-0000-4000-8000-000000000000', name: 'ended one', cwd: '/studio', kind: 'background', startedAt: 1, state: 'stopped' });
      agents.push({ id: 'abab0002', sessionId: 'abab0002-0000-4000-8000-000000000000', name: 'crashed one', cwd: '/studio', kind: 'background', startedAt: 1, state: 'failed' });
      agents.push({ sessionId: 'abab0003-0000-4000-8000-000000000000', name: 'terminal one', cwd: '/studio', kind: 'interactive', startedAt: 1, status: 'busy', pid: 7 });
      fs.writeFileSync(agentsFile, JSON.stringify(agents));
      const out = bobbyIn(['status']).stdout;
      const at = (s) => out.indexOf(s);
      expect(out).toMatch(/STOPPED \(2\)\s+already ended, no live process; not reaped: stopped 1, failed 1/);
      expect(out.slice(at('STOPPED'), at('INTERACTIVE'))).toMatch(/crashed one.*\[state: failed, background\]/);
      expect(out.slice(at('STOPPED'), at('INTERACTIVE'))).not.toContain('ended one');
      expect(out.slice(at('INTERACTIVE'), at('UNKNOWN STATE'))).toMatch(/terminal one.*\[interactive, status: busy\]/);
      expect(out.slice(at('UNKNOWN STATE'), at('HANDOFFS'))).not.toMatch(/ended one|crashed one|terminal one/);
      const data = JSON.parse(bobbyIn(['status', '--json']).stdout);
      expect(data.stopped.map(s => s.name)).toEqual(['ended one', 'crashed one']);
      expect(data.interactive.map(s => [s.name, s.status])).toEqual([['interactive', null], ['terminal one', 'busy']]);
    });

    test('--json parses and carries the same groups', () => {
      const r = bobbyIn(['status', '--json']);
      expect(r.status).toBe(0);
      const data = JSON.parse(r.stdout);
      expect(Object.keys(data)).toEqual(['generated_at', 'working', 'waiting_on_cc', 'done', 'stopped', 'interactive', 'unknown', 'handoffs', 'inbox', 'board', 'machine', 'stacks']);
      expect(data.working.map(s => s.name)).toEqual(['lane one']);
      expect(data.waiting_on_cc.map(s => s.name)).toEqual(['lane two']);
      expect(data.done.map(s => s.name)).toEqual(['lane three']);
      const text = bobbyIn(['status']).stdout;
      for (const group of ['working', 'waiting_on_cc', 'done', 'interactive', 'unknown']) {
        for (const s of data[group]) expect(text).toContain(s.name);
      }
    });

    test('INBOX lists undelivered messages per session and flags stale ones; status changes nothing', () => {
      const inbox = path.join(root, '.bobby', 'conductor', 'inbox');
      fs.mkdirSync(inbox, { recursive: true });
      const msg = (to, text, minutesAgo) => JSON.stringify({ id: text, ts: new Date(Date.now() - minutesAgo * 60000).toISOString(), from: 'orchestrator', to, text });
      fs.writeFileSync(path.join(inbox, 'aaaa1111-0000-4000-8000-000000000000.jsonl'), `${msg('aaaa1111-0000-4000-8000-000000000000', 'fresh', 2)}\n`);
      fs.writeFileSync(path.join(inbox, 'bbbb2222-0000-4000-8000-000000000000.jsonl'), `${msg('bbbb2222-0000-4000-8000-000000000000', 'old', 120)}\n${msg('bbbb2222-0000-4000-8000-000000000000', 'older', 90)}\n`);
      const before = fs.readdirSync(inbox).map(f => fs.readFileSync(path.join(inbox, f), 'utf8'));
      const text = bobbyIn(['status']).stdout;
      expect(text).toMatch(/INBOX.*2 sessions/);
      expect(text).toMatch(/aaaa1111  lane one  1 undelivered  oldest 2m\n/);
      expect(text).toMatch(/bbbb2222  lane two  2 undelivered  oldest 2h\s+waiting for CC to reply/);
      const data = JSON.parse(bobbyIn(['status', '--json']).stdout);
      expect(data.inbox.sessions.map(e => [e.name, e.undelivered, e.flag])).toEqual([['lane one', 1, null], ['lane two', 2, 'waiting for CC to reply']]);
      expect(fs.readdirSync(inbox).map(f => fs.readFileSync(path.join(inbox, f), 'utf8'))).toEqual(before);
    });

    test('INBOX says so when the inbox directory does not exist', () => {
      expect(bobbyIn(['status']).stdout).toMatch(/INBOX[\s\S]*no inbox directory at/);
    });

    test('board counts per stage match `bobby ticket list` for the same project', () => {
      const data = JSON.parse(bobbyIn(['status', '--json']).stdout);
      for (const project of ['alpha', 'beta']) {
        const list = spawnSync('node', [bobby, 'ticket', 'list', '--project', project], { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: root } });
        expect(list.status).toBe(0);
        const fromList = {};
        for (const m of list.stdout.matchAll(/▎ ([A-Z-]+)\S* ?.*?\((\d+)\)/g)) fromList[m[1].toLowerCase()] = Number(m[2]);
        expect(Object.keys(fromList).length).toBeGreaterThan(0);
        for (const stage of STAGES) {
          if (stage in fromList) expect(data.board[project].stages[stage]).toBe(fromList[stage]);
        }
      }
      expect(data.board.alpha.stages).toMatchObject({ backlog: 1, building: 2 });
      expect(data.board.alpha.blocked).toBe(1);
    });

    test('a claude failure exits non-zero with the error and prints no board', () => {
      const r = bobbyIn(['status'], { claude: 'fail' });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/claude agents --json --all.*failed.*claude is down/);
      expect(r.stdout).not.toMatch(/BOARD|WORKING/);
    });

    test('bad JSON from claude exits non-zero and prints no board', () => {
      const r = bobbyIn(['status', '--json'], { claude: 'garbage' });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/unparseable JSON/);
      expect(r.stdout).toBe('');
    });

    test('status shows MACHINE and STACKS; stacks map to tickets and unmapped ones say so', () => {
      seedTickets(root, 'alpha', [{ title: 'e', stage: 'building' }]); // AL-4
      setVm({ freeMb: 100, specMb: 0, fileMb: 5000, purgeMb: 0, storedMb: 24000, compressorMb: 9000 });
      setStacks(['al-4api', 'al-4api', 'promote-api-mainapi']);
      const r = bobbyIn(['status']);
      expect(r.status).toBe(0);
      const machine = r.stdout.slice(r.stdout.indexOf('MACHINE'), r.stdout.indexOf('STACKS'));
      expect(machine).toMatch(/free 5100 MB of 49152 MB/);
      expect(machine).toMatch(/holds 24000 MB, takes 9000 MB/);
      const stacks = r.stdout.slice(r.stdout.indexOf('STACKS'));
      expect(stacks).toMatch(/\(2 of max 4\)/);
      expect(stacks).toMatch(/al-4api\s+AL-004\s+lane none\s.*2 containers/);
      expect(stacks).toMatch(/promote-api-mainapi\s+unmapped/);
      const data = JSON.parse(bobbyIn(['status', '--json']).stdout);
      expect(data.stacks.list.map(s => [s.project, s.ticket, s.unmapped])).toEqual([['al-4api', 'AL-004', false], ['promote-api-mainapi', null, true]]);
    });

    test('a stack stopped by the conductor still shows in status as stopped; a running stack is not listed there', () => {
      seedTickets(root, 'alpha', [{ title: 'e', stage: 'building' }]); // AL-4
      setStacks(['al-5api']);
      // al-4api: only exited containers (stopped). al-5api: an exited one-off beside a running service.
      fs.writeFileSync(exitedFile, [psLine('x1', 'al-4api'), psLine('x2', 'al-4api'), psLine('x3', 'al-5api')].join('\n'));
      const r = bobbyIn(['status']);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/STOPPED STACKS \(1,/);
      expect(r.stdout).toMatch(/al-4api\s+stopped\s+AL-004\s.*2 containers/);
      const data = JSON.parse(bobbyIn(['status', '--json']).stdout);
      expect(data.stacks.stopped).toEqual([{ project: 'al-4api', containers: 2, ticket: 'AL-004', unmapped: false }]);
      expect(data.stacks.list.map(s => s.project)).toEqual(['al-5api']);
    });

    test('docker down fails status with the docker error and prints no board', () => {
      const r = bobbyIn(['status'], { docker: 'fail' });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/Cannot connect to the Docker daemon/);
      expect(r.stdout).not.toMatch(/BOARD|STACKS/);
    });

    describe('check', () => {
      test('lane: exit 1 with the numbers below the floor, exit 0 above it', () => {
        setVm({ freeMb: 1000, specMb: 0, fileMb: 100, purgeMb: 0 });
        const low = bobbyIn(['check', 'lane']);
        expect(low.status).toBe(1);
        expect(low.stderr).toMatch(/free RAM 1100 MB < min 4096 MB/);
        setVm({ freeMb: 1000, specMb: 0, fileMb: 6000, purgeMb: 0 });
        const ok = bobbyIn(['check', 'lane']);
        expect(ok.status).toBe(0);
        expect(ok.stdout).toMatch(/free RAM 7000 MB >= min 4096 MB/);
      });

      test('lane check does not need docker', () => {
        setVm({ freeMb: 8000 });
        expect(bobbyIn(['check', 'lane'], { docker: 'fail' }).status).toBe(0);
      });

      test('stack: refuses at the cap with the count and the cap; passes below it', () => {
        setVm({ freeMb: 8000 });
        setStacks(['rf-1api', 'rf-2api', 'rf-3api', 'rf-4api']);
        const full = bobbyIn(['check', 'stack']);
        expect(full.status).toBe(1);
        expect(full.stderr).toMatch(/docker stacks 4 >= max 4/);
        setStacks(['rf-1api', 'rf-2api', 'rf-3api']);
        const ok = bobbyIn(['check', 'stack']);
        expect(ok.status).toBe(0);
        expect(ok.stdout).toMatch(/docker stacks 3 < max 4/);
      });

      test('stack: low RAM refuses with the RAM reason', () => {
        setVm({ freeMb: 10, specMb: 0, fileMb: 10, purgeMb: 0 });
        const r = bobbyIn(['check', 'stack']);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/free RAM 20 MB < min 4096 MB/);
      });

      test('docker down is a non-zero exit with the docker error, never a zero-stack pass', () => {
        setVm({ freeMb: 8000 });
        const r = bobbyIn(['check', 'stack'], { docker: 'fail' });
        expect(r.status).not.toBe(0);
        expect(r.stderr).toMatch(/Cannot connect to the Docker daemon/);
        expect(r.stdout).toBe('');
      });

      test('an unknown kind is an error', () => {
        const r = bobbyIn(['check', 'ship']);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toMatch(/Unknown check "ship"/);
      });

      test('missing governor keys exit non-zero naming the key', () => {
        writeConductorYml(root, `projects:\n  - alpha\nhook_state_dir: ${hookDir}\n`);
        const r = bobbyIn(['check', 'lane']);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toMatch(/key "governor\.min_free_ram_mb" is missing/);
      });
    });

    test('status works from a checkout nested under the studio', () => {
      const nested = path.join(root, 'worktrees', 'X');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, '.bobbyrc.yml'), 'project: x\n');
      expect(bobbyIn(['status'], { cwd: nested }).status).toBe(0);
    });
  });
  describe('reap', () => {
    const stops = () => (fs.existsSync(stopsFile) ? fs.readFileSync(stopsFile, 'utf8').split('\n').filter(Boolean) : []);
    beforeEach(() => { writeConductorYml(root, validYml(hookDir)); });

    test('without --apply it lists the done session, stops nothing and exits 0', () => {
      const r = bobbyIn(['reap']);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/Dry run: 1 session/);
      expect(r.stdout).toMatch(/would end {2}cccc3333 {2}lane three/);
      expect(r.stdout).not.toMatch(/lane two/); // blocked is never listed
      expect(stops()).toEqual([]);
    });

    test('--apply ends the done session once with claude stop <id>', () => {
      const r = bobbyIn(['reap', '--apply']);
      expect(r.status).toBe(0);
      expect(stops()).toEqual(['cccc3333']);
      expect(r.stdout).toMatch(/ended {2}cccc3333/);
    });

    test('--apply never stops the session running the command', () => {
      const r = bobbyIn(['reap', '--apply'], { session: 'cccc3333-0000-4000-8000-000000000000' });
      expect(r.status).toBe(0);
      expect(stops()).toEqual([]);
    });

    test('a done session with no pid (already stopped, still listed by claude) is not listed, not stopped, and status does not count it as done', () => {
      const agents = agentsFixture();
      agents.push({ id: 'abab0001', sessionId: 'abab0001-0000-4000-8000-000000000000', name: 'old stopped lane', cwd: '/studio', kind: 'background', startedAt: 1, state: 'done' });
      agents.push({ id: 'abab0002', sessionId: 'abab0002-0000-4000-8000-000000000000', name: 'null pid lane', cwd: '/studio', kind: 'background', startedAt: 1, state: 'done', pid: null });
      fs.writeFileSync(agentsFile, JSON.stringify(agents));
      const dry = bobbyIn(['reap']);
      expect(dry.status).toBe(0);
      expect(dry.stdout).toMatch(/Dry run: 1 session/);
      expect(dry.stdout).not.toMatch(/old stopped lane|null pid lane/);
      expect(bobbyIn(['reap', '--apply']).status).toBe(0);
      expect(stops()).toEqual(['cccc3333']);
      const data = JSON.parse(bobbyIn(['status', '--json']).stdout);
      expect(data.done.map(s => s.name)).toEqual(['lane three']);
      expect(data.stopped.map(s => s.name)).toEqual(['old stopped lane', 'null pid lane']);
      expect(bobbyIn(['status']).stdout).toMatch(/STOPPED \(2\)\s+already ended, no live process; not reaped/);
    });

    test('a failing claude stop is reported and the exit code is non-zero', () => {
      const failing = bobbyIn(['reap', '--apply'], { stopFail: 'cccc3333' });
      expect(failing.status).toBe(1);
      expect(failing.stdout).toMatch(/failed {2}cccc3333/);
      expect(failing.stderr).toMatch(/1 session\(s\) could not be ended/);
    });

    test('it refuses on a host that is not the M4, even without --apply', () => {
      const r = bobbyIn(['reap'], { cpu: 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz' });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/M4 only/);
      expect(stops()).toEqual([]);
    });

    test('if claude agents --json fails it exits non-zero and stops nothing', () => {
      const r = bobbyIn(['reap', '--apply'], { claude: 'fail' });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/claude is down/);
      expect(stops()).toEqual([]);
    });

    test('a missing conductor.yml is an error naming the file', () => {
      fs.rmSync(path.join(root, '.bobby', 'conductor.yml'));
      const r = bobbyIn(['reap']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/conductor\.yml/);
    });

    test('status shows a handoff whose successor is not live as an orphaned handoff', () => {
      fs.writeFileSync(path.join(hookDir, 'cccc3333-0000-4000-8000-000000000000.handoff'), '"lane" (bg ffff9999, claude-opus-5-5) from /x/h.md\n');
      const r = bobbyIn(['status']);
      expect(r.stdout).toMatch(/orphaned handoff/);
      const dry = bobbyIn(['reap']);
      expect(dry.stdout).toMatch(/Orphaned handoff \(1\)/);
      expect(dry.stdout).toMatch(/Dry run: 0 session/);
    });
    test('status does not call a handed-off session with no live pid an orphan, same as reap', () => {
      const agents = agentsFixture();
      agents.push({ id: 'abab0001', sessionId: 'abab0001-0000-4000-8000-000000000000', name: 'old stopped lane', cwd: '/studio', kind: 'background', startedAt: 1, state: 'done' });
      fs.writeFileSync(agentsFile, JSON.stringify(agents));
      fs.writeFileSync(path.join(hookDir, 'abab0001-0000-4000-8000-000000000000.handoff'), '"lane" (bg ffff9999, claude-opus-5-5) from /x/h.md\n');
      const r = bobbyIn(['status']);
      expect(r.stdout).toMatch(/old stopped lane\s+successor ffff9999 not live/);
      expect(r.stdout).not.toMatch(/orphaned handoff/);
      expect(bobbyIn(['reap']).stdout).not.toMatch(/Orphaned handoff/);
    });
  });

  describe('reap --stacks', () => {
    const composeCalls = () => (fs.existsSync(composeFile) ? fs.readFileSync(composeFile, 'utf8').split('\n').filter(Boolean) : []);
    beforeEach(() => {
      writeConductorYml(root, validYml(hookDir));
      seedTickets(root, 'alpha', [{ title: 'a' }, { title: 'b' }, { title: 'c' }, { title: 'd', stage: 'building' }]); // AL-4 = 'd'
      setStacks(['al-4api', 'promote-api-mainapi']); // both started 2026-11-08T08:00Z: long idle
    });

    test('dry run lists the idle ticket stack, keeps the promote stack, and runs no compose command', () => {
      const r = bobbyIn(['reap', '--stacks']);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/Dry run: 1 stack\(s\) would be stopped/);
      expect(r.stdout).toMatch(/would stop {2}al-4api {2}AL-004/);
      expect(r.stdout).toMatch(/kept {2}promote-api-mainapi {2}promote\/ship stack/);
      expect(composeCalls()).toEqual([]);
    });

    test('--apply runs exactly docker compose -p <project> stop for the idle stack', () => {
      const r = bobbyIn(['reap', '--stacks', '--apply']);
      expect(r.status).toBe(0);
      expect(composeCalls()).toEqual(['compose -p al-4api stop']);
      expect(r.stdout).toMatch(/stopped {2}al-4api/);
    });

    test('a working lane for the ticket keeps its stack', () => {
      const agents = agentsFixture();
      agents.push({ id: 'ffff6666', sessionId: 'ffff6666-0000-4000-8000-000000000000', name: 'AL-004 build', cwd: '/studio', kind: 'background', startedAt: 1, state: 'working' });
      fs.writeFileSync(agentsFile, JSON.stringify(agents));
      const r = bobbyIn(['reap', '--stacks', '--apply']);
      expect(r.status).toBe(0);
      expect(composeCalls()).toEqual([]);
      expect(r.stdout).toMatch(/AL-004 has a working lane/);
    });

    test('docker down is a non-zero exit with the docker error', () => {
      const r = bobbyIn(['reap', '--stacks', '--apply'], { docker: 'fail' });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/Cannot connect to the Docker daemon/);
      expect(composeCalls()).toEqual([]);
    });

    test('it refuses on a host that is not the M4, even without --apply', () => {
      const r = bobbyIn(['reap', '--stacks'], { cpu: 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz' });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/M4 only/);
    });

    test('a conductor.yml without reaper.stack_idle_hours is an error naming the key', () => {
      writeConductorYml(root, validYml(hookDir).replace(/reaper:[\s\S]*$/, ''));
      const r = bobbyIn(['reap', '--stacks']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/key "reaper\.stack_idle_hours" is missing/);
    });
  });
});
