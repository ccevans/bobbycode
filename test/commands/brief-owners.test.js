// test/commands/brief-owners.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import matter from 'gray-matter';

describe('bobby brief — owners', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const brief = () => execSync(`node ${bobby} brief`, { cwd: tmpDir, encoding: 'utf8' })
    .replace(/\x1b\[[0-9;]*m/g, '');

  const add = (id, stage, owner) => {
    const dir = path.join(tmpDir, '.bobby', 'tickets', `${id}--t-${id.toLowerCase()}`);
    fs.mkdirSync(dir, { recursive: true });
    const data = { id, title: `Title ${id}`, stage, priority: 'medium' };
    if (owner) data.owner = { ...owner, since: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, 'ticket.md'), matter.stringify('## Description\n', data));
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-brief-owners-'));
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify({
      project: 'test', stack: 'generic', tickets_dir: '.bobby/tickets', sprints_dir: '.bobby/sprints', ticket_prefix: 'TKT',
    }));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'), '0');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('TC10 groups in-flight tickets by machine then session', () => {
    add('TKT-001', 'building', { session: 'studio-27', machine: 'M4' });
    add('TKT-002', 'reviewing', { session: 'intel-2', machine: 'Intel MBP' });
    add('TKT-003', 'building', { session: 'studio-28', machine: 'M4' });
    add('TKT-004', 'testing');
    add('TKT-005', 'done', { session: 'old', machine: 'M4' });
    const out = brief();
    const inFlight = out.slice(out.indexOf('In flight'), out.indexOf('Backlog'));
    const order = ['Intel MBP', 'intel-2', 'TKT-002', 'M4', 'studio-27', 'TKT-001', 'studio-28', 'TKT-003', 'No owner', 'TKT-004'];
    const positions = order.map(s => inFlight.indexOf(s));
    expect(positions.every(p => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(inFlight).not.toContain('TKT-005');
  });

  test('a null machine shows as "machine not recorded"', () => {
    add('TKT-001', 'building', { session: 'intel-2', machine: null });
    expect(brief()).toContain('machine not recorded');
  });

  test('TC11 without owners the flat format is unchanged', () => {
    add('TKT-001', 'building');
    add('TKT-002', 'reviewing');
    const out = brief();
    expect(out).toMatch(/\n {4}\[REVIEWING\]  TKT-002/);
    expect(out).toMatch(/\n {4}\[BUILDING\]  TKT-001/);
    expect(out).not.toContain('No owner');
    expect(out).not.toContain('machine not recorded');
  });
});
