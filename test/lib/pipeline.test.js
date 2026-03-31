// test/lib/pipeline.test.js
import {
  buildSingleAgentPrompt, buildNextStepPrompt, buildBatchStagePrompt,
  buildUxPrompt, buildPmPrompt, buildQePrompt, buildShipPrompt, buildFeaturePrompt,
  buildOrchestrationPrompt, buildSecurityPrompt, buildDebugPrompt, buildDocsPrompt,
  buildPerformancePrompt, buildWatchdogPrompt, buildVetPrompt, buildStrategyPrompt,
  resolveNextAgent, DEFAULT_PIPELINE,
} from '../../lib/pipeline.js';
import { createTicket, moveTicket, findTicket, writeTicket } from '../../lib/tickets.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('pipeline', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-pipeline-'));
    fs.writeFileSync(path.join(tmpDir, '.counter'), '0');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('buildSingleAgentPrompt includes claim step', () => {
    const prompt = buildSingleAgentPrompt('bobby-plan', 'TKT-001');
    expect(prompt).toContain('bobby assign TKT-001 bobby-plan');
    expect(prompt).toContain('bobby move');
  });

  test('buildNextStepPrompt returns plan prompt for planning stage', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'planning', 'dev');

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_PIPELINE, tmpDir);
    expect(prompt).toContain('bobby-plan');
    expect(prompt).toContain('TKT-001');
  });

  test('buildNextStepPrompt returns build prompt for building stage', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'building', 'dev');

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_PIPELINE, tmpDir);
    expect(prompt).toContain('bobby-build');
  });

  test('buildNextStepPrompt handles backlog', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_PIPELINE, tmpDir);
    expect(prompt).toContain('in backlog');
    expect(prompt).toContain('bobby move TKT-001 plan');
  });

  test('buildNextStepPrompt handles blocked', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'building', 'dev');
    moveTicket(tmpDir, 'TKT-001', 'blocked', 'dev', 'Needs API key');

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_PIPELINE, tmpDir);
    expect(prompt).toContain('blocked');
    expect(prompt).toContain('Needs API key');
  });

  test('buildNextStepPrompt handles done', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'done', 'dev');

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_PIPELINE, tmpDir);
    expect(prompt).toContain('already done');
  });

  test('buildNextStepPrompt handles shipping', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'shipping', 'dev');

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_PIPELINE, tmpDir);
    expect(prompt).toContain('bobby run ship');
  });

  test('buildNextStepPrompt throws for missing ticket', () => {
    expect(() => buildNextStepPrompt('TKT-999', DEFAULT_PIPELINE, tmpDir)).toThrow('not found');
  });

  test('buildBatchStagePrompt lists all ticket IDs', () => {
    const prompt = buildBatchStagePrompt('bobby-plan', ['TKT-001', 'TKT-002', 'TKT-003']);
    expect(prompt).toContain('3 ticket(s)');
    expect(prompt).toContain('TKT-001');
    expect(prompt).toContain('TKT-002');
    expect(prompt).toContain('TKT-003');
    expect(prompt).toContain('parallel');
    expect(prompt).toContain('subagent');
  });

  test('buildBatchStagePrompt default has no worktree instructions', () => {
    const prompt = buildBatchStagePrompt('bobby-build', ['TKT-001', 'TKT-002']);
    expect(prompt).not.toContain('worktree');
    expect(prompt).not.toContain('isolation');
  });

  test('buildBatchStagePrompt with worktree isolation includes isolation instructions', () => {
    const prompt = buildBatchStagePrompt('bobby-build', ['TKT-001', 'TKT-002'], '.bobby/tickets', 'worktree');
    expect(prompt).toContain('worktree isolation');
    expect(prompt).toContain('isolation: "worktree"');
    expect(prompt).toContain('git checkout -b tkt-{ID}');
    expect(prompt).toContain('TKT-001');
    expect(prompt).toContain('TKT-002');
    expect(prompt).toContain('parallel');
  });

  test('buildUxPrompt mentions Chrome browser', () => {
    expect(buildUxPrompt()).toContain('Chrome browser');
  });

  test('buildPmPrompt mentions product review', () => {
    expect(buildPmPrompt()).toContain('product review');
  });

  test('buildShipPrompt mentions PR', () => {
    expect(buildShipPrompt()).toContain('PR');
  });

  test('buildQePrompt mentions Chrome browser', () => {
    expect(buildQePrompt()).toContain('Chrome browser');
  });

  describe('resolveNextAgent', () => {
    test('returns agent for matching stage', () => {
      expect(resolveNextAgent(DEFAULT_PIPELINE, 'planning')).toBe('bobby-plan');
      expect(resolveNextAgent(DEFAULT_PIPELINE, 'building')).toBe('bobby-build');
      expect(resolveNextAgent(DEFAULT_PIPELINE, 'reviewing')).toBe('bobby-review');
      expect(resolveNextAgent(DEFAULT_PIPELINE, 'testing')).toBe('bobby-test');
    });

    test('returns null for unmapped stage', () => {
      expect(resolveNextAgent(DEFAULT_PIPELINE, 'shipping')).toBeNull();
      expect(resolveNextAgent(DEFAULT_PIPELINE, 'done')).toBeNull();
      expect(resolveNextAgent(DEFAULT_PIPELINE, 'blocked')).toBeNull();
    });
  });

  describe('buildOrchestrationPrompt', () => {
    test('includes ticket list', () => {
      const prompt = buildOrchestrationPrompt(['TKT-001', 'TKT-002'], DEFAULT_PIPELINE);
      expect(prompt).toContain('- TKT-001');
      expect(prompt).toContain('- TKT-002');
    });

    test('includes branch guard', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_PIPELINE);
      expect(prompt).toContain('Branch guard');
      expect(prompt).toContain('git branch --show-current');
      expect(prompt).toContain('tkt-TKT-001');
    });

    test('includes safety limits', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_PIPELINE, 5, '.bobby/tickets', 30);
      expect(prompt).toContain('Max retries per ticket: 5');
      expect(prompt).toContain('Max total agent invocations across all tickets: 30');
    });

    test('includes all pipeline agent references', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_PIPELINE);
      expect(prompt).toContain('.claude/agents/bobby-plan.md');
      expect(prompt).toContain('.claude/agents/bobby-build.md');
      expect(prompt).toContain('.claude/agents/bobby-review.md');
      expect(prompt).toContain('.claude/agents/bobby-test.md');
    });

    test('includes retry and debug logic', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_PIPELINE);
      expect(prompt).toContain('rejection');
      expect(prompt).toContain('bobby-debug');
      expect(prompt).toContain('.claude/agents/bobby-debug.md');
    });

    test('includes run log format', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_PIPELINE, 3, '.bobby/tickets', 20, '.bobby/runs');
      expect(prompt).toContain('Pipeline Run');
      expect(prompt).toContain('.bobby/runs/');
      expect(prompt).toContain('run-{YYYYMMDD-HHmmss}.md');
    });

    test('handles single ticket ID (non-array)', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_PIPELINE);
      expect(prompt).toContain('- TKT-001');
    });

    test('uses custom ticketsDir', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_PIPELINE, 3, 'custom/tickets');
      expect(prompt).toContain('custom/tickets');
    });
  });

  describe('buildSecurityPrompt', () => {
    test('includes ticket ID and agent ref', () => {
      const prompt = buildSecurityPrompt('TKT-001');
      expect(prompt).toContain('TKT-001');
      expect(prompt).toContain('.claude/agents/bobby-security.md');
    });

    test('references OWASP and STRIDE', () => {
      const prompt = buildSecurityPrompt('TKT-001');
      expect(prompt).toContain('OWASP Top 10');
      expect(prompt).toContain('STRIDE');
    });

    test('includes claim step', () => {
      const prompt = buildSecurityPrompt('TKT-001');
      expect(prompt).toContain('bobby assign TKT-001 bobby-security');
    });

    test('uses custom ticketsDir', () => {
      const prompt = buildSecurityPrompt('TKT-001', 'custom/tickets');
      expect(prompt).toContain('custom/tickets/TKT-001');
    });
  });

  describe('buildDebugPrompt', () => {
    test('includes ticket ID and agent ref', () => {
      const prompt = buildDebugPrompt('TKT-001');
      expect(prompt).toContain('TKT-001');
      expect(prompt).toContain('.claude/agents/bobby-debug.md');
    });

    test('references debug methodology', () => {
      const prompt = buildDebugPrompt('TKT-001');
      expect(prompt).toContain('Reproduce');
      expect(prompt).toContain('Hypothesize');
      expect(prompt).toContain('Trace');
      expect(prompt).toContain('Verify');
      expect(prompt).toContain('Fix');
    });

    test('includes scope lock', () => {
      const prompt = buildDebugPrompt('TKT-001');
      expect(prompt).toContain('Scope lock');
      expect(prompt).toContain('only fix the bug');
    });

    test('includes claim step', () => {
      const prompt = buildDebugPrompt('TKT-001');
      expect(prompt).toContain('bobby assign TKT-001 bobby-debug');
    });
  });

  describe('buildDocsPrompt', () => {
    test('includes agent ref', () => {
      const prompt = buildDocsPrompt();
      expect(prompt).toContain('.claude/agents/bobby-docs.md');
    });

    test('references git log', () => {
      const prompt = buildDocsPrompt();
      expect(prompt).toContain('git log');
    });

    test('includes commit message format', () => {
      const prompt = buildDocsPrompt();
      expect(prompt).toContain('docs: update');
    });
  });

  describe('buildPerformancePrompt', () => {
    test('includes agent ref', () => {
      const prompt = buildPerformancePrompt();
      expect(prompt).toContain('.claude/agents/bobby-performance.md');
    });

    test('references benchmarks path', () => {
      const prompt = buildPerformancePrompt();
      expect(prompt).toContain('.bobby/benchmarks/');
    });

    test('mentions regression threshold', () => {
      const prompt = buildPerformancePrompt();
      expect(prompt).toContain('10%');
    });
  });

  describe('buildWatchdogPrompt', () => {
    test('includes agent ref', () => {
      const prompt = buildWatchdogPrompt();
      expect(prompt).toContain('.claude/agents/bobby-watchdog.md');
    });

    test('references health check steps', () => {
      const prompt = buildWatchdogPrompt();
      expect(prompt).toContain('HTTP 200');
      expect(prompt).toContain('5 seconds');
      expect(prompt).toContain('JavaScript console errors');
    });

    test('references watchdog output', () => {
      const prompt = buildWatchdogPrompt();
      expect(prompt).toContain('.bobby/watchdog/');
    });
  });

  describe('buildVetPrompt', () => {
    test('includes agent ref', () => {
      const prompt = buildVetPrompt();
      expect(prompt).toContain('.claude/agents/bobby-vet.md');
    });

    test('uses ticketsDir for path interpolation', () => {
      const prompt = buildVetPrompt('custom/tickets');
      expect(prompt).toContain('custom/tickets/{ID}*/ticket.md');
    });

    test('does not move ticket between stages', () => {
      const prompt = buildVetPrompt();
      expect(prompt).toContain('Do NOT move the ticket');
    });

    test('asks one question at a time', () => {
      const prompt = buildVetPrompt();
      expect(prompt).toContain('ONE probing question');
    });
  });

  describe('buildStrategyPrompt', () => {
    test('includes agent ref', () => {
      const prompt = buildStrategyPrompt();
      expect(prompt).toContain('.claude/agents/bobby-strategy.md');
    });

    test('uses ticketsDir for path interpolation', () => {
      const prompt = buildStrategyPrompt('custom/tickets');
      expect(prompt).toContain('custom/tickets/{ID}*/ticket.md');
    });

    test('includes decision outcomes', () => {
      const prompt = buildStrategyPrompt();
      expect(prompt).toContain('APPROVE');
      expect(prompt).toContain('DEFER');
      expect(prompt).toContain('KILL');
    });

    test('references strategy framework', () => {
      const prompt = buildStrategyPrompt();
      expect(prompt).toContain('demand validation');
      expect(prompt).toContain('impact scoring');
    });
  });

  test('buildShipPrompt with multi-repo includes per-repo steps', () => {
    const repos = [
      { name: 'Backend', path: 'api/' },
      { name: 'Frontend', path: 'web/' },
    ];
    const prompt = buildShipPrompt('.bobby/tickets', repos);
    expect(prompt).toContain('multi-repo');
    expect(prompt).toContain('api/');
    expect(prompt).toContain('web/');
    expect(prompt).toContain('PRs for ALL repos');
  });

  test('buildShipPrompt includes agent ref', () => {
    const prompt = buildShipPrompt();
    expect(prompt).toContain('.claude/agents/bobby-ship.md');
  });

  test('buildNextStepPrompt returns no-agent message for unmapped stage', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'reviewing', 'dev');

    // Use a pipeline that has no entry for "reviewing"
    const customPipeline = [
      { stage: 'planning', agent: 'bobby-plan' },
      { stage: 'building', agent: 'bobby-build' },
    ];
    const prompt = buildNextStepPrompt('TKT-001', customPipeline, tmpDir);
    expect(prompt).toContain('No agent mapped for stage');
  });

  test('buildNextStepPrompt shows "no reason given" when blocked without reason', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'building', 'dev');
    moveTicket(tmpDir, 'TKT-001', 'blocked', 'dev');
    // Force blocked_reason to null
    const found = findTicket(tmpDir, 'TKT-001');
    writeTicket(found.path, { ...found.data, blocked_reason: null }, found.content);

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_PIPELINE, tmpDir);
    expect(prompt).toContain('no reason given');
  });

  describe('buildFeaturePrompt', () => {
    const children = [
      { id: 'TKT-002', title: 'Auth login', priority: 'high', stage: 'backlog' },
      { id: 'TKT-003', title: 'Auth signup', priority: 'medium', stage: 'backlog' },
    ];

    test('includes epic ID and title', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('TKT-001');
      expect(prompt).toContain('User Auth');
    });

    test('includes feature branch name', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('feature/tkt-001-user-auth');
    });

    test('lists child tickets in order', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('1. TKT-002');
      expect(prompt).toContain('2. TKT-003');
      expect(prompt).toContain('Auth login');
      expect(prompt).toContain('Auth signup');
    });

    test('includes holistic verification step', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('full test suite one final time');
      expect(prompt).toContain('bobby move TKT-001 ship');
    });

    test('includes inter-ticket test instructions', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('Between tickets');
      expect(prompt).toContain('integration issues');
    });

    test('respects maxRetries and maxIterations', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE, 5, '.bobby/tickets', 30);
      expect(prompt).toContain('Max retries per ticket: 5');
      expect(prompt).toContain('Max total agent invocations: 30');
    });

    test('includes pipeline agent steps', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('bobby-plan');
      expect(prompt).toContain('bobby-build');
      expect(prompt).toContain('bobby-review');
      expect(prompt).toContain('bobby-test');
    });

    test('includes run log format', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('Feature Run');
      expect(prompt).toContain('feature-tkt-001');
    });

    test('includes two-phase structure', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('Phase 1');
      expect(prompt).toContain('Phase 2');
      expect(prompt).toContain('Holistic Planning');
      expect(prompt).toContain('Sequential Execution');
    });

    test('Phase 1 lists tickets needing planning', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('Tickets to plan:');
      expect(prompt).toContain('TKT-002');
      expect(prompt).toContain('TKT-003');
    });

    test('Phase 1 includes feature-plan.md instructions', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('feature-plan.md');
      expect(prompt).toContain('cross-cutting');
    });

    test('Phase 1 includes sibling plan.md reading', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('TKT-002*/plan.md');
      expect(prompt).toContain('TKT-003*/plan.md');
    });

    test('Phase 2 includes feature-plan.md context for execution agents', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('Read `');
      expect(prompt).toContain('feature-plan.md` for cross-cutting feature context');
    });

    test('Phase 2 flags backlog/planning as error', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('backlog');
      expect(prompt).toContain('planning');
      expect(prompt).toContain('error');
    });

    test('skips Phase 1 when all tickets past planning', () => {
      const builtChildren = [
        { id: 'TKT-002', title: 'Auth login', priority: 'high', stage: 'building' },
        { id: 'TKT-003', title: 'Auth signup', priority: 'medium', stage: 'reviewing' },
      ];
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', builtChildren, DEFAULT_PIPELINE);
      expect(prompt).toContain('already past planning');
      expect(prompt).not.toContain('Tickets to plan:');
    });

    test('handles mixed stages — some planned, some not', () => {
      const mixedChildren = [
        { id: 'TKT-002', title: 'Auth login', priority: 'high', stage: 'building' },
        { id: 'TKT-003', title: 'Auth signup', priority: 'medium', stage: 'backlog' },
      ];
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', mixedChildren, DEFAULT_PIPELINE);
      expect(prompt).toContain('Tickets to plan:');
      expect(prompt).toContain('TKT-003');
      expect(prompt).toContain('Already past planning');
      expect(prompt).toContain('TKT-002');
    });

    test('describes two-phase workflow in intro', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('two phases');
      expect(prompt).toContain('plan all tickets holistically');
    });

    test('mentions worktree isolation', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_PIPELINE);
      expect(prompt).toContain('worktree');
      expect(prompt).toContain('isolated worktree');
    });

    test('handles all tickets past planning with empty pastPlanning edge', () => {
      // All children are in stages past planning but pass an empty array
      // to test the !pastPlanning.length branch
      const emptyChildren = [];
      const prompt = buildFeaturePrompt('TKT-001', 'Empty Epic', emptyChildren, DEFAULT_PIPELINE);
      expect(prompt).toContain('already past planning');
      expect(prompt).toContain('Skipping to Phase 2');
    });
  });
});
