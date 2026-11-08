import fs from 'fs';
import path from 'path';
import os from 'os';
import { findStudioRoot, loadConductorConfig, initConductorConfig, conductorFilePath } from '../../../lib/conductor/config.js';
import { makeStudio, writeConductorYml, validYml } from './helpers.js';

describe('conductor config', () => {
  let root;
  let hookDir;
  beforeEach(() => { ({ root, hookDir } = makeStudio()); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('a missing file throws naming the file and the init command', () => {
    expect(() => loadConductorConfig(root)).toThrow(/conductor\.yml does not exist.*bobby conductor init/);
  });

  test('a valid file loads exactly what it says', () => {
    writeConductorYml(root, validYml(hookDir, ['alpha']));
    expect(loadConductorConfig(root)).toEqual({ projects: ['alpha'], hook_state_dir: hookDir });
  });

  test.each([
    ['projects', `hook_state_dir: /x\n`],
    ['hook_state_dir', `projects:\n  - alpha\n`],
  ])('missing key "%s" throws naming the key and the file; no default applied', (key, yml) => {
    writeConductorYml(root, yml);
    expect(() => loadConductorConfig(root)).toThrow(new RegExp(`conductor\\.yml: key "${key}" is missing`));
  });

  test.each([
    ['projects', `projects: []\nhook_state_dir: /x\n`],
    ['projects', `projects: alpha\nhook_state_dir: /x\n`],
    ['hook_state_dir', `projects:\n  - alpha\nhook_state_dir: relative/dir\n`],
    ['hook_state_dir', `projects:\n  - alpha\nhook_state_dir: 7\n`],
  ])('invalid "%s" throws naming the key', (key, yml) => {
    writeConductorYml(root, yml);
    expect(() => loadConductorConfig(root)).toThrow(new RegExp(`key "${key}" must be`));
  });

  test('a non-mapping file throws', () => {
    writeConductorYml(root, '- a\n- b\n');
    expect(() => loadConductorConfig(root)).toThrow(/expected a YAML mapping/);
  });

  test('init writes every key explicitly and the result loads', () => {
    const { file, values } = initConductorConfig(root, { projects: ['alpha'] });
    expect(file).toBe(conductorFilePath(root));
    expect(values).toEqual({ projects: ['alpha'], hook_state_dir: path.join(os.homedir(), '.bobby', 'hook-state') });
    expect(loadConductorConfig(root)).toEqual(values);
  });

  test('init without --projects writes every studio project explicitly', () => {
    expect(initConductorConfig(root).values.projects).toEqual(['alpha', 'beta']);
  });

  test('init refuses an unknown project and writes nothing', () => {
    expect(() => initConductorConfig(root, { projects: ['nope'] })).toThrow(/Unknown project\(s\) nope/);
    expect(fs.existsSync(conductorFilePath(root))).toBe(false);
  });

  test('init refuses to overwrite and leaves the file untouched', () => {
    writeConductorYml(root, 'projects:\n  - beta\nhook_state_dir: /keep\n');
    const before = fs.readFileSync(conductorFilePath(root), 'utf8');
    expect(() => initConductorConfig(root)).toThrow(/already exists/);
    expect(fs.readFileSync(conductorFilePath(root), 'utf8')).toBe(before);
  });

  test('findStudioRoot walks past a non-studio .bobbyrc.yml (a repo checkout under worktrees/)', () => {
    const repo = path.join(root, 'worktrees', 'X');
    fs.mkdirSync(path.join(repo, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.bobbyrc.yml'), 'project: x\n');
    expect(findStudioRoot(path.join(repo, 'lib'))).toBe(root);
  });

  test('findStudioRoot throws outside a studio', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-nostudio-'));
    try {
      expect(() => findStudioRoot(outside)).toThrow(/must run inside a studio/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
