// End-to-end: `bobby conductor init|status` in a temp studio, with a fake `claude`
// on PATH so no real session list is touched.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { STAGES } from '../../lib/stages.js';
import { makeStudio, writeConductorYml, validYml, seedTickets, agentsFixture } from '../lib/conductor/helpers.js';

const bobby = path.resolve('bin/bobby.js');

describe('bobby conductor', () => {
  let root;
  let hookDir;
  let fakeBin;
  let agentsFile;

  const bobbyIn = (args, { cwd = root, claude = 'ok' } = {}) => {
    const env = { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, FAKE_AGENTS_FILE: agentsFile, FAKE_CLAUDE: claude, HOME: root };
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
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('init writes conductor.yml; a second run exits non-zero and leaves the file alone', () => {
    const first = bobbyIn(['init', '--projects', 'alpha,beta']);
    expect(first.status).toBe(0);
    const file = path.join(root, '.bobby', 'conductor.yml');
    const written = fs.readFileSync(file, 'utf8');
    expect(written).toMatch(/projects:\n {2}- alpha\n {2}- beta\n/);
    expect(written).toMatch(/hook_state_dir: \//);
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
      expect(Object.keys(data)).toEqual(['generated_at', 'working', 'waiting_on_cc', 'done', 'unknown', 'handoffs', 'board']);
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

    test('status works from a checkout nested under the studio', () => {
      const nested = path.join(root, 'worktrees', 'X');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, '.bobbyrc.yml'), 'project: x\n');
      expect(bobbyIn(['status'], { cwd: nested }).status).toBe(0);
    });
  });
});
