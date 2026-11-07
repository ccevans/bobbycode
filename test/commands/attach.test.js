// test/commands/attach.test.js
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby ticket attach', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-attach-'));
    const config = {
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login', 'ticket.md'),
      '---\nid: TKT-001\ntitle: Fix login\nstage: backlog\n---\n## Description\n'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('attaches a file to a ticket (copies — original kept)', () => {
    const file = path.join(tmpDir, 'screenshot.png');
    fs.writeFileSync(file, 'fake-png-data');

    execSync(`node ${bobby} ticket attach TKT-001 screenshot.png`, { cwd: tmpDir });

    const dest = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login', 'test-evidence', 'screenshots', 'screenshot.png');
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf8')).toBe('fake-png-data');
    // Original preserved — copy is the default
    expect(fs.existsSync(file)).toBe(true);
  });

  test('--move removes the original', () => {
    const file = path.join(tmpDir, 'moveme.png');
    fs.writeFileSync(file, 'data');

    execSync(`node ${bobby} ticket attach TKT-001 moveme.png --move`, { cwd: tmpDir });

    const dest = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login', 'test-evidence', 'screenshots', 'moveme.png');
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  test('attaches multiple files', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.png'), 'aaa');
    fs.writeFileSync(path.join(tmpDir, 'b.png'), 'bbb');

    execSync(`node ${bobby} ticket attach TKT-001 a.png b.png`, { cwd: tmpDir });

    const evidenceDir = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login', 'test-evidence', 'screenshots');
    expect(fs.existsSync(path.join(evidenceDir, 'a.png'))).toBe(true);
    expect(fs.existsSync(path.join(evidenceDir, 'b.png'))).toBe(true);
  });

  test('supports custom --dir option', () => {
    fs.writeFileSync(path.join(tmpDir, 'app.log'), 'log data');

    execSync(`node ${bobby} ticket attach TKT-001 app.log --dir logs`, { cwd: tmpDir });

    const dest = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login', 'test-evidence', 'logs', 'app.log');
    expect(fs.existsSync(dest)).toBe(true);
  });

  test('fails for non-existent ticket', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.png'), 'data');

    expect(() => {
      execSync(`node ${bobby} ticket attach TKT-999 file.png`, { cwd: tmpDir, stdio: 'pipe' });
    }).toThrow();
  });

  test('warns for missing files and skips them', () => {
    fs.writeFileSync(path.join(tmpDir, 'real.png'), 'data');

    const output = execSync(`node ${bobby} ticket attach TKT-001 missing.png real.png`, { cwd: tmpDir, encoding: 'utf8' });

    const evidenceDir = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login', 'test-evidence', 'screenshots');
    expect(fs.existsSync(path.join(evidenceDir, 'real.png'))).toBe(true);
  });

  test('fails when all files are missing', () => {
    expect(() => {
      execSync(`node ${bobby} ticket attach TKT-001 missing.png`, { cwd: tmpDir, stdio: 'pipe' });
    }).toThrow();
  });

  describe('--log (TKT-086)', () => {
    const tdir = () => path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login');
    const git = (args) => execSync(`git ${args}`, { cwd: tmpDir, encoding: 'utf8', stdio: 'pipe' });
    const ignoreLine = '.bobby/tickets/*/**/*.log';
    const rspecLog = [
      ...Array.from({ length: 300 }, (_, i) => `line ${i}`),
      'Failed examples:',
      'rspec ./spec/models/user_spec.rb:12 # User is valid',
      'Finished in 4.2 seconds (files took 1.1 seconds to load)',
      '120 examples, 2 failures',
      'EXITCODE=1',
    ].join('\n');

    function gitInit({ ignored }) {
      git('init -q');
      if (ignored) fs.writeFileSync(path.join(tmpDir, '.gitignore'), `${ignoreLine}\n`);
    }

    test('writes the raw log byte-identical plus a .log.md summary; raw ignored, summary not', () => {
      gitInit({ ignored: true });
      fs.writeFileSync(path.join(tmpDir, 'rspec.log'), rspecLog);

      execSync(`node ${bobby} ticket attach TKT-001 rspec.log --log --cmd "bundle exec rspec"`, { cwd: tmpDir });

      expect(fs.readFileSync(path.join(tdir(), 'logs', 'rspec.log'), 'utf8')).toBe(rspecLog);
      expect(fs.existsSync(path.join(tmpDir, 'rspec.log'))).toBe(true);
      const md = fs.readFileSync(path.join(tdir(), 'logs', 'rspec.log.md'), 'utf8');
      expect(md).toContain('Command: bundle exec rspec');
      expect(md).toContain('120 examples, 2 failures');
      expect(md).toContain('rspec ./spec/models/user_spec.rb:12');
      expect(fs.existsSync(path.join(tdir(), 'test-evidence'))).toBe(false);

      const status = git('status --porcelain --untracked-files=all');
      expect(status).toContain('logs/rspec.log.md');
      expect(status).not.toMatch(/logs\/rspec\.log$/m);
    });

    test('a non-.log name gets .log appended so the ignore pattern covers it', () => {
      gitInit({ ignored: true });
      fs.writeFileSync(path.join(tmpDir, 'out.txt'), 'x\n```\ny\n```\n');

      execSync(`node ${bobby} ticket attach TKT-001 out.txt --log`, { cwd: tmpDir });

      expect(fs.existsSync(path.join(tdir(), 'logs', 'out.txt.log'))).toBe(true);
      expect(fs.existsSync(path.join(tdir(), 'logs', 'out.txt.log.md'))).toBe(true);
    });

    test('warns, but succeeds, when the raw log is not gitignored', () => {
      gitInit({ ignored: false });
      fs.writeFileSync(path.join(tmpDir, 'rspec.log'), rspecLog);

      const res = spawnSync('node', [bobby, 'ticket', 'attach', 'TKT-001', 'rspec.log', '--log'], { cwd: tmpDir, encoding: 'utf8' });

      expect(res.status).toBe(0);
      expect(res.stdout + res.stderr).toContain('is not gitignored');
      expect(res.stdout + res.stderr).toContain('bobby init --refresh');
    });

    test('--log --move on a file already in the ticket logs/ keeps the raw log and writes the summary', () => {
      gitInit({ ignored: true });
      fs.mkdirSync(path.join(tdir(), 'logs'), { recursive: true });
      const inPlace = path.join(tdir(), 'logs', 'rspec.log');
      fs.writeFileSync(inPlace, rspecLog);

      const res = spawnSync('node', [bobby, 'ticket', 'attach', 'TKT-001', inPlace, '--log', '--move'], { cwd: tmpDir, encoding: 'utf8' });

      expect(res.status).toBe(0);
      expect(fs.readFileSync(inPlace, 'utf8')).toBe(rspecLog);
      expect(fs.readFileSync(`${inPlace}.md`, 'utf8')).toContain('120 examples, 2 failures');
    });

    test('without --log nothing is written to logs/', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.png'), 'x');
      execSync(`node ${bobby} ticket attach TKT-001 a.png`, { cwd: tmpDir });
      expect(fs.existsSync(path.join(tdir(), 'logs'))).toBe(false);
    });
  });

  describe('untrack-logs (TKT-086)', () => {
    const git = (args, cwd = tmpDir) => execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: 'pipe' });

    function seedRepo() {
      git('init -q');
      git('config user.email t@example.com');
      git('config user.name T');
      const t = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login');
      fs.mkdirSync(path.join(t, 'logs'), { recursive: true });
      fs.writeFileSync(path.join(t, 'ship-rspec6.log'), 'a');
      fs.writeFileSync(path.join(t, 'logs', 'a.log'), 'b');
      fs.writeFileSync(path.join(t, 'notes.md'), 'n');
      fs.mkdirSync(path.join(tmpDir, 'src'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'app.log'), 'c');
      git('add -A');
      git('commit -q -m base');
    }

    test('--dry-run lists the ticket logs and changes nothing', () => {
      seedRepo();
      const out = execSync(`node ${bobby} ticket untrack-logs --dry-run`, { cwd: tmpDir, encoding: 'utf8' });
      expect(out).toContain('ship-rspec6.log');
      expect(out).toContain('logs/a.log');
      expect(out).not.toContain('src/app.log');
      expect(git('status --porcelain')).toBe('');
    });

    test('stages removals only (git rm --cached): files stay, other files and history untouched', () => {
      seedRepo();
      const before = git('rev-list --count HEAD').trim();

      const out = execSync(`node ${bobby} ticket untrack-logs`, { cwd: tmpDir, encoding: 'utf8' });

      expect(out).toContain('Untracked 2 log files');
      const t = path.join('.bobby', 'tickets', 'TKT-001--fix-login');
      expect(fs.existsSync(path.join(tmpDir, t, 'ship-rspec6.log'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, t, 'logs', 'a.log'))).toBe(true);
      expect(git('diff --cached --name-status').split('\n').filter(Boolean).sort()).toEqual([
        `D\t${t}/logs/a.log`, `D\t${t}/ship-rspec6.log`,
      ]);
      expect(git('ls-files')).toContain('src/app.log');
      expect(git('ls-files')).toContain('notes.md');
      expect(git('rev-list --count HEAD').trim()).toBe(before);
      expect(fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8')).toContain('.bobby/tickets/*/**/*.log');
    });

    test('in a studio it covers every project board without an active project', () => {
      git('init -q');
      git('config user.email t@example.com');
      git('config user.name T');
      fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify({ studio: true, project: 'studio' }));
      for (const [proj, id] of [['a', 'A-1--x'], ['b', 'B-1--y']]) {
        const d = path.join(tmpDir, '.bobby', proj, 'tickets', id);
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, 'ship.log'), 'x');
      }
      git('add -A');
      git('commit -q -m base');

      const out = execSync(`node ${bobby} ticket untrack-logs`, { cwd: tmpDir, encoding: 'utf8' });
      expect(out).toContain('Untracked 2 log files');
    });

    test('outside a git repo it is an explicit error', () => {
      const res = spawnSync('node', [bobby, 'ticket', 'untrack-logs'], { cwd: tmpDir, encoding: 'utf8' });
      expect(res.status).toBe(1);
      expect(res.stdout + res.stderr).toContain('untrack-logs needs a git repo');
    });
  });
});
