// test/lib/library-workflow.test.js
//
// Projects with no live app (CLIs, libraries, npm packages) must not stall at
// the `test` stage. bobby-test verifies by exercising a running application and
// is forbidden from running the spec suite as a substitute, so on a library it
// has nothing to do — and the old failure mode was silent: every test case came
// back BLOCKED and the ticket simply stopped advancing.

import {
  BUILT_IN_WORKFLOWS,
  resolveWorkflow,
  stackDefaultWorkflow,
  hasNoLiveApp,
  buildSingleAgentPrompt,
  LIVE_APP_AGENTS,
} from '../../lib/workflow.js';

describe('library workflows', () => {
  test('library and library-secure are built in and end at review', () => {
    expect(BUILT_IN_WORKFLOWS.library).toEqual(['plan', 'build', 'review']);
    expect(BUILT_IN_WORKFLOWS['library-secure'])
      .toEqual(['plan', 'build', 'security', 'review']);
  });

  test.each(['library', 'library-secure'])('%s contains no live-app stage', (name) => {
    const agents = resolveWorkflow({}, name).map(s => s.agent);
    for (const liveOnly of LIVE_APP_AGENTS) {
      expect(agents).not.toContain(liveOnly);
    }
  });

  test('review is the final stage, so the suite still runs', () => {
    const steps = resolveWorkflow({}, 'library');
    expect(steps[steps.length - 1].agent).toBe('bobby-review');
  });
});

describe('stackDefaultWorkflow', () => {
  test('an explicit default_workflow on the stack always wins', () => {
    expect(stackDefaultWorkflow({
      default_workflow: 'library-secure',
      health_checks: [{ url: 'http://x' }],
      commands: { dev: 'npm run dev' },
    })).toBe('library-secure');
  });

  test('infers library when there is nothing to serve and no way to start it', () => {
    expect(stackDefaultWorkflow({ health_checks: [], commands: {} })).toBe('library');
    expect(stackDefaultWorkflow({})).toBe('library');
  });

  test('a stack with a dev command or health check keeps the default workflow', () => {
    expect(stackDefaultWorkflow({ health_checks: [], commands: { dev: 'npm run dev' } }))
      .toBe('default');
    expect(stackDefaultWorkflow({ health_checks: [{ url: 'http://x' }], commands: {} }))
      .toBe('default');
  });
});

describe('resolveWorkflow precedence', () => {
  const libConfig = { default_workflow: 'library' };

  test('project default applies when no flag or ticket override is given', () => {
    expect(resolveWorkflow(libConfig, 'default').map(s => s.agent))
      .toEqual(['bobby-plan', 'bobby-build', 'bobby-review']);
  });

  test('an explicit workflow name beats the project default', () => {
    expect(resolveWorkflow(libConfig, 'quick').map(s => s.stage))
      .toContain('testing');
  });

  test('a ticket-level workflow beats the project default', () => {
    expect(resolveWorkflow(libConfig, 'default', 'secure').map(s => s.agent))
      .toContain('bobby-security');
  });

  test('absent default_workflow still resolves to the built-in default', () => {
    expect(resolveWorkflow({}, 'default').map(s => s.stage))
      .toEqual(['planning', 'building', 'reviewing', 'testing']);
  });
});

describe('hasNoLiveApp', () => {
  test('true only when nothing can be observed or started', () => {
    expect(hasNoLiveApp({})).toBe(true);
    expect(hasNoLiveApp({ health_checks: [], services: {}, commands: {} })).toBe(true);
  });

  test('any of health checks, services, or a dev command makes it false', () => {
    expect(hasNoLiveApp({ health_checks: [{ url: 'http://x' }] })).toBe(false);
    expect(hasNoLiveApp({ services: { api: {} } })).toBe(false);
    expect(hasNoLiveApp({ commands: { dev: 'npm run dev' } })).toBe(false);
  });
});

describe('live-app agent guard', () => {
  const promptFor = (agent, noLiveApp) =>
    buildSingleAgentPrompt(agent, 'TKT-001', '.bobby/tickets', '.claude/agents', false, noLiveApp);

  test.each(LIVE_APP_AGENTS)('%s blocks loudly instead of stalling', (agent) => {
    const prompt = promptFor(agent, true);
    expect(prompt).toContain('no live app');
    // Must name the escape hatch, not just refuse.
    expect(prompt).toContain('library');
    expect(prompt).toContain(`bobby ticket move TKT-001 block`);
    // The silent-stall behaviour this replaces:
    expect(prompt).toContain('Do NOT emit BLOCKED test cases');
    expect(prompt).toContain('do NOT fall back to running specs');
  });

  test('non-live-app agents are unaffected on a library project', () => {
    for (const agent of ['bobby-build', 'bobby-review', 'bobby-plan']) {
      const prompt = promptFor(agent, true);
      expect(prompt).toContain(`Run the ${agent} agent`);
      expect(prompt).not.toContain('no live app');
    }
  });

  test('live-app agents run normally when the project has an app', () => {
    const prompt = promptFor('bobby-test', false);
    expect(prompt).toContain('Run the bobby-test agent');
    expect(prompt).not.toContain('no live app');
  });
});
