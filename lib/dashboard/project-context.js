// lib/dashboard/project-context.js
//
// The single mutable answer to "which project is the dashboard showing?" (TKT-022).
//
// `bobby app` and `bobby remote` bind one server to one machine, but a studio
// holds many projects (lib/studio.js, boards at .bobby/<project>/). Before this,
// switching projects meant quitting and restarting from another directory. A
// ProjectContext lets the running server move between them: the orchestrator and
// the API read the board paths from HERE, and `switchTo` re-points them in place.
//
// It is a THIN HOLDER, not a state machine. Switching is a reassignment of a few
// resolved paths — no teardown, no rebuild — which is exactly why a running agent
// in project A is undisturbed when the user switches to project B (the agent
// works in its own worktree and the shared process map is never touched here).
//
// The selection PERSISTS via `.bobby/active-project` (setActiveProject), the same
// per-developer file the CLI's `--project` resolution reads, so a page reload —
// or the next `bobby app` — lands back on the project you were on.

import path from 'path';
import { listStudioProjects } from '../config.js';
import { readProjectConfig, setActiveProject, getActiveProject } from '../studio.js';

export class ProjectContext {
  /**
   * @param {string} root      the studio (or single-project) root — where .bobby lives
   * @param {object} config    the resolved config; `config.studio` marks a studio
   */
  constructor(root, config) {
    this.root = root;
    this._studioConfig = config || {};
    this._studio = !!this._studioConfig.studio;

    // In a studio the starting project is the persisted one, else the first on
    // the board (listStudioProjects sorts, so "first" is stable). Off-studio
    // there is one board and `config.project` names it.
    const initial = this._studio
      ? (getActiveProject(root) || listStudioProjects(root)[0] || null)
      : (this._studioConfig.project || null);

    this._resolveTo(initial);
  }

  /**
   * Re-point every resolved path at `name`. In a studio the board lives at
   * .bobby/<name>/; off-studio it is the config's own tickets_dir. Absolute
   * paths throughout, because the consumers (orchestrator prompts, the API) run
   * from cwds that are not the studio root.
   */
  _resolveTo(name) {
    this._project = name;
    if (this._studio) {
      this._config = name
        ? { ...this._studioConfig, ...readProjectConfig(this.root, name) }
        : this._studioConfig;
      this._ticketsDir = name ? path.join(this.root, '.bobby', name, 'tickets') : null;
      this._sessionsDir = name ? path.join(this.root, '.bobby', name, 'sessions') : null;
    } else {
      // Off-studio the context is INERT: the caller already resolved the board
      // paths with resolveTicketsDir/resolveSessionsDir (which handle worktree-
      // root resolution, something this class does not), so we return null and
      // let the orchestrator fall back to them. A single-project dashboard thus
      // behaves exactly as it did before TKT-022 — only isStudio()/projectName
      // carry meaning here.
      this._config = this._studioConfig;
      this._ticketsDir = null;
      this._sessionsDir = null;
    }
  }

  /**
   * Switch to another project and persist the choice. Studio-only: a
   * single-project dashboard has nowhere to switch to, so this refuses rather
   * than pretend. An unknown name throws, naming it and listing the real ones,
   * before anything is re-pointed.
   */
  switchTo(name) {
    if (!this._studio) {
      throw new Error('Project switching is only available in a studio.');
    }
    const projects = listStudioProjects(this.root);
    if (!projects.includes(name)) {
      throw new Error(`No such project '${name}'. Studio projects: ${projects.join(', ') || '(none)'}.`);
    }
    this._resolveTo(name);
    setActiveProject(this.root, name);
    return this;
  }

  /** Whether project switching is available here. */
  isStudio() { return this._studio; }

  /** Every project the studio holds (just the current one off-studio). */
  listProjects() {
    if (this._studio) return listStudioProjects(this.root);
    return this._project ? [this._project] : [];
  }

  get projectName() { return this._project; }
  get config() { return this._config; }
  get ticketsDir() { return this._ticketsDir; }
  get sessionsDir() { return this._sessionsDir; }
}
