// test/lib/pipeline.test.js
import {
  buildSingleAgentPrompt, buildNextStepPrompt, buildBatchStagePrompt,
  buildUxPrompt, buildPmPrompt, buildQePrompt, buildShipPrompt, buildFeaturePrompt, DEFAULT_PIPELINE,
} from '../../lib/pipeline.js';
import { createTicket, moveTicket } from '../../lib/tickets.js';
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
    expect(prompt).toContain('auto-clears assignment');
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
  });
});
