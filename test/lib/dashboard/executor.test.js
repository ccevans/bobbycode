// test/lib/dashboard/executor.test.js
import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { runClaude } from '../../../lib/dashboard/executor.js';

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
});
