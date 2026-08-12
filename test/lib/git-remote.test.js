// test/lib/git-remote.test.js
//
// TKT-012. Two things are being pinned here, and the second matters more than
// the first: the parser understands every form git itself writes, and ABSENCE
// is an answer rather than a throw. The Feature view's sublabel degrades to the
// project name, so every unparseable case has to arrive as null.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { parseGitRemote, originRepo } from '../../lib/git-remote.js';

describe('parseGitRemote', () => {
  it('reads owner/repo out of an https remote', () => {
    expect(parseGitRemote('https://github.com/ccevans/bobbycode')).toBe('ccevans/bobbycode');
  });

  it('reads owner/repo out of an scp-form ssh remote', () => {
    expect(parseGitRemote('git@github.com:ccevans/bobbycode.git')).toBe('ccevans/bobbycode');
  });

  it('reads owner/repo out of an ssh:// remote', () => {
    expect(parseGitRemote('ssh://git@github.com/ccevans/bobbycode')).toBe('ccevans/bobbycode');
  });

  it('drops a trailing .git in either form', () => {
    expect(parseGitRemote('https://github.com/ccevans/bobbycode.git')).toBe('ccevans/bobbycode');
    expect(parseGitRemote('git@github.com:ccevans/bobbycode.git')).toBe('ccevans/bobbycode');
  });

  it('drops a trailing slash', () => {
    expect(parseGitRemote('https://github.com/ccevans/bobbycode/')).toBe('ccevans/bobbycode');
  });

  it('keeps credentials out of the answer', () => {
    expect(parseGitRemote('https://ccevans:ghp_secret@github.com/ccevans/bobbycode.git'))
      .toBe('ccevans/bobbycode');
  });

  // Not a GitHub allowlist: every forge puts owner and repo in the last two
  // path segments, and a host check would return null for exactly the
  // self-hosted repos that have no other name to show.
  it('works for hosts that are not GitHub', () => {
    expect(parseGitRemote('git@gitlab.com:acme/website.git')).toBe('acme/website');
    expect(parseGitRemote('https://bitbucket.org/acme/website.git')).toBe('acme/website');
    expect(parseGitRemote('ssh://git@git.internal:2222/team/thing.git')).toBe('team/thing');
  });

  it('takes the last group and the repo from a nested GitLab path', () => {
    expect(parseGitRemote('https://gitlab.com/top/middle/thing.git')).toBe('middle/thing');
  });

  // A path names a directory, not an owner. `srv/mirror` would be a fabrication.
  it.each([
    ['an absolute path', '/srv/git/mirror.git'],
    ['a relative path', '../vendor/thing'],
    ['a bare relative path', 'repos/thing'],
    ['a file:// URL', 'file:///srv/git/mirror.git'],
  ])('returns null for %s', (_what, url) => {
    expect(parseGitRemote(url)).toBeNull();
  });

  it.each([
    ['an empty string', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
    ['a host with no path', 'git@github.com:'],
    ['a single path segment', 'git@github.com:bobbycode.git'],
    ['nonsense', 'not a url at all'],
  ])('returns null for %s rather than throwing', (_what, url) => {
    expect(parseGitRemote(url)).toBeNull();
  });
});

describe('originRepo', () => {
  let tmp;
  const git = (args, cwd) => execSync(`git ${args}`, { cwd, stdio: 'pipe', encoding: 'utf8' });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-remote-'));
    git('init', tmp);
  });

  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('reads the origin remote of a real repo', () => {
    git('remote add origin https://github.com/ccevans/bobbycode.git', tmp);
    expect(originRepo(tmp)).toBe('ccevans/bobbycode');
  });

  it('is null in a repo with no origin', () => {
    expect(originRepo(tmp)).toBeNull();
  });

  it('is null when a remote exists but names no owner', () => {
    git(`remote add origin ${path.join(tmp, 'mirror.git')}`, tmp);
    expect(originRepo(tmp)).toBeNull();
  });

  it('is null outside a git repository', () => {
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-notgit-'));
    try {
      expect(originRepo(notARepo)).toBeNull();
    } finally {
      fs.rmSync(notARepo, { recursive: true, force: true });
    }
  });

  // The "git is not installed" case, which cannot be arranged on a machine that
  // plainly has git: a directory that does not exist makes the spawn itself
  // fail, which is the same failure mode as a missing binary.
  it('is null when git cannot be run at all', () => {
    expect(originRepo(path.join(tmp, 'no', 'such', 'dir'))).toBeNull();
  });
});
