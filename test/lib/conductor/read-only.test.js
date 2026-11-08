// BOB-174: the conductor board never stops, starts or deletes anything. Later
// tickets that add a mutating command allow-list exactly that one command here.
import fs from 'fs';
import path from 'path';

const FORBIDDEN = [
  ['stop', /\bstop\b/i],
  ['rm', /\brm\b/i],
  ['unlink', /unlink/i],
  ['down', /\bdown\b/i],
  ['--bg', /--bg\b/],
];

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
    const hits = sourceFiles().flatMap(f =>
      fs.readFileSync(f, 'utf8').split('\n')
        .map((line, i) => (re.test(line) ? `${path.relative(process.cwd(), f)}:${i + 1}: ${line.trim()}` : null))
        .filter(Boolean));
    expect(hits).toEqual([]);
  });
});
