// test/lib/studio.test.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { touchProject, listProjects, registryFile, inboxFile } from '../../lib/registry.js';

describe('project registry', () => {
  const origHome = process.env.HOME;
  let tmpHome;
  let projA;
  let projB;

  const makeProject = (dir, name) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.bobbyrc.yml'), YAML.stringify({
      project: name, stack: 'generic',
      tickets_dir: '.bobby/tickets', sessions_dir: '.bobby/sessions', sprints_dir: '.bobby/sprints',
      ticket_prefix: 'TKT',
    }));
    fs.mkdirSync(path.join(dir, '.bobby', 'tickets'), { recursive: true });
  };

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-ws-'));
    process.env.HOME = tmpHome;
    projA = path.join(tmpHome, 'proj-a');
    projB = path.join(tmpHome, 'proj-b');
    makeProject(projA, 'alpha');
    makeProject(projB, 'beta');
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('registryFile and inboxFile live under ~/.bobby', () => {
    expect(registryFile()).toBe(path.join(tmpHome, '.bobby', 'projects.yml'));
    expect(inboxFile()).toBe(path.join(tmpHome, '.bobby', 'inbox.yml'));
  });

  test('touchProject registers the project containing the start dir', () => {
    touchProject(projA);
    const projects = listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ name: 'alpha', path: projA });
    expect(projects[0].last_touched).toBeTruthy();
  });

  test('touchProject outside any project is a silent no-op', () => {
    const outside = path.join(tmpHome, 'not-a-project');
    fs.mkdirSync(outside);
    expect(touchProject(outside)).toBeNull();
    expect(listProjects()).toHaveLength(0);
  });

  test('touching the same project twice upserts, not duplicates', () => {
    touchProject(projA);
    touchProject(projA);
    expect(listProjects()).toHaveLength(1);
  });

  test('registers multiple projects', () => {
    touchProject(projA);
    touchProject(projB);
    const names = listProjects().map(p => p.name).sort();
    expect(names).toEqual(['alpha', 'beta']);
  });

  test('listProjects prunes projects whose directory disappeared', () => {
    touchProject(projA);
    touchProject(projB);
    fs.rmSync(projB, { recursive: true });
    const projects = listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('alpha');
    // Pruned list is persisted
    const raw = YAML.parse(fs.readFileSync(registryFile(), 'utf8'));
    expect(raw.projects).toHaveLength(1);
  });

  test('a corrupt registry does not throw — it is treated as empty and self-heals', () => {
    // Simulate a torn concurrent write (the July 2026 corruption): trailing
    // garbage that makes the YAML unparseable.
    fs.mkdirSync(path.join(tmpHome, '.bobby'), { recursive: true });
    fs.writeFileSync(registryFile(), 'projects:\n  - name: a\n    path: /x\nZ\n');
    // Reads must not throw...
    expect(() => listProjects()).not.toThrow();
    // ...and the next write repairs the file so registration works again.
    expect(() => touchProject(projA)).not.toThrow();
    expect(listProjects().map(p => p.name)).toContain('alpha');
    // File is now valid YAML.
    expect(() => YAML.parse(fs.readFileSync(registryFile(), 'utf8'))).not.toThrow();
  });

  test('touchProject picks up a renamed project on next touch', () => {
    touchProject(projA);
    const rc = YAML.parse(fs.readFileSync(path.join(projA, '.bobbyrc.yml'), 'utf8'));
    rc.project = 'alpha-renamed';
    fs.writeFileSync(path.join(projA, '.bobbyrc.yml'), YAML.stringify(rc));
    touchProject(projA);
    expect(listProjects()[0].name).toBe('alpha-renamed');
  });
});
