// test/commands/audit.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import matter from 'gray-matter';

describe('bobby audit', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, { cwd: tmpDir, encoding: 'utf8', env: { ...process.env, BOBBY_NO_REGISTRY: '1', FORCE_COLOR: '0' } });
  const write = (rel, content) => {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  };
  const ticketsDir = () => path.join(tmpDir, '.bobby', 'tickets');

  const initProject = () => {
    const config = {
      project: 'audit-test', stack: 'generic',
      tickets_dir: '.bobby/tickets',
      sprints_dir: '.bobby/sprints',
      sessions_dir: '.bobby/sessions',
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(ticketsDir(), { recursive: true });
    fs.writeFileSync(path.join(ticketsDir(), '.counter'), '0');
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-audit-cmd-'));
    write('package.json', '{"name":"vibe-app"}');
    write('server.js', 'app.post("/login", (req, res) => res.json({}));');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('runs outside a Bobby project — auditing a repo Bobby has never touched is the point', () => {
    const out = run('audit');

    expect(out).toMatch(/Production readiness/);
    expect(out).toMatch(/\d+\/100/);
    expect(out).toMatch(/gap\(s\)/);
  });

  it('emits machine-readable findings with --json', () => {
    const parsed = JSON.parse(run('audit --json'));

    expect(typeof parsed.score).toBe('number');
    expect(parsed.grade).toBeTruthy();
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings[0]).toHaveProperty('severity');
    expect(parsed.findings[0]).toHaveProperty('fix');
    expect(parsed.byArea.security).toHaveProperty('score');
  });

  it('lists passing checks only when asked', () => {
    write('.gitignore', '.env\n');

    expect(run('audit')).not.toMatch(/Passing/);
    expect(run('audit --all')).toMatch(/Passing/);
  });

  it('--tickets seeds a real backlog with descriptions and criteria filled in', () => {
    initProject();

    const out = run('audit --tickets');
    expect(out).toMatch(/TKT-\d+/);

    const dirs = fs.readdirSync(ticketsDir()).filter((d) => d.startsWith('TKT-'));
    expect(dirs.length).toBeGreaterThan(3);

    const bodies = dirs.map((d) => matter(fs.readFileSync(path.join(ticketsDir(), d, 'ticket.md'), 'utf8')));

    // Every seeded ticket is actionable: no template placeholders left behind.
    for (const t of bodies) {
      expect(t.content).toContain('Gap found by');
      expect(t.content).toContain('Why it matters');
      expect(t.content).not.toContain('[First criterion]');
      expect(t.data.stage).toBe('backlog');
      expect(t.data.author).toBe('bobby-audit');
    }

    // Security gaps ride the secure workflow so the security stage runs.
    const security = bodies.filter((t) => t.data.area === 'security');
    expect(security.length).toBeGreaterThan(0);
    for (const t of security) expect(t.data.workflow).toBe('secure');
  });

  it('does not seed tickets without --tickets', () => {
    initProject();
    run('audit');

    expect(fs.readdirSync(ticketsDir()).filter((d) => d.startsWith('TKT-'))).toHaveLength(0);
  });

  it('tells you to init when asked for tickets outside a project', () => {
    const out = run('audit --tickets');

    expect(out).toMatch(/bobby init/);
    expect(fs.existsSync(path.join(tmpDir, '.bobby'))).toBe(false);
  });
});
