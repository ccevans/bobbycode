// BOB-174: the conductor never stops, starts or deletes anything. Each mutating
// ticket allow-lists exactly its one command here. BOB-176: lib/conductor/reaper.js
// may name `claude stop` (and only that); see the reaper block below. BOB-177:
// lib/conductor/stack-reaper.js may name `docker compose -p <project> stop` (and only that).
// BOB-189: lib/conductor/worktree-reaper.js may name `git -C <repo> worktree remove --force <path>` (and only that).
import fs from 'fs';
import path from 'path';

const FORBIDDEN = [
  ['stop', /\bstop\b/i],
  ['rm', /\brm\b/i],
  ['unlink', /unlink/i],
  ['down', /\bdown\b/i],
  ['--bg', /--bg\b/],
];

// File -> forbidden tokens it is exempt from. Everything else is still checked.
const ALLOWED = { 'reaper.js': ['stop'], 'stack-reaper.js': ['stop'] };

function sourceFiles() {
  const libDir = path.resolve('lib/conductor');
  return [
    ...fs.readdirSync(libDir).map(f => path.join(libDir, f)),
    path.resolve('commands/conductor.js'),
    path.resolve('commands/conductor-queue.js'),
  ].filter(f => f.endsWith('.js'));
}

describe('conductor is read-only', () => {
  test('there are source files to check', () => {
    expect(sourceFiles().length).toBeGreaterThanOrEqual(6);
  });

  test.each(FORBIDDEN)('no conductor source mentions "%s"', (_name, re) => {
    const hits = sourceFiles().filter(f => !(ALLOWED[path.basename(f)] || []).includes(_name)).flatMap(f =>
      fs.readFileSync(f, 'utf8').split('\n')
        .map((line, i) => (re.test(line) ? `${path.relative(process.cwd(), f)}:${i + 1}: ${line.trim()}` : null))
        .filter(Boolean));
    expect(hits).toEqual([]);
  });
});

describe('the reaper is the only mutator and does exactly one thing', () => {
  const src = fs.readFileSync(path.resolve('lib/conductor/reaper.js'), 'utf8');
  const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

  test('`claude stop <id>` is the only exec of a mutating command', () => {
    const runs = [...code.matchAll(/\brun\(([^)]*)\)/g)].map(m => m[1].replace(/\s+/g, ' '));
    expect(runs).toEqual(["'claude', ['stop', still.id]"]);
  });

  test('no file is written, deleted or renamed, and no session is removed or killed', () => {
    for (const re of [/\brm\b/, /unlink/, /rmSync/, /writeFile/, /appendFile/, /rename/, /\bkill\b/, /--bg/, /\bdown\b/, /['"]rm['"]/]) {
      expect(code).not.toMatch(re);
    }
  });

  test('no other conductor module passes a stop argument to exec', () => {
    const others = sourceFiles().filter(f => !['reaper.js', 'stack-reaper.js'].includes(path.basename(f)));
    for (const f of others) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/['"]stop['"]/);
  });
});

describe('the stack reaper does exactly one docker thing', () => {
  const src = fs.readFileSync(path.resolve('lib/conductor/stack-reaper.js'), 'utf8');
  const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

  test('`docker compose -p <project> stop` is the only exec of a mutating command', () => {
    const runs = [...code.matchAll(/\brun\(([^)]*)\)/g)].map(m => m[1].replace(/\s+/g, ' '));
    expect(runs).toEqual(["'docker', ['compose', '-p', still.project, 'stop']"]);
  });

  test('no rm, down, volume, prune, kill or file write anywhere in it', () => {
    for (const re of [/\brm\b/, /\bdown\b/, /volume/i, /prune/i, /--volumes/, /['"]-v['"]/, /\bkill\b/, /unlink/, /rmSync/, /writeFile/, /appendFile/, /rename/, /['"]rm['"]/, /['"]down['"]/]) {
      expect(code).not.toMatch(re);
    }
  });
});

describe('the worktree reaper does exactly one removal', () => {
  const src = fs.readFileSync(path.resolve('lib/conductor/worktree-reaper.js'), 'utf8');
  const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

  test('`git -C <repo> worktree remove --force <path>` is the only exec that changes anything', () => {
    const runs = [...code.matchAll(/\brun\(([^)]*)\)/g)].map(m => m[1].replace(/\s+/g, ' '));
    expect(runs).toEqual([
      "'git', ['-C', p, 'status', '--porcelain', '-uno']",
      "'git', ['-C', p, 'for-each-ref', '--contains', 'HEAD', 'refs/heads', 'refs/remotes']",
      "'git', ['-C', still.repo_path, 'worktree', 'remove', '--force', still.path]",
    ]);
  });

  test('no rm, prune, branch delete, recursive delete or file write in it or in worktrees.js beyond the size cache', () => {
    for (const re of [/\brm\b/, /rmSync/, /unlink/, /prune/i, /\bbranch\b.*['"]-[dD]['"]/, /['"]clean['"]/, /['"]reset['"]/, /recursive/, /writeFile/, /rename/]) {
      expect(code).not.toMatch(re);
    }
    const lib = fs.readFileSync(path.resolve('lib/conductor/worktrees.js'), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(lib).not.toMatch(/\brm\b|rmSync|unlink|prune|recursive/i);
    expect([...lib.matchAll(/\brun\(([^)]*)\)/g)].map(m => m[1].replace(/\s+/g, ' '))).toEqual([
      "'git', ['-C', repo.path, 'worktree', 'list', '--porcelain']",
      "'du', ['-sk', p]",
    ]);
  });
});
