// test/lib/dashboard/orchestrator-continue-builder.test.js
//
// TKT-073 changed the claude-code `workflow` prompt to continue the original
// builder via SendMessage on a rejection. Dashboard runs build that prompt too
// (orchestrator runAgent -> buildPromptFor), so pin what the dashboard hands
// its `claude -p` host.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { buildPromptFor, resolveWorkflow } from '../../../lib/workflow.js';
import { createTicket } from '../../../lib/tickets.js';

describe('dashboard workflow prompt (TKT-073)', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-dash-cb-'));
    createTicket(dir, { prefix: 'TKT', title: 'X', author: 'dev', area: '' });
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true }); });

  const promptFor = (config) => {
    const o = Object.assign(Object.create(Orchestrator.prototype), {
      _config: config, agentsPath: '.claude/agents', repoRoot: dir,
      _ticketsDirFor: () => dir,
      _configFor: () => config,
      _pipelineFor: () => resolveWorkflow(config, 'default'),
    });
    return buildPromptFor('workflow', ['TKT-001'], o._promptContext({ ticketId: 'TKT-001' })).prompt;
  };

  test('claude host: the rejection loop continues the original builder', () => {
    const p = promptFor({ target: 'claude-code' });
    expect(p).toContain('SendMessage');
    expect(p).toContain('Note the agent id');
    expect(p).toContain('fresh bobby-build subagent');
  });

  test('cursor-agent host on a claude-code target keeps the fresh-launch loop', () => {
    const p = promptFor({ target: 'claude-code', dashboard: { executor: 'cursor-agent' } });
    expect(p).not.toContain('SendMessage');
    expect(p).toContain('Loop back and launch a bobby-build subagent again');
  });

  test('cursor target keeps the fresh-launch loop', () => {
    expect(promptFor({ target: 'cursor' })).not.toContain('SendMessage');
  });

  // SendMessage exists only in the `claude` host. An allow-list: every other
  // executor (codex, opencode, a custom binary) gets the fresh-launch loop.
  test.each(['codex', 'opencode'])('%s host on a claude-code target keeps the fresh-launch loop', (executor) => {
    const p = promptFor({ target: 'claude-code', dashboard: { executor } });
    expect(p).not.toContain('SendMessage');
    expect(p).toContain('Loop back and launch a bobby-build subagent again');
  });

  test('a custom claude binary path keeps the fresh-launch loop', () => {
    const p = promptFor({ target: 'claude-code', dashboard: { executor: '/opt/bin/claude' } });
    expect(p).not.toContain('SendMessage');
  });

  test.each(['codex', 'opencode', 'copilot', 'agents-md'])('%s target keeps the fresh-launch loop', (target) => {
    expect(promptFor({ target })).not.toContain('SendMessage');
  });
});
