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
    expect(b.nextAction.command).toMatch(/bobby ticket create|bobby idea/);
  });

  test('lists backlog tickets and picks the top-priority one to start', () => {
    run('ticket create -t "Low thing" -p low');
    run('ticket create -t "Critical thing" -p critical');
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.backlogCount).toBe(2);
    // Nothing in flight → next action starts the critical ticket
    expect(b.nextAction.command).toContain('bobby run workflow');
    expect(b.backlogTop[0].priority).toBe('critical');
  });

  test('surfaces in-flight work and recommends the next agent', () => {
    run('ticket create -t "Ship me"');
    run('ticket move TKT-001 build');
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.inFlight.map(t => t.id)).toContain('TKT-001');
    // A ticket in "building" advances to review next
    expect(b.nextAction.command).toBe('bobby run review TKT-001');
  });

  test('the furthest-along in-flight ticket wins the next action', () => {
    run('ticket create -t "Earlier"');   // TKT-001
    run('ticket create -t "Later"');     // TKT-002
    run('ticket move TKT-001 build');    // building
    run('ticket move TKT-002 test');     // testing (further along)
    const b = buildBrief(ticketsDir(), sprintsDir());
    // testing outranks building → TKT-002 is closest to done
    expect(b.nextAction.command).toBe('bobby run ship TKT-002');
    expect(b.inFlight[0].id).toBe('TKT-002');
  });

  test('a fresh epic (no children) -> next action is break it down with run plan', () => {
    run('ticket create -t "A whole product idea" --epic');
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.nextAction.command).toBe('bobby run plan TKT-001');
    expect(b.nextAction.reason).toMatch(/fresh idea/);
  });

  test('a planned epic (has children, nothing in flight) -> next action is run feature', () => {
    run('ticket create -t "A whole product idea" --epic');   // TKT-001 epic
    run('ticket create -t "child one" --parent TKT-001');     // TKT-002 child (backlog)
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.nextAction.command).toBe('bobby run feature TKT-001');
    expect(b.nextAction.reason).toMatch(/build the MVP/);
  });

  test('in-flight child work takes priority over kicking off the feature build', () => {
    run('ticket create -t "Epic" --epic');                 // TKT-001
    run('ticket create -t "child" --parent TKT-001');       // TKT-002
    run('ticket move TKT-002 build');                       // child in flight
    const b = buildBrief(ticketsDir(), sprintsDir());
    // Push the in-flight child, don't restart the whole feature
    expect(b.nextAction.command).toBe('bobby run review TKT-002');
  });

  test('blocked tickets are separated from in-flight', () => {
    run('ticket create -t "Stuck"');
    run('ticket move TKT-001 build');
    run('ticket move TKT-001 block "waiting on API"');
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.inFlight).toHaveLength(0);
    expect(b.blocked.map(t => t.id)).toContain('TKT-001');
  });

  test('includes active sprints with progress', () => {
    run('ticket create -t "A"');
    run('ticket create -t "B"');
    run('sprint new "Batch" TKT-001 TKT-002');
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.sprints).toHaveLength(1);
    expect(b.sprints[0]).toMatchObject({ id: 'SPR-001', total: 2, done: 0 });
  });
});

describe('define-pipeline routing', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, { cwd: tmpDir, encoding: 'utf8' });
  const ticketsDir = () => path.join(tmpDir, '.bobby', 'tickets');
  const sprintsDir = () => path.join(tmpDir, '.bobby', 'sprints');
  const productDir = () => path.join(tmpDir, '.bobby', 'product');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-define-'));
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify({
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets', sprints_dir: '.bobby/sprints',
      sessions_dir: '.bobby/sessions', ticket_prefix: 'TKT',
    }));
    fs.mkdirSync(ticketsDir(), { recursive: true });
    fs.writeFileSync(path.join(ticketsDir(), '.counter'), '0');
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('fresh epic with no feature map routes to define', () => {
    run('ticket create -t "An idea" --epic');
    const b = buildBrief(ticketsDir(), sprintsDir(), { productDir: productDir() });
    expect(b.nextAction.argv).toEqual(['run', 'define', 'TKT-001']);
    expect(b.nextAction.reason).toMatch(/no product definition/);
  });

  test('fresh epic with a locked feature map routes to plan', () => {
    run('ticket create -t "An idea" --epic');
    fs.mkdirSync(productDir(), { recursive: true });
    fs.writeFileSync(path.join(productDir(), 'feature-map.md'), '# Feature Map\n');
    const b = buildBrief(ticketsDir(), sprintsDir(), { productDir: productDir() });
    expect(b.nextAction.argv).toEqual(['run', 'plan', 'TKT-001']);
  });

  test('an epic mid-definition resumes define regardless of the map', () => {
    run('ticket create -t "An idea" --epic');
    run('ticket move TKT-001 journeys');
    const b = buildBrief(ticketsDir(), sprintsDir(), { productDir: productDir() });
    expect(b.nextAction.argv).toEqual(['run', 'define', 'TKT-001']);
    expect(b.nextAction.reason).toMatch(/definition is in progress \(define-journeys\)/);
  });

  test('without productDir, legacy behavior: fresh epic goes to plan', () => {
    run('ticket create -t "An idea" --epic');
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.nextAction.argv).toEqual(['run', 'plan', 'TKT-001']);
  });

  test('the design visibility fix: a ticket parked mid-design is in flight and resumes', () => {
    run('ticket create -t "Landing page"');
    run('ticket move TKT-001 mockup');
    const b = buildBrief(ticketsDir(), sprintsDir());
    expect(b.inFlight.map(t => t.id)).toContain('TKT-001');
    expect(b.nextAction.argv).toEqual(['run', 'design-mockup', 'TKT-001']);
  });
});
