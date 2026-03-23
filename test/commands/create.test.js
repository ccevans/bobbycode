// test/commands/create.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import matter from 'gray-matter';

describe('bobby create', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-cmd-'));
    // Set up a Bobby project with single tickets directory
    const config = {
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets',
      areas: ['auth', 'dashboard'],
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'), '0');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('creates a ticket in the tickets directory', () => {
    execSync(`node ${bobby} create -t "Fix login" --type bug -p high`, { cwd: tmpDir });
    const entries = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets'))
      .filter(e => e.startsWith('TKT-'));
    expect(entries.length).toBe(1);
    expect(entries[0]).toMatch(/^TKT-001--fix-login$/);

    // Verify frontmatter
    const ticketFile = path.join(tmpDir, '.bobby', 'tickets', entries[0], 'ticket.md');
    const { data } = matter(fs.readFileSync(ticketFile, 'utf8'));
    expect(data.stage).toBe('backlog');
    expect(data.type).toBe('bug');
    expect(data.priority).toBe('high');
  });

  test('creates an epic with --epic flag', () => {
    execSync(`node ${bobby} create -t "Big feature" --epic`, { cwd: tmpDir });
    const entries = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets'))
      .filter(e => e.startsWith('TKT-'));
    expect(entries.length).toBe(1);

    const ticketFile = path.join(tmpDir, '.bobby', 'tickets', entries[0], 'ticket.md');
    const { data } = matter(fs.readFileSync(ticketFile, 'utf8'));
    expect(data.type).toBe('epic');
  });

  test('creates a ticket with --parent flag', () => {
    execSync(`node ${bobby} create -t "Sub task" --parent TKT-001`, { cwd: tmpDir });
    const entries = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets'))
      .filter(e => e.startsWith('TKT-'));

    const ticketFile = path.join(tmpDir, '.bobby', 'tickets', entries[0], 'ticket.md');
    const { data } = matter(fs.readFileSync(ticketFile, 'utf8'));
    expect(data.parent).toBe('TKT-001');
  });

  test('fails without title', () => {
    expect(() => {
      execSync(`node ${bobby} create`, { cwd: tmpDir, stdio: 'pipe' });
    }).toThrow();
  });
});
