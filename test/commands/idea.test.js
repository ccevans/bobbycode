// test/commands/idea.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { STAGES } from '../../lib/stages.js';

describe('bobby idea + promote', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-idea-'));
    const config = { project: 'test', stack: 'generic', tickets_dir: 'tickets', areas: ['auth'], ticket_prefix: 'TKT', idea_prefix: 'IDEA', skill_routing: {} };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    for (const stage of STAGES) {
      fs.mkdirSync(path.join(tmpDir, 'tickets', stage), { recursive: true });
    }
    fs.writeFileSync(path.join(tmpDir, 'tickets', '.counter'), '0');
    fs.writeFileSync(path.join(tmpDir, 'tickets', '.idea-counter'), '0');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('creates an idea file in 0-ideas', () => {
    execSync(`node ${bobby} idea "Bulk CSV import" --area auth`, { cwd: tmpDir });
    const ideas = fs.readdirSync(path.join(tmpDir, 'tickets', '0-ideas'));
    expect(ideas.length).toBe(1);
    expect(ideas[0]).toMatch(/^IDEA-001--bulk-csv-import\.md$/);
  });

  test('promote converts idea to ticket', () => {
    execSync(`node ${bobby} idea "Promote me"`, { cwd: tmpDir });
    execSync(`node ${bobby} promote IDEA-001`, { cwd: tmpDir });
    // Idea should be deleted
    const ideas = fs.readdirSync(path.join(tmpDir, 'tickets', '0-ideas')).filter(f => f.endsWith('.md'));
    expect(ideas.length).toBe(0);
    // Ticket should exist in backlog
    const backlog = fs.readdirSync(path.join(tmpDir, 'tickets', '1-backlog'));
    expect(backlog.length).toBe(1);
  });
});
