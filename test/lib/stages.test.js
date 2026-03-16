// test/lib/stages.test.js
import { STAGES, isValidStage, stageColor, stageIndex } from '../../lib/stages.js';

describe('stages', () => {
  test('STAGES has 11 entries', () => {
    expect(STAGES).toHaveLength(11);
  });

  test('STAGES starts with 0-ideas and ends with 10-released', () => {
    expect(STAGES[0]).toBe('0-ideas');
    expect(STAGES[10]).toBe('10-released');
  });

  test('isValidStage returns true for valid stages', () => {
    expect(isValidStage('1-backlog')).toBe(true);
    expect(isValidStage('4-in-progress')).toBe(true);
  });

  test('isValidStage returns false for invalid stages', () => {
    expect(isValidStage('invalid')).toBe(false);
    expect(isValidStage('')).toBe(false);
  });

  test('stageColor returns color codes', () => {
    const color = stageColor('4-in-progress');
    expect(color).toBeDefined();
  });

  test('stageIndex returns numeric index', () => {
    expect(stageIndex('0-ideas')).toBe(0);
    expect(stageIndex('10-released')).toBe(10);
  });
});
