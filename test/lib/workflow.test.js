// test/lib/workflow.test.js
import {
  buildSingleAgentPrompt, buildNextStepPrompt, buildBatchStagePrompt,
  buildUxPrompt, buildPmPrompt, buildQePrompt, buildShipPrompt, buildFeaturePrompt,
  buildOrchestrationPrompt, buildSecurityPrompt, buildDebugPrompt, buildDocsPrompt,
  buildPerformancePrompt, buildWatchdogPrompt, buildVetPrompt, buildStrategyPrompt,
  buildSprintPrompt,
  resolveNextAgent, DEFAULT_WORKFLOW, resolveWorkflow, listWorkflows,
  BUILT_IN_WORKFLOWS, STAGE_MAP, nextStageForAgent,
  deriveDefaultWorkflow, buildPromptFor,
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
      // PRO-029: sibling paths now resolve to the on-disk folder when it exists.
      // Point at a dir with no such folders so the glob fallback is deterministic
      // (these fixture ids would otherwise collide with the real board). TC4 in the
      // PRO-029 block covers the resolved case against real slugged folders.
      const prompt = buildFeaturePrompt('TKT-001', 'User Auth', children, DEFAULT_WORKFLOW, 3, '/no-such-bobby-board-pro029');
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
      expect(listWorkflows({})).toEqual(['default', 'secure', 'quick', 'library', 'library-secure', 'design', 'define', 'freewill']);
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
// board lives at the studio root. Board references the orchestration prompts hand
// the agent must reach the studio-rooted board, not resolve against the worktree.
// PRO-029 SUPERSEDED the re-read SITES here: the stage-confirm and backlog-advance
// reads are no longer a `{TICKET_ID}*/ticket.md` path at all — they are now
// `bobby ticket view {TICKET_ID}` commands, which resolve the board (and the slug)
// cwd-independently, so PRO-026's guarantee holds via the command. These tests now
// assert the command form and that the un-expandable glob path is gone. The
// product-dir references (TC5/TC6) remain path-based and are still asserted absolute.
describe('PRO-026: board references in orchestration prompts are absolute', () => {
  const ABS = '/studio/.bobby/pro/tickets';
  const PDIR = '/studio/.bobby/product';

  // TC1 — coordinator stage-confirm read is a cwd-independent command (PRO-029).
  test('TC1: orchestration coordinator re-read uses bobby ticket view', () => {
    const prompt = buildOrchestrationPrompt('PRO-001', DEFAULT_WORKFLOW, 3, ABS);
    expect(prompt).toContain('re-run `bobby ticket view {TICKET_ID}` and read the `Stage:` line to confirm the stage advanced');
    // The un-expandable glob board path must be gone entirely.
    expect(prompt).not.toContain(`${ABS}/{TICKET_ID}*/ticket.md`);
  });

  // TC2 — backlog-advance branch read is a cwd-independent command (PRO-029).
  test('TC2: backlog-advance re-read uses bobby ticket view', () => {
    const prompt = buildOrchestrationPrompt('PRO-001', DEFAULT_WORKFLOW, 3, ABS);
    expect(prompt).toContain('then re-run `bobby ticket view {TICKET_ID}` and continue with the new stage');
    expect(prompt).not.toContain(`${ABS}/{TICKET_ID}*/ticket.md`);
  });

  // TC3 — sprint prompt inherits both command forms (shared fragments).
  test('TC3: sprint prompt inherits the bobby ticket view coordinator + backlog reads', () => {
    const prompt = buildSprintPrompt(
      { id: 'SPR-1', name: 'Sprint One', branch: 'sprint/one' },
      [{ id: 'PRO-001', title: 'work', stage: 'backlog', priority: 'high' }],
      DEFAULT_WORKFLOW,
      { ticketsDir: ABS },
    );
    expect(prompt).toContain('re-run `bobby ticket view {TICKET_ID}` and read the `Stage:` line to confirm the stage advanced');
    expect(prompt).toContain('then re-run `bobby ticket view {TICKET_ID}` and continue with the new stage');
    expect(prompt).not.toContain(`${ABS}/{TICKET_ID}*/ticket.md`);
  });

  // TC4 — feature prompt Phase-2 read is a cwd-independent command (PRO-029).
  test('TC4: feature prompt Phase-2 re-read uses bobby ticket view', () => {
    const prompt = buildFeaturePrompt(
      'PRO-009', 'Epic',
      [{ id: 'PRO-010', title: 'child', priority: 'high', stage: 'backlog' }],
      DEFAULT_WORKFLOW, 3, ABS,
    );
    expect(prompt).toContain('re-run `bobby ticket view {TICKET_ID}` and read the `Stage:` line to confirm the stage advanced');
    expect(prompt).not.toContain(`${ABS}/{TICKET_ID}*/ticket.md`);
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

  // TC7 — single-repo default: the re-read sites are the same bobby ticket view
  // commands (PRO-029), independent of the threaded board dir.
  test('TC7: single-repo default uses the bobby ticket view re-read commands', () => {
    const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW);
    expect(prompt).toContain('re-run `bobby ticket view {TICKET_ID}` and read the `Stage:` line to confirm the stage advanced');
    expect(prompt).toContain('then re-run `bobby ticket view {TICKET_ID}` and continue with the new stage');
    expect(prompt).not.toContain('{TICKET_ID}*/ticket.md');
    // No product context threaded → no product hint at all.
    expect(prompt).not.toContain('feature-map.md');
  });
});

// PRO-029: agent prompts embedded the ticket path as a `${id}*` glob the agent's
// structured file-read tool cannot expand (folders carry a slug), so the first read
// returned "File does not exist". Known-id sites now emit the exact resolved folder;
// runtime-placeholder sites use `bobby ticket view` (resolves slug + board, cwd-independent).
describe('ticket-path resolution (PRO-029)', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-pro029-'));
    fs.writeFileSync(path.join(tmpDir, '.counter'), '0');
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  // TC1 — known-id prompt embeds the exact resolved folder, no glob (AC #1).
  test('TC1: known-id prompt embeds the exact resolved folder, no glob', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Some Feature' });
    const prompt = buildSingleAgentPrompt('bobby-build', 'TKT-001', tmpDir);
    expect(prompt).toContain(`${tmpDir}/TKT-001--some-feature/ticket.md`);
    expect(prompt).not.toContain('TKT-001*');
  });

  // TC2 — reproduction: the resolved path stats true, the old glob path stats false.
  test('TC2: resolved path stats true, the old ${id}* glob path stats false', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Some Feature' });
    // The new form points at a real file the read tool can open.
    expect(fs.existsSync(path.join(tmpDir, 'TKT-001--some-feature', 'ticket.md'))).toBe(true);
    // The old glob form does not resolve as a literal path — this is exactly why
    // the structured file-read tool failed on `${id}*/ticket.md`.
    expect(fs.existsSync(path.join(tmpDir, 'TKT-001*', 'ticket.md'))).toBe(false);
  });

  // TC3 — placeholder sites carry the resolve instruction, not a glob (AC, req 2).
  test('TC3: placeholder builders instruct bobby ticket view, no glob token', () => {
    const orch = buildOrchestrationPrompt(['TKT-001', 'TKT-002'], DEFAULT_WORKFLOW);
    expect(orch).not.toContain('{TICKET_ID}*/ticket.md');
    expect(orch).toContain('bobby ticket view {TICKET_ID}');

    const batchNormal = buildBatchStagePrompt('bobby-plan', ['TKT-001', 'TKT-002']);
    const batchWorktree = buildBatchStagePrompt('bobby-build', ['TKT-001', 'TKT-002'], '.bobby/tickets', 'worktree');
    for (const p of [batchNormal, batchWorktree]) {
      expect(p).not.toContain('{ID}*/ticket.md');
      expect(p).toContain('bobby ticket view {ID}');
    }
  });

  // TC4 — buildFeaturePrompt: known-id sites resolved, placeholder sites instructed.
  test('TC4: feature prompt resolves known-id paths and instructs placeholder reads', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Icon Set Epic' });
    createTicket(tmpDir, { prefix: 'TKT', title: 'Sibling One' });
    createTicket(tmpDir, { prefix: 'TKT', title: 'Sibling Two' });
    const children = ['TKT-002', 'TKT-003'].map(id => {
      const t = findTicket(tmpDir, id);
      return { id, title: t.data.title, priority: 'high', stage: 'backlog', dirname: t.dirname };
    });
    const prompt = buildFeaturePrompt('TKT-001', 'Icon Set Epic', children, DEFAULT_WORKFLOW, 3, tmpDir);

    // Feature-plan path resolved (no glob).
    expect(prompt).toContain('TKT-001--icon-set-epic/feature-plan.md');
    expect(prompt).not.toContain('TKT-001*');
    // Sibling plan paths resolved (no glob).
    expect(prompt).toContain('TKT-002--sibling-one/plan.md');
    expect(prompt).toContain('TKT-003--sibling-two/plan.md');
    expect(prompt).not.toContain('TKT-002*');
    expect(prompt).not.toContain('TKT-003*');
    // Placeholder reads instructed.
    expect(prompt).toContain('bobby ticket view {TICKET_ID}');
    expect(prompt).not.toContain('{TICKET_ID}*/ticket.md');
  });

  // TC5 — end-to-end: the emitted known-id path actually opens and yields ticket content.
  test('TC5: following the known-id prompt opens the ticket (zero does-not-exist)', () => {
    createTicket(tmpDir, { prefix: 'TKT', title: 'Some Feature' });
    const prompt = buildSingleAgentPrompt('bobby-build', 'TKT-001', tmpDir);
    const extracted = prompt.match(/`([^`]*TKT-001[^`]*ticket\.md)`/)[1];
    expect(fs.existsSync(extracted)).toBe(true);
    const content = fs.readFileSync(extracted, 'utf8');
    expect(content).toContain('Some Feature');
  });

  // TC6 — error path: unknown id falls back to the glob, no crash (regression guard).
  test('TC6: unknown id falls back to the glob without throwing', () => {
    let prompt;
    expect(() => { prompt = buildSingleAgentPrompt('bobby-plan', 'TKT-999', tmpDir); }).not.toThrow();
    expect(prompt).toContain('TKT-999*');
    expect(prompt).toContain('bobby ticket assign TKT-999 bobby-plan');
  });
});

// BOB-090. Every built-in workflow except `design`/`define` ended at the
// live-app `testing` stage, so CLI/library projects (no dev server, no
// health checks) stranded every ticket there: bobby-test is forbidden to run
// specs or read source, and with nothing to curl it emitted BLOCKED test
// cases one by one. These cover the fix's three parts: the built-in `library`
// workflows, the `default_workflow` config key (derived at init), and the
// loud block instruction that replaces the silent stall.
describe('library workflow and no-live-app gates (BOB-090)', () => {
  const REASON = 'no live app to test — use the library workflow';
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-bob090-'));
    fs.writeFileSync(path.join(tmpDir, '.counter'), '0');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

  describe('built-in library workflows', () => {
    test('library resolves to plan → build → review', () => {
      expect(resolveWorkflow({}, 'library')).toEqual([
        { stage: 'planning', agent: 'bobby-plan' },
        { stage: 'building', agent: 'bobby-build' },
        { stage: 'reviewing', agent: 'bobby-review' },
      ]);
    });

    test('library-secure resolves to plan → build → security → review', () => {
      expect(resolveWorkflow({}, 'library-secure')).toEqual([
        { stage: 'planning', agent: 'bobby-plan' },
        { stage: 'building', agent: 'bobby-build' },
        { stage: 'security', agent: 'bobby-security' },
        { stage: 'reviewing', agent: 'bobby-review' },
      ]);
    });
  });

  describe('default_workflow config key', () => {
    test('redirects the name default', () => {
      const steps = resolveWorkflow({ default_workflow: 'library' }, 'default');
      expect(steps.map(s => s.stage)).toEqual(['planning', 'building', 'reviewing']);
    });

    test('loses to ticket frontmatter workflow', () => {
      const steps = resolveWorkflow({ default_workflow: 'library' }, 'default', 'quick');
      expect(steps.map(s => s.stage)).toEqual(['planning', 'building', 'testing']);
    });

    test('loses to an explicit workflow name', () => {
      const steps = resolveWorkflow({ default_workflow: 'library' }, 'secure');
      expect(steps.map(s => s.stage)).toEqual(['planning', 'building', 'security', 'reviewing', 'testing']);
    });

    test('loses to a user-defined workflows.default', () => {
      const config = { default_workflow: 'library', workflows: { default: ['plan', 'build', 'test'] } };
      const steps = resolveWorkflow(config, 'default');
      expect(steps.map(s => s.stage)).toEqual(['planning', 'building', 'testing']);
    });

    test('unknown name throws and points at default_workflow in .bobbyrc.yml', () => {
      expect(() => resolveWorkflow({ default_workflow: 'nope' }, 'default'))
        .toThrow(/Unknown workflow 'nope'[\s\S]*default_workflow[\s\S]*\.bobbyrc\.yml/);
    });
  });

  describe('deriveDefaultWorkflow', () => {
    test('explicit stack field wins even with health checks present', () => {
      const stack = { default_workflow: 'library' };
      const config = { health_checks: [{ name: 'app', url: 'http://localhost:3000' }], commands: { dev: 'npm run dev' } };
      expect(deriveDefaultWorkflow(stack, config)).toBe('library');
    });

    test('no health checks and no dev command derives library', () => {
      expect(deriveDefaultWorkflow({}, { health_checks: [], commands: { dev: '' } })).toBe('library');
    });

    test('missing health_checks key still derives library', () => {
      expect(deriveDefaultWorkflow({}, { commands: {} })).toBe('library');
    });

    test('health checks present derives null', () => {
      expect(deriveDefaultWorkflow({}, { health_checks: [{ name: 'app', url: 'x' }], commands: {} })).toBeNull();
    });

    test('dev command present derives null', () => {
      expect(deriveDefaultWorkflow({}, { health_checks: [], commands: { dev: 'npm run dev' } })).toBeNull();
    });
  });

  describe('orchestration prompt testing gate', () => {
    test('hasHealthChecks false replaces the pre-gate with a block instruction', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW, 3, '.bobby/tickets', 20, '.claude/agents', false, {}, false);
      expect(prompt).toContain(`bobby ticket move {TICKET_ID} block "${REASON}"`);
      expect(prompt).toContain('default_workflow: library');
      expect(prompt).not.toContain('Pre-gate');
      // The testing stage launches no subagent at all.
      expect(prompt).not.toContain('bobby ticket assign {TICKET_ID} bobby-test');
    });

    test('hasHealthChecks true (explicit) keeps the existing pre-gate wording', () => {
      const prompt = buildOrchestrationPrompt('TKT-001', DEFAULT_WORKFLOW, 3, '.bobby/tickets', 20, '.claude/agents', false, {}, true);
      expect(prompt).toContain('Pre-gate');
      expect(prompt).toContain('health check');
      expect(prompt).toContain('live app, not run specs');
      expect(prompt).not.toContain(REASON);
    });

    test('sprint prompt threads hasHealthChecks through its opts', () => {
      const sprint = { id: 'SPR-001', name: 'Sprint', goal: '', branch: 'sprint/spr-001' };
      const tickets = [{ id: 'TKT-001', title: 'T', stage: 'backlog', priority: 'high' }];
      const blocked = buildSprintPrompt(sprint, tickets, DEFAULT_WORKFLOW, { hasHealthChecks: false });
      expect(blocked).toContain(REASON);
      expect(blocked).not.toContain('Pre-gate');
      const normal = buildSprintPrompt(sprint, tickets, DEFAULT_WORKFLOW, {});
      expect(normal).toContain('Pre-gate');
      expect(normal).not.toContain(REASON);
    });

    test('feature prompt emits the block clause for the testing stage', () => {
      const children = [{ id: 'TKT-002', title: 'Child', stage: 'building', priority: 'high' }];
      const blocked = buildFeaturePrompt('TKT-001', 'Epic', children, DEFAULT_WORKFLOW, 3, '.bobby/tickets', undefined, '.claude/agents', {}, false);
      expect(blocked).toContain(REASON);
      expect(blocked).not.toContain('bobby ticket assign {TICKET_ID} bobby-test');
      const normal = buildFeaturePrompt('TKT-001', 'Epic', children, DEFAULT_WORKFLOW, 3, '.bobby/tickets', undefined, '.claude/agents', {});
      expect(normal).not.toContain(REASON);
      expect(normal).toContain('bobby ticket assign {TICKET_ID} bobby-test');
    });
  });

  describe('bobby-test gates in buildNextStepPrompt and buildPromptFor', () => {
    test('slow mode on a ticket in testing gets the block instruction', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'A CLI thing' });
      moveTicket(tmpDir, 'TKT-001', 'testing', 'dev');
      const prompt = buildNextStepPrompt('TKT-001', DEFAULT_WORKFLOW, tmpDir, tmpDir, '.claude/agents', false);
      expect(prompt).toContain(`bobby ticket move TKT-001 block "${REASON}"`);
      expect(prompt).toContain('default_workflow: library');
      expect(prompt).not.toContain('bobby ticket assign TKT-001 bobby-test');
    });

    test('slow mode with health checks builds the normal test prompt', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'A CLI thing' });
      moveTicket(tmpDir, 'TKT-001', 'testing', 'dev');
      const prompt = buildNextStepPrompt('TKT-001', DEFAULT_WORKFLOW, tmpDir, tmpDir, '.claude/agents', true);
      expect(prompt).toContain('bobby ticket assign TKT-001 bobby-test');
      expect(prompt).not.toContain(REASON);
    });

    const ctxFor = (config) => ({
      config, ticketsDir: tmpDir, ticketsPath: tmpDir,
      agentsPath: '.claude/agents', workflow: DEFAULT_WORKFLOW,
    });

    test('buildPromptFor test agent without health checks returns a block prompt', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'A CLI thing' });
      const { prompt, label } = buildPromptFor('test', ['TKT-001'], ctxFor({ health_checks: [] }));
      expect(label).toBe('Bobby Test — TKT-001 (no live app)');
      expect(prompt).toContain(`bobby ticket move TKT-001 block "${REASON}"`);
      expect(prompt).not.toContain('bobby ticket assign TKT-001 bobby-test');
    });

    test('buildPromptFor test agent with health checks builds the normal prompt', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'A CLI thing' });
      const { prompt, label } = buildPromptFor('test', ['TKT-001'], ctxFor({ health_checks: [{ name: 'app', url: 'x' }] }));
      expect(label).toBe('Bobby Test — TKT-001');
      expect(prompt).toContain('bobby ticket assign TKT-001 bobby-test');
      expect(prompt).not.toContain(REASON);
    });

    test('batch test run without health checks instructs blocking each listed ticket', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'First' });
      createTicket(tmpDir, { prefix: 'TKT', title: 'Second' });
      moveTicket(tmpDir, 'TKT-001', 'testing', 'dev');
      moveTicket(tmpDir, 'TKT-002', 'testing', 'dev');
      const { prompt, label } = buildPromptFor('test', [], ctxFor({ health_checks: [] }));
      expect(label).toContain('(no live app)');
      expect(prompt).toContain('TKT-001');
      expect(prompt).toContain('TKT-002');
      expect(prompt).toContain(REASON);
    });

    test('workflow mode threads the gate from config', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'A CLI thing' });
      const { prompt } = buildPromptFor('workflow', ['TKT-001'], ctxFor({ health_checks: [] }));
      expect(prompt).toContain(REASON);
      const withHc = buildPromptFor('workflow', ['TKT-001'], ctxFor({ health_checks: [{ name: 'app', url: 'x' }] }));
      expect(withHc.prompt).toContain('Pre-gate');
      expect(withHc.prompt).not.toContain(REASON);
    });

    test('next mode threads the gate from config', () => {
      createTicket(tmpDir, { prefix: 'TKT', title: 'A CLI thing' });
      moveTicket(tmpDir, 'TKT-001', 'testing', 'dev');
      const { prompt } = buildPromptFor('next', ['TKT-001'], ctxFor({ health_checks: [] }));
      expect(prompt).toContain(REASON);
    });
  });
});
