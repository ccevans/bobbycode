// test/lib/workflow.test.js
import {
  buildSingleAgentPrompt, buildNextStepPrompt, buildBatchStagePrompt,
  buildUxPrompt, buildPmPrompt, buildQePrompt, buildShipPrompt, buildFeaturePrompt,
  buildOrchestrationPrompt, buildSecurityPrompt, buildDebugPrompt, buildDocsPrompt,
  buildPerformancePrompt, buildWatchdogPrompt, buildVetPrompt, buildStrategyPrompt,
  buildSprintPrompt,
  resolveNextAgent, DEFAULT_WORKFLOW, resolveWorkflow, listWorkflows,
  BUILT_IN_WORKFLOWS, STAGE_MAP, nextStageForAgent,
} from '../../lib/workflow.js';
import { createTicket, moveTicket, findTicket, writeTicket } from '../../lib/tickets.js';
import { isValidStage } from '../../lib/stages.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('workflow', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-workflow-'));
    fs.writeFileSync(path.join(tmpDir, '.counter'), '0');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('buildSingleAgentPrompt includes claim step', () => {
    const prompt = buildSingleAgentPrompt('bobby-plan', 'TKT-001');
    expect(prompt).toContain('bobby ticket assign TKT-001 bobby-plan');
    expect(prompt).toContain('bobby ticket move');
  });

  test('buildSingleAgentPrompt includes service hint when hasServices is true', () => {
    const prompt = buildSingleAgentPrompt('bobby-build', 'TKT-001', '.bobby/tickets', '.claude/agents', true);
    expect(prompt).toContain('services');
    expect(prompt).toContain('.bobbyrc.yml');
  });

  test('buildSingleAgentPrompt has no service hint when hasServices is false', () => {
    const prompt = buildSingleAgentPrompt('bobby-build', 'TKT-001', '.bobby/tickets', '.claude/agents', false);
    expect(prompt).not.toContain('.bobbyrc.yml');
  });

  test('buildNextStepPrompt returns plan prompt for planning stage', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'planning', 'dev');

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_WORKFLOW, tmpDir);
    expect(prompt).toContain('bobby-plan');
    expect(prompt).toContain('TKT-001');
  });

  test('buildNextStepPrompt returns build prompt for building stage', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'building', 'dev');

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_WORKFLOW, tmpDir);
    expect(prompt).toContain('bobby-build');
  });

  test('buildNextStepPrompt handles backlog', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_WORKFLOW, tmpDir);
    expect(prompt).toContain('in backlog');
    expect(prompt).toContain('bobby ticket move TKT-001 plan');
  });

  test('buildNextStepPrompt handles blocked', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'building', 'dev');
    moveTicket(tmpDir, 'TKT-001', 'blocked', 'dev', 'Needs API key');

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_WORKFLOW, tmpDir);
    expect(prompt).toContain('blocked');
    expect(prompt).toContain('Needs API key');
  });

  test('buildNextStepPrompt handles done', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'done', 'dev');

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_WORKFLOW, tmpDir);
    expect(prompt).toContain('already done');
  });

  test('buildNextStepPrompt handles shipping', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Test', author: 'dev', area: '' });
    moveTicket(tmpDir, 'TKT-001', 'shipping', 'dev');

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_WORKFLOW, tmpDir);
    expect(prompt).toContain('bobby run ship');
  });

  test('buildNextStepPrompt throws for missing ticket', () => {
    expect(() => buildNextStepPrompt('TKT-999', DEFAULT_WORKFLOW, tmpDir)).toThrow('not found');
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

  test('buildUxPrompt mentions browser', () => {
    expect(buildUxPrompt()).toContain('browser');
  });

  test('buildPmPrompt mentions product review', () => {
    expect(buildPmPrompt()).toContain('product review');
  });

  test('buildShipPrompt mentions PR', () => {
    expect(buildShipPrompt()).toContain('PR');
  });

  test('buildQePrompt mentions browser', () => {
    expect(buildQePrompt()).toContain('browser');
  });

  describe('resolveNextAgent', () => {
    test('returns agent for matching stage', () => {
      expect(resolveNextAgent(DEFAULT_WORKFLOW, 'planning')).toBe('bobby-plan');
      expect(resolveNextAgent(DEFAULT_WORKFLOW, 'building')).toBe('bobby-build');
      expect(resolveNextAgent(DEFAULT_WORKFLOW, 'reviewing')).toBe('bobby-review');
      expect(resolveNextAgent(DEFAULT_WORKFLOW, 'testing')).toBe('bobby-test');
    });

    test('returns null for unmapped stage', () => {
      expect(resolveNextAgent(DEFAULT_WORKFLOW, 'shipping')).toBeNull();
      expect(resolveNextAgent(DEFAULT_WORKFLOW, 'done')).toBeNull();
      expect(resolveNextAgent(DEFAULT_WORKFLOW, 'blocked')).toBeNull();
    });
  });

  describe('buildOrchestrationPrompt', () => {
    test('includes ticket list', () => {
      const prompt = buildOrchestrationPrompt(['TKT-001', 'TKT-002'], DEFAULT_WORKFLOW);
      expect(prompt).toContain('- TKT-001');
      expect(prompt).toContain('- TKT-002');
    });

    test('includes branch guard', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('Branch guard');
      expect(prompt).toContain('git branch --show-current');
      expect(prompt).toContain('tkt-TKT-001');
    });

    test('includes safety limits', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW, 5, '.bobby/tickets', 30);
      expect(prompt).toContain('Max retries per ticket: 5');
      expect(prompt).toContain('Max total agent invocations across all tickets: 30');
    });

    test('includes all workflow agent references', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('.claude/agents/bobby-plan.md');
      expect(prompt).toContain('.claude/agents/bobby-build.md');
      expect(prompt).toContain('.claude/agents/bobby-review.md');
      expect(prompt).toContain('.claude/agents/bobby-test.md');
    });

    test('includes retry and debug logic', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('rejection');
      expect(prompt).toContain('bobby-debug');
      expect(prompt).toContain('.claude/agents/bobby-debug.md');
    });

    test('the single-stage freewill workflow hands off straight to shipping', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', resolveWorkflow({}, 'freewill'));
      expect(prompt).toContain('bobby-freewill');
      expect(prompt).toContain('bobby ticket move {TICKET_ID} shipping');
      // Nothing stands between the one agent and shipping — that is the point.
      expect(prompt).not.toContain('bobby-review');
    });

    test('includes final status reporting', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('report the final status');
    });

    test('handles single ticket ID (non-array)', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('- TKT-001');
    });

    test('uses custom ticketsDir', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW, 3, 'custom/tickets');
      expect(prompt).toContain('custom/tickets');
    });

    test('includes service hint when hasServices is true', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW, 3, '.bobby/tickets', 20, '.claude/agents', true);
      expect(prompt).toContain('services');
      expect(prompt).toContain('.bobbyrc.yml');
    });

    test('has no service hint when hasServices is false', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW, 3, '.bobby/tickets', 20, '.claude/agents', false);
      expect(prompt).not.toContain('.bobbyrc.yml');
    });

    test('instructs subagent-per-stage, not inline execution', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('Launch a subagent');
      expect(prompt).toContain('Agent tool');
      expect(prompt).toContain('coordination, not execution');
      // Should NOT say "Follow the instructions" (inline pattern)
      expect(prompt).not.toMatch(/^\s*c\) Follow the instructions in/m);
    });

    test('includes bobby ticket create guardrail', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('bobby ticket create');
      expect(prompt).toContain('Never write ticket files manually');
    });

    test('includes no-todo-tracking guardrail', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('sole progress tracker');
      expect(prompt).not.toContain('TodoWrite');
    });

    test('includes no-error-suppression guardrail', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('Never suppress errors');
      expect(prompt).toContain('2>/dev/null');
    });

    test('includes health check pre-gate for test stage', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('Pre-gate');
      expect(prompt).toContain('health check');
      expect(prompt).toContain('live app, not run specs');
    });

    test('includes pre-flight stage gates for backlog/done/blocked', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('Pre-flight stage gates');
      expect(prompt).toContain('"done"');
      expect(prompt).toContain('"blocked"');
      expect(prompt).toContain('"backlog"');
      // Backlog gate advances to the first workflow stage (planning, by default)
      expect(prompt).toContain('bobby ticket move {TICKET_ID} planning');
    });

    test('backlog gate uses the first stage of a custom workflow', () => {
      const customPipeline = [
        { stage: 'building', agent: 'bobby-build' },
        { stage: 'testing', agent: 'bobby-test' },
      ];
      const prompt = buildOrchestrationPrompt('TKT-001', customPipeline);
      expect(prompt).toContain('bobby ticket move {TICKET_ID} building');
      expect(prompt).not.toContain('bobby ticket move {TICKET_ID} planning');
    });

    test('catch-all instructs warn-not-skip for unhandled stages', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
      expect(prompt).toContain('log a warning');
      expect(prompt).toMatch(/do not silently skip|do not silently move on/);
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
      expect(prompt).toContain('bobby ticket assign TKT-001 bobby-security');
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
      expect(prompt).toContain('bobby ticket assign TKT-001 bobby-debug');
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

    // Use a workflow that has no entry for "reviewing"
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

    const prompt = buildNextStepPrompt('TKT-001', DEFAULT_WORKFLOW, tmpDir);
    expect(prompt).toContain('no reason given');
  });

  describe('buildFeaturePrompt', () => {
    const children = [
      { id: 'TKT-002', title: 'Auth login', priority: 'high', stage: 'backlog' },
      { id: 'TKT-003', title: 'Auth signup', priority: 'medium', stage: 'backlog' },
    ];

    test('includes epic ID and title', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('TKT-001');
      expect(prompt).toContain('User Auth');
    });

    test('includes feature branch name', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('feature/tkt-001-user-auth');
    });

    test('lists child tickets in order', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('1. TKT-002');
      expect(prompt).toContain('2. TKT-003');
      expect(prompt).toContain('Auth login');
      expect(prompt).toContain('Auth signup');
    });

    test('includes holistic verification step', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('full test suite one final time');
      expect(prompt).toContain('bobby ticket move TKT-001 ship');
    });

    test('includes inter-ticket test instructions', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('Between tickets');
      expect(prompt).toContain('integration issues');
    });

    test('respects maxRetries and maxIterations', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW, 5, '.bobby/tickets', 30);
      expect(prompt).toContain('Max retries per ticket: 5');
      expect(prompt).toContain('Max total agent invocations: 30');
    });

    test('includes workflow agent steps', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('bobby-plan');
      expect(prompt).toContain('bobby-build');
      expect(prompt).toContain('bobby-review');
      expect(prompt).toContain('bobby-test');
    });

    test('includes final status reporting', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('Report');
      expect(prompt).toContain('final status');
    });

    test('includes two-phase structure', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('Phase 1');
      expect(prompt).toContain('Phase 2');
      expect(prompt).toContain('Holistic Planning');
      expect(prompt).toContain('Sequential Execution');
    });

    test('Phase 1 lists tickets needing planning', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('Tickets to plan:');
      expect(prompt).toContain('TKT-002');
      expect(prompt).toContain('TKT-003');
    });

    test('Phase 1 includes feature-plan.md instructions', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('feature-plan.md');
      expect(prompt).toContain('cross-cutting');
    });

    test('Phase 1 includes sibling plan.md reading', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('TKT-002*/plan.md');
      expect(prompt).toContain('TKT-003*/plan.md');
    });

    test('Phase 2 includes feature-plan.md context for execution agents', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('Read `');
      expect(prompt).toContain('feature-plan.md` for cross-cutting feature context');
    });

    test('Phase 2 flags backlog/planning as error', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('backlog');
      expect(prompt).toContain('planning');
      expect(prompt).toContain('error');
    });

    test('Phase 2 pre-flight gate covers "done" tickets entering the loop', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('Pre-flight stage gates');
      expect(prompt).toContain('"done"');
      expect(prompt).toContain('already complete on entry');
    });

    test('skips Phase 1 when all tickets past planning', () => {
      const builtChildren = [
        { id: 'TKT-002', title: 'Auth login', priority: 'high', stage: 'building' },
        { id: 'TKT-003', title: 'Auth signup', priority: 'medium', stage: 'reviewing' },
      ];
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', builtChildren, DEFAULT_WORKFLOW);
      expect(prompt).toContain('already past planning');
      expect(prompt).not.toContain('Tickets to plan:');
    });

    test('handles mixed stages — some planned, some not', () => {
      const mixedChildren = [
        { id: 'TKT-002', title: 'Auth login', priority: 'high', stage: 'building' },
        { id: 'TKT-003', title: 'Auth signup', priority: 'medium', stage: 'backlog' },
      ];
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', mixedChildren, DEFAULT_WORKFLOW);
      expect(prompt).toContain('Tickets to plan:');
      expect(prompt).toContain('TKT-003');
      expect(prompt).toContain('Already past planning');
      expect(prompt).toContain('TKT-002');
    });

    test('describes two-phase workflow in intro', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('two phases');
      expect(prompt).toContain('plan all tickets holistically');
    });

    test('mentions worktree isolation', () => {
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW);
      expect(prompt).toContain('worktree');
      expect(prompt).toContain('isolated worktree');
    });

    test('handles all tickets past planning with empty pastPlanning edge', () => {
      // All children are in stages past planning but pass an empty array
      // to test the !pastPlanning.length branch
      const emptyChildren = [];
      const prompt = buildFeaturePrompt('TKT-001', 'Empty Epic', emptyChildren, DEFAULT_WORKFLOW);
      expect(prompt).toContain('already past planning');
      expect(prompt).toContain('Skipping to Phase 2');
    });
  });

  describe('resolveWorkflow', () => {
    test('returns DEFAULT_WORKFLOW when no config workflows', () => {
      const result = resolveWorkflow({}, 'default');
      expect(result).toEqual(DEFAULT_WORKFLOW);
    });

    test('still reads the legacy `pipelines:` config key (backward compat)', () => {
      const result = resolveWorkflow({ pipelines: { legacy: ['build', 'test'] } }, 'legacy');
      expect(result).toEqual([
        { stage: 'building', agent: 'bobby-build' },
        { stage: 'testing', agent: 'bobby-test' },
      ]);
    });

    test('resolves the built-in secure workflow without any config', () => {
      const result = resolveWorkflow({}, 'secure');
      expect(result).toHaveLength(5);
      expect(result.map(s => s.agent)).toContain('bobby-security');
    });

    test('resolves the built-in quick workflow without any config', () => {
      const result = resolveWorkflow({}, 'quick');
      expect(result.map(s => s.agent)).toEqual(['bobby-plan', 'bobby-build', 'bobby-test']);
    });

    test('resolves the built-in freewill workflow without any config', () => {
      const result = resolveWorkflow({}, 'freewill');
      // One agent covers plan through test; the board shows the ticket as building.
      expect(result).toEqual([{ stage: 'building', agent: 'bobby-freewill' }]);
    });

    test('config can override a built-in workflow by name', () => {
      const result = resolveWorkflow({ workflows: { quick: ['build'] } }, 'quick');
      expect(result).toEqual([{ stage: 'building', agent: 'bobby-build' }]);
    });

    test('resolves named workflow from config', () => {
      const config = { workflows: { quick: ['build', 'test'] } };
      const result = resolveWorkflow(config, 'quick');
      expect(result).toEqual([
        { stage: 'building', agent: 'bobby-build' },
        { stage: 'testing', agent: 'bobby-test' },
      ]);
    });

    test('resolves workflow with security step', () => {
      const config = { workflows: { secure: ['plan', 'build', 'security', 'review', 'test'] } };
      const result = resolveWorkflow(config, 'secure');
      expect(result).toHaveLength(5);
      expect(result[2]).toEqual({ stage: 'security', agent: 'bobby-security' });
    });

    test('throws for unknown workflow name', () => {
      const config = { workflows: { quick: ['build'] } };
      expect(() => resolveWorkflow(config, 'nonexistent')).toThrow("Unknown workflow 'nonexistent'");
    });

    test('error message lists available workflows', () => {
      const config = { workflows: { quick: ['build'], hotfix: ['build'] } };
      expect(() => resolveWorkflow(config, 'nope')).toThrow(/quick/);
      expect(() => resolveWorkflow(config, 'nope')).toThrow(/hotfix/);
    });

    test('ticket workflow overrides default when flag is default', () => {
      const config = { workflows: { quick: ['build', 'test'] } };
      const result = resolveWorkflow(config, 'default', 'quick');
      expect(result).toEqual([
        { stage: 'building', agent: 'bobby-build' },
        { stage: 'testing', agent: 'bobby-test' },
      ]);
    });

    test('explicit flag overrides ticket workflow', () => {
      const config = { workflows: { quick: ['build', 'test'], secure: ['plan', 'build', 'security', 'review', 'test'] } };
      const result = resolveWorkflow(config, 'secure', 'quick');
      expect(result).toHaveLength(5);
      expect(result[0].agent).toBe('bobby-plan');
    });

    test('ticket workflow is ignored when explicit flag is set', () => {
      const config = { workflows: { quick: ['build'] } };
      // Explicit 'quick' flag — ticket workflow 'nonexistent' should not matter
      const result = resolveWorkflow(config, 'quick', 'nonexistent');
      expect(result).toEqual([{ stage: 'building', agent: 'bobby-build' }]);
    });

    test('returns DEFAULT_WORKFLOW when ticket workflow is null and flag is default', () => {
      const result = resolveWorkflow({}, 'default', null);
      expect(result).toEqual(DEFAULT_WORKFLOW);
    });

    test('config default workflow overrides built-in default', () => {
      const config = { workflows: { default: ['build', 'review'] } };
      const result = resolveWorkflow(config, 'default');
      expect(result).toEqual([
        { stage: 'building', agent: 'bobby-build' },
        { stage: 'reviewing', agent: 'bobby-review' },
      ]);
    });
  });

  describe('listWorkflows', () => {
    test('returns the built-in workflows when none configured', () => {
      expect(listWorkflows({})).toEqual(['default', 'secure', 'quick', 'design', 'define', 'freewill']);
    });

    test('includes custom workflow names plus default', () => {
      const config = { workflows: { quick: ['build'], hotfix: ['build'] } };
      const result = listWorkflows(config);
      expect(result).toContain('default');
      expect(result).toContain('quick');
      expect(result).toContain('hotfix');
    });

    test('does not duplicate default when config defines it', () => {
      const config = { workflows: { default: ['build', 'review'], quick: ['build'] } };
      const result = listWorkflows(config);
      expect(result.filter(n => n === 'default')).toHaveLength(1);
    });
  });

  describe('ticket workflow field', () => {
    test('createTicket stores workflow in frontmatter', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Quick fix', author: 'dev', area: '', workflow: 'quick' });
      const ticket = findTicket(tmpDir, 'TKT-001');
      expect(ticket.data.workflow).toBe('quick');
    });

    test('createTicket stores null workflow when not specified', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'Normal task', author: 'dev', area: '' });
      const ticket = findTicket(tmpDir, 'TKT-001');
      expect(ticket.data.workflow).toBeNull();
    });
  });

  describe('buildSprintPrompt', () => {
    const sprint = {
      id: 'SPR-001',
      name: 'Auth overhaul',
      goal: 'Passwordless login',
      branch: 'feature/spr-001-auth-overhaul',
    };
    const tickets = [
      { id: 'TKT-001', title: 'Login page', stage: 'backlog', priority: 'high' },
      { id: 'TKT-002', title: 'Session store', stage: 'building', priority: 'medium' },
    ];

    test('includes the sprint id, branch, goal, and tickets', () => {
      const p = buildSprintPrompt(sprint, tickets, DEFAULT_WORKFLOW);
      expect(p).toContain('SPR-001');
      expect(p).toContain('feature/spr-001-auth-overhaul');
      expect(p).toContain('Passwordless login');
      expect(p).toContain('TKT-001');
      expect(p).toContain('TKT-002');
    });

    test('includes the branch guard and the sprint-done step', () => {
      const p = buildSprintPrompt(sprint, tickets, DEFAULT_WORKFLOW);
      expect(p).toContain('git checkout -b feature/spr-001-auth-overhaul');
      expect(p).toContain('bobby sprint status SPR-001 done');
    });

    test('references the sprint plan when a path is given', () => {
      const p = buildSprintPrompt(sprint, tickets, DEFAULT_WORKFLOW, {
        sprintPlanPath: '.bobby/sprints/SPR-001--auth/sprint-plan.md',
      });
      expect(p).toContain('sprint-plan.md');
    });

    test('omits the plan read when no path is given', () => {
      const p = buildSprintPrompt(sprint, tickets, DEFAULT_WORKFLOW);
      expect(p).not.toContain('sprint-plan.md');
    });

    test('includes a multi-service hint when hasServices is true', () => {
      const p = buildSprintPrompt(sprint, tickets, DEFAULT_WORKFLOW, { hasServices: true });
      expect(p).toContain('Multi-service project');
    });

    test('includes pre-flight stage gates for backlog/done/blocked', () => {
      const p = buildSprintPrompt(sprint, tickets, DEFAULT_WORKFLOW);
      expect(p).toContain('Pre-flight stage gates');
      expect(p).toContain('"done"');
      expect(p).toContain('"blocked"');
      expect(p).toContain('"backlog"');
      expect(p).toContain('bobby ticket move {TICKET_ID} planning');
    });

    test('backlog gate uses the first stage of a custom workflow', () => {
      const customPipeline = [
        { stage: 'building', agent: 'bobby-build' },
        { stage: 'testing', agent: 'bobby-test' },
      ];
      const p = buildSprintPrompt(sprint, tickets, customPipeline);
      expect(p).toContain('bobby ticket move {TICKET_ID} building');
      expect(p).not.toContain('bobby ticket move {TICKET_ID} planning');
    });

    test('catch-all instructs warn-not-skip for unhandled stages', () => {
      const p = buildSprintPrompt(sprint, tickets, DEFAULT_WORKFLOW);
      expect(p).toContain('log a warning');
      expect(p).toMatch(/do not silently skip|do not silently move on/);
    });
  });
});

describe('define workflow', () => {
  test('resolves to five define stages with matching agents', () => {
    const wf = resolveWorkflow({}, 'define');
    expect(wf).toEqual([
      { stage: 'define-brief', agent: 'bobby-define-brief' },
      { stage: 'define-personas', agent: 'bobby-define-personas' },
      { stage: 'define-journeys', agent: 'bobby-define-journeys' },
      { stage: 'define-features', agent: 'bobby-define-features' },
      { stage: 'define-blueprint', agent: 'bobby-define-blueprint' },
    ]);
  });

  test('orchestration terminates at planning, never shipping', () => {
    const wf = resolveWorkflow({}, 'define');
    const prompt = buildOrchestrationPrompt(['TKT-001'], wf, 3);
    expect(prompt).toContain('bobby ticket move {TICKET_ID} define-personas');
    expect(prompt).toContain('bobby ticket move {TICKET_ID} define-blueprint');
    expect(prompt).toContain('bobby ticket move {TICKET_ID} plan');
    expect(prompt).not.toContain('move {TICKET_ID} ship');
  });

  test('single-agent prompt injects the product-context step only when hasProduct', () => {
    const withIt = buildSingleAgentPrompt('bobby-build', 'TKT-002', '.bobby/tickets', '.claude/agents', false, true);
    expect(withIt).toContain('feature-map.md');
    expect(withIt).toContain('personas.md');
    const without = buildSingleAgentPrompt('bobby-build', 'TKT-002', '.bobby/tickets', '.claude/agents', false, false);
    expect(without).not.toContain('feature-map.md');
    // Step numbering stays sequential either way.
    expect(withIt).toContain('4. Follow the instructions');
    expect(without).toContain('3. Follow the instructions');
  });
});

// TKT-049. The bug this guards is a CLASS, not an instance: every resolver in
// the orchestrator is a first-match lookup — `resolveNextAgent` finds the first
// step whose `stage` matches, `nextStageForAgent` the first whose `agent`
// matches. So any workflow with two steps on one stage makes the second step
// unreachable and can hand a stage off to itself, which under
// `dashboard.auto_approve_stages` is an unattended infinite loop spending real
// tokens. These run over every built-in workflow, so adding a colliding entry
// to STAGE_MAP or BUILT_IN_WORKFLOWS later fails here rather than in production.
describe('built-in workflows are structurally sound (TKT-049)', () => {
  const names = Object.keys(BUILT_IN_WORKFLOWS);

  test('there are built-in workflows to check', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  test.each(names)('%s gives every step a distinct stage', (name) => {
    const stages = resolveWorkflow({}, name).map(s => s.stage);
    expect(stages).toEqual([...new Set(stages)]);
  });

  test.each(names)('%s gives every step a distinct agent', (name) => {
    const agents = resolveWorkflow({}, name).map(s => s.agent);
    expect(agents).toEqual([...new Set(agents)]);
  });

  test.each(names)('%s maps every step to a stage that really exists', (name) => {
    for (const step of resolveWorkflow({}, name)) {
      expect({ step: step.agent, stage: step.stage, valid: isValidStage(step.stage) })
        .toEqual({ step: step.agent, stage: step.stage, valid: true });
    }
  });

  test.each(names)('%s never hands a stage off to itself', (name) => {
    const steps = resolveWorkflow({}, name);
    for (const step of steps) {
      expect({ agent: step.agent, from: step.stage, to: nextStageForAgent(step.agent, steps) })
        .not.toEqual({ agent: step.agent, from: step.stage, to: step.stage });
    }
  });

  test('every STAGE_MAP target is a real stage', () => {
    for (const [step, stage] of Object.entries(STAGE_MAP)) {
      expect({ step, stage, valid: isValidStage(stage) })
        .toEqual({ step, stage, valid: true });
    }
  });

  test('the security step has a stage of its own, not the review stage', () => {
    expect(STAGE_MAP.security).toBe('security');
    expect(STAGE_MAP.security).not.toBe(STAGE_MAP.review);
  });

  test('secure resolves to five steps on five different stages', () => {
    expect(resolveWorkflow({}, 'secure')).toEqual([
      { stage: 'planning', agent: 'bobby-plan' },
      { stage: 'building', agent: 'bobby-build' },
      { stage: 'security', agent: 'bobby-security' },
      { stage: 'reviewing', agent: 'bobby-review' },
      { stage: 'testing', agent: 'bobby-test' },
    ]);
  });

  // The design workflow was audited in the same pass. design-build and
  // design-check reuse the `building` and `reviewing` stages, but each is used
  // exactly once within `design`, so there is no collision to fix — the shared
  // generic tests above are what keep that true.
  test('design reuses building and reviewing but only once each', () => {
    const stages = resolveWorkflow({}, 'design').map(s => s.stage);
    expect(stages).toEqual([
      'design-research', 'design-analyze', 'design-mockup', 'design-spec',
      'building', 'reviewing',
    ]);
  });
});

// PRO-026: a studio agent runs with its cwd in a code-repo worktree while the
// board lives at the studio root. Every board reference the orchestration
// prompts hand the agent must be an ABSOLUTE, studio-rooted path — a relative
// `ticket.md` resolves against the worktree, where the board does not exist, and
// the agent fails with "File does not exist". These assert the four re-read/
// product references are absolute when a studio board dir is threaded, and that
// the single-repo relative default is preserved.
describe('PRO-026: board references in orchestration prompts are absolute', () => {
  const ABS = '/studio/.bobby/pro/tickets';
  const PDIR = '/studio/.bobby/product';

  // TC1 — coordinator "re-read … to confirm the stage advanced" is absolute.
  test('TC1: orchestration coordinator re-read uses the absolute board path', () => {
    const prompt = buildOrchestrationPrompt('PRO-001', DEFAULT_WORKFLOW, 3, ABS);
    expect(prompt).toContain(`\`${ABS}/{TICKET_ID}*/ticket.md\` frontmatter to confirm the stage advanced`);
    // The bare re-read form must be gone (absolute paths still end in ticket.md).
    expect(prompt).not.toMatch(/re-read `ticket\.md` frontmatter/);
  });

  // TC2 — backlog-advance branch re-read is absolute.
  test('TC2: backlog-advance re-read uses the absolute board path', () => {
    const prompt = buildOrchestrationPrompt('PRO-001', DEFAULT_WORKFLOW, 3, ABS);
    expect(prompt).toContain(`then re-read \`${ABS}/{TICKET_ID}*/ticket.md\` and continue with the new stage`);
    expect(prompt).not.toMatch(/re-read `ticket\.md` and continue/);
  });

  // TC3 — sprint prompt inherits both absolute fixes (shared fragments).
  test('TC3: sprint prompt inherits absolute coordinator + backlog re-reads', () => {
    const prompt = buildSprintPrompt(
      { id: 'SPR-1', name: 'Sprint One', branch: 'sprint/one' },
      [{ id: 'PRO-001', title: 'work', stage: 'backlog', priority: 'high' }],
      DEFAULT_WORKFLOW,
      { ticketsDir: ABS },
    );
    expect(prompt).toContain(`\`${ABS}/{TICKET_ID}*/ticket.md\` frontmatter to confirm the stage advanced`);
    expect(prompt).toContain(`then re-read \`${ABS}/{TICKET_ID}*/ticket.md\` and continue with the new stage`);
    expect(prompt).not.toMatch(/re-read `ticket\.md`/);
  });

  // TC4 — feature prompt Phase-2 re-read is absolute.
  test('TC4: feature prompt Phase-2 re-read uses the absolute board path', () => {
    const prompt = buildFeaturePrompt(
      'PRO-009', 'Epic',
      [{ id: 'PRO-010', title: 'child', priority: 'high', stage: 'backlog' }],
      DEFAULT_WORKFLOW, 3, ABS,
    );
    expect(prompt).toContain(`re-read \`${ABS}/{TICKET_ID}*/ticket.md\` frontmatter to confirm the stage advanced`);
    expect(prompt).not.toMatch(/re-read `ticket\.md` frontmatter/);
  });

  // TC5 — product hint uses the threaded absolute product dir.
  test('TC5: product hint uses the threaded absolute product dir', () => {
    const prompt = buildSingleAgentPrompt(
      'bobby-build', 'PRO-001', ABS, '.claude/agents', false, true, 'reviewing', PDIR,
    );
    expect(prompt).toContain(`\`${PDIR}/feature-map.md\``);
    expect(prompt).toContain(`\`${PDIR}/personas.md\``);
    // The relative form (backtick immediately before .bobby) must be gone.
    expect(prompt).not.toContain('`.bobby/product/feature-map.md`');
    expect(prompt).not.toContain('`.bobby/product/personas.md`');
  });

  // TC6 — product hint falls back to the relative default when no productDir.
  test('TC6: product hint falls back to relative default with no productDir', () => {
    const prompt = buildSingleAgentPrompt(
      'bobby-build', 'PRO-001', '.bobby/tickets', '.claude/agents', false, true,
    );
    expect(prompt).toContain('`.bobby/product/feature-map.md`');
    expect(prompt).toContain('`.bobby/product/personas.md`');
  });

  // TC7 — single-repo case unchanged: the relative default flows through.
  test('TC7: single-repo default keeps the relative board re-read paths', () => {
    const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
    expect(prompt).toContain('`.bobby/tickets/{TICKET_ID}*/ticket.md` frontmatter to confirm the stage advanced');
    expect(prompt).toContain('then re-read `.bobby/tickets/{TICKET_ID}*/ticket.md` and continue with the new stage');
    // No product context threaded → no product hint at all.
    expect(prompt).not.toContain('feature-map.md');
  });
});
