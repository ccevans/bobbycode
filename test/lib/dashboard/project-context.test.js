// test/lib/dashboard/project-context.test.js
//
// TKT-022: ProjectContext is the single mutable holder of "which project the
// dashboard is showing". It resolves the active project's board paths, switches
// between projects without a lifecycle event, and persists the selection via
// .bobby/active-project (so a reload lands back on the same project).
//
// Faithfully faked: real fs studio on disk (the only way listStudioProjects,
// readProjectConfig, setActiveProject and getActiveProject can be exercised —
// they all read/write real files under .bobby/). No git, no CLI.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectContext } from '../../../lib/dashboard/project-context.js';

/**
 * A studio on disk with the named projects. Each project is a `.bobby/<name>/`
 * carrying its own .bobbyrc.yml (what listStudioProjects keys on) and a tickets
 * dir. Returns the studio root.
 */
function makeStudio(tmp, projects) {
  const root = path.join(tmp, 'studio');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '.bobbyrc.yml'), 'studio: teststudio\n');
  for (const name of projects) {
    const dir = path.join(root, '.bobby', name);
    fs.mkdirSync(path.join(dir, 'tickets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.bobbyrc.yml'), `project: ${name}\nprefix: ${name.slice(0, 2).toUpperCase()}\n`);
  }
  return root;
}

describe('ProjectContext (TKT-022)', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-projctx-')));
  });
  afterEach(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  test('TC-1: initializes from the .bobby/active-project file', () => {
    const root = makeStudio(tmp, ['alpha', 'beta']);
    fs.writeFileSync(path.join(root, '.bobby', 'active-project'), 'beta');

    const pc = new ProjectContext(root, { studio: 'teststudio' });

    expect(pc.projectName).toBe('beta');
    expect(pc.ticketsDir).toBe(path.join(root, '.bobby', 'beta', 'tickets'));
    expect(pc.sessionsDir).toBe(path.join(root, '.bobby', 'beta', 'sessions'));
  });

  test('TC-2: falls back to the first project when there is no active-project file', () => {
    const root = makeStudio(tmp, ['alpha', 'beta']);

    const pc = new ProjectContext(root, { studio: 'teststudio' });

    // listStudioProjects sorts, so the first is alpha.
    expect(pc.projectName).toBe('alpha');
    expect(pc.ticketsDir).toBe(path.join(root, '.bobby', 'alpha', 'tickets'));
  });

  test('TC-3: switchTo re-scopes every path and persists the selection', () => {
    const root = makeStudio(tmp, ['alpha', 'beta']);
    const pc = new ProjectContext(root, { studio: 'teststudio' });
    expect(pc.projectName).toBe('alpha');

    pc.switchTo('beta');

    expect(pc.projectName).toBe('beta');
    expect(pc.ticketsDir).toBe(path.join(root, '.bobby', 'beta', 'tickets'));
    expect(pc.sessionsDir).toBe(path.join(root, '.bobby', 'beta', 'sessions'));
    expect(fs.readFileSync(path.join(root, '.bobby', 'active-project'), 'utf8').trim()).toBe('beta');
  });

  test('TC-4: switchTo throws on an unknown project, naming it', () => {
    const root = makeStudio(tmp, ['alpha', 'beta']);
    const pc = new ProjectContext(root, { studio: 'teststudio' });

    expect(() => pc.switchTo('nonexistent')).toThrow(/nonexistent/);
  });

  test('TC-12: isStudio reflects the config', () => {
    const root = makeStudio(tmp, ['alpha']);
    expect(new ProjectContext(root, { studio: 'teststudio' }).isStudio()).toBe(true);

    // A non-studio (single-board) project: no `studio` key, so switching is off.
    // The context is inert — board paths are null so the orchestrator falls back
    // to the caller's resolved dirs (which handle worktree-root resolution).
    const single = path.join(tmp, 'single');
    fs.mkdirSync(path.join(single, '.bobby', 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(single, '.bobbyrc.yml'), 'project: solo\n');
    const pc = new ProjectContext(single, { project: 'solo', tickets_dir: '.bobby/tickets' });
    expect(pc.isStudio()).toBe(false);
    expect(pc.projectName).toBe('solo');
    expect(pc.ticketsDir).toBeNull();
  });

  // The precedence bug. `config._project` is the answer lib/config.js already
  // computed from explicit arg > BOBBY_PROJECT > active-project file > sole
  // project. Re-deriving from the file alone dropped the top two rungs, so
  // `bobby app --project beta` served alpha's board while /api/config said beta.
  test('the config\'s already-resolved project wins over the active-project file', () => {
    const root = makeStudio(tmp, ['alpha', 'beta']);
    fs.writeFileSync(path.join(root, '.bobby', 'active-project'), 'alpha');

    // What readConfig produces for `--project beta` / BOBBY_PROJECT=beta.
    const pc = new ProjectContext(root, { studio: 'teststudio', _project: 'beta' });

    expect(pc.projectName).toBe('beta');
    expect(pc.ticketsDir).toBe(path.join(root, '.bobby', 'beta', 'tickets'));
    // Reading it must not rewrite the persisted default — `--project` is for
    // one command.
    expect(fs.readFileSync(path.join(root, '.bobby', 'active-project'), 'utf8').trim()).toBe('alpha');
  });

  // Switching must hand over the NEXT project's config, cascaded the way
  // readConfig cascades it — not a spread of the project file over whatever
  // config the server booted with. The old spread did both halves wrong.
  test('switching yields the target project\'s own config, with no leak from the last one', () => {
    const root = makeStudio(tmp, ['alpha', 'beta']);
    // An alpha-only key, and a prefix on each side.
    fs.appendFileSync(path.join(root, '.bobby', 'alpha', '.bobbyrc.yml'), 'area_only_alpha: yes\n');

    // Boot as the app does: a config that already has alpha cascaded into it.
    const pc = new ProjectContext(root, { studio: 'teststudio', _project: 'alpha', prefix: 'AL', area_only_alpha: 'yes' });
    expect(pc.config.ticket_prefix).toBe('AL');

    pc.switchTo('beta');

    expect(pc.config.ticket_prefix).toBe('BE');            // the cascade's own prefix rule
    expect(pc.config._project).toBe('beta');
    expect(pc.config.area_only_alpha).toBeUndefined();     // alpha's key did not survive
    expect(pc.config.tickets_dir).toBe('.bobby/beta/tickets');
  });

  test('listProjects returns the studio projects', () => {
    const root = makeStudio(tmp, ['alpha', 'beta', 'gamma']);
    const pc = new ProjectContext(root, { studio: 'teststudio' });
    expect(pc.listProjects()).toEqual(['alpha', 'beta', 'gamma']);
  });
});
