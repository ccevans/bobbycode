// test/lib/project.test.js
//
// TKT-025. `createProject` used to live inside the closure `commands/new.js`
// hands to commander, so the only way to reach it was to spawn the CLI — which
// is why `test/commands/new.test.js` shells out for every one of its cases.
//
// The point of the extraction is not the move, it is the SIGNATURE: a caller
// that is not a terminal (the app's onboarding, TKT-024; studio mode, TKT-022)
// has to be able to name where the project goes, get the facts back as values,
// and see a failure as a thrown Error rather than as an exit code and some
// text on a stream it does not own. Every test in this file calls the function
// directly — nothing here spawns `node bin/bobby.js`, and nothing spawns
// `claude`.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
// Jest's ESM runtime does not inject the `jest` global — it has to be imported.
import { jest } from '@jest/globals';
import YAML from 'yaml';
import { createProject, PROJECT_STACKS } from '../../lib/project.js';

let tmp;

// `git commit` needs an identity, and this file's tests make real commits.
//
// It cannot be arranged from here. Setting GIT_AUTHOR_NAME and friends on
// `process.env` looks like it should work and does nothing: a Jest ESM test
// module gets a COPY of process.env that spawned children never see — the same
// reason the failing-commit branch is not exercised below. This file therefore
// depends on the MACHINE having a git identity, which every developer box has
// and a bare CI runner does not; .github/workflows/ci.yml configures one.
//
// It went unnoticed for so long because macOS git auto-detects user@host and
// commits anyway, while the Linux runner's `runner` user has an empty gecos and
// git refuses with "empty ident name" (TKT-072).

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-project-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('createProject', () => {
  it('scaffolds into a directory slugged from the idea, under the cwd it is given', () => {
    const result = createProject('a habit tracker for runners', { cwd: tmp });

    // `cwd` is the whole reason this is callable from a server: the app's
    // process is sitting in the repo it is serving, not where a new project
    // belongs, so the parent directory has to be an argument.
    expect(result.dirName).toBe('a-habit-tracker-for-runners');
    expect(result.root).toBe(path.join(tmp, 'a-habit-tracker-for-runners'));
    expect(fs.existsSync(path.join(result.root, '.bobbyrc.yml'))).toBe(true);
    expect(fs.existsSync(path.join(result.root, '.claude', 'agents'))).toBe(true);
    expect(fs.existsSync(path.join(result.root, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.root, 'README.md'))).toBe(true);
  });

  it('returns the facts a caller needs instead of printing them', () => {
    const result = createProject('a url shortener', { dir: 'short', cwd: tmp });

    expect(result.epic.id).toBe('TKT-001');
    expect(result.config.project).toBe('short');
    expect(result.config.stack).toBe('node');
    expect(result.starter).toMatchObject({ dev: expect.any(String), url: expect.any(String) });
    // commitError FIRST: it carries git's own words, so a failure here names its
    // cause instead of printing a bare `false` (TKT-072).
    expect(result.commitError).toBeNull();
    expect(result.committed).toBe(true);
  });

  it('captures the idea as a high-priority epic with the idea in its body', () => {
    const { root, epic } = createProject('a habit tracker for runners', { cwd: tmp });

    const ticket = fs.readFileSync(path.join(epic.path, 'ticket.md'), 'utf8');
    expect(ticket).toContain('type: epic');
    expect(ticket).toContain('priority: high');
    expect(ticket).toContain('**The idea:** a habit tracker for runners');
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8'))
      .toContain('a habit tracker for runners');
  });

  it('makes the initial commit', () => {
    const { root, epic, commitError } = createProject('a habit tracker for runners', { cwd: tmp });

    // Assert the commit succeeded BEFORE shelling out to read it. Otherwise this
    // fails as an opaque `git log` crash about a branch with no commits, which
    // says nothing about why the commit never happened (TKT-072).
    expect(commitError).toBeNull();

    const log = execSync('git log --oneline', { cwd: root, encoding: 'utf8' });
    expect(log).toMatch(new RegExp(`Scaffold ${epic.id}`));
  });

  it('--dir and --stack are options, not flags it has to parse', () => {
    const { root, config } = createProject('a web thing', { dir: 'webapp', stack: 'nextjs', cwd: tmp });

    expect(config.stack).toBe('nextjs');
    const written = YAML.parse(fs.readFileSync(path.join(root, '.bobbyrc.yml'), 'utf8'));
    expect(written.stack).toBe('nextjs');
  });

  it('lays down a runnable starter when the stack has one, and nothing when it does not', () => {
    const withStarter = createProject('a url shortener', { dir: 'short', cwd: tmp });
    expect(fs.existsSync(path.join(withStarter.root, 'server.js'))).toBe(true);

    const without = createProject('a thing', { dir: 'plain', stack: 'generic', cwd: tmp });
    expect(without.starter).toBeNull();
    expect(fs.existsSync(path.join(without.root, 'server.js'))).toBe(false);
  });

  /* ---- failures are thrown, never exited ---- */

  it.each([
    ['an empty idea', '', {}, /Give me an idea/],
    ['a whitespace idea', '   ', {}, /Give me an idea/],
    ['an unknown stack', 'x', { stack: 'banana' }, /Unknown stack "banana"/],
  ])('throws on %s rather than calling process.exit', (_what, idea, opts, message) => {
    expect(() => createProject(idea, { cwd: tmp, ...opts })).toThrow(message);
  });

  it('refuses a non-empty existing directory, and leaves it alone', () => {
    fs.mkdirSync(path.join(tmp, 'taken'));
    fs.writeFileSync(path.join(tmp, 'taken', 'file.txt'), 'x');

    expect(() => createProject('y', { dir: 'taken', cwd: tmp })).toThrow(/already exists and isn't empty/);
    expect(fs.readdirSync(path.join(tmp, 'taken'))).toEqual(['file.txt']);
  });

  // A commit that cannot be made is a fact to report, not a crash and not a
  // line printed to a stream the caller does not own. The CLI turns this into
  // its `warn()`; the app can put it on screen.
  // The heart of the ticket. Inside the closure, everything this function knew
  // it told the terminal — the epic id, the starter's dev command, whether the
  // commit landed, and every failure. A caller that is not a terminal gets none
  // of that back, so the extraction is only real if the function has gone
  // silent and says it all in its return value instead.
  it('writes nothing to the console — success or failure', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warned = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      createProject('a quiet idea', { dir: 'quiet', cwd: tmp });
      expect(() => createProject('x', { dir: 'quiet', cwd: tmp })).toThrow();

      expect(log).not.toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
      expect(warned).not.toHaveBeenCalled();
    } finally {
      log.mockRestore(); err.mockRestore(); warned.mockRestore();
    }
  });

  // The commit is best-effort and its outcome is DATA — two fields, not a
  // `warn()` on a stream the caller does not own. The failing branch is not
  // exercised here on purpose: making `git commit` fail needs a poisoned
  // environment, and a Jest ESM test module gets a COPY of process.env that
  // child processes never see, so any such test would pass for the wrong
  // reason. What is pinned is that both fields come back at all.
  it('reports the commit outcome as fields rather than as output', () => {
    const result = createProject('an idea', { dir: 'committed', cwd: tmp });

    expect(result).toHaveProperty('committed');
    expect(result).toHaveProperty('commitError');
    // commitError FIRST: it carries git's own words, so a failure here names its
    // cause instead of printing a bare `false` (TKT-072).
    expect(result.commitError).toBeNull();
    expect(result.committed).toBe(true);
  });

  it('publishes the stack list so the CLI and the app offer the same choices', () => {
    expect(PROJECT_STACKS).toContain('node');
    expect(PROJECT_STACKS).toContain('generic');
    expect(PROJECT_STACKS[0]).toBe('node');
  });
});
