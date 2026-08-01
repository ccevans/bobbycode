// test/lib/codex-target.test.js
//
// Target-specific behaviour for the Codex adapter and its executor flavor.
// Shared adapter invariants are covered by target-matrix.test.js, which runs
// against every registered target including this one.
//
// Every convention asserted here was verified against the real @openai/codex
// 0.146.0 binary (strings + `codex exec --help`), not documentation.

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { getTarget, TARGETS } from '../../lib/targets/index.js';
import { resolveExecutor, runAgent } from '../../lib/dashboard/executor.js';

function fakeSpawn() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  child.exitCode = null;
  child.pid = 999;
  const spawnFn = jest.fn(() => child);
  spawnFn.child = child;
  return spawnFn;
}

describe('codex target', () => {
  const target = getTarget('codex');

  test('is registered', () => {
    expect(TARGETS).toContain('codex');
    expect(target.displayName()).toBe('Codex');
  });

  test('rules go to AGENTS.md — Codex reads it natively', () => {
    // Verified: the binary carries a full "AGENTS.md spec" in its base
    // instructions and ships `/init` to create one.
    expect(target.paths().rules).toBe('AGENTS.md');
  });

  test('scaffolds under the .codex namespace', () => {
    const p = target.paths();
    expect(p.skills).toBe('.codex/skills');
    expect(p.agents).toBe('.codex/agents');
    expect(p.commands).toBe('.codex/prompts');
  });

  test('does not claim subagent support', () => {
    // The binary mentions a subagents concept but the definition format is
    // unverified, and unverified conventions do not ship.
    expect(target.supportsSubagents()).toBe(false);
  });

  test('strips frontmatter from prompt files', () => {
    const out = target.transformCommand('---\ndescription: "Build a ticket"\n---\n\nBody.\n');
    expect(out).toBe('_Build a ticket_\n\nBody.\n');
    expect(out.startsWith('---')).toBe(false);
  });
});

describe('codex executor', () => {
  test('derives from target: codex', () => {
    const e = resolveExecutor({ target: 'codex' });
    expect(e.name).toBe('codex');
    expect(e.bin).toBe('codex');
  });

  test('an explicit executor still overrides the target', () => {
    expect(resolveExecutor({ target: 'codex', dashboard: { executor: 'claude' } }).name)
      .toBe('claude');
  });

  const argvFor = (opts) => {
    const spawn = fakeSpawn();
    runAgent({ worktreePath: '/t', prompt: 'PROMPT', sessionId: 's', spawn, executor: 'codex', ...opts });
    return spawn.mock.calls[0][1];
  };

  test('uses the exec subcommand and --json, not --output-format', () => {
    const args = argvFor({});
    expect(args[0]).toBe('exec');
    expect(args).toContain('--json');
    expect(args).not.toContain('--output-format');
    expect(args).not.toContain('--verbose');
  });

  test('passes the prompt positionally, never via -p', () => {
    // In Codex, -p is --profile. Passing the prompt as `-p <prompt>` would
    // silently load a nonexistent profile instead of erroring.
    const args = argvFor({});
    expect(args).not.toContain('-p');
    expect(args[args.length - 1]).toBe('PROMPT');
  });

  test('the prompt is last, so it cannot be consumed as a flag value', () => {
    const args = argvFor({ model: 'gpt-5.3-codex', permissionMode: 'acceptEdits' });
    expect(args[args.length - 1]).toBe('PROMPT');
    expect(args.indexOf('PROMPT')).toBe(args.length - 1);
  });

  test('maps permission modes to verified sandbox/approval flags', () => {
    expect(argvFor({ permissionMode: 'bypassPermissions' }))
      .toContain('--dangerously-bypass-approvals-and-sandbox');

    const accept = argvFor({ permissionMode: 'acceptEdits' });
    expect(accept).toContain('--sandbox');
    expect(accept[accept.indexOf('--sandbox') + 1]).toBe('workspace-write');
    expect(accept).toContain('--ask-for-approval');
    expect(accept[accept.indexOf('--ask-for-approval') + 1]).toBe('never');

    const plan = argvFor({ permissionMode: 'plan' });
    expect(plan[plan.indexOf('--sandbox') + 1]).toBe('read-only');
    expect(plan).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  test('passes --model through', () => {
    const args = argvFor({ model: 'gpt-5.3-codex' });
    expect(args[args.indexOf('--model') + 1]).toBe('gpt-5.3-codex');
  });

  test('drops allowedTools — Codex has no per-tool allowlist', () => {
    expect(argvFor({ allowedTools: 'Bash,Edit' })).not.toContain('--allowed-tools');
  });

  test('parses codex JSONL events', async () => {
    const spawn = fakeSpawn();
    const events = [];
    const h = runAgent({
      worktreePath: '/t', prompt: 'p', sessionId: 's', spawn, executor: 'codex',
      onEvent: e => events.push(e),
    });
    spawn.child.stdout.emit('data', Buffer.from('{"type":"item.completed"}\nnot json\n'));
    spawn.child.emit('exit', 0, null);
    await h.done;
    expect(events.filter(e => e.kind === 'json')).toHaveLength(1);
    expect(events.filter(e => e.kind === 'text')).toHaveLength(1);
  });
});
