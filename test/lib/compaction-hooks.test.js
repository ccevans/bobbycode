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

// A transcript as Claude Code writes it: one JSON object per line.
function transcript(entries) {
  const p = path.join(tmp, 'transcript.jsonl');
  fs.writeFileSync(p, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  return p;
}
const hook = (script, input, env = {}, cwd = tmp) => spawnSync('bash', [path.join(tmp, 'hooks', script)], {
  cwd, input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: tmp, ...env },
});
const prompt = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const toolResult = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } });
const assistant = (tokens, content = []) => ({
  type: 'assistant', message: { model: 'claude-x', content, usage: { input_tokens: 10, cache_read_input_tokens: tokens, cache_creation_input_tokens: 0 } },
});

describe('session hooks are scaffolded and registered', () => {
  test('context-cap and handoff-spawn ship executable, with UserPromptSubmit registered', () => {
    scaffoldProject(tmp, base);
    for (const f of ['context-cap.sh', 'handoff-spawn.sh', 'stop.sh']) {
      expect(fs.statSync(path.join(tmp, 'hooks', f)).mode & 0o111).toBeTruthy();
    }
    const s = JSON.parse(fs.readFileSync(path.join(tmp, '.claude', 'settings.json'), 'utf8'));
    expect(s.hooks.UserPromptSubmit[0].hooks[0].command).toBe('"$CLAUDE_PROJECT_DIR"/hooks/context-cap.sh');
  });

  test('migrate adds the context cap to an old settings file once', () => {
    const p = path.join(tmp, 'settings.json');
    fs.writeFileSync(p, JSON.stringify({ hooks: {} }));
    migrateHookSettings(p);
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(s.hooks.UserPromptSubmit).toHaveLength(1);
    expect(migrateHookSettings(p)).toBe(false);
  });

  test('an old stop.sh is replaced on upgrade', () => {
    scaffoldProject(tmp, base);
    fs.writeFileSync(path.join(tmp, 'hooks', 'stop.sh'), "if d.get('type') == 'human'\n");
    scaffoldProject(tmp, base);
    expect(fs.readFileSync(path.join(tmp, 'hooks', 'stop.sh'), 'utf8')).toContain("!= 'user'");
  });
});

describe('context-cap', () => {
  let home;
  beforeEach(() => { scaffoldProject(tmp, base); home = path.join(tmp, 'home'); fs.mkdirSync(home); });
  const cap = (tokens, env = {}) => hook('context-cap.sh',
    { session_id: 's1', transcript_path: transcript([prompt('hi'), assistant(tokens)]) },
    { HOME: home, CLAUDE_CODE_ENTRYPOINT: 'cli', ...env });

  test('under the cap says nothing', () => {
    const r = cap(100000);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  test('over the cap, an interactive session is told to hand off through handoff-spawn.sh', () => {
    const msg = JSON.parse(cap(300000).stdout).hookSpecificOutput.additionalContext;
    expect(msg).toContain('about 300k tokens (cap 250k)');
    expect(msg).toContain('handoff-spawn.sh');
    expect(msg).not.toMatch(/\bCC\b/);
  });

  test('a headless run only stops', () => {
    const msg = JSON.parse(cap(300000, { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' }).stdout).hookSpecificOutput.additionalContext;
    expect(msg).toContain('Do not start new work');
    expect(msg).not.toContain('handoff-spawn.sh');
  });

  test('after a handoff it points at the successor', () => {
    fs.mkdirSync(path.join(home, '.bobby', 'hook-state'), { recursive: true });
    fs.writeFileSync(path.join(home, '.bobby', 'hook-state', 's1.handoff'), '"Work 2" (bg abc)');
    const msg = JSON.parse(cap(300000).stdout).hookSpecificOutput.additionalContext;
    expect(msg).toContain('already handed off to "Work 2"');
  });

  test('BOBBY_CONTEXT_CAP moves the cap', () => {
    expect(cap(120000, { BOBBY_CONTEXT_CAP: '100000' }).stdout).toContain('cap 100k');
  });
});

describe('handoff-spawn refuses before starting anything', () => {
  let home;
  beforeEach(() => { scaffoldProject(tmp, base); home = path.join(tmp, 'home'); fs.mkdirSync(home); });
  // PATH holds a fake `claude` that records any call, so a refusal is provably before it.
  const spawn = (args, env = {}) => {
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/bash\ntouch "${tmp}/claude-called"\n`, { mode: 0o755 });
    return spawnSync('bash', [path.join(tmp, 'hooks', 'handoff-spawn.sh'), ...args], {
      cwd: tmp, encoding: 'utf8', env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, ...env },
    });
  };
  const handoff = (body = 'next: ship it') => { const p = path.join(tmp, 'handoff.md'); fs.writeFileSync(p, body); return p; };

  test('without a session id', () => {
    const r = spawn([handoff()], { CLAUDE_CODE_SESSION_ID: '' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('CLAUDE_CODE_SESSION_ID not set');
  });

  test('with an empty handoff', () => {
    const r = spawn([handoff('')], { CLAUDE_CODE_SESSION_ID: 's1' });
    expect(r.stderr).toContain('missing or empty');
  });

  test('a second time', () => {
    fs.mkdirSync(path.join(home, '.bobby', 'hook-state'), { recursive: true });
    fs.writeFileSync(path.join(home, '.bobby', 'hook-state', 's1.handoff'), '"Work 2"');
    const r = spawn([handoff()], { CLAUDE_CODE_SESSION_ID: 's1' });
    expect(r.stderr).toContain('already handed off');
    expect(fs.existsSync(path.join(tmp, 'claude-called'))).toBe(false);
  });

  test('starts "<name> 2" with the session model and records the marker', () => {
    const proj = path.join(home, '.claude', 'projects', 'p');
    fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(path.join(proj, 's1.jsonl'), [
      { type: 'custom-title', customTitle: 'Work' }, { cwd: tmp, ...prompt('hi') }, assistant(1),
    ].map(e => JSON.stringify(e)).join('\n') + '\n');
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/bash\necho "$@" > "${tmp}/claude-args"\necho "backgrounded · ab12 · Work 2"\n`, { mode: 0o755 });
    const r = spawnSync('bash', [path.join(tmp, 'hooks', 'handoff-spawn.sh'), handoff()], {
      cwd: tmp, encoding: 'utf8', env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, CLAUDE_CODE_SESSION_ID: 's1' },
    });
    expect(r.stdout).toContain('Handed off to "Work 2" (bg ab12, claude-x)');
    expect(fs.readFileSync(path.join(tmp, 'claude-args'), 'utf8')).toContain('--remote-control Work 2 -n Work 2 --model claude-x');
    expect(fs.existsSync(path.join(home, '.bobby', 'hook-state', 's1.handoff'))).toBe(true);
  });
});

describe('stop.sh', () => {
  let home;
  beforeEach(() => { scaffoldProject(tmp, base); home = path.join(tmp, 'home'); fs.mkdirSync(home); });
  const stop = (entries) => hook('stop.sh', { session_id: 's1', transcript_path: transcript(entries) },
    { HOME: home, BOBBY_SAVE_INTERVAL: '3' });

  test('blocks with valid JSON after the interval of real prompts', () => {
    const r = stop([prompt('a'), toolResult(), prompt('b'), toolResult(), prompt('c')]);
    const out = JSON.parse(r.stdout);
    expect(out.decision).toBe('block');
    expect(out.reason).toContain("doesn't already exist");
  });

  test('tool results and meta entries do not count as turns', () => {
    const r = stop([prompt('a'), toolResult(), toolResult(), toolResult(), { ...prompt('caveat'), isMeta: true }, prompt('b')]);
    expect(JSON.parse(r.stdout)).toEqual({});
  });
});

describe('postcompact-restore from the session transcript', () => {
  const wrote = (file) => assistant(1, [{ type: 'tool_use', name: 'Write', input: { file_path: file, content: 'x' } }]);
  const restore = (entries, branch = 'studio-sync') => {
    const wt = path.join(tmp, 'wt');
    fs.mkdirSync(wt, { recursive: true });
    execFileSync('git', ['init', '-q', '-b', branch], { cwd: wt });
    return hook('postcompact-restore.sh', { transcript_path: transcript(entries) }, {}, wt);
  };

  test('off a ticket branch, hands back the last handoff this session wrote', () => {
    scaffoldProject(tmp, base);
    const dir = path.join(tmp, '.bobby', 'handoffs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'old.md'), 'OLD');
    fs.writeFileSync(path.join(dir, 'new.md'), 'NEXT: push the branch');
    const r = restore([wrote(path.join(dir, 'old.md')), wrote(path.join(tmp, 'notes.md')), wrote(path.join(dir, 'new.md'))]);
    expect(r.stdout).toContain('NEXT: push the branch');
    expect(r.stdout).not.toContain('OLD');
  });

  test('a session that wrote no checkpoint gets nothing', () => {
    scaffoldProject(tmp, base);
    const r = restore([prompt('hi'), wrote(path.join(tmp, 'notes.md'))]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  test('the branch ticket still wins over the transcript', () => {
    scaffoldProject(tmp, base);
    const t = path.join(tmp, '.bobby', 'tickets', 'TKT-9--x');
    fs.mkdirSync(t, { recursive: true });
    fs.writeFileSync(path.join(t, 'progress.md'), 'BRANCH TICKET');
    const other = path.join(tmp, 'progress.md');
    fs.writeFileSync(other, 'TRANSCRIPT ONE');
    const r = restore([wrote(other)], 'bobby/tkt-9-x');
    expect(r.stdout).toContain('BRANCH TICKET');
    expect(r.stdout).not.toContain('TRANSCRIPT ONE');
  });
});
