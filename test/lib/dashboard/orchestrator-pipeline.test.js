// test/lib/dashboard/orchestrator-pipeline.test.js
//
// A workspace advances through ITS OWN workflow, not the server default.
// Before the fix, `pipeline: 'quick'` was recorded on the workspace but
// approve() walked the constructor pipeline anyway.
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { resolveWorkflow } from '../../../lib/workflow.js';

function bareOrchestrator(config = {}) {
  // _resolveNextAgent and _pipelineFor need no fs, store, or executor.
  return Object.assign(Object.create(Orchestrator.prototype), {
    config,
    pipeline: resolveWorkflow(config, 'default'),
    pipelineName: 'default',
  });
}

describe('per-workspace pipeline', () => {
  it('a quick workspace skips review: building → testing', () => {
    const o = bareOrchestrator();

    // default: building → reviewing; quick: building → testing
    expect(o._resolveNextAgent({ stage: 'building', pipeline: 'default' })).toBe('review');
    expect(o._resolveNextAgent({ stage: 'building', pipeline: 'quick' })).toBe('test');
  });

  it('no recorded pipeline falls back to the server default', () => {
    const o = bareOrchestrator();

    expect(o._resolveNextAgent({ stage: 'planning' })).toBe('build');
  });

  it('a custom workflow from config is honored', () => {
    const o = bareOrchestrator({
      workflows: { thorough: ['plan', 'build', 'review', 'security', 'test'] },
    });

    expect(o._resolveNextAgent({ stage: 'reviewing', pipeline: 'thorough' })).toBe('security');
  });

  it('a workflow deleted from config degrades to the default instead of stranding', () => {
    const o = bareOrchestrator();

    expect(o._resolveNextAgent({ stage: 'building', pipeline: 'gone-from-config' })).toBe('review');
  });
});

describe('featureProgress', () => {
  // featureProgress needs only config, ticketsDir, and a store — no git.
  const wire = (o, { ws, ticketsDir }) => Object.assign(o, {
    ticketsDir,
    store: { get: (id) => (id === ws.id ? ws : null) },
  });

  it('reads child stages from the worktree when it exists, main tickets dir when it is gone', async () => {
    const fs = (await import('fs')).default;
    const os = (await import('os')).default;
    const path = (await import('path')).default;
    const { createTicket } = await import('../../../lib/tickets.js');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-fp-'));
    try {
      const mainTickets = path.join(tmp, 'main', '.bobby', 'tickets');
      fs.mkdirSync(mainTickets, { recursive: true });
      createTicket(mainTickets, { prefix: 'TKT', title: 'Epic', type: 'epic' });
      createTicket(mainTickets, { prefix: 'TKT', title: 'Child', parent: 'TKT-001' });

      // Worktree copy where the child has advanced.
      const worktree = path.join(tmp, 'wt');
      const wtTickets = path.join(worktree, '.bobby', 'tickets');
      fs.mkdirSync(path.dirname(wtTickets), { recursive: true });
      fs.cpSync(mainTickets, wtTickets, { recursive: true });
      const childFile = path.join(wtTickets, fs.readdirSync(wtTickets).find((d) => d.startsWith('TKT-002')), 'ticket.md');
      fs.writeFileSync(childFile, fs.readFileSync(childFile, 'utf8').replace('stage: backlog', 'stage: reviewing'));

      const ws = { id: 'ws1', ticketId: 'TKT-001', worktreePath: worktree };
      const o = wire(bareOrchestrator(), { ws, ticketsDir: mainTickets });

      expect(o.featureProgress('ws1').children[0].stage).toBe('reviewing');

      // Worktree removed (merged/discarded) → falls back to the main checkout.
      fs.rmSync(worktree, { recursive: true });
      expect(o.featureProgress('ws1').children[0].stage).toBe('backlog');

      expect(() => o.featureProgress('nope')).toThrow(/not found/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
