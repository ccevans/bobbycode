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

// These assert PIPELINE SELECTION — that a workspace advances through the
// workflow it was created with rather than the server default. They previously
// also encoded an off-by-one (`ws.stage` read as "the stage just completed", so
// the next agent was pipeline[idx + 1]); ws.stage is the stage the ticket is NOW
// IN, so the agent that owns that stage is the one that runs next (TKT-047).
// The workspaces below are therefore keyed on the stage whose agent we expect.
describe('per-workspace pipeline', () => {
  it('a quick workspace skips review: after build, testing not reviewing', () => {
    const o = bareOrchestrator();

    // Both workflows put a built ticket in the stage their next agent owns.
    // default: reviewing → bobby-review. quick has no reviewing stage at all,
    // so bobby-build lands the ticket in testing → bobby-test.
    expect(o._resolveNextAgent({ stage: 'reviewing', pipeline: 'default' })).toBe('review');
    expect(o._resolveNextAgent({ stage: 'testing', pipeline: 'quick' })).toBe('test');

    // The selection, stated as the difference it makes: the same stage resolves
    // to an agent under default and to nothing under quick.
    expect(o._resolveNextAgent({ stage: 'reviewing', pipeline: 'quick' })).toBeNull();
  });

  it('no recorded pipeline falls back to the server default', () => {
    const o = bareOrchestrator();

    expect(o._resolveNextAgent({ stage: 'planning' })).toBe('plan');
    expect(o._resolveNextAgent({ stage: 'building' })).toBe('build');
  });

  it('a custom workflow from config is honored', () => {
    const o = bareOrchestrator({
      workflows: { thorough: ['plan', 'build', 'security', 'test'] },
    });

    // `security` has a stage of its own (TKT-049), so `thorough` resolves it to
    // bobby-security and has no reviewing stage at all — while `default` still
    // gives reviewing to bobby-review. Both only because the workspace's own
    // workflow is consulted.
    expect(o._resolveNextAgent({ stage: 'security', pipeline: 'thorough' })).toBe('security');
    expect(o._resolveNextAgent({ stage: 'reviewing', pipeline: 'thorough' })).toBeNull();
    expect(o._resolveNextAgent({ stage: 'reviewing', pipeline: 'default' })).toBe('review');
  });

  it('a workflow deleted from config degrades to the default instead of stranding', () => {
    const o = bareOrchestrator();

    expect(o._resolveNextAgent({ stage: 'reviewing', pipeline: 'gone-from-config' })).toBe('review');
  });

  it('returns null past the end of the workflow', () => {
    const o = bareOrchestrator();

    expect(o._resolveNextAgent({ stage: 'shipping', pipeline: 'default' })).toBeNull();
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
