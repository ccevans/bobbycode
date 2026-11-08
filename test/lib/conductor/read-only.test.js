// BOB-174: the conductor never stops, starts or deletes anything. Each mutating
// ticket allow-lists exactly its one command here. BOB-176: lib/conductor/reaper.js
// may name `claude stop` (and only that); see the reaper block below.
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
const ALLOWED = { 'reaper.js': ['stop'] };

function sourceFiles() {
  const libDir = path.resolve('lib/conductor');
  return [
    ...fs.readdirSync(libDir).map(f => path.join(libDir, f)),
    path.resolve('commands/conductor.js'),
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
    expect(runs).toEqual(["'claude', ['stop', c.id]"]);
  });

  test('no file is written, deleted or renamed, and no session is removed or killed', () => {
    for (const re of [/\brm\b/, /unlink/, /rmSync/, /writeFile/, /appendFile/, /rename/, /\bkill\b/, /--bg/, /\bdown\b/, /['"]rm['"]/]) {
      expect(code).not.toMatch(re);
    }
  });

  test('no other conductor module passes a stop argument to exec', () => {
    const others = sourceFiles().filter(f => path.basename(f) !== 'reaper.js');
    for (const f of others) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/['"]stop['"]/);
  });
});
