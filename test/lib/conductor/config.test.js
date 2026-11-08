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
    expect(loadConductorConfig(root)).toEqual({
      projects: ['alpha'],
      hook_state_dir: hookDir,
      governor: { min_free_ram_mb: 4096, max_docker_stacks: 4, min_free_disk_gb: 1 },
      reaper: { stack_idle_hours: 2 },
      wip: { max_lanes: 6 },
      claims: { ttl_minutes: 30 },
      inbox: { stale_minutes: 30 },
    });
  });

  const govYml = 'projects:\n  - alpha\nhook_state_dir: /x\ngovernor:\n  min_free_ram_mb: 4096\n  max_docker_stacks: 4\n  min_free_disk_gb: 50\n';
  test.each([
    ['reaper.stack_idle_hours', govYml],
    ['reaper.stack_idle_hours', `${govYml}reaper:\n  other: 1\n`],
    ['reaper.stack_idle_hours', `${govYml}reaper:\n  stack_idle_hours:\n`],
    ['reaper.stack_idle_hours', `${govYml}reaper:\n  stack_idle_hours: 0\n`],
    ['reaper.stack_idle_hours', `${govYml}reaper:\n  stack_idle_hours: soon\n`],
    ['reaper', `${govYml}reaper: 2\n`],
  ])('a missing or invalid %s names the key', (key, yml) => {
    writeConductorYml(root, yml);
    expect(() => loadConductorConfig(root)).toThrow(new RegExp(`key "${key.replace('.', '\\.')}"`));
  });

  const reaperYml = `${govYml}reaper:\n  stack_idle_hours: 2\n`;
  test.each([
    ['wip.max_lanes', reaperYml],
    ['wip.max_lanes', `${reaperYml}wip:\n  other: 1\n`],
    ['wip.max_lanes', `${reaperYml}wip:\n  max_lanes:\n`],
    ['wip.max_lanes', `${reaperYml}wip:\n  max_lanes: 0\n`],
    ['wip.max_lanes', `${reaperYml}wip:\n  max_lanes: 2.5\n`],
    ['wip', `${reaperYml}wip: 6\n`],
    ['claims.ttl_minutes', `${reaperYml}wip:\n  max_lanes: 6\n`],
    ['claims.ttl_minutes', `${reaperYml}wip:\n  max_lanes: 6\nclaims:\n  ttl_minutes: soon\n`],
    ['claims', `${reaperYml}wip:\n  max_lanes: 6\nclaims: 30\n`],
  ])('a missing or invalid %s names the key (wip and claims)', (key, yml) => {
    writeConductorYml(root, yml);
    expect(() => loadConductorConfig(root)).toThrow(new RegExp(`key "${key.replace('.', '\\.')}"`));
  });

  const wipYml = `${reaperYml}wip:\n  max_lanes: 6\nclaims:\n  ttl_minutes: 30\n`;
  test.each([
    ['inbox.stale_minutes', wipYml],
    ['inbox.stale_minutes', `${wipYml}inbox:\n  other: 1\n`],
    ['inbox.stale_minutes', `${wipYml}inbox:\n  stale_minutes:\n`],
    ['inbox.stale_minutes', `${wipYml}inbox:\n  stale_minutes: 0\n`],
    ['inbox.stale_minutes', `${wipYml}inbox:\n  stale_minutes: soon\n`],
    ['inbox', `${wipYml}inbox: 30\n`],
  ])('a missing or invalid %s names the key', (key, yml) => {
    writeConductorYml(root, yml);
    expect(() => loadConductorConfig(root)).toThrow(new RegExp(`key "${key.replace('.', '\\.')}"`));
  });

  test.each([
    ['projects', `hook_state_dir: /x\n`],
    ['hook_state_dir', `projects:\n  - alpha\n`],
    ['governor.min_free_ram_mb', `projects:\n  - alpha\nhook_state_dir: /x\n`],
    ['governor.min_free_ram_mb', `projects:\n  - alpha\nhook_state_dir: /x\ngovernor:\n  max_docker_stacks: 4\n`],
    ['governor.max_docker_stacks', `projects:\n  - alpha\nhook_state_dir: /x\ngovernor:\n  min_free_ram_mb: 4096\n`],
    ['governor.min_free_disk_gb', `projects:\n  - alpha\nhook_state_dir: /x\ngovernor:\n  min_free_ram_mb: 4096\n  max_docker_stacks: 4\n`],
    ['governor.min_free_disk_gb', `projects:\n  - alpha\nhook_state_dir: /x\ngovernor:\n  min_free_ram_mb: 4096\n  max_docker_stacks: 4\n  min_free_disk_gb:\n`],
  ])('missing key "%s" throws naming the key and the file; no default applied', (key, yml) => {
    writeConductorYml(root, yml);
    expect(() => loadConductorConfig(root)).toThrow(new RegExp(`conductor\\.yml: key "${key}" is missing`));
  });

  test.each([
    ['projects', `projects: []\nhook_state_dir: /x\n`],
    ['projects', `projects: alpha\nhook_state_dir: /x\n`],
    ['hook_state_dir', `projects:\n  - alpha\nhook_state_dir: relative/dir\n`],
    ['hook_state_dir', `projects:\n  - alpha\nhook_state_dir: 7\n`],
    ['governor', `projects:\n  - alpha\nhook_state_dir: /x\ngovernor: 4\n`],
    ['governor.min_free_ram_mb', `projects:\n  - alpha\nhook_state_dir: /x\ngovernor:\n  min_free_ram_mb: 0\n  max_docker_stacks: 4\n`],
    ['governor.min_free_ram_mb', `projects:\n  - alpha\nhook_state_dir: /x\ngovernor:\n  min_free_ram_mb: lots\n  max_docker_stacks: 4\n`],
    ['governor.max_docker_stacks', `projects:\n  - alpha\nhook_state_dir: /x\ngovernor:\n  min_free_ram_mb: 4096\n  max_docker_stacks: 2.5\n`],
    ['governor.min_free_disk_gb', `projects:\n  - alpha\nhook_state_dir: /x\ngovernor:\n  min_free_ram_mb: 4096\n  max_docker_stacks: 4\n  min_free_disk_gb: 0\n`],
    ['governor.min_free_disk_gb', `projects:\n  - alpha\nhook_state_dir: /x\ngovernor:\n  min_free_ram_mb: 4096\n  max_docker_stacks: 4\n  min_free_disk_gb: lots\n`],
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
    expect(values).toEqual({
      projects: ['alpha'],
      hook_state_dir: path.join(os.homedir(), '.bobby', 'hook-state'),
      governor: { min_free_ram_mb: 4096, max_docker_stacks: 4, min_free_disk_gb: 50 },
      reaper: { stack_idle_hours: 2 },
      wip: { max_lanes: 6 },
      claims: { ttl_minutes: 30 },
      inbox: { stale_minutes: 30 },
    });
    expect(loadConductorConfig(root)).toEqual(values);
    expect(fs.readFileSync(file, 'utf8')).toMatch(/wip:\n {2}max_lanes: 6\n/);
    expect(fs.readFileSync(file, 'utf8')).toMatch(/claims:\n {2}ttl_minutes: 30\n/);
    expect(fs.readFileSync(file, 'utf8')).toMatch(/governor:\n {2}min_free_ram_mb: 4096\n {2}max_docker_stacks: 4\n {2}min_free_disk_gb: 50\n/);
    expect(fs.readFileSync(file, 'utf8')).toMatch(/reaper:\n {2}stack_idle_hours: 2\n/);
    expect(fs.readFileSync(file, 'utf8')).toMatch(/inbox:\n {2}stale_minutes: 30\n/);
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
