// test/eval/eval.test.js
// Prompt quality evaluation tests — validates that generated prompts
// contain required structural elements for correct agent behavior.

import {
  buildOrchestrationPrompt,
  buildSingleAgentPrompt,
  buildFeaturePrompt,
  buildShipPrompt,
  buildBatchStagePrompt,
  buildUxPrompt,
  buildPmPrompt,
  buildQePrompt,
  DEFAULT_PIPELINE,
} from '../../lib/pipeline.js';

// ── Orchestration Prompt ──────────────────────────────────

describe('eval: buildOrchestrationPrompt', () => {
  const prompt = buildOrchestrationPrompt(['TKT-001', 'TKT-002'], DEFAULT_PIPELINE, 3, '.bobby/tickets', 20, '.bobby/runs');

  test('includes branch guard', () => {
    expect(prompt).toContain('git branch --show-current');
    expect(prompt).toMatch(/main|master/);
  });

  test('includes safety limits', () => {
    expect(prompt).toContain('Max retries per ticket: 3');
    expect(prompt).toContain('Max total agent invocations');
    expect(prompt).toContain('20');
  });

  test('maps every pipeline stage to an agent', () => {
    for (const step of DEFAULT_PIPELINE) {
      expect(prompt).toContain(step.agent);
      expect(prompt).toContain(step.stage);
    }
  });

  test('includes retry logic for rejections', () => {
    expect(prompt).toMatch(/reject|building/i);
    expect(prompt).toContain('Maximum retries');
  });

  test('includes run log format', () => {
    expect(prompt).toContain('Pipeline Run');
    expect(prompt).toContain('Results');
    expect(prompt).toContain('Ticket');
    expect(prompt).toContain('Outcome');
  });

  test('includes git status verification', () => {
    expect(prompt).toContain('git status');
    expect(prompt).toContain('uncommitted');
  });

  test('lists all ticket IDs', () => {
    expect(prompt).toContain('TKT-001');
    expect(prompt).toContain('TKT-002');
  });
});

// ── Single Agent Prompt ───────────────────────────────────

describe('eval: buildSingleAgentPrompt', () => {
  const prompt = buildSingleAgentPrompt('bobby-build', 'TKT-042', '.bobby/tickets');

  test('includes claim step', () => {
    expect(prompt).toContain('bobby assign TKT-042 bobby-build');
  });

  test('includes read ticket step', () => {
    expect(prompt).toContain('ticket.md');
  });

  test('includes follow agent instructions', () => {
    expect(prompt).toContain('.claude/agents/bobby-build.md');
  });

  test('includes git status verification', () => {
    expect(prompt).toContain('git status');
  });
});

// ── Feature Prompt ────────────────────────────────────────

describe('eval: buildFeaturePrompt', () => {
  const childTickets = [
    { id: 'TKT-011', title: 'Welcome screen', priority: 'high', stage: 'planning' },
    { id: 'TKT-012', title: 'Profile setup', priority: 'high', stage: 'building' },
    { id: 'TKT-013', title: 'Celebration', priority: 'medium', stage: 'backlog' },
  ];
  const prompt = buildFeaturePrompt(
    'TKT-010', 'User onboarding flow', childTickets,
    DEFAULT_PIPELINE, 3, '.bobby/tickets', undefined, '.bobby/runs'
  );

  test('includes Phase 1 holistic planning', () => {
    expect(prompt).toContain('Phase 1');
    expect(prompt).toMatch(/[Hh]olistic [Pp]lanning/);
  });

  test('includes Phase 2 sequential execution', () => {
    expect(prompt).toContain('Phase 2');
    expect(prompt).toMatch(/[Ss]equential [Ee]xecution/);
  });

  test('includes feature-plan.md management', () => {
    expect(prompt).toContain('feature-plan.md');
  });

  test('includes integration check between tickets', () => {
    expect(prompt).toMatch(/test suite|integration/i);
  });

  test('includes branch guard with feature branch name', () => {
    expect(prompt).toContain('feature/tkt-010-user-onboarding-flow');
  });

  test('includes safety limits', () => {
    expect(prompt).toContain('Max retries per ticket: 3');
    expect(prompt).toContain('Max total agent invocations');
  });

  test('includes run log format', () => {
    expect(prompt).toContain('Feature Run');
    expect(prompt).toContain('Results');
  });

  test('lists all child tickets in order', () => {
    expect(prompt).toContain('TKT-011');
    expect(prompt).toContain('TKT-012');
    expect(prompt).toContain('TKT-013');
  });

  test('identifies tickets needing planning', () => {
    expect(prompt).toContain('Tickets to plan');
    // TKT-011 is planning, TKT-013 is backlog — both need planning
    expect(prompt).toContain('TKT-011');
    expect(prompt).toContain('TKT-013');
  });

  test('identifies tickets past planning', () => {
    expect(prompt).toContain('Already past planning');
    expect(prompt).toContain('TKT-012');
  });

  test('includes sibling plan reading instructions', () => {
    expect(prompt).toContain('plan.md');
    expect(prompt).toMatch(/sibling|cross-ticket|context/i);
  });
});

// ── Ship Prompt ───────────────────────────────────────────

describe('eval: buildShipPrompt', () => {
  test('single repo includes rebase and no-merge instruction', () => {
    const prompt = buildShipPrompt('.bobby/tickets', []);
    expect(prompt).toContain('Rebase');
    expect(prompt).toMatch(/[Dd]o NOT merge|not merge/i);
  });

  test('multi-repo includes per-repo steps', () => {
    const repos = [
      { name: 'api', path: '../myapp-api' },
      { name: 'ui', path: '../myapp-ui' },
    ];
    const prompt = buildShipPrompt('.bobby/tickets', repos);
    expect(prompt).toContain('../myapp-api');
    expect(prompt).toContain('../myapp-ui');
    expect(prompt).toContain('ALL repos');
  });

  test('includes shipping list check', () => {
    const prompt = buildShipPrompt('.bobby/tickets', []);
    expect(prompt).toContain('bobby list shipping');
  });
});

// ── Batch Stage Prompt ────────────────────────────────────

describe('eval: buildBatchStagePrompt', () => {
  const prompt = buildBatchStagePrompt('bobby-plan', ['TKT-001', 'TKT-002', 'TKT-003']);

  test('mentions parallel subagent execution', () => {
    expect(prompt).toMatch(/parallel/i);
    expect(prompt).toMatch(/subagent/i);
  });

  test('lists all ticket IDs', () => {
    expect(prompt).toContain('TKT-001');
    expect(prompt).toContain('TKT-002');
    expect(prompt).toContain('TKT-003');
  });

  test('includes ticket count', () => {
    expect(prompt).toContain('3 ticket(s)');
  });
});

// ── Freeform Agent Prompts ────────────────────────────────

describe('eval: freeform agent prompts', () => {
  test('UX prompt references agent instructions and Chrome', () => {
    const prompt = buildUxPrompt();
    expect(prompt).toContain('bobby-ux');
    expect(prompt).toContain('Chrome');
  });

  test('PM prompt references agent instructions and Chrome', () => {
    const prompt = buildPmPrompt();
    expect(prompt).toContain('bobby-pm');
    expect(prompt).toContain('Chrome');
  });

  test('QE prompt references testing queue', () => {
    const prompt = buildQePrompt();
    expect(prompt).toContain('bobby-qe');
    expect(prompt).toContain('bobby list testing');
  });
});

// ── Cross-Cutting Prompt Quality Checks ───────────────────

describe('eval: cross-cutting quality', () => {
  const allPrompts = [
    { name: 'orchestration', prompt: buildOrchestrationPrompt(['TKT-001'], DEFAULT_PIPELINE) },
    { name: 'single', prompt: buildSingleAgentPrompt('bobby-build', 'TKT-001') },
    { name: 'ship', prompt: buildShipPrompt() },
    { name: 'ux', prompt: buildUxPrompt() },
    { name: 'pm', prompt: buildPmPrompt() },
    { name: 'qe', prompt: buildQePrompt() },
  ];

  test.each(allPrompts)('$name prompt references agent .md file', ({ prompt }) => {
    expect(prompt).toMatch(/\.claude\/agents\/bobby-\w+\.md/);
  });

  test('orchestration and feature prompts include git status check', () => {
    const orch = buildOrchestrationPrompt(['TKT-001'], DEFAULT_PIPELINE);
    expect(orch).toContain('git status');

    const feat = buildFeaturePrompt('TKT-010', 'Test', [
      { id: 'TKT-011', title: 'Child', priority: 'medium', stage: 'planning' },
    ], DEFAULT_PIPELINE, 3, '.bobby/tickets', undefined, '.bobby/runs');
    expect(feat).toContain('git status');
  });

  test('no prompt contains deprecated prefill instructions', () => {
    for (const { name, prompt } of allPrompts) {
      expect(prompt).not.toMatch(/prefill|Assistant \(prefill\)/i);
    }
  });
});
