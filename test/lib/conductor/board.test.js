import fs from 'fs';
import { boardCounts } from '../../../lib/conductor/board.js';
import { makeStudio, seedTickets } from './helpers.js';

describe('conductor board', () => {
  let root;
  beforeEach(() => { ({ root } = makeStudio()); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('counts tickets per stage for each named project, separately', () => {
    seedTickets(root, 'alpha', [
      { title: 'a' }, { title: 'b' }, { title: 'c', stage: 'building' }, { title: 'd', stage: 'shipping', blocked: true },
    ]);
    seedTickets(root, 'beta', [{ title: 'e', stage: 'testing' }]);
    const board = boardCounts(root, ['alpha', 'beta']);
    expect(board.alpha.stages).toMatchObject({ backlog: 2, building: 1, shipping: 1, testing: 0 });
    expect(board.alpha).toMatchObject({ total: 4, blocked: 1 });
    expect(board.beta.stages).toMatchObject({ testing: 1, backlog: 0 });
  });

  test('only the projects named are counted', () => {
    expect(Object.keys(boardCounts(root, ['beta']))).toEqual(['beta']);
  });

  test('a project that is not in the studio throws naming the key', () => {
    expect(() => boardCounts(root, ['alpha', 'ghost'])).toThrow(/"projects": "ghost" is not a project/);
  });
});
