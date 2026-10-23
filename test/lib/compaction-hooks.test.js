// test/lib/compaction-hooks.test.js — compaction is safe at any moment.
//
// The old precompact hook blocked every compaction until the agent replied,
// which fails a headless stage outright when the context limit forces the
// compaction. The replacement is a no-op PreCompact, milestone checkpoints in
// the skills, and a SessionStart(compact) hook that hands the checkpoint back.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { scaffoldProject, migrateHookSettings } from '../../commands/init.js';

let tmp;
const base = {
  project: 'p', stack: 'generic', tickets_dir: '.bobby/tickets', ticket_prefix: 'TKT',
  health_checks: [], areas: [], commands: {},
};
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-compact-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const run = (script, cwd, env = {}) => spawnSync('bash', [path.join(tmp, 'hooks', script)], {
  cwd, input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: tmp, ...env },
});

describe('hooks', () => {
  test('precompact never blocks and says nothing', () => {
    scaffoldProject(tmp, base);
    const r = run('precompact.sh', tmp);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  test('settings anchor every Bobby hook to the project dir and register the restore', () => {
    scaffoldProject(tmp, base);
    const s = JSON.parse(fs.readFileSync(path.join(tmp, '.claude', 'settings.json'), 'utf8'));
    const cmds = Object.values(s.hooks).flat().flatMap(g => g.hooks.map(h => h.command));
    for (const c of cmds) expect(c).toMatch(/^"\$CLAUDE_PROJECT_DIR"\/hooks\//);
    expect(s.hooks.SessionStart[0].matcher).toBe('compact');
    expect(s.hooks.SessionStart[0].hooks[0].command).toContain('postcompact-restore.sh');
  });
});

describe('postcompact-restore', () => {
  function ticket(dir, id, progress) {
    const t = path.join(tmp, dir, `${id}--slug`);
    fs.mkdirSync(t, { recursive: true });
    fs.writeFileSync(path.join(t, 'ticket.md'), '---\nid: x\n---\n');
    if (progress) fs.writeFileSync(path.join(t, 'progress.md'), progress);
  }
  function repoOnBranch(branch) {
    const wt = path.join(tmp, 'wt');
    fs.mkdirSync(wt);
    execFileSync('git', ['init', '-q', '-b', branch], { cwd: wt });
    return wt;
  }

  test('hands back the checkpoint of the ticket named by the branch, in a studio project', () => {
    scaffoldProject(tmp, base);
    fs.mkdirSync(path.join(tmp, '.bobby'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.bobby', 'active-project'), 'robinflow');
    ticket('.bobby/robinflow/tickets', 'RF-12', 'NEXT: wire the form');
    ticket('.bobby/robinflow/tickets', 'RF-120', 'WRONG TICKET');
    const r = run('postcompact-restore.sh', repoOnBranch('feature/rf-12-thing'));
    expect(r.stdout).toContain('NEXT: wire the form');
    expect(r.stdout).toContain('RF-12');
    expect(r.stdout).not.toContain('WRONG TICKET');
  });

  test('another ticket is never guessed: no matching branch, no output', () => {
    scaffoldProject(tmp, base);
    ticket('.bobby/tickets', 'TKT-7', 'someone else');
    const r = run('postcompact-restore.sh', repoOnBranch('main'));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  test('BOBBY_PROJECT selects the board over active-project', () => {
    scaffoldProject(tmp, base);
    fs.mkdirSync(path.join(tmp, '.bobby'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.bobby', 'active-project'), 'other');
    ticket('.bobby/bobby/tickets', 'BOB-5', 'bobby board checkpoint');
    const r = run('postcompact-restore.sh', repoOnBranch('bobby/bob-5-x'), { BOBBY_PROJECT: 'bobby' });
    expect(r.stdout).toContain('bobby board checkpoint');
  });
});

describe('migrateHookSettings', () => {
  test('anchors old relative commands and adds the restore, leaving the rest alone', () => {
    const p = path.join(tmp, 'settings.json');
    fs.writeFileSync(p, JSON.stringify({
      permissions: { allow: ['Bash(ls)'] },
      hooks: { PreCompact: [{ matcher: '', hooks: [{ type: 'command', command: 'hooks/precompact.sh' }] }] },
    }));
    expect(migrateHookSettings(p)).toBe(true);
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(s.permissions.allow).toEqual(['Bash(ls)']);
    expect(s.hooks.PreCompact[0].hooks[0].command).toBe('"$CLAUDE_PROJECT_DIR"/hooks/precompact.sh');
    expect(s.hooks.SessionStart).toHaveLength(1);
    expect(migrateHookSettings(p)).toBe(false);   // idempotent
  });

  test('scaffolding over an old project refreshes the shipped hooks', () => {
    scaffoldProject(tmp, base);
    fs.writeFileSync(path.join(tmp, 'hooks', 'precompact.sh'), '#!/bin/bash\necho block\n');
    scaffoldProject(tmp, base);
    expect(fs.readFileSync(path.join(tmp, 'hooks', 'precompact.sh'), 'utf8')).toContain('Deliberately a no-op');
  });
});

describe('skills checkpoint at milestones', () => {
  test.each(['bobby-build', 'bobby-test', 'bobby-ship', 'bobby-freewill'])('%s', (skill) => {
    scaffoldProject(tmp, base);
    const body = fs.readFileSync(path.join(tmp, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
    expect(body).toContain('## Checkpointing');
    expect(body).toContain('Compaction can happen at any moment');
  });

  test('bobby-review writes review.md as it goes and never resumes build\'s session', () => {
    scaffoldProject(tmp, base);
    const body = fs.readFileSync(path.join(tmp, '.claude', 'skills', 'bobby-review', 'SKILL.md'), 'utf8');
    expect(body).toContain('## Checkpointing');
    expect(body).toContain('Write `review.md` as you go');
    expect(body).toContain('Never carry the build agent');
  });
});
