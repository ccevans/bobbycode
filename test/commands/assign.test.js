// test/commands/assign.test.js
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import matter from 'gray-matter';
import { machineName, HANDOFF_SECTIONS } from '../../lib/owner.js';
import { scaffoldProject } from '../../commands/init.js';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'T', GIT_COMMITTER_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t.com', GIT_COMMITTER_EMAIL: 't@t.com',
};

describe('bobby ticket assign --session / handoff', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const ticketDir = () => path.join(tmpDir, '.bobby', 'tickets', 'TKT-001--fix-login');
  const ticketFile = () => path.join(ticketDir(), 'ticket.md');
  const progressFile = () => path.join(ticketDir(), 'progress.md');
  const fm = () => matter(fs.readFileSync(ticketFile(), 'utf8')).data;
  const run = (...args) => spawnSync('node', [bobby, 'ticket', ...args], { cwd: tmpDir, encoding: 'utf8', env: GIT_ENV });
  const fillAll = (text) => text.replace(/TODO\(handoff\): .*/g, 'none');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-assign-'));
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify({
      project: 'test', stack: 'generic', tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
    }));
    fs.mkdirSync(ticketDir(), { recursive: true });
    fs.writeFileSync(ticketFile(), '---\nid: TKT-001\ntitle: Fix login\nstage: building\n---\n## Description\n');
    execSync('git init -q && git add -A && git commit -qm init', { cwd: tmpDir, env: GIT_ENV });
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('TC1 assign --session records owner and leaves assigned alone', () => {
    const before = Date.now();
    const r = run('assign', 'TKT-001', 'bobby-build', '--session', 'studio-27');
    expect(r.status).toBe(0);
    const d = fm();
    expect(d.assigned).toBe('bobby-build');
    expect(d.owner.session).toBe('studio-27');
    expect(d.owner.machine).toBe(machineName());
    expect(typeof d.owner.since).toBe('string');
    expect(Date.parse(d.owner.since)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(d.owner.since)).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test('TC2 assign without --session keeps an existing owner', () => {
    run('assign', 'TKT-001', 'bobby-build', '--session', 'studio-27');
    const owner = fm().owner;
    const r = run('assign', 'TKT-001', 'someone-else');
    expect(r.status).toBe(0);
    expect(fm().assigned).toBe('someone-else');
    expect(fm().owner).toEqual(owner);
  });

  test('TC3 empty --session is an error and changes nothing', () => {
    const before = fs.readFileSync(ticketFile(), 'utf8');
    const r = run('assign', 'TKT-001', 'x', '--session', '');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--session needs a session name');
    expect(fs.readFileSync(ticketFile(), 'utf8')).toBe(before);
  });

  test('TC4 first handoff writes the template and refuses', () => {
    run('assign', 'TKT-001', 'bobby-build', '--session', 'studio-27');
    const owner = fm().owner;
    const r = run('handoff', 'TKT-001', '--to', 'intel-2');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('progress.md');
    const text = fs.readFileSync(progressFile(), 'utf8');
    const idx = HANDOFF_SECTIONS.map(([n]) => text.indexOf(`## ${n}`));
    expect(idx.every(i => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect((text.match(/TODO\(handoff\):/g) || []).length).toBe(6);
    expect(fm().owner).toEqual(owner);
  });

  test('TC5 placeholders left are refused, naming the sections', () => {
    run('handoff', 'TKT-001', '--to', 'intel-2');
    let text = fillAll(fs.readFileSync(progressFile(), 'utf8'));
    text = text.replace(/(## Resources held\n\n).*/, '$1TODO(handoff): ports').replace(/(## Next step\n\n).*/, '$1TODO(handoff): x');
    fs.writeFileSync(progressFile(), text);
    const ownerBefore = fm().owner;
    const r = run('handoff', 'TKT-001', '--to', 'intel-2');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Resources held, Next step');
    expect(fs.readFileSync(progressFile(), 'utf8')).toBe(text);
    expect(fm().owner).toEqual(ownerBefore);
  });

  test('TC6 filled handoff sets owner, adds the handed-off line, commits the ticket only', () => {
    run('assign', 'TKT-001', 'bobby-build', '--session', 'studio-27');
    run('handoff', 'TKT-001', '--to', 'intel-2', '--machine', 'Intel MBP');
    fs.writeFileSync(progressFile(), fillAll(fs.readFileSync(progressFile(), 'utf8')));
    fs.writeFileSync(path.join(tmpDir, 'unrelated.txt'), 'x');
    const r = run('handoff', 'TKT-001', '--to', 'intel-2', '--machine', 'Intel MBP');
    expect(r.status).toBe(0);
    const d = fm();
    expect(d.owner.session).toBe('intel-2');
    expect(d.owner.machine).toBe('Intel MBP');
    expect(typeof d.owner.since).toBe('string');
    expect(d.assigned).toBe('bobby-build');
    const text = fs.readFileSync(progressFile(), 'utf8');
    expect(text).toMatch(new RegExp(`^# Handoff.*\\n\\n> Handed off \\S+ from studio-27 on ${machineName()} to intel-2 on Intel MBP`));
    expect(execSync('git log -1 --format=%s', { cwd: tmpDir, encoding: 'utf8' }).trim()).toBe('bobby: auto-sync');
    const files = execSync('git log -1 --name-only --format=', { cwd: tmpDir, encoding: 'utf8' }).trim().split('\n');
    expect(files.sort()).toEqual([
      '.bobby/tickets/TKT-001--fix-login/progress.md',
      '.bobby/tickets/TKT-001--fix-login/ticket.md',
    ]);
    // a second handoff replaces the line instead of stacking it
    run('handoff', 'TKT-001', '--to', 'studio-30');
    expect(fs.readFileSync(progressFile(), 'utf8').match(/> Handed off/g)).toHaveLength(1);
  });

  test('TC7 handoff without --machine leaves machine null', () => {
    run('handoff', 'TKT-001', '--to', 'intel-2');
    fs.writeFileSync(progressFile(), fillAll(fs.readFileSync(progressFile(), 'utf8')));
    const r = run('handoff', 'TKT-001', '--to', 'intel-2');
    expect(r.status).toBe(0);
    expect(fm().owner.machine).toBeNull();
    expect(fs.readFileSync(progressFile(), 'utf8')).toContain('from no recorded owner to intel-2\n');
  });

  test('TC8 existing free-form progress.md is preserved under Earlier notes', () => {
    fs.writeFileSync(progressFile(), 'checkpoint: halfway through step 3');
    const r = run('handoff', 'TKT-001', '--to', 'x');
    expect(r.status).toBe(1);
    const text = fs.readFileSync(progressFile(), 'utf8');
    expect(text).toContain('## Earlier notes\n\ncheckpoint: halfway through step 3');
    fs.writeFileSync(progressFile(), fillAll(text));
    expect(run('handoff', 'TKT-001', '--to', 'x').status).toBe(0);
    expect(fs.readFileSync(progressFile(), 'utf8')).toContain('checkpoint: halfway through step 3');
  });

  test('TC9 unknown ticket', () => {
    const r = run('handoff', 'TKT-999', '--to', 'x');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Ticket TKT-999 not found');
  });
});

describe('shared skill points at the handoff command (TC13)', () => {
  test('template and scaffolded skill both mention handoff and --session', () => {
    const tpl = fs.readFileSync(path.resolve('templates/skills/bobby-shared/SKILL.md'), 'utf8');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-assign-skill-'));
    try {
      scaffoldProject(tmp, {
        project: 'test-app', stack: 'nextjs', health_checks: [], areas: [],
        commands: { dev: 'npm run dev', test: 'npm test' }, tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
      });
      const out = fs.readFileSync(path.join(tmp, '.claude', 'skills', 'bobby-shared', 'SKILL.md'), 'utf8');
      for (const text of [tpl, out]) {
        expect(text).toContain('bobby ticket handoff');
        expect(text).toContain('--session');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
