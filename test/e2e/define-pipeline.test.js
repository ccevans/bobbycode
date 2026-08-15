// test/e2e/define-pipeline.test.js
//
// The full definition walk, end to end through the real CLI: a fresh epic
// routes to define, the epic moves through all four define stages (artifacts
// stubbed the way the agents would write them), lands in planning, and
// decomposition creates children that carry traceable refs. This is the
// idea → brief → personas → journeys → features → tickets path as one story.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('E2E: define pipeline', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, {
    cwd: tmpDir, encoding: 'utf8', env: { ...process.env, BOBBY_NO_REGISTRY: '1' },
  });
  const productDir = () => path.join(tmpDir, '.bobby', 'product');
  const writeArtifact = (name) => {
    fs.mkdirSync(productDir(), { recursive: true });
    fs.writeFileSync(path.join(productDir(), name),
      `# stub ${name}\n**Locked:** 2026-07-31 · **Status:** approved\n`);
  };

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-define-e2e-'));
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify({
      project: 'define-e2e', stack: 'generic',
      tickets_dir: '.bobby/tickets', sprints_dir: '.bobby/sprints',
      sessions_dir: '.bobby/sessions', ticket_prefix: 'TKT',
    }));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'), '0');
  });
  afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('a fresh epic routes to define, not plan', () => {
    run('ticket create -t "a habit tracker for runners" --epic');
    const out = run('go');
    expect(out).toMatch(/no product definition/);
    expect(out).toContain('bobby run define TKT-001');
  });

  test('run define emits the four-stage orchestration ending at planning', () => {
    const out = run('run define TKT-001');
    for (const stage of ['define-brief', 'define-personas', 'define-journeys', 'define-features']) {
      expect(out).toContain(stage);
    }
    // The terminal move goes to planning, never shipping.
    expect(out).toContain('move {TICKET_ID} plan');
    expect(out).not.toContain('move {TICKET_ID} ship');
  });

  test('the epic walks the stages via aliases, artifacts landing per stage', () => {
    run('ticket move TKT-001 brief');
    writeArtifact('brief.md');
    run('ticket move TKT-001 personas');
    writeArtifact('personas.md');
    run('ticket move TKT-001 journeys');
    writeArtifact('journeys.md');
    run('ticket move TKT-001 features');
    writeArtifact('feature-map.md');

    // Mid-pipeline the board shows the stage and go resumes define.
    const board = run('ticket list define-features');
    expect(board).toContain('TKT-001');
    const go = run('go');
    expect(go).toMatch(/definition is in progress/);

    run('ticket move TKT-001 plan');
  });

  test('with the map locked, go hands the epic to decomposition', () => {
    // The epic sits in planning with 0 children — but has a feature map, so
    // the next action is plan (Product-Aware decomposition), not define.
    const go = run('go');
    expect(go).toContain('bobby run plan TKT-001');
  });

  test('decomposition children carry traceable refs, and the board can filter by them', () => {
    run('ticket create -t "Log a run" --parent TKT-001 --feature F1.1 --persona P1');
    run('ticket create -t "See weekly streak" --parent TKT-001 --feature F1.2 --persona P1');

    const view = run('ticket view TKT-002');
    expect(view).toMatch(/feature.*F1\.1/i);

    const filtered = run('ticket list --feature F1.2');
    expect(filtered).toContain('TKT-003');
    expect(filtered).not.toContain('Log a run');
  });

  test('with children the epic flows into the normal build loop', () => {
    const go = run('go');
    expect(go).toContain('bobby run feature TKT-001');
  });

  test('a build agent prompt now carries the product-context step', () => {
    const out = run('run build TKT-002');
    expect(out).toContain('feature-map.md');
  });
});
