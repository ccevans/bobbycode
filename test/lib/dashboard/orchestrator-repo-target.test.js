// test/lib/dashboard/orchestrator-repo-target.test.js
//
// TKT-069: the orchestrator worktrees / branches / locks / diffs / merges a
// ticket in its TARGET repo, resolved from the ticket's `repos` frontmatter —
// not always the launch repo the app was started in.
//
// Two suites. Fast UNIT tests drive `_resolveTargetRepo` directly (no git) for
// the precedence + Decision-1 logic. INTEGRATION tests use real git repos (the
// `initRepo` pattern from worktree.test.js) and call the real createWorkspace /
// getDiff / merge, asserting the worktree, branch, lock and diff land in the
// resolved repo. No agent is spawned — the assertions are on git state, not
// agent output.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { Orchestrator } from '../../../lib/dashboard/orchestrator.js';
import { WorkspaceStore } from '../../../lib/dashboard/state.js';
import { createTicket, moveTicket } from '../../../lib/tickets.js';
import { listWorktrees, resolveWorktreeRoot, computeWorktreePlacement } from '../../../lib/dashboard/worktree.js';
import { mainCheckoutLockPath, acquireMainCheckoutLock } from '../../../lib/dashboard/main-checkout-lock.js';

const git = (cwd, cmd) => execSync(`git ${cmd}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init -q -b main');
  git(dir, 'config user.email test@example.com');
  git(dir, 'config user.name Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  git(dir, 'add .');
  git(dir, 'commit -q -m "initial"');
  return dir;
}

/**
 * A studio with two real repos, `repos/launch` and `repos/pro`, a board under
 * `.bobby/<project>/tickets`, and an orchestrator rooted at the studio root —
 * exactly the shape `commands/app.js` constructs, where `this.repoRoot` IS the
 * studio root that `resolveRepoPath` expects.
 */
function makeStudio(tmp) {
  const studioRoot = path.join(tmp, 'studio');
  const launchPath = initRepo(path.join(studioRoot, 'repos', 'launch'));
  const proPath = initRepo(path.join(studioRoot, 'repos', 'pro'));
  const project = 'proj';
  const ticketsDir = path.join(studioRoot, '.bobby', project, 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });

  const config = {
    studio: 'studio',
    repo_group: { launch: { path: 'repos/launch' }, pro: { path: 'repos/pro' } },
    project_repos: ['launch'],
    dashboard: { worktree_root: '../wt' },
    git_conventions: {},
  };

  const store = new WorkspaceStore(path.join(studioRoot, '.bobby', project, 'workspaces.json'));
  const o = new Orchestrator({
    repoRoot: studioRoot,
    config,
    ticketsDir,
    sessionsDir: path.join(studioRoot, '.bobby', project, 'sessions'),
    agentsPath: null,
    store,
    sseHub: null,
  });
  return { o, studioRoot, launchPath, proPath, ticketsDir, config };
}

/** A legacy single-repo project: no studio, no repo group — today's behavior. */
function makeSingleRepo(tmp) {
  const launchPath = initRepo(path.join(tmp, 'launch'));
  const ticketsDir = path.join(tmp, 'board', 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });
  const config = {}; // no studio, no repo_group
  const store = new WorkspaceStore(path.join(tmp, 'board', 'workspaces.json'));
  const o = new Orchestrator({
    repoRoot: launchPath,
    config,
    ticketsDir,
    sessionsDir: path.join(tmp, 'board', 'sessions'),
    agentsPath: null,
    store,
    sseHub: null,
  });
  return { o, launchPath, ticketsDir, config };
}

/** Create a ticket on the board with the given repos, and move it to planning. */
function seedTicket(ticketsDir, { title, repos = null }) {
  const { id } = createTicket(ticketsDir, { prefix: 'TKT', title, repos });
  moveTicket(ticketsDir, id, 'planning', 'test');
  return id;
}

function hasBranch(repoRoot, branch) {
  return listWorktrees(repoRoot).some(w => w.branch === branch);
}

function commitOnWorktree(worktreePath, file, contents) {
  fs.writeFileSync(path.join(worktreePath, file), contents);
  git(worktreePath, 'add -A');
  git(worktreePath, 'commit -q -m "work"');
}

describe('orchestrator resolves a ticket to its target repo (TKT-069)', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-repotarget-')); });
  afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

  // TC1 — a ticket targeting a NON-launch repo worktrees + ships in that repo.
  test('TC1: a ticket targeting pro worktrees, diffs and merges in pro, not launch', async () => {
    const { o, launchPath, proPath, ticketsDir, config } = makeStudio(tmp);
    const id = seedTicket(ticketsDir, { title: 'pro work', repos: ['pro'] });

    const ws = o.createWorkspace({ ticketId: id, agent: 'plan' });

    // Resolved to pro, with pro's lock and pro's worktree root.
    expect(ws.repoRoot).toBe(proPath);
    expect(ws.repoRoot).not.toBe(launchPath);
    expect(ws.lockFile).toBe(mainCheckoutLockPath(proPath, config));
    expect(ws.worktreePath.startsWith(resolveWorktreeRoot(proPath, config))).toBe(true);

    // The branch lives in pro, and nowhere in launch.
    expect(hasBranch(proPath, ws.branch)).toBe(true);
    expect(hasBranch(launchPath, ws.branch)).toBe(false);

    // A committed change on the branch shows in the diff computed against pro.
    commitOnWorktree(ws.worktreePath, 'feature.txt', 'hi\n');
    const { diff } = o.getDiff(ws.id);
    expect(diff).toContain('feature.txt');

    // Merge lands the branch in pro's main; launch's main is untouched.
    await o.merge(ws.id);
    expect(git(proPath, 'log --oneline main')).toContain('work');
    expect(git(launchPath, 'log --oneline main')).not.toContain('work');
  });

  // TC2 — single-repo / non-studio case is byte-identical (regression guard).
  test('TC2: non-studio single-repo case resolves to this.repoRoot, unchanged', () => {
    const { o, launchPath, ticketsDir, config } = makeSingleRepo(tmp);
    const id = seedTicket(ticketsDir, { title: 'plain work', repos: null });

    const ws = o.createWorkspace({ ticketId: id, agent: 'plan' });

    // Resolution was skipped: identical to the launch repo and the default lock.
    expect(ws.repoRoot).toBe(launchPath);
    expect(ws.repoRoot).toBe(o.repoRoot);
    expect(ws.lockFile).toBe(o.lockFile);

    // Placement is exactly what the pre-change code computed.
    const expected = computeWorktreePlacement(launchPath, config, id, 'plan');
    expect(ws.worktreePath).toBe(expected.worktreePath);
    expect(ws.branch).toBe(expected.branch);

    expect(hasBranch(launchPath, ws.branch)).toBe(true);
  });

  // TC3 — a ticket naming TWO repos is refused at createWorkspace (Decision 1).
  test('TC3: a two-repo ticket throws before any worktree or record is created', () => {
    const { o, launchPath, proPath, ticketsDir } = makeStudio(tmp);
    const id = seedTicket(ticketsDir, { title: 'both', repos: ['launch', 'pro'] });

    const launchBefore = listWorktrees(launchPath).length;
    const proBefore = listWorktrees(proPath).length;

    let err;
    try { o.createWorkspace({ ticketId: id, agent: 'plan' }); }
    catch (e) { err = e; }

    expect(err).toBeDefined();
    // Names the ticket, both repos, and the way out.
    expect(err.message).toContain(id);
    expect(err.message).toContain('launch');
    expect(err.message).toContain('pro');
    expect(err.message).toMatch(/split|narrow/i);

    // No worktree created, no workspace record stored — the refusal is total.
    expect(listWorktrees(launchPath).length).toBe(launchBefore);
    expect(listWorktrees(proPath).length).toBe(proBefore);
    expect(o.store.list().length).toBe(0);
  });

  // TC4 — lock isolation: a run in repo A does not block a run in repo B.
  test('TC4: launch and pro workspaces get distinct, per-repo locks', async () => {
    const { o, launchPath, proPath, ticketsDir, config } = makeStudio(tmp);
    const idA = seedTicket(ticketsDir, { title: 'A', repos: ['launch'] });
    const idB = seedTicket(ticketsDir, { title: 'B', repos: ['pro'] });

    const wsA = o.createWorkspace({ ticketId: idA, agent: 'plan' });
    const wsB = o.createWorkspace({ ticketId: idB, agent: 'plan' });

    // Distinct paths, each under its own repo's .bobby.
    expect(wsA.lockFile).not.toBe(wsB.lockFile);
    expect(wsA.lockFile).toBe(mainCheckoutLockPath(launchPath, config));
    expect(wsB.lockFile).toBe(mainCheckoutLockPath(proPath, config));

    // Hold A's lock; B's merge (which takes B's lock) still succeeds.
    const lockA = acquireMainCheckoutLock(wsA.lockFile, { holder: 'test' });
    await expect(o.merge(wsB.id)).resolves.toBeDefined();

    // But a second acquire of the SAME (A) lock is refused — the lock works,
    // just per-repo.
    expect(() => acquireMainCheckoutLock(wsA.lockFile, { holder: 'again' })).toThrow();
    lockA.release();
  });

  // TC5 — precedence: repos > project_repos > this.repoRoot (unit, no git).
  test('TC5: _resolveTargetRepo precedence and fallback chain', () => {
    const { o, studioRoot, launchPath, proPath, config } = makeStudio(tmp);

    // 1. ticket.repos wins.
    expect(o._resolveTargetRepo({ data: { repos: ['pro'] } })).toEqual({
      repoRoot: proPath,
      lockFile: mainCheckoutLockPath(proPath, config),
    });

    // 2. no ticket.repos → project_repos[0] (launch).
    expect(o._resolveTargetRepo({ data: { repos: null } }).repoRoot).toBe(launchPath);

    // 3. no ticket.repos AND empty project_repos → fallback to this.repoRoot.
    o.config.project_repos = [];
    expect(o._resolveTargetRepo({ data: { repos: null } })).toEqual({
      repoRoot: studioRoot,
      lockFile: o.lockFile,
    });

    // 4. non-studio config → resolution skipped entirely (resolveRepoPath never
    //    called, so no throw on an empty group).
    const { o: solo, launchPath: soloRepo } = makeSingleRepo(tmp);
    expect(solo._resolveTargetRepo({ data: { repos: ['anything'] } })).toEqual({
      repoRoot: soloRepo,
      lockFile: solo.lockFile,
    });
  });

  // TC6 — unknown repo name is a diagnosable error.
  test('TC6: an unknown repo name throws, naming the repo and the ticket', () => {
    const { o } = makeStudio(tmp);
    let err;
    try { o._resolveTargetRepo({ data: { id: 'TKT-600', repos: ['nope'] } }); }
    catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.message).toContain('nope');
    expect(err.message).toContain('TKT-600');
  });

  // TC7 — persisted workspace without ws.repoRoot still merges/diffs (fallback).
  test('TC7: a pre-upgrade record with no repoRoot falls back to this.repoRoot', async () => {
    const { o, launchPath, ticketsDir } = makeSingleRepo(tmp);
    const id = seedTicket(ticketsDir, { title: 'legacy', repos: null });
    const ws = o.createWorkspace({ ticketId: id, agent: 'plan' });

    // Simulate a record written before the fields existed.
    o.store.update(ws.id, { repoRoot: undefined, lockFile: undefined });
    const stripped = o.store.get(ws.id);
    expect(stripped.repoRoot).toBeUndefined();
    expect(stripped.lockFile).toBeUndefined();

    commitOnWorktree(ws.worktreePath, 'legacy.txt', 'hi\n');

    // Both degrade to the constructor defaults (the launch repo) without error.
    const { diff } = o.getDiff(ws.id);
    expect(diff).toContain('legacy.txt');
    await o.merge(ws.id);
    expect(git(launchPath, 'log --oneline main')).toContain('work');
  });
});
