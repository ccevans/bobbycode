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

  const setVm = (opts) => fs.writeFileSync(vmFile, vmStatText(opts));
  const setStacks = (projects) => {
    fs.writeFileSync(psFile, projects.map((p, i) => psLine(`c${i}`, p)).join('\n'));
    fs.writeFileSync(startsFile, projects.map(() => '2026-11-08T08:00:00.000000000Z').join('\n'));
  };

  const bobbyIn = (args, { cwd = root, claude = 'ok', docker = 'ok' } = {}) => {
    const env = {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      FAKE_AGENTS_FILE: agentsFile,
      FAKE_CLAUDE: claude,
      FAKE_VM_FILE: vmFile,
      FAKE_PS_FILE: psFile,
      FAKE_STARTS_FILE: startsFile,
      FAKE_DOCKER: docker,
      HOME: root,
    };
    delete env.BOBBY_PROJECT;
    return spawnSync('node', [bobby, 'conductor', ...args], { cwd, encoding: 'utf8', env });
  };

  beforeEach(() => {
    ({ root, hookDir } = makeStudio());
    fakeBin = path.join(root, 'fakebin');
    fs.mkdirSync(fakeBin);
    agentsFile = path.join(root, 'agents.json');
    fs.writeFileSync(agentsFile, JSON.stringify(agentsFixture()));
    fs.writeFileSync(path.join(fakeBin, 'claude'), [
      '#!/bin/sh',
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
    setVm();
    setStacks([]);
    fs.writeFileSync(path.join(fakeBin, 'vm_stat'), '#!/bin/sh\ncat "$FAKE_VM_FILE"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(fakeBin, 'sysctl'), '#!/bin/sh\n[ "$*" = "-n hw.memsize" ] || exit 2\necho 51539607552\n', { mode: 0o755 });
    fs.writeFileSync(path.join(fakeBin, 'docker'), [
      '#!/bin/sh',
      '[ "$FAKE_DOCKER" = fail ] && { echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock" >&2; exit 1; }',
      'case "$1" in',
      '  ps) cat "$FAKE_PS_FILE" ;;',
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
      expect(out.slice(at('DONE'), at('UNKNOWN STATE'))).toContain('lane three');
      expect(out.slice(at('UNKNOWN STATE'))).toContain('state: stopped');
    });

    test('--json parses and carries the same groups', () => {
      const r = bobbyIn(['status', '--json']);
      expect(r.status).toBe(0);
      const data = JSON.parse(r.stdout);
      expect(Object.keys(data)).toEqual(['generated_at', 'working', 'waiting_on_cc', 'done', 'unknown', 'handoffs', 'board', 'machine', 'stacks']);
      expect(data.working.map(s => s.name)).toEqual(['lane one']);
      expect(data.waiting_on_cc.map(s => s.name)).toEqual(['lane two']);
      expect(data.done.map(s => s.name)).toEqual(['lane three']);
      const text = bobbyIn(['status']).stdout;
      for (const group of ['working', 'waiting_on_cc', 'done', 'unknown']) {
        for (const s of data[group]) expect(text).toContain(s.name);
      }
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
});
