// test/lib/dashboard/executor.test.js
import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  runClaude,
  runAgent,
  resolveExecutor,
  commandExists,
  cleanExecutorEnv,
  claudeSessionIdFromEvent,
  EXECUTOR_NAMES,
} from '../../../lib/dashboard/executor.js';

function fakeSpawn(scripted = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn(() => { child.killed = true; });
  child.killed = false;
  child.exitCode = null;
  child.pid = 4242;
  Object.assign(child, scripted);
  const spawnFn = jest.fn(() => child);
  spawnFn.child = child;
  return spawnFn;
}

describe('runClaude', () => {
  test('spawns with expected args and cwd', () => {
    const spawn = fakeSpawn();
    runClaude({
      worktreePath: '/tmp/wt',
      prompt: 'hi',
      sessionId: 'ses-1',
      spawn,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [bin, args, opts] = spawn.mock.calls[0];
    expect(bin).toBe('claude');
    expect(args).toEqual(['-p', 'hi', '--output-format', 'stream-json', '--verbose']);
    expect(opts.cwd).toBe('/tmp/wt');
    expect(opts.env.BOBBY_SESSION_ID).toBe('ses-1');
  });

  test('omits --output-format when outputFormat=null', () => {
    const spawn = fakeSpawn();
    runClaude({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn, outputFormat: null });
    const [, args] = spawn.mock.calls[0];
    expect(args).toEqual(['-p', 'p']);
  });

  test('passes allowedTools and permissionMode when provided', () => {
    const spawn = fakeSpawn();
    runClaude({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      allowedTools: 'Bash,Edit',
      permissionMode: 'acceptEdits',
    });
    const [, args] = spawn.mock.calls[0];
    expect(args).toContain('--allowed-tools');
    expect(args).toContain('Bash,Edit');
    expect(args).toContain('--permission-mode');
    expect(args).toContain('acceptEdits');
  });

  test('parses JSONL stdout into json events', async () => {
    const spawn = fakeSpawn();
    const events = [];
    const handle = runClaude({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      onEvent: (ev) => events.push(ev),
    });
    spawn.child.stdout.emit('data', Buffer.from('{"type":"msg","text":"hi"}\n'));
    spawn.child.stdout.emit('data', Buffer.from('{"type":"tool"}\n'));
    spawn.child.emit('exit', 0, null);
    await handle.done;
    const json = events.filter(e => e.type === 'stdout' && e.kind === 'json');
    expect(json).toHaveLength(2);
    expect(json[0].data.type).toBe('msg');
    expect(events.find(e => e.type === 'exit')).toBeDefined();
  });

  test('passes through non-JSON stdout as text events', async () => {
    const spawn = fakeSpawn();
    const events = [];
    const handle = runClaude({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      onEvent: (ev) => events.push(ev),
    });
    spawn.child.stdout.emit('data', Buffer.from('just plain text\n'));
    spawn.child.emit('exit', 0, null);
    await handle.done;
    const text = events.filter(e => e.type === 'stdout' && e.kind === 'text');
    expect(text[0].data).toBe('just plain text');
  });

  test('emits stderr events', async () => {
    const spawn = fakeSpawn();
    const events = [];
    const handle = runClaude({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      onEvent: (ev) => events.push(ev),
    });
    spawn.child.stderr.emit('data', Buffer.from('oops'));
    spawn.child.emit('exit', 1, null);
    await handle.done;
    expect(events.some(e => e.type === 'stderr' && e.text === 'oops')).toBe(true);
  });

  test('stop() sends SIGTERM', () => {
    const spawn = fakeSpawn();
    const handle = runClaude({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn });
    handle.stop();
    expect(spawn.child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('onExit callback fires with exit code', async () => {
    const spawn = fakeSpawn();
    const onExit = jest.fn();
    const handle = runClaude({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn, onExit });
    spawn.child.emit('exit', 0, null);
    await handle.done;
    expect(onExit).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 0 }));
  });

  test('spawn error is captured', async () => {
    const spawn = fakeSpawn();
    const events = [];
    const handle = runClaude({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      onEvent: (ev) => events.push(ev),
    });
    spawn.child.emit('error', new Error('ENOENT'));
    const result = await handle.done;
    expect(result.error).toContain('ENOENT');
    expect(events.some(e => e.type === 'stderr' && e.text.includes('ENOENT'))).toBe(true);
  });

  test('requires worktreePath and prompt', () => {
    expect(() => runClaude({ prompt: 'p', sessionId: 's' })).toThrow(/worktreePath/);
    expect(() => runClaude({ worktreePath: '/t', sessionId: 's' })).toThrow(/prompt/);
  });

  test('runClaude is an alias of runAgent', () => {
    expect(runClaude).toBe(runAgent);
  });
});

// TKT-019. The claude CLI reports what a run cost on its final stream-json
// event. Until now every event was forwarded verbatim and inspected by nothing,
// so the number was parsed and dropped on the floor.
//
// The distinction these tests exist to hold: a cost of 0 is a FACT ("this run
// was free"); a missing cost is the ABSENCE of one, and must stay null so no
// total can quietly understate itself by counting it as zero.
describe('per-run cost from total_cost_usd (TKT-019)', () => {
  const resultEvent = (extra) => `${JSON.stringify({ type: 'result', subtype: 'success', ...extra })}\n`;

  test('captures total_cost_usd off the result event', async () => {
    const spawn = fakeSpawn();
    const handle = runAgent({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn });
    spawn.child.stdout.emit('data', Buffer.from('{"type":"assistant"}\n'));
    spawn.child.stdout.emit('data', Buffer.from(resultEvent({ total_cost_usd: 0.0432 })));
    spawn.child.emit('exit', 0, null);

    expect((await handle.done).costUsd).toBe(0.0432);
  });

  test('captures it from a final line that never got a trailing newline', async () => {
    const spawn = fakeSpawn();
    const handle = runAgent({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn });
    // The result event is the LAST thing a CLI writes, so it is exactly the
    // line most likely to arrive unterminated and be flushed at exit.
    spawn.child.stdout.emit('data', Buffer.from(resultEvent({ total_cost_usd: 1.25 }).trimEnd()));
    spawn.child.emit('exit', 0, null);

    expect((await handle.done).costUsd).toBe(1.25);
  });

  test('reports null — not 0 — when the CLI never mentions cost', async () => {
    const spawn = fakeSpawn();
    const handle = runAgent({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn });
    spawn.child.stdout.emit('data', Buffer.from(resultEvent({ num_turns: 3 })));
    spawn.child.emit('exit', 0, null);

    const result = await handle.done;
    expect(result.costUsd).toBeNull();
    expect(result.costUsd).not.toBe(0);
  });

  test('keeps a genuinely-reported zero as zero', async () => {
    const spawn = fakeSpawn();
    const handle = runAgent({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn });
    spawn.child.stdout.emit('data', Buffer.from(resultEvent({ total_cost_usd: 0 })));
    spawn.child.emit('exit', 0, null);

    expect((await handle.done).costUsd).toBe(0);
  });

  test('ignores a non-numeric total_cost_usd rather than passing junk on', async () => {
    const spawn = fakeSpawn();
    const handle = runAgent({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn });
    spawn.child.stdout.emit('data', Buffer.from(resultEvent({ total_cost_usd: 'unknown' })));
    spawn.child.emit('exit', 0, null);

    expect((await handle.done).costUsd).toBeNull();
  });

  test('the last reported figure wins — total_cost_usd is cumulative', async () => {
    const spawn = fakeSpawn();
    const handle = runAgent({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn });
    spawn.child.stdout.emit('data', Buffer.from(resultEvent({ total_cost_usd: 0.1 })));
    spawn.child.stdout.emit('data', Buffer.from(resultEvent({ total_cost_usd: 0.3 })));
    spawn.child.emit('exit', 0, null);

    expect((await handle.done).costUsd).toBe(0.3);
  });

  test('a cost reported before a crash still survives on the error result', async () => {
    const spawn = fakeSpawn();
    const handle = runAgent({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn });
    spawn.child.stdout.emit('data', Buffer.from(resultEvent({ total_cost_usd: 0.5 })));
    spawn.child.emit('error', new Error('ENOENT'));

    const result = await handle.done;
    expect(result.error).toContain('ENOENT');
    expect(result.costUsd).toBe(0.5);
  });
});

// TKT-021. Conversational planning continues a prior Claude session with
// `--resume <sessionId>`. The executor never passed it before; these assert the
// flag is injected when set and absent when not.
describe('--resume passthrough (TKT-021)', () => {
  test('TC-1: claude args include --resume followed by the session id when set', () => {
    const spawn = fakeSpawn();
    runAgent({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn, resume: 'ses-abc123' });
    const [, args] = spawn.mock.calls[0];
    expect(args).toContain('--resume');
    expect(args[args.indexOf('--resume') + 1]).toBe('ses-abc123');
  });

  test('TC-2: claude args omit --resume when it is not set', () => {
    const spawn = fakeSpawn();
    runAgent({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn });
    const [, args] = spawn.mock.calls[0];
    expect(args).not.toContain('--resume');
  });
});

// TKT-021. To use --resume, the chat manager must capture the CLAUDE session id
// the CLI reports on its stream events (not bobby's own ses- id).
describe('claudeSessionIdFromEvent (TKT-021)', () => {
  const ev = (data) => ({ type: 'stdout', kind: 'json', data, at: 'now' });

  test('reads session_id off a json stdout event', () => {
    expect(claudeSessionIdFromEvent(ev({ type: 'system', session_id: 'claude-1' }))).toBe('claude-1');
  });

  test('returns null for events without a session_id', () => {
    expect(claudeSessionIdFromEvent(ev({ type: 'assistant' }))).toBeNull();
  });

  test('returns null for text or non-stdout events', () => {
    expect(claudeSessionIdFromEvent({ type: 'stdout', kind: 'text', data: 'session_id: x' })).toBeNull();
    expect(claudeSessionIdFromEvent({ type: 'stderr', text: 'x' })).toBeNull();
    expect(claudeSessionIdFromEvent(null)).toBeNull();
  });
});

describe('resolveExecutor', () => {
  test('defaults to claude when nothing is configured', () => {
    expect(resolveExecutor({}).name).toBe('claude');
    expect(resolveExecutor({}).bin).toBe('claude');
  });

  test('derives cursor-agent from target=cursor', () => {
    const e = resolveExecutor({ target: 'cursor' });
    expect(e.name).toBe('cursor-agent');
    expect(e.bin).toBe('cursor-agent');
  });

  test('leaves other targets on claude', () => {
    expect(resolveExecutor({ target: 'cline' }).name).toBe('claude');
    expect(resolveExecutor({ target: 'claude-code' }).name).toBe('claude');
  });

  test('an explicit executor overrides the target derivation', () => {
    expect(resolveExecutor({ target: 'cursor', dashboard: { executor: 'claude' } }).name).toBe('claude');
    expect(resolveExecutor({ target: 'claude-code', dashboard: { executor: 'cursor-agent' } }).name)
      .toBe('cursor-agent');
  });

  test('an unrecognized executor is treated as a custom binary path', () => {
    const e = resolveExecutor({ dashboard: { executor: '/opt/bin/claude' } });
    expect(e.bin).toBe('/opt/bin/claude');
    // Custom bins keep claude-style flags, which is what this config meant before.
    expect(e.buildArgs({ prompt: 'p', outputFormat: 'stream-json' }))
      .toEqual(['-p', 'p', '--output-format', 'stream-json', '--verbose']);
  });

  test('EXECUTOR_NAMES lists both known flavors', () => {
    expect(EXECUTOR_NAMES).toEqual(expect.arrayContaining(['claude', 'cursor-agent']));
  });
});

describe('cursor-agent executor', () => {
  test('spawns cursor-agent with stream-json and --trust, without --verbose', () => {
    const spawn = fakeSpawn();
    runAgent({
      worktreePath: '/tmp/wt', prompt: 'hi', sessionId: 'ses-1', spawn,
      executor: 'cursor-agent',
    });
    const [bin, args, opts] = spawn.mock.calls[0];
    expect(bin).toBe('cursor-agent');
    expect(args).toEqual(['-p', 'hi', '--output-format', 'stream-json', '--trust']);
    expect(args).not.toContain('--verbose');
    expect(opts.cwd).toBe('/tmp/wt');
    expect(opts.env.BOBBY_SESSION_ID).toBe('ses-1');
  });

  test('passes --model through', () => {
    const spawn = fakeSpawn();
    runAgent({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      executor: 'cursor-agent', model: 'composer-1',
    });
    const [, args] = spawn.mock.calls[0];
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('composer-1');
  });

  test('maps write-capable permission modes to --force', () => {
    for (const mode of ['acceptEdits', 'bypassPermissions']) {
      const spawn = fakeSpawn();
      runAgent({
        worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
        executor: 'cursor-agent', permissionMode: mode,
      });
      const [, args] = spawn.mock.calls[0];
      expect(args).toContain('--force');
      expect(args).not.toContain('--permission-mode');
    }
  });

  test('maps plan mode to --mode plan and never forces', () => {
    const spawn = fakeSpawn();
    runAgent({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      executor: 'cursor-agent', permissionMode: 'plan',
    });
    const [, args] = spawn.mock.calls[0];
    expect(args).toContain('--mode');
    expect(args[args.indexOf('--mode') + 1]).toBe('plan');
    expect(args).not.toContain('--force');
  });

  test('drops allowedTools — cursor-agent has no per-tool allowlist', () => {
    const spawn = fakeSpawn();
    runAgent({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      executor: 'cursor-agent', allowedTools: 'Bash,Edit',
    });
    const [, args] = spawn.mock.calls[0];
    expect(args).not.toContain('--allowed-tools');
    expect(args).not.toContain('Bash,Edit');
  });

  test('parses cursor-agent stream-json events', async () => {
    const spawn = fakeSpawn();
    const events = [];
    const handle = runAgent({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      executor: 'cursor-agent',
      onEvent: (ev) => events.push(ev),
    });
    spawn.child.stdout.emit('data', Buffer.from(
      '{"type":"system","subtype":"init","session_id":"abc"}\n' +
      '{"type":"tool_call","subtype":"started","call_id":"1","tool_call":{"readToolCall":{"args":{"path":"a.txt"}}}}\n' +
      '{"type":"result","subtype":"success","is_error":false,"result":"done"}\n'
    ));
    spawn.child.emit('exit', 0, null);
    await handle.done;
    const json = events.filter(e => e.type === 'stdout' && e.kind === 'json');
    expect(json).toHaveLength(3);
    expect(json[0].data.subtype).toBe('init');
    expect(json[1].data.tool_call.readToolCall.args.path).toBe('a.txt');
    expect(json[2].data.result).toBe('done');
  });

  test('claudeBin overrides the flavor default binary', () => {
    const spawn = fakeSpawn();
    runAgent({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      executor: 'cursor-agent', claudeBin: '/opt/cursor/cursor-agent',
    });
    expect(spawn.mock.calls[0][0]).toBe('/opt/cursor/cursor-agent');
  });

  test('claudeArgs fully overrides the built arg list', () => {
    const spawn = fakeSpawn();
    runAgent({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      executor: 'cursor-agent', claudeArgs: ['--resume', 'abc'],
    });
    expect(spawn.mock.calls[0][1]).toEqual(['--resume', 'abc']);
  });
});

// PRO-025. When bobby remote / app / run is started from inside a Claude Code
// session, the shell carries CLAUDECODE / CLAUDE_CODE_* and the spawned
// `claude -p` child inherits them, tripping Claude Code's nested-session guard
// so no agent run works. The fix strips exactly those vars at the spawn point.
describe('cleanExecutorEnv (PRO-025 nested-session strip)', () => {
  test('removes CLAUDECODE and every CLAUDE_CODE_* key', () => {
    const cleaned = cleanExecutorEnv({
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      CLAUDE_CODE_SSE_PORT: '1234',
      PATH: '/usr/bin',
    });
    expect(cleaned).not.toHaveProperty('CLAUDECODE');
    expect(cleaned).not.toHaveProperty('CLAUDE_CODE_ENTRYPOINT');
    expect(cleaned).not.toHaveProperty('CLAUDE_CODE_SSE_PORT');
    // No CLAUDE_CODE-prefixed key survives.
    expect(Object.keys(cleaned).some(k => /^CLAUDE_CODE/.test(k))).toBe(false);
  });

  test('keeps every other var untouched (PATH, HOME, and unrelated CLAUDE_* keys)', () => {
    const cleaned = cleanExecutorEnv({
      CLAUDECODE: '1',
      PATH: '/usr/bin',
      HOME: '/home/dev',
      // A CLAUDE_ var that is NOT the Claude Code family must survive.
      CLAUDE_API_KEY: 'secret',
    });
    expect(cleaned.PATH).toBe('/usr/bin');
    expect(cleaned.HOME).toBe('/home/dev');
    expect(cleaned.CLAUDE_API_KEY).toBe('secret');
  });

  test('does not mutate the input env', () => {
    const input = { CLAUDECODE: '1', PATH: '/usr/bin' };
    cleanExecutorEnv(input);
    expect(input.CLAUDECODE).toBe('1');
  });

  test('defaults to process.env', () => {
    const original = process.env.CLAUDECODE;
    process.env.CLAUDECODE = '1';
    try {
      expect(cleanExecutorEnv()).not.toHaveProperty('CLAUDECODE');
    } finally {
      if (original === undefined) delete process.env.CLAUDECODE;
      else process.env.CLAUDECODE = original;
    }
  });

  test('the spawned child env carries no CLAUDE_CODE keys even when the host has them', () => {
    const saved = {
      CLAUDECODE: process.env.CLAUDECODE,
      CLAUDE_CODE_ENTRYPOINT: process.env.CLAUDE_CODE_ENTRYPOINT,
    };
    process.env.CLAUDECODE = '1';
    process.env.CLAUDE_CODE_ENTRYPOINT = 'cli';
    try {
      const spawn = fakeSpawn();
      runAgent({ worktreePath: '/t', prompt: 'p', sessionId: 's', spawn });
      const [, , opts] = spawn.mock.calls[0];
      // Reproduction guard: the pre-fix env WOULD have contained CLAUDECODE
      // (it is present in process.env for this test), which is exactly what
      // tripped the nested-session guard.
      expect(process.env.CLAUDECODE).toBe('1');
      expect(opts.env).not.toHaveProperty('CLAUDECODE');
      expect(opts.env).not.toHaveProperty('CLAUDE_CODE_ENTRYPOINT');
      expect(Object.keys(opts.env).some(k => /^CLAUDE_CODE/.test(k))).toBe(false);
      // The rest of the child env is still built as before.
      expect(opts.env.BOBBY_SESSION_ID).toBe('s');
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  test('a caller-supplied env cannot reintroduce the stripped keys', () => {
    const spawn = fakeSpawn();
    runAgent({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn,
      env: { CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', FOO: 'bar' },
    });
    const [, , opts] = spawn.mock.calls[0];
    expect(opts.env).not.toHaveProperty('CLAUDECODE');
    expect(opts.env).not.toHaveProperty('CLAUDE_CODE_ENTRYPOINT');
    expect(opts.env.FOO).toBe('bar');
  });
});

describe('commandExists', () => {
  test('finds a binary that is on PATH', () => {
    expect(commandExists('node')).toBe(true);
  });

  test('rejects a binary that is not on PATH', () => {
    expect(commandExists('bobby-definitely-not-a-real-binary')).toBe(false);
  });

  test('checks the filesystem for explicit absolute paths', () => {
    expect(commandExists(process.execPath)).toBe(true);
    expect(commandExists('/nope/not/here')).toBe(false);
  });

  test('rejects a directory or non-executable file', () => {
    // existsSync alone would accept both of these and then EACCES per agent run.
    expect(commandExists('/usr/local/bin')).toBe(false);
    expect(commandExists('/etc/hosts')).toBe(false);
  });

  test('rejects relative paths, which would resolve differently at spawn time', () => {
    // The preflight runs from the repo root; agents spawn with cwd=worktree.
    expect(commandExists('./node')).toBe(false);
    expect(commandExists('bin/claude')).toBe(false);
  });

  test('treats a forward-slash path as a path regardless of platform separator', () => {
    // Guards against using path.sep, which is "\\" on Windows.
    expect(commandExists('C:/tools/definitely-not-here.exe')).toBe(false);
  });

  test('rejects empty input', () => {
    expect(commandExists('')).toBe(false);
    expect(commandExists(undefined)).toBe(false);
  });
});
