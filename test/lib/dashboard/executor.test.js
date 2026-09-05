// test/lib/dashboard/executor.test.js
import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  runClaude,
  runAgent,
  resolveExecutor,
  executorLabel,
  commandExists,
  cleanExecutorEnv,
  sessionIdFromEvent,
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

// TKT-021 / BOB-133. To resume a conversation, the chat manager must capture
// the CLI's OWN conversation id off its stream events (not bobby's own ses- id):
// claude's `session_id`, codex's `thread_id`.
describe('sessionIdFromEvent (TKT-021, BOB-133)', () => {
  const ev = (data) => ({ type: 'stdout', kind: 'json', data, at: 'now' });

  test('reads session_id off a json stdout event (claude shape)', () => {
    expect(sessionIdFromEvent(ev({ type: 'system', session_id: 'claude-1' }))).toBe('claude-1');
  });

  test('reads thread_id off a thread.started event (codex shape, V1 capture verbatim)', () => {
    // Real codex-cli 0.146.0 first event, captured 2026-08-23 (BOB-133 plan V1).
    expect(sessionIdFromEvent(ev({ type: 'thread.started', thread_id: '01a0316a-5d66-7a80-900b-f0af9fe878d8' })))
      .toBe('01a0316a-5d66-7a80-900b-f0af9fe878d8');
  });

  test('session_id wins when an event carries both fields', () => {
    expect(sessionIdFromEvent(ev({ session_id: 'sid-1', thread_id: 'tid-1' }))).toBe('sid-1');
  });

  test('reads camelCase sessionID off an opencode event (BOB-085, plan V2 capture verbatim)', () => {
    // Real opencode 1.18.21 `run --format json` event, captured 2026-08-23
    // (BOB-085 plan V2); every opencode event carries sessionID (run.ts
    // ~L408-417 @03bba464). Error body shape from the 2026-08-24 re-capture.
    expect(sessionIdFromEvent(ev({
      type: 'error',
      timestamp: 1787537649689,
      sessionID: 'ses_fce7411fbffeS3C7aYXhpXidaZ',
      error: { name: 'UnknownError', data: { message: 'Unexpected server error. Check server logs for details.', ref: 'err_4c0b7f36' } },
    }))).toBe('ses_fce7411fbffeS3C7aYXhpXidaZ');
  });

  test('session_id wins over sessionID when both are present (claude field first, no cross-contamination)', () => {
    expect(sessionIdFromEvent(ev({ session_id: 'a', sessionID: 'b' }))).toBe('a');
  });

  test('a text event containing the string sessionID still yields null', () => {
    expect(sessionIdFromEvent({ type: 'stdout', kind: 'text', data: 'sessionID: ses_x' })).toBeNull();
  });

  test('returns null for events with neither id', () => {
    expect(sessionIdFromEvent(ev({ type: 'assistant' }))).toBeNull();
  });

  test('returns null for text or non-stdout events', () => {
    expect(sessionIdFromEvent({ type: 'stdout', kind: 'text', data: 'session_id: x' })).toBeNull();
    expect(sessionIdFromEvent({ type: 'stderr', text: 'x' })).toBeNull();
    expect(sessionIdFromEvent(null)).toBeNull();
  });
});

describe('codex buildArgs — every flag verified against codex-cli 0.146.0 (BOB-080)', () => {
  const build = (opts) => resolveExecutor({ target: 'codex' }).buildArgs(opts);

  test('exec is the subcommand and the prompt is positional, last', () => {
    expect(build({ prompt: 'do the thing' })).toEqual(['exec', 'do the thing']);
  });

  test('structured output maps to --json — the only structured mode codex has', () => {
    // outputFormat's VALUE is claude vocabulary (stream-json); codex has one
    // structured switch, so any request maps to it.
    expect(build({ prompt: 'p', outputFormat: 'stream-json' }))
      .toEqual(['exec', '--json', 'p']);
  });

  test('permission modes map to the verified sandbox policies', () => {
    // bypassPermissions must NOT be workspace-write: the agent runs
    // `bobby ticket move`, which writes the studio board OUTSIDE the worktree
    // cwd, and workspace-write would block the workflow's own bookkeeping.
    expect(build({ prompt: 'p', permissionMode: 'bypassPermissions' }))
      .toEqual(['exec', '--dangerously-bypass-approvals-and-sandbox', 'p']);
    expect(build({ prompt: 'p', permissionMode: 'acceptEdits' }))
      .toEqual(['exec', '--sandbox', 'workspace-write', 'p']);
    expect(build({ prompt: 'p', permissionMode: 'plan' }))
      .toEqual(['exec', '--sandbox', 'read-only', 'p']);
  });

  test('resume is exec\'s own subcommand, before the prompt', () => {
    expect(build({ prompt: 'p', resume: 'sess-1' }))
      .toEqual(['exec', 'resume', 'sess-1', 'p']);
  });

  test('allowedTools has no codex equivalent and is dropped, like cursor-agent', () => {
    expect(build({ prompt: 'p', allowedTools: 'Bash' }))
      .toEqual(['exec', 'p']);
  });

  test('model passes through', () => {
    expect(build({ prompt: 'p', model: 'gpt-5.2' }))
      .toEqual(['exec', '--model', 'gpt-5.2', 'p']);
  });
});

describe('codex through runAgent — the shim test AC 3 demands (BOB-080)', () => {
  test('spawns the codex bin with the built argv, cwd=worktree, session env', () => {
    const spawn = fakeSpawn();
    runAgent({
      worktreePath: '/tmp/wt', prompt: 'do it',
      executor: 'codex',
      outputFormat: 'stream-json', permissionMode: 'bypassPermissions',
      sessionId: 'ses-123', spawn,
    });
    const [bin, args, opts] = spawn.mock.calls[0];
    expect(bin).toBe('codex');
    expect(args).toEqual(['exec', '--json', '--dangerously-bypass-approvals-and-sandbox', 'do it']);
    expect(opts.cwd).toBe('/tmp/wt');
    expect(opts.env.BOBBY_SESSION_ID).toBe('ses-123');
  });

  test('resume never carries a sandbox flag — a subcommand\'s flags are not its parent\'s (F7)', () => {
    // The bug: `exec resume <id> --sandbox …` — refused by the real parser,
    // generated by exactly the chat path (resume + plan). Cross-product pinned.
    const build = resolveExecutor({ target: 'codex' }).buildArgs;
    for (const pm of ['acceptEdits', 'plan']) {
      const args = build({ prompt: 'p', resume: 'sess-1', permissionMode: pm, outputFormat: 'stream-json' });
      expect(args).toEqual(['exec', 'resume', 'sess-1', '--json', 'p']);
    }
    // bypass IS in resume's flag set — verified — and must survive.
    expect(build({ prompt: 'p', resume: 's', permissionMode: 'bypassPermissions' }))
      .toEqual(['exec', 'resume', 's', '--dangerously-bypass-approvals-and-sandbox', 'p']);
  });
});

// BOB-085. Every flag verified against the real binary — opencode 1.18.21
// (npm opencode-ai), `opencode run --help` run 2026-08-23 and re-run
// 2026-08-24 (plan.md verification ledger V1), cross-products re-run against
// the same binary 2026-08-24 (V6) — never from remembered help text.
describe('opencode buildArgs — every flag verified against opencode 1.18.21 (BOB-085)', () => {
  const build = (opts) => resolveExecutor({ target: 'opencode' }).buildArgs(opts);

  test('run is the subcommand and the prompt is positional, last — -p is the basic-auth password flag, never the prompt (V1)', () => {
    expect(build({ prompt: 'do the thing' })).toEqual(['run', 'do the thing']);
  });

  test('structured output maps to --format json — the only structured mode opencode has (V1/V2)', () => {
    // outputFormat's VALUE is claude vocabulary (stream-json); opencode has
    // one structured choice, so any request for structured output maps to it.
    expect(build({ prompt: 'p', outputFormat: 'stream-json' }))
      .toEqual(['run', '--format', 'json', 'p']);
  });

  test('model passes through in provider/model form (V1)', () => {
    expect(build({ prompt: 'p', model: 'anthropic/claude-sonnet-4-6' }))
      .toEqual(['run', '--model', 'anthropic/claude-sonnet-4-6', 'p']);
  });

  test('allowedTools has no opencode equivalent and is dropped, like cursor-agent and codex', () => {
    expect(build({ prompt: 'p', allowedTools: 'Bash' })).toEqual(['run', 'p']);
  });

  test('permission modes map to the verified run-mode posture (V4/V5)', () => {
    // bypassPermissions → --auto: run mode AUTO-REJECTS permission asks
    // without it (run.ts ~L551-565 @03bba464), and `bobby ticket move`
    // writes the studio board OUTSIDE the worktree cwd.
    expect(build({ prompt: 'p', permissionMode: 'bypassPermissions' }))
      .toEqual(['run', '--auto', 'p']);
    // plan → the built-in plan agent, whose policy denies edits (V5).
    expect(build({ prompt: 'p', permissionMode: 'plan' }))
      .toEqual(['run', '--agent', 'plan', 'p']);
    // acceptEdits / default → NO flag: run-mode's default posture already IS
    // acceptEdits (edits allowed in-project, external asks auto-rejected).
    expect(build({ prompt: 'p', permissionMode: 'acceptEdits' })).toEqual(['run', 'p']);
    expect(build({ prompt: 'p', permissionMode: 'default' })).toEqual(['run', 'p']);
  });

  test('resume is a flag on the same parser — --session <id>, long form (V1/V6)', () => {
    expect(build({ prompt: 'p', resume: 'ses_x', outputFormat: 'stream-json' }))
      .toEqual(['run', '--session', 'ses_x', '--format', 'json', 'p']);
  });

  test('resume × mode cross-products keep both flags — verified as cross-products, not each flag once (V6, the F7 class)', () => {
    // `opencode run` is a single yargs parser — no codex-style subcommand
    // flag-set trap — but the combos were still verified as real runs (V6).
    expect(build({ prompt: 'p', resume: 'ses_x', permissionMode: 'plan', outputFormat: 'stream-json' }))
      .toEqual(['run', '--session', 'ses_x', '--format', 'json', '--agent', 'plan', 'p']);
    expect(build({ prompt: 'p', resume: 'ses_x', permissionMode: 'bypassPermissions', outputFormat: 'stream-json' }))
      .toEqual(['run', '--session', 'ses_x', '--format', 'json', '--auto', 'p']);
    expect(build({ prompt: 'p', resume: 'ses_x', permissionMode: 'acceptEdits', outputFormat: 'stream-json' }))
      .toEqual(['run', '--session', 'ses_x', '--format', 'json', 'p']);
  });

  test('never emits flags absent from opencode run --help', () => {
    for (const permissionMode of ['default', 'acceptEdits', 'bypassPermissions', 'plan']) {
      for (const resume of [undefined, 'ses_x']) {
        const args = build({ prompt: 'p', outputFormat: 'stream-json', permissionMode, resume });
        expect(args).not.toContain('--force');
        expect(args).not.toContain('--sandbox');
        expect(args).not.toContain('--permission-mode');
        expect(args).not.toContain('-p');
        expect(args[args.length - 1]).toBe('p'); // prompt positional, last
      }
    }
  });
});

describe('opencode through runAgent — the shim test (BOB-085)', () => {
  test('spawns the opencode bin with the built argv, cwd=worktree, session env', () => {
    const spawn = fakeSpawn();
    runAgent({
      worktreePath: '/tmp/wt', prompt: 'do it',
      executor: 'opencode',
      outputFormat: 'stream-json', permissionMode: 'bypassPermissions',
      sessionId: 'ses-123', spawn,
    });
    const [bin, args, opts] = spawn.mock.calls[0];
    expect(bin).toBe('opencode');
    expect(args).toEqual(['run', '--format', 'json', '--auto', 'do it']);
    expect(opts.cwd).toBe('/tmp/wt');
    expect(opts.env.BOBBY_SESSION_ID).toBe('ses-123');
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
    expect(resolveExecutor({ target: 'agents-md' }).name).toBe('claude');
    expect(resolveExecutor({ target: 'claude-code' }).name).toBe('claude');
  });

  test('an explicit executor overrides the target derivation', () => {
    expect(resolveExecutor({ target: 'cursor', dashboard: { executor: 'claude' } }).name).toBe('claude');
    expect(resolveExecutor({ target: 'claude-code', dashboard: { executor: 'cursor-agent' } }).name)
      .toBe('cursor-agent');
  });

  test('derives codex from target=codex (BOB-080)', () => {
    const e = resolveExecutor({ target: 'codex' });
    expect(e.name).toBe('codex');
    expect(e.bin).toBe('codex');
    // ...and the explicit override still wins, same as every flavor.
    expect(resolveExecutor({ target: 'codex', dashboard: { executor: 'claude' } }).name).toBe('claude');
  });

  test('derives opencode from target=opencode (BOB-085)', () => {
    const e = resolveExecutor({ target: 'opencode' });
    expect(e.name).toBe('opencode');
    expect(e.bin).toBe('opencode');
    // ...and the explicit override still wins, same as every flavor.
    expect(resolveExecutor({ target: 'opencode', dashboard: { executor: 'claude' } }).name).toBe('claude');
  });

  test('an unrecognized executor is treated as a custom binary path', () => {
    const e = resolveExecutor({ dashboard: { executor: '/opt/bin/claude' } });
    expect(e.bin).toBe('/opt/bin/claude');
    // Custom bins keep claude-style flags, which is what this config meant before.
    expect(e.buildArgs({ prompt: 'p', outputFormat: 'stream-json' }))
      .toEqual(['-p', 'p', '--output-format', 'stream-json', '--verbose']);
  });

  test('EXECUTOR_NAMES lists every known flavor', () => {
    // EXECUTOR_NAMES is what wires the app/remote startup banner and the
    // missing-binary warning text, so registration alone discharges those.
    expect(EXECUTOR_NAMES).toEqual(expect.arrayContaining(['claude', 'cursor-agent', 'codex', 'opencode']));
  });
});

describe('executorLabel (BOB-136)', () => {
  test('a registered flavor is named by itself', () => {
    expect(executorLabel(resolveExecutor({ target: 'opencode' }))).toBe('opencode');
    expect(executorLabel(resolveExecutor({ target: 'codex' }))).toBe('codex');
    expect(executorLabel(resolveExecutor({ target: 'cursor' }))).toBe('cursor-agent');
    expect(executorLabel(resolveExecutor({}))).toBe('claude');
  });

  test('a custom binary path is named by its binary, not by the path', () => {
    // What `resolveExecutor` returns today for `dashboard.executor: <a path>`.
    const label = executorLabel({ name: '/abs/path/to/opencode', bin: '/abs/path/to/opencode' });
    expect(label).toBe('opencode');
    expect(label).not.toContain('/');
  });

  test('a resolved flavor keeps the flavor name even when its bin says otherwise', () => {
    // The shape BOB-137 will produce: a path resolved to a registered flavor.
    // The bin here is deliberately a wrapper whose basename is NOT the flavor
    // name — the case where "registered flavor wins" is the only thing that
    // separates this branch from a bare basename.
    expect(executorLabel({ name: 'opencode', bin: '/opt/wrappers/oc-shim' })).toBe('opencode');
    expect(executorLabel({ name: 'opencode', bin: '/abs/path/to/opencode' })).toBe('opencode');
  });

  test('an unregistered bare name is kept as-is', () => {
    expect(executorLabel({ name: 'aider', bin: 'aider' })).toBe('aider');
  });

  test('degrades to an honest phrase rather than to undefined or empty', () => {
    // `${undefined} exited with code 1` is worse than the hardcode it replaced.
    expect(executorLabel({})).toBe('the agent CLI');
    expect(executorLabel(undefined)).toBe('the agent CLI');
    expect(executorLabel({ name: '', bin: '' })).toBe('the agent CLI');
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
