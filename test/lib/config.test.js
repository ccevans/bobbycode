// test/lib/config.test.js
import { readConfig, writeConfig, findProjectRoot } from '../../lib/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('config', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('readConfig reads .bobbyrc.yml', () => {
    const yml = `project: test-app\nstack: nextjs\ntickets_dir: tickets\nareas:\n  - auth\n  - dashboard\n`;
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), yml);
    const config = readConfig(tmpDir);
    expect(config.project).toBe('test-app');
    expect(config.stack).toBe('nextjs');
    expect(config.areas).toEqual(['auth', 'dashboard']);
  });

  test('readConfig throws if no .bobbyrc.yml', () => {
    expect(() => readConfig(tmpDir)).toThrow('Not a Bobby project');
  });

  test('writeConfig creates .bobbyrc.yml', () => {
    const config = { project: 'my-app', stack: 'nextjs', tickets_dir: 'tickets', areas: ['auth'] };
    writeConfig(tmpDir, config);
    const content = fs.readFileSync(path.join(tmpDir, '.bobbyrc.yml'), 'utf8');
    expect(content).toContain('project: my-app');
  });

  test('readConfig applies defaults for missing fields', () => {
    const yml = `project: test-app\nstack: nextjs\n`;
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), yml);
    const config = readConfig(tmpDir);
    expect(config.tickets_dir).toBe('tickets');
    expect(config.ticket_prefix).toBe('TKT');
    expect(config.idea_prefix).toBe('IDEA');
  });
});
