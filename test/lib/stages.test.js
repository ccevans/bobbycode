// test/lib/stages.test.js
import { STAGES, TRANSITIONS, isValidStage, stageColor, stageIndex, resolveTransition } from '../../lib/stages.js';

describe('stages', () => {
  test('STAGES has 13 entries', () => {
    expect(STAGES).toHaveLength(13);
  });

  test('STAGES starts with backlog and ends with blocked', () => {
    expect(STAGES[0]).toBe('backlog');
    expect(STAGES[STAGES.length - 1]).toBe('blocked');
  });

  test('STAGES contains all expected stages', () => {
    expect(STAGES).toEqual([
      'backlog', 'planning',
      'design-research', 'design-analyze', 'design-mockup', 'design-spec',
      'building', 'security', 'reviewing',
      'testing', 'shipping', 'done', 'blocked',
    ]);
  });

  test('isValidStage returns true for valid stages', () => {
    expect(isValidStage('backlog')).toBe(true);
    expect(isValidStage('building')).toBe(true);
    expect(isValidStage('done')).toBe(true);
    expect(isValidStage('blocked')).toBe(true);
  });

  test('isValidStage returns false for invalid stages', () => {
    expect(isValidStage('invalid')).toBe(false);
    expect(isValidStage('')).toBe(false);
    expect(isValidStage('1-backlog')).toBe(false);
  });

  test('stageColor returns color functions for known stages', () => {
    const color = stageColor('building');
    expect(color).toBeDefined();
    expect(typeof color).toBe('function');
  });

  test('stageColor returns fallback for unknown stage', () => {
    const color = stageColor('nonexistent');
    expect(color).toBeDefined();
    expect(typeof color).toBe('function');
  });

  test('stageIndex returns numeric index', () => {
    expect(stageIndex('backlog')).toBe(0);
    expect(stageIndex('blocked')).toBe(STAGES.length - 1);
    expect(stageIndex('building')).toBe(STAGES.indexOf('building'));
    // design stages sit between planning and building
    expect(stageIndex('design-research')).toBeGreaterThan(stageIndex('planning'));
    expect(stageIndex('design-spec')).toBeLessThan(stageIndex('building'));
  });

  // Position, not just membership: stageIndex is an ordering comparison in the
  // parent-epic auto-advance (lib/tickets.js), so a child that has cleared
  // security must read as further along than one still building and less far
  // than one in review. Dropping `security` at the end of STAGES would pass a
  // membership check and silently advance epics wrong.
  test('security sits between building and reviewing', () => {
    expect(stageIndex('security')).toBeGreaterThan(stageIndex('building'));
    expect(stageIndex('security')).toBeLessThan(stageIndex('reviewing'));
  });

  test('security is reachable by `bobby ticket move <id> security`', () => {
    expect(TRANSITIONS.security).toBe('security');
    expect(resolveTransition('security')).toBe('security');
    expect(isValidStage('security')).toBe(true);
  });

  test('TRANSITIONS maps aliases to stage names', () => {
    expect(TRANSITIONS.plan).toBe('planning');
    expect(TRANSITIONS.build).toBe('building');
    expect(TRANSITIONS.review).toBe('reviewing');
    expect(TRANSITIONS.test).toBe('testing');
    expect(TRANSITIONS.ship).toBe('shipping');
    expect(TRANSITIONS.done).toBe('done');
  });

  test('resolveTransition resolves aliases', () => {
    expect(resolveTransition('plan')).toBe('planning');
    expect(resolveTransition('build')).toBe('building');
  });

  test('resolveTransition passes through valid stage names', () => {
    expect(resolveTransition('backlog')).toBe('backlog');
    expect(resolveTransition('done')).toBe('done');
  });

  test('resolveTransition returns null for unknown aliases', () => {
    expect(resolveTransition('invalid')).toBeNull();
    expect(resolveTransition('fake')).toBeNull();
  });
});
