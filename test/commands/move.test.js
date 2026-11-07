// test/commands/move.test.js
import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

describe('bobby ticket move — scope check on leaving building', () => {
  let tmpDir;
  const bobby = path.resolve('bin/bobby.js');
  const run = (args) => execSync(`node ${bobby} ${args}`, { cwd: tmpDir, encoding: 'utf8' });
  const git = (...args) => execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe' });
  const ticketDir = (id) => {
    const root = path.join(tmpDir, '.bobby', 'tickets');
    return path.join(root, fs.readdirSync(root).find(e => e.startsWith(id)));
  };
  const ticketMd = (id) => fs.readFileSync(path.join(ticketDir(id), 'ticket.md'), 'utf8');
  const write = (rel, text = 'x\n') => {
    fs.mkdirSync(path.dirname(path.join(tmpDir, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, rel), text);
  };
  const commitAll = (msg) => { git('add', '-A'); git('commit', '-q', '-m', msg); };

  // A Bobby project that is also a git repo, on a feature branch with TKT-001 building.
  const setup = ({ git: useGit = true } = {}) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-move-'));
    fs.writeFileSync(path.join(tmpDir, '.bobbyrc.yml'), YAML.stringify({
      project: 'test', stack: 'generic', tickets_dir: '.bobby/tickets',
      sessions_dir: '.bobby/sessions', ticket_prefix: 'TKT',
    }));
    fs.mkdirSync(path.join(tmpDir, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.bobby', 'tickets', '.counter'), '0');
    if (useGit) {
      git('init', '-q', '-b', 'main');
      git('config', 'user.email', 't@example.com');
      git('config', 'user.name', 'T');
      commitAll('base');
      git('checkout', '-q', '-b', 'tkt-001');
    }
    run('ticket create -t "Thing"');
    run('ticket move TKT-001 build');
  };
  const writePlan = (text) => fs.writeFileSync(path.join(ticketDir('TKT-001'), 'plan.md'), text);

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('drift: warns, names the file, and records a scope-check comment', () => {
    setup();
    writePlan('## Files to modify\n- `lib/a.js`\n');
    write('lib/a.js');
    write('README.md');
    commitAll('work');
    const out = run('ticket move TKT-001 review');
    expect(out).toContain('reviewing');
    expect(out).toContain('not named in plan.md');
    expect(out).toContain('README.md');
    expect(out).toContain('--found-in');
    expect(ticketMd('TKT-001')).toContain('scope-check: Scope check: out of plan — README.md');
  });

  test('clean diff: confirms and adds no comment', () => {
    setup();
    writePlan('## Files to modify\n- `lib/a.js`\n');
    write('lib/a.js');
    commitAll('work');
    const out = run('ticket move TKT-001 review');
    expect(out).toContain('all 1 changed file(s) are named in plan.md');
    expect(ticketMd('TKT-001')).not.toContain('scope-check:');
  });

  test('plan without a file list: every changed file is reported as unchecked', () => {
    setup();
    writePlan('## Approach\nDo it.\n');
    write('lib/a.js');
    commitAll('work');
    const out = run('ticket move TKT-001 review');
    expect(out).toContain('plan.md has no "Files to modify" section');
    expect(out).toContain('lib/a.js');
    expect(ticketMd('TKT-001')).toContain('Scope check: unchecked (plan lists no files) — lib/a.js');
  });

  test('other moves never run the check', () => {
    setup();
    writePlan('## Files to modify\n- `lib/a.js`\n');
    write('README.md');
    commitAll('work');
    const outs = [
      run('ticket move TKT-001 block "x"'),
      run('ticket move TKT-001 unblock'),
      run('ticket move TKT-001 review'),   // the one real trigger, to reach reviewing
    ];
    expect(outs[0]).not.toContain('Scope check');
    expect(outs[1]).not.toContain('Scope check');
    const rejected = run('ticket move TKT-001 reject "y"');
    expect(rejected).not.toContain('Scope check');
    run('ticket create -t "Other"');
    expect(run('ticket move TKT-002 build')).not.toContain('Scope check');
  });

  test('the check cannot run: the move still succeeds and says why', () => {
    setup({ git: false });
    const out = run('ticket move TKT-001 review');
    expect(out).toContain('reviewing');
    expect(out).toContain('Scope check not run: not a git repository');
    expect(ticketMd('TKT-001')).toContain('stage: reviewing');
  });
});
