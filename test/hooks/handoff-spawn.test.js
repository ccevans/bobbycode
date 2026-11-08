// test/hooks/handoff-spawn.test.js — successor names never clash with a live or finished session (BOB-178).
// Runs the real templates/hooks/handoff-spawn.sh against a stub `claude` on PATH and a temp HOME.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const SCRIPT = fileURLToPath(new URL('../../templates/hooks/handoff-spawn.sh', import.meta.url));
const SID = '11111111-2222-3333-4444-555555555555';

function run({ name, agents, agentsExit = 0 }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-spawn-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  const proj = path.join(home, '.claude', 'projects', 'p');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(
    path.join(proj, `${SID}.jsonl`),
    [
      { type: 'custom-title', customTitle: name },
      { type: 'assistant', cwd: home, message: { model: 'claude-test-1' } },
    ].map((d) => JSON.stringify(d)).join('\n') + '\n',
  );
  const handoff = path.join(home, 'handoff.md');
  fs.writeFileSync(handoff, 'next action: x\n');
  fs.writeFileSync(path.join(home, 'agents.out'), agents);
  const spawnLog = path.join(home, 'spawn.log');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!/usr/bin/env bash
if [ "$1" = agents ]; then
  cat "${home}/agents.out"; exit ${agentsExit}
fi
printf '%s\\n' "$*" >> "${spawnLog}"
echo "backgrounded · abc123 · stub"
`,
    { mode: 0o755 },
  );
  const r = spawnSync('bash', [SCRIPT, handoff], {
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, CLAUDE_CODE_SESSION_ID: SID },
    encoding: 'utf8',
  });
  const spawned = fs.existsSync(spawnLog) ? fs.readFileSync(spawnLog, 'utf8') : '';
  const marker = path.join(home, '.bobby', 'hook-state', `${SID}.handoff`);
  const out = { ...r, spawned, markerExists: fs.existsSync(marker), marker: fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '' };
  fs.rmSync(home, { recursive: true, force: true });
  return out;
}

const list = (...names) => JSON.stringify(names.map((n, i) => ({ id: `a${i}`, name: n, state: 'done' })));

test('no clash: successor is "<name> 2" and the marker line is unchanged', () => {
  const r = run({ name: 'Lane', agents: list('Other') });
  expect(r.status).toBe(0);
  expect(r.spawned).toContain('--remote-control Lane 2 -n Lane 2 --model claude-test-1');
  expect(r.marker).toBe('"Lane 2" (bg abc123, claude-test-1) from ' + r.marker.split(' from ')[1]);
  expect(r.stdout).toContain('Handed off to "Lane 2" (bg abc123, claude-test-1).');
});

test('a taken "<name> 2" moves on to "<name> 3"', () => {
  const r = run({ name: 'Lane', agents: list('Lane', 'Lane 2') });
  expect(r.status).toBe(0);
  expect(r.spawned).toContain('--remote-control Lane 3 -n Lane 3');
});

test('a numbered session whose next number is taken skips ahead', () => {
  const r = run({ name: 'Sheet Planes gates lane 3', agents: list('Sheet Planes gates lane 4', 'Sheet Planes gates lane 5') });
  expect(r.status).toBe(0);
  expect(r.spawned).toContain('-n Sheet Planes gates lane 6');
});

test('a clash with a done session still increments (the name clashes, not the state)', () => {
  const doneOnly = JSON.stringify([{ id: 'x', name: 'Lane 2', state: 'done' }, { id: 'y', name: 'Lane 3', status: 'idle' }]);
  const r = run({ name: 'Lane', agents: doneOnly });
  expect(r.status).toBe(0);
  expect(r.spawned).toContain('-n Lane 4');
});

test('sessions without a name are ignored', () => {
  const r = run({ name: 'Lane', agents: JSON.stringify([{ id: 'x' }, { id: 'y', name: null }]) });
  expect(r.status).toBe(0);
  expect(r.spawned).toContain('-n Lane 2');
});

test('claude agents failing exits 1 and spawns nothing', () => {
  const r = run({ name: 'Lane', agents: 'boom', agentsExit: 1 });
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('not spawning with an unchecked name');
  expect(r.spawned).toBe('');
  expect(r.markerExists).toBe(false);
});

test.each([['not json {'], ['{"name":"Lane 2"}']])('bad session list %j exits 1 and spawns nothing', (bad) => {
  const r = run({ name: 'Lane', agents: bad });
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('unchecked name');
  expect(r.spawned).toBe('');
  expect(r.markerExists).toBe(false);
});
