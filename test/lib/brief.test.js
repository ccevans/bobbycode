// test/lib/brief.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { buildBrief } from '../../lib/brief.js';

describe('buildBrief', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, { cwd: tmpDir, encoding: 'utf8' });
  const ticketsDir = () => path.join(tmpDir, '.bobby', 'tickets');
  const sprintsDir = () => path.join(tmpDir, '.bobby', 'sprints');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-brief-'));
    const config = {
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets',
      sprints_dir: '.bobby/sprints',
      sessions_dir: '.bobby/sessions',
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(ticketsDir(), { recursive: true });
    fs.writeFileSync(path.join(ticketsDir(), '.counter'), '0');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('empty board suggests creating work', () => {
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.inFlight).toHaveLength(0);
    expect(b.backlogCount).toBe(0);
    expect(b.nextAction.command).toMatch(/bobby create|bobby idea/);
  });

  test('lists backlog tickets and picks the top-priority one to start', () => {
    run('create -t "Low thing" -p low');
    run('create -t "Critical thing" -p critical');
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.backlogCount).toBe(2);
    // Nothing in flight → next action starts the critical ticket
    expect(b.nextAction.command).toContain('bobby run pipeline');
    expect(b.backlogTop[0].priority).toBe('critical');
  });

  test('surfaces in-flight work and recommends the next agent', () => {
    run('create -t "Ship me"');
    run('move TKT-001 build');
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.inFlight.map(t => t.id)).toContain('TKT-001');
    // A ticket in "building" advances to review next
    expect(b.nextAction.command).toBe('bobby run review TKT-001');
  });

  test('the furthest-along in-flight ticket wins the next action', () => {
    run('create -t "Earlier"');   // TKT-001
    run('create -t "Later"');     // TKT-002
    run('move TKT-001 build');    // building
    run('move TKT-002 test');     // testing (further along)
    const b = buildBrief(ticketsDir(), sprintsDir());
    // testing outranks building → TKT-002 is closest to done
    expect(b.nextAction.command).toBe('bobby run ship TKT-002');
    expect(b.inFlight[0].id).toBe('TKT-002');
  });

  test('blocked tickets are separated from in-flight', () => {
    run('create -t "Stuck"');
    run('move TKT-001 build');
    run('move TKT-001 block "waiting on API"');
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.inFlight).toHaveLength(0);
    expect(b.blocked.map(t => t.id)).toContain('TKT-001');
  });

  test('includes active sprints with progress', () => {
    run('create -t "A"');
    run('create -t "B"');
    run('sprint new "Batch" TKT-001 TKT-002');
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.sprints).toHaveLength(1);
    expect(b.sprints[0]).toMatchObject({ id: 'SPR-001', total: 2, done: 0 });
  });
});
