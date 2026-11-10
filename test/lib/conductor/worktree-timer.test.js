import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildWorktreeTimerPlist, TIMER_LABEL } from '../../../lib/conductor/worktree-timer.js';

describe('conductor worktree timer plist', () => {
  let bin;
  let studio;
  let config;
  beforeEach(() => {
    bin = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-timer-bin-'));
    for (const name of ['git', 'claude', 'sysctl', 'node']) {
      fs.writeFileSync(path.join(bin, name), '#!/bin/sh\n');
      fs.chmodSync(path.join(bin, name), 0o755);
    }
    studio = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-timer-studio-'));
    config = { worktree_timer: { interval_minutes: 15, log_file: path.join(studio, 'a&b.log') } };
  });
  afterEach(() => {
    for (const d of [bin, studio]) fs.rmSync(d, { recursive: true, force: true });
  });

  const build = (env) => buildWorktreeTimerPlist({ studioRoot: studio, config, env: { HOME: '/home/cc', PATH: bin, ...env } });

  test('interval in seconds, the label, and XML-escaped paths', () => {
    const xml = build();
    expect(xml).toContain(`<string>${TIMER_LABEL}</string>`);
    expect(xml).toMatch(/<integer>900<\/integer>/);
    expect(xml).toContain(`<string>${path.join(studio, 'a&amp;b.log')}</string>`);
    // node is taken from PATH as written, so a Homebrew opt/ link is not pinned to its Cellar version
    expect(xml).toContain(`<string>${path.join(bin, 'node')}</string>`);
    expect(xml).toContain('<string>/home/cc</string>');
    expect(xml).toMatch(/<key>RunAtLoad<\/key>\s*<false\/>/);
  });

  test('git, claude or sysctl missing from PATH is an error naming them; nothing is printed', () => {
    fs.rmSync(path.join(bin, 'claude'));
    fs.chmodSync(path.join(bin, 'sysctl'), 0o644);
    expect(() => build()).toThrow(/claude, sysctl not found on PATH/);
  });

  test('node missing from PATH, or a log folder that does not exist, is an error', () => {
    fs.rmSync(path.join(bin, 'node'));
    expect(() => build()).toThrow(/node not found on PATH/);
    fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\n', { mode: 0o755 });
    config.worktree_timer.log_file = path.join(studio, 'missing', 'reap.log');
    expect(() => build()).toThrow(/worktree_timer\.log_file: folder .*missing does not exist/);
  });

  test('no PATH or no HOME is an error', () => {
    expect(() => build({ PATH: '' })).toThrow(/PATH is not set/);
    expect(() => build({ HOME: '' })).toThrow(/HOME is not set/);
  });
});
