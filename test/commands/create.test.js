// test/commands/create.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import matter from 'gray-matter';

describe('bobby ticket create', () => {
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
    execSync(`node ${bobby} ticket create -t "Fix login" --type bug -p high`, { cwd: tmpDir });
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
    execSync(`node ${bobby} ticket create -t "Big feature" --epic`, { cwd: tmpDir });
    const entries = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets'))
      .filter(e => e.startsWith('TKT-'));
    expect(entries.length).toBe(1);

    const ticketFile = path.join(tmpDir, '.bobby', 'tickets', entries[0], 'ticket.md');
    const { data } = matter(fs.readFileSync(ticketFile, 'utf8'));
    expect(data.type).toBe('epic');
  });

  test('creates a ticket with --parent flag', () => {
    execSync(`node ${bobby} ticket create -t "Sub task" --parent TKT-001`, { cwd: tmpDir });
    const entries = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets'))
      .filter(e => e.startsWith('TKT-'));

    const ticketFile = path.join(tmpDir, '.bobby', 'tickets', entries[0], 'ticket.md');
    const { data } = matter(fs.readFileSync(ticketFile, 'utf8'));
    expect(data.parent).toBe('TKT-001');
  });

  test('fails without title', () => {
    expect(() => {
      execSync(`node ${bobby} ticket create`, { cwd: tmpDir, stdio: 'pipe' });
    }).toThrow();
  });

  describe('--found-in', () => {
    const ticketsPath = () => path.join(tmpDir, '.bobby', 'tickets');
    const readData = (prefix) => {
      const dir = fs.readdirSync(ticketsPath()).find(e => e.startsWith(prefix));
      return matter(fs.readFileSync(path.join(ticketsPath(), dir, 'ticket.md'), 'utf8')).data;
    };

    test('records the ticket the finding came from', () => {
      execSync(`node ${bobby} ticket create -t "Origin"`, { cwd: tmpDir });
      const out = execSync(
        `node ${bobby} ticket create -t "Login 500s on empty email" --type bug -p high -a bobby-build --found-in TKT-001`,
        { cwd: tmpDir, encoding: 'utf8' },
      );
      expect(out).toContain('Found in TKT-001');
      const data = readData('TKT-002');
      expect(data.found_in).toBe('TKT-001');
      expect(data.author).toBe('bobby-build');
      expect(data.stage).toBe('backlog');
    });

    test('an unknown origin is an explicit error and writes nothing', () => {
      let err;
      try {
        execSync(`node ${bobby} ticket create -t "X" --found-in TKT-999`, { cwd: tmpDir, stdio: 'pipe' });
      } catch (e) { err = e; }
      expect(err).toBeDefined();
      expect(err.status).toBe(1);
      expect(err.stderr.toString()).toMatch(/TKT-999.*no such ticket/);
      expect(fs.readdirSync(ticketsPath()).filter(e => e.startsWith('TKT-'))).toHaveLength(0);
      expect(fs.readFileSync(path.join(ticketsPath(), '.counter'), 'utf8').trim()).toBe('0');
    });

    test('without the flag found_in is null', () => {
      execSync(`node ${bobby} ticket create -t "Plain"`, { cwd: tmpDir });
      expect(readData('TKT-001').found_in).toBeNull();
    });
  });
});
