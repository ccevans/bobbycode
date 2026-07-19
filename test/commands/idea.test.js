// test/commands/idea.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby idea', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, { cwd: tmpDir, encoding: 'utf8' });
  const ideasFile = () => path.join(tmpDir, '.bobby', 'ideas.yml');
  const readIdeas = () => (YAML.parse(fs.readFileSync(ideasFile(), 'utf8')) || {}).ideas || [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-idea-'));
    const config = {
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets',
      sprints_dir: '.bobby/sprints',
      sessions_dir: '.bobby/sessions',
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'), '0');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('captures a quoted idea', () => {
    const out = run('idea "add passwordless login"');
    expect(out).toContain('Captured idea #1');
    const ideas = readIdeas();
    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({ n: 1, text: 'add passwordless login', promoted: null });
  });

  test('captures unquoted words by joining them', () => {
    run('idea build a settings page');
    expect(readIdeas()[0].text).toBe('build a settings page');
  });

  test('numbers ideas incrementally', () => {
    run('idea "first"');
    run('idea "second"');
    const ideas = readIdeas();
    expect(ideas.map(i => i.n)).toEqual([1, 2]);
  });

  test('list shows open ideas', () => {
    run('idea "capture me"');
    const out = run('idea list');
    expect(out).toContain('#1');
    expect(out).toContain('capture me');
  });

  test('bare `idea` with no args lists', () => {
    run('idea "something"');
    const out = run('idea');
    expect(out).toContain('something');
  });

  test('promote turns an idea into a backlog ticket and marks it', () => {
    run('idea "add login"');
    const out = run('idea promote 1 -p high');
    expect(out).toContain('Promoted idea #1');
    expect(out).toContain('TKT-001');
    // Idea marked promoted
    expect(readIdeas()[0].promoted).toBe('TKT-001');
    // Ticket exists with the idea text as title
    const ticketDir = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets')).find(e => e.startsWith('TKT-001'));
    const ticket = fs.readFileSync(path.join(tmpDir, '.bobby', 'tickets', ticketDir, 'ticket.md'), 'utf8');
    expect(ticket).toContain('title: add login');
    expect(ticket).toContain('priority: high');
  });

  test('promoted ideas are hidden from the default list but shown with --all', () => {
    run('idea "one"');
    run('idea promote 1');
    expect(run('idea list')).toContain('No open ideas');
    expect(run('idea list --all')).toContain('one');
  });

  test('promoting an already-promoted idea warns and does not create a second ticket', () => {
    run('idea "dup"');
    run('idea promote 1');
    const out = run('idea promote 1');
    expect(out).toContain('already promoted');
    const tickets = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets')).filter(e => e.startsWith('TKT-'));
    expect(tickets).toHaveLength(1);
  });

  test('promote with --epic creates an epic', () => {
    run('idea "big thing"');
    run('idea promote 1 --epic');
    const ticketDir = fs.readdirSync(path.join(tmpDir, '.bobby', 'tickets')).find(e => e.startsWith('TKT-001'));
    const ticket = fs.readFileSync(path.join(tmpDir, '.bobby', 'tickets', ticketDir, 'ticket.md'), 'utf8');
    expect(ticket).toContain('type: epic');
  });

  test('promote fails on an unknown idea number', () => {
    expect(() => run('idea promote 99')).toThrow();
  });

  test('rm deletes an idea', () => {
    run('idea "delete me"');
    const out = run('idea rm 1');
    expect(out).toContain('Removed idea #1');
    expect(readIdeas()).toHaveLength(0);
  });
});
