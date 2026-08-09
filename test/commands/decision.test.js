// test/commands/decision.test.js
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby decision', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, { cwd: tmpDir, encoding: 'utf8' });
  const logFile = () => path.join(tmpDir, '.bobby', 'decisions.yaml');
  const readLog = () => YAML.parse(fs.readFileSync(logFile(), 'utf8')) || [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-decision-'));
    const config = {
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets',
      sessions_dir: '.bobby/sessions',
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'), '0');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('add seeds the log and records the decision', () => {
    const out = run('decision add --id service-layer-only --fact "No DB in components." --why "Separation of concerns." --ticket TKT-012');
    expect(out).toMatch(/Recorded decision 'service-layer-only'/);
    expect(readLog()).toEqual([{
      id: 'service-layer-only',
      fact: 'No DB in components.',
      decided: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      ticket: 'TKT-012',
      why: 'Separation of concerns.',
      supersedes: null,
      invalidated: null,
    }]);
  });

  test('a second add leaves the first entry exactly as it was', () => {
    run('decision add --id first-choice --fact "A." --why "because A."');
    const first = readLog()[0];
    run('decision add --id second-choice --fact "B." --why "because B."');
    expect(readLog()[0]).toEqual(first);
    expect(readLog()).toHaveLength(2);
  });

  test('list shows active decisions and hides invalidated ones', () => {
    run('decision add --id kept --fact "Still true." --why "w"');
    run('decision add --id retired --fact "Was true." --why "w"');
    const log = readLog();
    log[1].invalidated = '2026-08-09';
    fs.writeFileSync(logFile(), YAML.stringify(log));

    expect(run('decision list')).toContain('kept');
    expect(run('decision list')).not.toContain('retired');
    expect(run('decision list --all')).toContain('retired');
  });

  test('add exits non-zero on a duplicate id', () => {
    run('decision add --id dupe --fact "A." --why "w"');
    expect(() => run('decision add --id dupe --fact "B." --why "w"')).toThrow();
    expect(readLog()).toHaveLength(1);
  });

  test('add requires id, fact and why', () => {
    expect(() => run('decision add --fact "A." --why "w"')).toThrow(/required option/i);
    expect(() => run('decision add --id x --why "w"')).toThrow(/required option/i);
    expect(() => run('decision add --id x --fact "A."')).toThrow(/required option/i);
  });
});
