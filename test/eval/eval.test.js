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
import { renderTemplate, renderSkillTemplates } from '../../lib/template.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Orchestration Prompt ──────────────────────────────────

describe('eval: buildOrchestrationPrompt', () => {
  const prompt = buildOrchestrationPrompt(['TKT-001', 'TKT-002'], DEFAULT_PIPELINE, 3, '.bobby/tickets', 20);

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

  test('includes final status reporting', () => {
    expect(prompt).toContain('report the final status');
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
    DEFAULT_PIPELINE, 3, '.bobby/tickets', undefined
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

  test('includes final status reporting', () => {
    expect(prompt).toContain('Report');
    expect(prompt).toContain('final status');
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
  test('UX prompt references agent instructions and browser', () => {
    const prompt = buildUxPrompt();
    expect(prompt).toContain('bobby-ux');
    expect(prompt).toContain('browser');
  });

  test('PM prompt references agent instructions and browser', () => {
    const prompt = buildPmPrompt();
    expect(prompt).toContain('bobby-pm');
    expect(prompt).toContain('browser');
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
    ], DEFAULT_PIPELINE, 3, '.bobby/tickets', undefined);
    expect(feat).toContain('git status');
    expect(feat).toContain('worktree');
  });

  test('no prompt contains deprecated prefill instructions', () => {
    for (const { name, prompt } of allPrompts) {
      expect(prompt).not.toMatch(/prefill|Assistant \(prefill\)/i);
    }
  });
});

// ── Bobby-Test Skill & Agent Quality ────────────────────────

describe('eval: bobby-test skill', () => {
  let tmpDir;
  let skillContent;
  let agentContent;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-eval-test-'));
    const config = {
      project: 'test-app',
      stack: 'nextjs',
      areas: ['auth'],
      health_checks: [{ name: 'app', url: 'http://localhost:3000', description: 'Next.js' }],
      commands: { test: 'npm test', lint: 'npm run lint', dev: 'npm run dev', build: 'npm run build' },
      tickets_dir: '.bobby/tickets',
      sessions_dir: '.bobby/sessions',
      paths: { agents: '.claude/agents', skills: '.claude/skills', commands: '.claude/commands', rules: 'CLAUDE.md' },
    };
    renderSkillTemplates(tmpDir, config);
    skillContent = fs.readFileSync(path.join(tmpDir, 'bobby-test', 'SKILL.md'), 'utf8');
    agentContent = renderTemplate('agents/bobby-test.md.ejs', config);
  });

  afterAll(() => { fs.rmSync(tmpDir, { recursive: true }); });

  // ── Anti-spec-running ──

  test('agent description does not say "runs test suite"', () => {
    expect(agentContent).not.toMatch(/[Rr]uns test suite/);
  });

  test('agent persona prohibits running specs', () => {
    expect(agentContent).toMatch(/NEVER run the test suite/);
  });

  test('skill has hard rules section prohibiting spec runners', () => {
    expect(skillContent).toContain('Hard Rules');
    expect(skillContent).toMatch(/NEVER run any spec/i);
  });

  test('skill mentions specific spec runners to avoid', () => {
    expect(skillContent).toMatch(/rspec/i);
    expect(skillContent).toMatch(/jest/i);
    expect(skillContent).toMatch(/pytest/i);
  });

  // ── Live app testing ──

  test('skill emphasizes live app observation', () => {
    expect(skillContent).toMatch(/live app/i);
    expect(skillContent).toMatch(/NEVER verify.*by reading source code/i);
  });

  test('skill includes health check section', () => {
    expect(skillContent).toContain('Health Check');
    expect(skillContent).toContain('http://localhost:3000');
  });

  test('skill includes evidence storage format', () => {
    expect(skillContent).toContain('test-evidence/');
    expect(skillContent).toContain('screenshots/');
    expect(skillContent).toContain('results.md');
  });

  // ── Bug hunting ──

  test('skill includes bug hunting strategy', () => {
    expect(skillContent).toContain('Bug Hunting Strategy');
  });

  test('bug hunting covers boundary values', () => {
    expect(skillContent).toMatch(/[Bb]oundary values/);
  });

  test('bug hunting covers state transitions', () => {
    expect(skillContent).toMatch(/[Ss]tate transitions/);
  });

  test('bug hunting covers persistence', () => {
    expect(skillContent).toMatch(/[Pp]ersistence/);
    expect(skillContent).toMatch(/refresh/i);
  });

  test('bug hunting covers error recovery', () => {
    expect(skillContent).toMatch(/[Ee]rror recovery/);
  });

  test('bug hunting covers side effects', () => {
    expect(skillContent).toMatch(/[Ss]ide effects/);
  });

  // ── Non-UI features ──

  test('skill covers non-UI features', () => {
    expect(skillContent).toContain('Non-UI Features');
  });

  test('non-UI section covers background jobs', () => {
    expect(skillContent).toMatch(/rails runner|node -e/i);
  });

  test('non-UI section covers API-only endpoints', () => {
    expect(skillContent).toContain('curl');
  });

  test('non-UI section requires tracing to UI', () => {
    expect(skillContent).toMatch(/[Tt]race to UI/);
    expect(skillContent).toMatch(/effects surface in the UI|open the browser|verify there too/i);
  });

  test('non-UI section warns against stopping at "no crash"', () => {
    expect(skillContent).toMatch(/never stop at.*executed without error/i);
  });

  // ── Test data setup ──

  test('skill includes test data setup section', () => {
    expect(skillContent).toContain('Test Data Setup');
  });

  test('test data section prohibits soft-passing due to missing data', () => {
    expect(skillContent).toMatch(/no data.*never an excuse/i);
  });

  test('test data section requires creating seed data', () => {
    expect(skillContent).toMatch(/create the data/i);
    expect(skillContent).toMatch(/API|rails runner|admin UI/i);
  });

  test('test data section requires documenting what was seeded', () => {
    expect(skillContent).toMatch(/[Dd]ocument what you seeded/i);
  });

  // ── Required services ──

  test('health check covers background workers', () => {
    expect(skillContent).toMatch(/[Bb]ackground workers/);
    expect(skillContent).toMatch(/docker compose/i);
  });

  test('skill allows running pending migrations', () => {
    expect(skillContent).toMatch(/pending migrations/i);
    expect(skillContent).not.toMatch(/[Nn]ever run migrations/);
  });

  // ── Self-check ──

  test('self-check verifies no specs were run', () => {
    expect(skillContent).toMatch(/did NOT run any test suite/i);
  });

  test('self-check verifies edge cases were explored', () => {
    expect(skillContent).toMatch(/tested beyond the happy path/i);
  });

  test('self-check verifies test data was created when needed', () => {
    expect(skillContent).toMatch(/created test data/i);
  });

  test('self-check verifies required services were running', () => {
    expect(skillContent).toMatch(/required services were running/i);
  });

  test('self-check verifies backend features traced to UI', () => {
    expect(skillContent).toMatch(/traced the result to a UI surface/i);
  });

  // ── Regression testing ──

  test('skill includes regression check section', () => {
    expect(skillContent).toContain('Regression Check');
  });

  test('self-check includes regression verification', () => {
    expect(skillContent).toMatch(/regression check/i);
    expect(skillContent).toMatch(/adjacent features/i);
  });

  test('results.md format includes regression section', () => {
    expect(skillContent).toMatch(/## Regression/);
  });

  // ── Testing tools config ──

  test('skill renders curl guidance with default config', () => {
    expect(skillContent).toContain('curl');
    expect(skillContent).toContain('API Testing');
  });
});

describe('eval: bobby-test skill with playwright', () => {
  let tmpDir;
  let skillContent;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-eval-pw-'));
    const config = {
      project: 'test-app',
      stack: 'nextjs',
      areas: ['auth'],
      health_checks: [{ name: 'app', url: 'http://localhost:3000', description: 'Next.js' }],
      commands: { test: 'npm test', lint: 'npm run lint', dev: 'npm run dev', build: 'npm run build' },
      tickets_dir: '.bobby/tickets',
      sessions_dir: '.bobby/sessions',
      testing_tools: ['playwright', 'curl'],
      paths: { agents: '.claude/agents', skills: '.claude/skills', commands: '.claude/commands', rules: 'CLAUDE.md' },
    };
    renderSkillTemplates(tmpDir, config);
    skillContent = fs.readFileSync(path.join(tmpDir, 'bobby-test', 'SKILL.md'), 'utf8');
  });

  afterAll(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('skill renders playwright guidance when configured', () => {
    expect(skillContent).toContain('Playwright (Browser Automation)');
    expect(skillContent).toContain('mcp__playwright__browser_navigate');
    expect(skillContent).toContain('mcp__playwright__browser_screenshot');
  });

  test('skill renders curl guidance alongside playwright', () => {
    expect(skillContent).toContain('curl (API Testing)');
  });

  test('UI testing section references Playwright MCP', () => {
    expect(skillContent).toContain('Playwright MCP for browser testing');
  });
});

describe('eval: bobby-test skill without testing_tools', () => {
  let tmpDir;
  let skillContent;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-eval-notool-'));
    const config = {
      project: 'test-app',
      stack: 'nextjs',
      areas: ['auth'],
      health_checks: [{ name: 'app', url: 'http://localhost:3000', description: 'Next.js' }],
      commands: { test: 'npm test', lint: 'npm run lint', dev: 'npm run dev', build: 'npm run build' },
      tickets_dir: '.bobby/tickets',
      sessions_dir: '.bobby/sessions',
      paths: { agents: '.claude/agents', skills: '.claude/skills', commands: '.claude/commands', rules: 'CLAUDE.md' },
    };
    renderSkillTemplates(tmpDir, config);
    skillContent = fs.readFileSync(path.join(tmpDir, 'bobby-test', 'SKILL.md'), 'utf8');
  });

  afterAll(() => { fs.rmSync(tmpDir, { recursive: true }); });

  test('skill renders fallback when no testing_tools configured', () => {
    expect(skillContent).toContain('Use curl for API testing and browser screenshots for UI verification');
    expect(skillContent).not.toContain('Playwright (Browser Automation)');
  });
});
