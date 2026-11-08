// test/commands/brief-freshness.test.js
// TKT-083: bobby brief leads with a line when the board is behind its upstream.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby brief: board freshness (TKT-083)', () => {
  const bobby = path.resolve('bin/bobby.js');
  let root, A, B;

  // TKT-083 fixture: local bare repo as origin plus two clones of a Bobby project. No network.
  const g = (cwd, args) => execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  function makeBoardRepos(root) {
    const origin = path.join(root, 'origin.git');
    const A = path.join(root, 'A');
    g(root, `init -q -b main --bare ${origin}`);
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

  const brief = (cwd) => {
    try {
      return { code: 0, out: execSync(`node ${bobby} brief`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e) {
      return { code: e.status, out: String(e.stdout) + String(e.stderr) };
    }
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-briefstale-'));
    ({ A, B } = makeBoardRepos(root));
    bPushesTicket(B, 'From B');
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('shows the behind line before the project title, and nothing once current', () => {
    const behind = brief(A);
    expect(behind.code).toBe(0);
    expect(behind.out).toContain('Board is 1 commit behind origin/main');
    expect(behind.out.indexOf('Board is 1 commit behind')).toBeLessThan(behind.out.indexOf('where you left off'));

    g(A, 'pull -q');
    const current = brief(A);
    expect(current.out).not.toMatch(/behind|freshness/i);
    expect(current.out).toContain('where you left off');
  });

  test('a fetch failure prints an explicit unknown line and the rest of the brief', () => {
    g(A, 'remote set-url origin /does/not/exist.git');
    const r = brief(A);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Board freshness unknown');
    expect(r.out).toContain('Could not fetch origin');
    expect(r.out).toContain('where you left off');
  });
});
