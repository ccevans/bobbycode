// test/commands/create.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import matter from 'gray-matter';

describe('bobby ticket create', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-cmd-'));
    // Set up a Bobby project with single tickets directory
    const config = {
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets',
      areas: ['auth', 'dashboard'],
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'), '0');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('creates a ticket in the tickets directory', () => {
    execSync(`node ${bobby} ticket create -t "Fix login" --type bug -p high`, { cwd: tmpDir });
    const entries = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets'))
      .filter(e => e.startsWith('TKT-'));
    expect(entries.length).toBe(1);
    expect(entries[0]).toMatch(/^TKT-001--fix-login$/);

    // Verify frontmatter
    const ticketFile = path.join(tmpDir, '.bobby', 'tickets', entries[0], 'ticket.md');
    const { data } = matter(fs.readFileSync(ticketFile, 'utf8'));
    expect(data.stage).toBe('backlog');
    expect(data.type).toBe('bug');
    expect(data.priority).toBe('high');
  });

  test('creates an epic with --epic flag', () => {
    execSync(`node ${bobby} ticket create -t "Big feature" --epic`, { cwd: tmpDir });
    const entries = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets'))
      .filter(e => e.startsWith('TKT-'));
    expect(entries.length).toBe(1);

    const ticketFile = path.join(tmpDir, '.bobby', 'tickets', entries[0], 'ticket.md');
    const { data } = matter(fs.readFileSync(ticketFile, 'utf8'));
    expect(data.type).toBe('epic');
  });

  test('creates a ticket with --parent flag', () => {
    execSync(`node ${bobby} ticket create -t "Sub task" --parent TKT-001`, { cwd: tmpDir });
    const entries = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets'))
      .filter(e => e.startsWith('TKT-'));

    const ticketFile = path.join(tmpDir, '.bobby', 'tickets', entries[0], 'ticket.md');
    const { data } = matter(fs.readFileSync(ticketFile, 'utf8'));
    expect(data.parent).toBe('TKT-001');
  });

  test('fails without title', () => {
    expect(() => {
      execSync(`node ${bobby} ticket create`, { cwd: tmpDir, stdio: 'pipe' });
    }).toThrow();
  });

  describe('--found-in', () => {
    const ticketsPath = () => path.join(tmpDir, '.bobby', 'tickets');
    const readData = (prefix) => {
      const dir = fs.readdirSync(ticketsPath()).find(e => e.startsWith(prefix));
      return matter(fs.readFileSync(path.join(ticketsPath(), dir, 'ticket.md'), 'utf8')).data;
    };

    test('records the ticket the finding came from', () => {
      execSync(`node ${bobby} ticket create -t "Origin"`, { cwd: tmpDir });
      const out = execSync(
        `node ${bobby} ticket create -t "Login 500s on empty email" --type bug -p high -a bobby-build --found-in TKT-001`,
        { cwd: tmpDir, encoding: 'utf8' },
      );
      expect(out).toContain('Found in TKT-001');
      const data = readData('TKT-002');
      expect(data.found_in).toBe('TKT-001');
      expect(data.author).toBe('bobby-build');
      expect(data.stage).toBe('backlog');
    });

    test('an unknown origin is an explicit error and writes nothing', () => {
      let err;
      try {
        execSync(`node ${bobby} ticket create -t "X" --found-in TKT-999`, { cwd: tmpDir, stdio: 'pipe' });
      } catch (e) { err = e; }
      expect(err).toBeDefined();
      expect(err.status).toBe(1);
      expect(err.stderr.toString()).toMatch(/TKT-999.*no such ticket/);
      expect(fs.readdirSync(ticketsPath()).filter(e => e.startsWith('TKT-'))).toHaveLength(0);
      expect(fs.readFileSync(path.join(ticketsPath(), '.counter'), 'utf8').trim()).toBe('0');
    });

    test('without the flag found_in is null', () => {
      execSync(`node ${bobby} ticket create -t "Plain"`, { cwd: tmpDir });
      expect(readData('TKT-001').found_in).toBeNull();
    });
  });
});

describe('bobby ticket create: stale board guard (TKT-083)', () => {
  const bobby = path.resolve('bin/bobby.js');
  let root, origin, A, B;

  // TKT-083 fixture: local bare repo as origin plus two clones of a Bobby project. No network.
  const g = (cwd, args) => execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  function makeBoardRepos(root) {
    const origin = path.join(root, 'origin.git');
    const A = path.join(root, 'A');
    g(root, `init -q --bare ${origin}`);
    fs.mkdirSync(path.join(A, '.bobby', 'tickets'), { recursive: true });
    g(A, 'init -q -b main');
    fs.writeFileSync(path.join(A, '.bobbyrc.yml'), YAML.stringify({
      project: 'test', stack: 'generic', tickets_dir: '.bobby/tickets',
      sprints_dir: '.bobby/sprints', sessions_dir: '.bobby/sessions', ticket_prefix: 'TKT',
    }));
    fs.writeFileSync(path.join(A, '.bobby', 'tickets', '.counter'), '0');
    g(A, 'add -A'); g(A, 'commit -qm init');
    g(A, `remote add origin ${origin}`); g(A, 'push -q -u origin main');
    const B = path.join(root, 'B');
    g(root, `clone -q ${origin} ${B}`);
    return { origin, A, B };
  }
  // B creates a ticket with the real CLI and pushes it, so A is one board commit behind.
  function bPushesTicket(B, title) {
    execSync(`node ${bobby} ticket create -t "${title}"`, { cwd: B });
    g(B, 'add -A'); g(B, `commit -qm "${title}"`); g(B, 'push -q');
  }

  const bobbyIn = (cwd, args) => {
    try {
      return { code: 0, out: execSync(`node ${bobby} ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e) {
      return { code: e.status, out: String(e.stdout) + String(e.stderr) };
    }
  };
  const folders = (dir) => fs.readdirSync(path.join(dir, '.bobby', 'tickets')).filter(e => e.startsWith('TKT-'));
  const counter = (dir) => fs.readFileSync(path.join(dir, '.bobby', 'tickets', '.counter'), 'utf8');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-stale-'));
    ({ origin, A, B } = makeBoardRepos(root));
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('refuses when upstream is ahead, names count + branch + pull command, creates nothing', () => {
    bPushesTicket(B, 'From B');
    const r = bobbyIn(A, 'ticket create -t "From A"');
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 commit behind origin/main');
    expect(r.out).toContain(`git -C ${fs.realpathSync(A)} pull --rebase origin main`);
    expect(folders(A)).toEqual([]);
    expect(counter(A)).toBe('0');
  });

  test('after pulling, the next ID is above upstream', () => {
    bPushesTicket(B, 'From B');
    g(A, 'pull -q');
    const r = bobbyIn(A, 'ticket create -t "From A"');
    expect(r.code).toBe(0);
    expect(folders(A)).toContain('TKT-002--from-a');
    expect(counter(A)).toBe('2');
  });

  test('a fetch failure is an explicit error naming the remote, and creates nothing', () => {
    g(A, 'remote set-url origin /does/not/exist.git');
    const r = bobbyIn(A, 'ticket create -t "Offline"');
    expect(r.code).toBe(1);
    expect(r.out).toContain('Could not fetch origin');
    expect(r.out).toContain('/does/not/exist.git');
    expect(folders(A)).toEqual([]);
    expect(counter(A)).toBe('0');
  });

  test('a git repo with no upstream, and a non-git dir, keep working', () => {
    const solo = path.join(root, 'solo');
    fs.mkdirSync(path.join(solo, '.bobby', 'tickets'), { recursive: true });
    fs.copyFileSync(path.join(A, '.bobbyrc.yml'), path.join(solo, '.bobbyrc.yml'));
    fs.writeFileSync(path.join(solo, '.bobby', 'tickets', '.counter'), '0');
    expect(bobbyIn(solo, 'ticket create -t "Local"').code).toBe(0);   // not a git repo
    g(solo, 'init -q -b main');
    fs.rmSync(path.join(solo, '.bobby', 'tickets', 'TKT-001--local'), { recursive: true });
    fs.writeFileSync(path.join(solo, '.bobby', 'tickets', '.counter'), '0');
    const r = bobbyIn(solo, 'ticket create -t "Local"');                // git repo, no upstream
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/fetch|behind/i);
    expect(folders(solo)).toEqual(['TKT-001--local']);
  });

  test('upstream commits that touch only code do not block', () => {
    fs.mkdirSync(path.join(B, 'src'));
    fs.writeFileSync(path.join(B, 'src', 'index.js'), '1');
    g(B, 'add -A'); g(B, 'commit -qm code'); g(B, 'push -q');
    expect(bobbyIn(A, 'ticket create -t "z"').code).toBe(0);
    expect(folders(A)).toEqual(['TKT-001--z']);
  });

  test('an upstream branch not yet on the remote is not an error', () => {
    g(A, 'checkout -q -b feat');
    g(A, 'config branch.feat.remote origin');
    g(A, 'config branch.feat.merge refs/heads/feat');
    expect(bobbyIn(A, 'ticket create -t "w"').code).toBe(0);
    expect(folders(A)).toEqual(['TKT-001--w']);
  });

  test('an upstream branch deleted on the remote refuses, names the way out, and keeps the tracking ref', () => {
    g(A, 'checkout -q -b feat');
    execSync(`node ${bobby} ticket create -t "On feat"`, { cwd: A });
    g(A, 'add -A'); g(A, 'commit -qm feat'); g(A, 'push -q -u origin feat');
    // delete on the remote itself: A's own `push --delete` would also drop A's tracking ref
    g(origin, 'branch -D feat');
    const r = bobbyIn(A, 'ticket create -t "After delete"');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/origin\/feat no longer exists on origin/);
    expect(r.out).toMatch(/git branch -u origin\/<branch> && git pull --rebase/);
    expect(r.out).not.toMatch(/--unset-upstream/);
    expect(r.out).not.toMatch(/git branch -u origin\/feat/); // re-pointing at the deleted branch loops
    expect(folders(A)).toEqual(['TKT-001--on-feat']);
    expect(g(A, 'rev-parse --verify refs/remotes/origin/feat').trim()).toBeTruthy();
  });

  test('studio board: its own board moving blocks; another project board moving does not', () => {
    const origin = path.join(root, 'studio-origin.git');
    const S = path.join(root, 'S');
    g(root, `init -q --bare ${origin}`);
    for (const p of ['app', 'other']) {
      fs.mkdirSync(path.join(S, '.bobby', p, 'tickets'), { recursive: true });
      fs.writeFileSync(path.join(S, '.bobby', p, 'tickets', '.counter'), '0');
      fs.writeFileSync(path.join(S, '.bobby', p, '.bobbyrc.yml'), YAML.stringify({ prefix: p === 'app' ? 'AP' : 'OT', repos: [] }));
    }
    fs.writeFileSync(path.join(S, '.bobbyrc.yml'), YAML.stringify({ studio: 'st', repos: {} }));
    g(S, 'init -q -b main'); g(S, 'add -A'); g(S, 'commit -qm init');
    g(S, `remote add origin ${origin}`); g(S, 'push -q -u origin main');
    const P = path.join(root, 'P');
    g(root, `clone -q ${origin} ${P}`);

    const r0 = bobbyIn(P, 'ticket create -t "x" --project app');
    expect(r0.code).toBe(0);
    g(P, 'add -A'); g(P, 'commit -qm "app ticket"'); g(P, 'push -q');
    const a = bobbyIn(S, 'ticket create -t "x" --project app');
    expect(a.code).toBe(1);
    expect(a.out).toContain('1 commit behind origin/main');

    g(S, 'pull -q');
    expect(bobbyIn(P, 'ticket create -t "o" --project other').code).toBe(0);
    g(P, 'add -A'); g(P, 'commit -qm "other ticket"'); g(P, 'push -q');
    const b = bobbyIn(S, 'ticket create -t "y" --project app');
    expect(b.code).toBe(0);
    expect(b.out).toContain('AP-002');
  });
});
