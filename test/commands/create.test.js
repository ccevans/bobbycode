// test/commands/create.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { STAGES } from '../../lib/stages.js';

describe('bobby create', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-cmd-'));
    // Set up a Bobby project
    const config = { project: 'test', stack: 'generic', tickets_dir: 'tickets', areas: ['auth', 'dashboard'], ticket_prefix: 'TKT', idea_prefix: 'IDEA', skill_routing: {} };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    for (const stage of STAGES) {
      fs.mkdirSync(path.join(tmpDir, 'tickets', stage), { recursive: true });
    }
    fs.writeFileSync(path.join(tmpDir, 'tickets', '.counter'), '0');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('creates a ticket in 1-backlog', () => {
    execSync(`node ${bobby} create -t "Fix login" --type bug -p high`, { cwd: tmpDir });
    const backlog = fs.readdirSync(path.join(tmpDir, 'tickets', '1-backlog'));
    expect(backlog.length).toBe(1);
    expect(backlog[0]).toMatch(/^TKT-001--fix-login$/);
  });

  test('fails without title', () => {
    expect(() => {
      execSync(`node ${bobby} create`, { cwd: tmpDir, stdio: 'pipe' });
    }).toThrow();
  });
});
