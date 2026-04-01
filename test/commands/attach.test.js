// test/commands/attach.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby attach', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-attach-'));
    const config = {
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login', 'ticket.md'),
      '---\nid: TKT-001\ntitle: Fix login\nstage: backlog\n---\n## Description\n'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('attaches a file to a ticket', () => {
    const file = path.join(tmpDir, 'screenshot.png');
    fs.writeFileSync(file, 'fake-png-data');

    execSync(`node ${bobby} attach TKT-001 screenshot.png`, { cwd: tmpDir });

    const dest = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login', 'test-evidence', 'screenshots', 'screenshot.png');
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf8')).toBe('fake-png-data');
    // Original removed
    expect(fs.existsSync(file)).toBe(false);
  });

  test('attaches multiple files', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.png'), 'aaa');
    fs.writeFileSync(path.join(tmpDir, 'b.png'), 'bbb');

    execSync(`node ${bobby} attach TKT-001 a.png b.png`, { cwd: tmpDir });

    const evidenceDir = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login', 'test-evidence', 'screenshots');
    expect(fs.existsSync(path.join(evidenceDir, 'a.png'))).toBe(true);
    expect(fs.existsSync(path.join(evidenceDir, 'b.png'))).toBe(true);
  });

  test('supports custom --dir option', () => {
    fs.writeFileSync(path.join(tmpDir, 'app.log'), 'log data');

    execSync(`node ${bobby} attach TKT-001 app.log --dir logs`, { cwd: tmpDir });

    const dest = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login', 'test-evidence', 'logs', 'app.log');
    expect(fs.existsSync(dest)).toBe(true);
  });

  test('fails for non-existent ticket', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.png'), 'data');

    expect(() => {
      execSync(`node ${bobby} attach TKT-999 file.png`, { cwd: tmpDir, stdio: 'pipe' });
    }).toThrow();
  });

  test('warns for missing files and skips them', () => {
    fs.writeFileSync(path.join(tmpDir, 'real.png'), 'data');

    const output = execSync(`node ${bobby} attach TKT-001 missing.png real.png`, { cwd: tmpDir, encoding: 'utf8' });

    const evidenceDir = path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login', 'test-evidence', 'screenshots');
    expect(fs.existsSync(path.join(evidenceDir, 'real.png'))).toBe(true);
  });

  test('fails when all files are missing', () => {
    expect(() => {
      execSync(`node ${bobby} attach TKT-001 missing.png`, { cwd: tmpDir, stdio: 'pipe' });
    }).toThrow();
  });
});
