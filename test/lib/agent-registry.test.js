// test/lib/agent-registry.test.js
import { AGENT_REGISTRY, VALID_AGENTS } from '../../lib/agent-registry.js';
import { buildGenericPrompt } from '../../lib/workflow.js';

describe('agent registry', () => {
  test('every registry entry with promptSteps names an agent file', () => {
    for (const [name, entry] of Object.entries(AGENT_REGISTRY)) {
      if (!entry.promptSteps) continue;
      expect(entry.agentName).toBeTruthy();
      expect(`${name} → ${entry.agentName}`).toMatch(/bobby-/);
    }
  });

  describe('freewill', () => {
    const entry = AGENT_REGISTRY.freewill;

    test('is runnable by name', () => {
      expect(VALID_AGENTS).toContain('freewill');
      expect(entry.agentName).toBe('bobby-freewill');
      expect(entry.requiresTicket).toBe(true);
    });

    // The premise of freewill is that Opus 5 / Fable 5 do better from a goal plus
    // its invariants than from a procedure. A dispatch prompt that grows into a
    // checklist quietly turns it back into every other agent, and nothing else in
    // the codebase would notice — so this asserts the intent directly.
    test('stays a brief, not a checklist', () => {
      expect(entry.promptSteps.length).toBeLessThanOrEqual(5);
      const counts = Object.values(AGENT_REGISTRY)
        .filter(e => e.promptSteps)
        .map(e => e.promptSteps.length);
      const average = counts.reduce((a, b) => a + b, 0) / counts.length;
      expect(entry.promptSteps.length).toBeLessThan(average);
    });

    test('routes work it should not do back to a reviewed workflow', () => {
      const prompt = buildGenericPrompt(entry, { ticketId: 'TKT-001' });
      expect(prompt).toMatch(/[Ss]ecurity-sensitive/);
      expect(prompt).toContain('bobby ticket move TKT-001 ship');
      expect(prompt).toContain('bobby ticket move TKT-001 block');
    });

    test('keeps the self-review that stands in for the review stage', () => {
      const prompt = buildGenericPrompt(entry, { ticketId: 'TKT-001' });
      expect(prompt).toMatch(/self-review/i);
    });
  });
});
