// test/commands/cli-help.test.js — a bad option prints that subcommand's help (TKT-087).
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('help after a commander error', () => {
  const bobby = path.resolve('bin/bobby.js');
  let tmpDir;

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-help-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  const run = (args) => spawnSync('node', [bobby, ...args], { cwd: tmpDir, encoding: 'utf8' });

  test('unknown option on a nested subcommand prints that subcommand usage', () => {
    const r = run(['ticket', 'create', '--bogus', '-t', 'x']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/error: unknown option '--bogus'/);
    expect(r.stderr).toContain('Usage: bobby ticket create [options]');
    expect(r.stderr).toContain('--found-in <id>');
  });

  test('unknown option on a top-level subcommand prints its usage too', () => {
    const r = run(['brief', '--bogus']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unknown option '--bogus'/);
    expect(r.stderr).toContain('Usage: bobby brief');
  });

  test('a missing argument prints the command usage', () => {
    const r = run(['ticket', 'move', 'TKT-001']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/missing required argument 'alias'/);
    expect(r.stderr).toContain('Usage: bobby ticket move');
  });

  test('--help still exits 0 with usage on stdout', () => {
    const r = run(['ticket', 'create', '--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage: bobby ticket create');
  });
});
