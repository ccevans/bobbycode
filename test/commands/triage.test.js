// test/commands/triage.test.js
import { jest } from '@jest/globals';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import inquirer from 'inquirer';
import { Command } from 'commander';
import { registerTriage } from '../../commands/triage.js';

describe('bobby ticket triage — agent-filed tickets', () => {
  let tmpDir;
  let origCwd;
  let promptSpy;
  let logSpy;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, { cwd: tmpDir, encoding: 'utf8' });

  beforeEach(() => {
    origCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-triage-'));
    const config = {
      project: 'test', stack: 'generic',
      tickets_dir: '.bobby/tickets',
      ticket_prefix: 'TKT',
    };
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify(config));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'), '0');
    promptSpy = jest.spyOn(inquirer, 'prompt').mockResolvedValue({ action: 'skip' });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    promptSpy.mockRestore();
    logSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true });
  });

  const triage = async () => {
    const program = new Command();
    registerTriage(program);
    await program.parseAsync(['node', 'x', 'triage']);
    return logSpy.mock.calls.map(c => c.join(' ')).join('\n');
  };

  test('shows agent-filed tickets first, with where they were found', async () => {
    run('ticket create -t "Human oldest"');                                          // TKT-001
    run('ticket create -t "Agent finding" -a bobby-review --found-in TKT-001');       // TKT-002
    const out = await triage();
    expect(out).toContain('1 filed by agents, awaiting product review (shown first)');
    expect(out.indexOf('TKT-002')).toBeGreaterThan(-1);
    expect(out.indexOf('TKT-002')).toBeLessThan(out.indexOf('TKT-001  Human oldest'));
    expect(out).toContain('Found in: TKT-001 by bobby-review');
  });

  test('with no agent-filed tickets there is no review line and order is unchanged', async () => {
    run('ticket create -t "First"');
    run('ticket create -t "Second"');
    const out = await triage();
    expect(out).not.toContain('awaiting product review');
    expect(out).not.toContain('Found in:');
    expect(out.indexOf('TKT-001')).toBeLessThan(out.indexOf('TKT-002'));
  });
});
