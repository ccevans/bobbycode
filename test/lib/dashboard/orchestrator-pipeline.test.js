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
