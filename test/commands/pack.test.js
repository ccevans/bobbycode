// test/commands/pack.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import matter from 'gray-matter';

describe('bobby pack', () => {
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
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify({
      project: 'pack-test', stack: 'generic',
      tickets_dir: '.bobby/tickets', sprints_dir: '.bobby/sprints',
      sessions_dir: '.bobby/sessions', ticket_prefix: 'TKT',
    }));
    fs.mkdirSync(ticketsDir(), { recursive: true });
    fs.writeFileSync(path.join(ticketsDir(), '.counter'), '0');
  };

  const localPack = () => {
    write('src-pack/pack.yml', `
id: demo
name: Demo Platform
version: 1.0.0
domain: A test platform
checks:
  - id: tenant-scoping
    area: data
    severity: critical
    title: Rows carry a tenant id
    why: Shared tables leak across customers.
    fix: Add tenant_id and filter every query.
    detect: { grep: "tenant_id" }
roadmap:
  - title: Add tenant scoping to every table
    priority: critical
    area: data
    criteria:
      - Every table has a tenant column.
      - Every query filters by it.
  - title: Already done thing
    skipWhen: { grep: "package" }
`);
    write('src-pack/scaffolds/docs/TENANCY.md', '# Tenancy\n\nHow this app isolates customers.\n');
    return path.join(tmpDir, 'src-pack');
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-pack-cmd-'));
    write('package.json', '{"name":"app"}');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('lists the built-in packs', () => {
    const out = run('pack list');

    expect(out).toMatch(/saas-starter/);
    expect(out).toMatch(/SaaS Foundations/);
  });

  it('shows what a pack checks and where it leads', () => {
    const out = run('pack info saas-starter');

    expect(out).toMatch(/Checks/);
    expect(out).toMatch(/Roadmap/);
    expect(out).toMatch(/paid path|account model/i);
  });

  it('errors helpfully on an unknown pack', () => {
    expect(() => run('pack info nope')).toThrow(/No pack "nope"/);
  });

  it('installs a pack into the project and then finds it', () => {
    initProject();
    const out = run(`pack add ${localPack()}`);

    expect(out).toMatch(/Installed demo/);
    expect(fs.existsSync(path.join(tmpDir, '.bobby/packs/demo/pack.yml'))).toBe(true);
    expect(run('pack list')).toMatch(/demo/);
  });

  it('scores against an installed pack with audit --pack', () => {
    initProject();
    run(`pack add ${localPack()}`);

    const parsed = JSON.parse(run('audit --pack demo --json'));
    const ids = [...parsed.findings, ...parsed.passed].map((c) => c.id);

    expect(ids).toContain('demo/tenant-scoping');
    expect(parsed.byArea.data.total).toBeGreaterThan(0);
  });

  it('rejects --pack for a pack that is not installed', () => {
    initProject();
    expect(() => run('audit --pack ghost')).toThrow(/No pack "ghost"/);
  });

  it('apply seeds the roadmap as real tickets, skipping satisfied items', () => {
    initProject();
    run(`pack add ${localPack()}`);

    const out = run('pack apply demo');
    expect(out).toMatch(/TKT-\d+/);
    // The second roadmap item is satisfied by this repo, so it is not seeded.
    expect(out).toMatch(/1 item\(s\) skipped/);

    const dirs = fs.readdirSync(ticketsDir()).filter((d) => d.startsWith('TKT-'));
    expect(dirs).toHaveLength(1);

    const ticket = matter(fs.readFileSync(path.join(ticketsDir(), dirs[0], 'ticket.md'), 'utf8'));
    expect(ticket.data.priority).toBe('critical');
    expect(ticket.data.author).toBe('pack:demo');
    expect(ticket.content).toContain('Demo Platform');
    expect(ticket.content).toContain('Every table has a tenant column.');
    expect(ticket.content).not.toContain('[First criterion]');
  });

  it('apply copies scaffolds without clobbering existing files', () => {
    initProject();
    run(`pack add ${localPack()}`);
    write('docs/TENANCY.md', 'MY OWN NOTES');

    run('pack apply demo');

    // An existing file is never overwritten by a pack.
    expect(fs.readFileSync(path.join(tmpDir, 'docs/TENANCY.md'), 'utf8')).toBe('MY OWN NOTES');
  });

  it('removes an installed pack', () => {
    initProject();
    run(`pack add ${localPack()}`);
    run('pack rm demo');

    expect(fs.existsSync(path.join(tmpDir, '.bobby/packs/demo'))).toBe(false);
    expect(() => run('pack rm demo')).toThrow(/not installed/);
  });
});
