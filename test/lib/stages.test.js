// test/lib/stages.test.js
import { STAGES, TRANSITIONS, isValidStage, stageColor, stageIndex, resolveTransition } from '../../lib/stages.js';

describe('stages', () => {
  test('STAGES has 17 entries', () => {
    expect(STAGES).toHaveLength(17);
  });

  test('STAGES starts with backlog and ends with blocked', () => {
    expect(STAGES[0]).toBe('backlog');
    expect(STAGES[STAGES.length - 1]).toBe('blocked');
  });

  test('STAGES contains all expected stages', () => {
    expect(STAGES).toEqual([
      'backlog',
      'define-brief', 'define-personas', 'define-journeys', 'define-features', 'define-blueprint',
      'planning',
      'design-research', 'design-analyze', 'design-mockup', 'design-spec',
      'building', 'reviewing',
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

// The fix-it-once guard: the design stages shipped without STAGE_ORDER ranks
// and without brief.js visibility for a release. These invariants make it
// impossible for a third pipeline to reintroduce that gap silently.
import { STAGE_ORDER } from '../../lib/tickets.js';
import { BUILT_IN_WORKFLOWS, resolveWorkflow } from '../../lib/workflow.js';
import chalk from 'chalk';

describe('stage invariants (every pipeline, forever)', () => {
  test('every stage has a STAGE_ORDER rank', () => {
    for (const stage of STAGES) {
      expect(STAGE_ORDER[stage]).toBeDefined();
    }
  });

  test('every stage has a real color, not the fallback', () => {
    for (const stage of STAGES) {
      expect(stageColor(stage)).not.toBe(chalk.reset);
    }
  });

  test('every built-in workflow step maps to a valid stage', () => {
    for (const [name] of Object.entries(BUILT_IN_WORKFLOWS)) {
      for (const step of resolveWorkflow({}, name)) {
        expect(isValidStage(step.stage)).toBe(true);
      }
    }
  });

  test('define aliases resolve to define stages', () => {
    expect(resolveTransition('brief')).toBe('define-brief');
    expect(resolveTransition('personas')).toBe('define-personas');
    expect(resolveTransition('journeys')).toBe('define-journeys');
    expect(resolveTransition('features')).toBe('define-features');
    expect(resolveTransition('blueprint')).toBe('define-blueprint');
  });
});
