// test/lib/models.test.js — per-stage model resolution (BOB-135).
//
// The rules worth pinning down are the ones a future edit could quietly
// reverse: that Bobby's own tiers never outrank a user's config, that an
// existing `dashboard.model` keeps meaning "everything runs on this", and that
// tier aliases never reach a CLI that would choke on them.
import {
  resolveModel,
  resolveModelForFile,
  agentKeyForFile,
  resolvedModelTable,
  withAgentModel,
  MODEL_TIERS,
  INHERIT,
} from '../../lib/models.js';
import { AGENT_REGISTRY, VALID_AGENTS } from '../../lib/agent-registry.js';

describe('registry tiers', () => {
  test('every agent declares a tier, and only a real one', () => {
    for (const [key, entry] of Object.entries(AGENT_REGISTRY)) {
      expect(`${key}: ${entry.tier}`).toBeTruthy();
      expect(MODEL_TIERS).toContain(entry.tier);
    }
  });

  // The whole point of the split. If every agent ends up on one tier, the
  // feature is plumbing with no opinion behind it.
  test('the tiers are actually spread across the kinds of work', () => {
    const used = new Set(Object.values(AGENT_REGISTRY).map(e => e.tier));
    expect([...used].sort()).toEqual(['haiku', 'opus', 'sonnet']);
  });

  test('judgment stages are not tiered below execution ones', () => {
    for (const key of ['plan', 'review', 'security', 'debug', 'arch']) {
      expect(`${key} → ${AGENT_REGISTRY[key].tier}`).toBe(`${key} → opus`);
    }
  });
});

describe('resolveModel precedence', () => {
  test('falls back to the agent tier when nothing is configured', () => {
    expect(resolveModel('review', {})).toBe('opus');
    expect(resolveModel('build', {})).toBe('sonnet');
    expect(resolveModel('watchdog', {})).toBe('haiku');
  });

  test('a named stage beats models.default, which beats dashboard.model', () => {
    const config = {
      models: { default: 'sonnet', review: 'my-review-model' },
      dashboard: { model: 'global-model' },
    };
    expect(resolveModel('review', config)).toBe('my-review-model');
    expect(resolveModel('build', config)).toBe('sonnet');
  });

  // Backwards compatibility, stated as a test because it is the one way this
  // change could surprise an existing project: a config that already pins one
  // model must not silently acquire per-stage defaults.
  test('an existing dashboard.model still governs every stage', () => {
    const config = { dashboard: { model: 'global-model' } };
    for (const agent of VALID_AGENTS) {
      expect(resolveModel(agent, config)).toBe('global-model');
    }
  });

  test('inherit means no model at all, at any level', () => {
    expect(resolveModel('review', { models: { review: INHERIT } })).toBeNull();
    expect(resolveModel('review', { models: { default: INHERIT } })).toBeNull();
  });

  test('a null in the config reads as unset, not as a value', () => {
    const config = { models: { review: null }, dashboard: { model: null } };
    expect(resolveModel('review', config)).toBe('opus');
  });

  test('an agent Bobby never shipped gets no opinion', () => {
    expect(resolveModel('my-custom-agent', {})).toBeNull();
    expect(resolveModel('my-custom-agent', { models: { default: 'sonnet' } })).toBe('sonnet');
  });
});

describe('tier aliases only reach a CLI that knows them', () => {
  // cursor-agent / codex / opencode take full model names. Handing one `opus`
  // is not a degraded run, it is a dead one — the CLI rejects the name.
  test('shipped tiers are withheld when the executor cannot read them', () => {
    for (const agent of VALID_AGENTS) {
      expect(resolveModel(agent, {}, { acceptsTiers: false })).toBeNull();
    }
  });

  test('a model the user named is passed through regardless', () => {
    const config = { models: { build: 'anthropic/claude-sonnet-4-6' } };
    expect(resolveModel('build', config, { acceptsTiers: false }))
      .toBe('anthropic/claude-sonnet-4-6');
  });
});

describe('agent files map back to their registry key', () => {
  test('including the ones whose name and key differ', () => {
    expect(agentKeyForFile('bobby-ticket-intake')).toBe('intake');
    expect(agentKeyForFile('bobby-ship')).toBe('ship');
    expect(agentKeyForFile('bobby-design-check')).toBe('design-check');
    expect(agentKeyForFile('not-a-bobby-agent')).toBeNull();
  });

  test('resolveModelForFile agrees with resolveModel', () => {
    expect(resolveModelForFile('bobby-review', {})).toBe('opus');
    expect(resolveModelForFile('not-a-bobby-agent', {})).toBeNull();
  });
});

describe('withAgentModel', () => {
  const file = '---\nname: bobby-plan\ndescription: Plans tickets\n---\n\nBody text.\n';

  test('adds the model to a leading frontmatter block', () => {
    expect(withAgentModel(file, 'opus')).toContain('description: Plans tickets\nmodel: opus\n---');
  });

  test('leaves the file alone when there is no model, or no frontmatter', () => {
    expect(withAgentModel(file, null)).toBe(file);
    expect(withAgentModel('# Just a heading\n', 'opus')).toBe('# Just a heading\n');
  });

  test('never writes a second model line', () => {
    const pinned = '---\nname: x\nmodel: haiku\n---\n\nBody.\n';
    expect(withAgentModel(pinned, 'opus')).toBe(pinned);
  });

  // A `---` inside the body is not a frontmatter delimiter.
  test('only the leading block counts', () => {
    const withRule = '---\nname: x\n---\n\nBody\n\n---\n\nMore body\n';
    const out = withAgentModel(withRule, 'opus');
    expect(out.match(/model: opus/g)).toHaveLength(1);
    expect(out.indexOf('model: opus')).toBeLessThan(out.indexOf('Body'));
  });
});

describe('resolvedModelTable', () => {
  test('reports every agent in registry order', () => {
    const table = resolvedModelTable({});
    expect(table.map(r => r.agent)).toEqual(VALID_AGENTS);
    expect(table.find(r => r.agent === 'review')).toEqual({
      agent: 'review', tier: 'opus', model: 'opus',
    });
  });
});
