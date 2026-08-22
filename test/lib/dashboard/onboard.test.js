// test/lib/dashboard/onboard.test.js — BOB-024's backend, and the BOB-117 guard.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { onboardStudio, inferStack } from '../../../lib/dashboard/onboard.js';
import { initStudio } from '../../../lib/studio.js';
import { findProjectRoot } from '../../../lib/config.js';

describe('onboarding composes studio primitives (BOB-024)', () => {
  let tmp, root;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-onboard-'));
    root = path.join(tmp, 'studio');
    fs.mkdirSync(root, { recursive: true });
    execSync('git init -q', { cwd: root, stdio: 'pipe' });
    initStudio(root);
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('an idea becomes a repo, a project, and a real first ticket', () => {
    const r = onboardStudio(root, { idea: 'A site where local bakeries list day-old bread' });
    expect(r.project).toBe('a-site-where-local-bakeries-list-day-old');   // 40-char slug, trailing dash trimmed
    expect(r.stack).toBe('nextjs');

    // The repo exists, with git and a README carrying the idea
    const repo = path.join(root, 'repos', r.project);
    expect(fs.existsSync(path.join(repo, 'README.md'))).toBe(true);

    // The studio board exists with the first ticket in it
    const ticketDirs = fs.readdirSync(path.join(root, '.bobby', r.project, 'tickets'))
      .filter((d) => d.startsWith(r.ticketId));
    expect(ticketDirs.length).toBe(1);
  });

  test('THE BOB-117 GUARD: the repo carries no .bobbyrc.yml, so the studio resolves it', () => {
    // lib/project.js createProject writes one; using it here would shadow the
    // studio and send board writes to the repo's own board. The composition
    // must never produce that file.
    const r = onboardStudio(root, { idea: 'an api for tracking shipments' });
    const repo = path.join(root, 'repos', r.project);
    expect(fs.existsSync(path.join(repo, '.bobbyrc.yml'))).toBe(false);
    // ...and the proof by behaviour: from inside the repo, the project root IS
    // the studio.
    expect(findProjectRoot(repo)).toBe(root);
  });

  test('explicit stack wins; "auto" defers to inference', () => {
    const r1 = onboardStudio(root, { idea: 'a plain thing', stack: 'go' });
    expect(r1.stack).toBe('go');
    const r2 = onboardStudio(root, { idea: 'an api for things', stack: 'auto' });
    expect(r2.stack).toBe('go');
  });

  test('an empty idea is refused with a human message, not a crash', () => {
    expect(() => onboardStudio(root, { idea: '  ' })).toThrow(/Describe what you want/);
  });

  test('a colliding name is refused, naming the way out', () => {
    onboardStudio(root, { idea: 'twin project' });
    expect(() => onboardStudio(root, { idea: 'twin project' })).toThrow(/already exists/);
  });

  test('B2: a failed step unwinds — the studio is as it found it, retry works', async () => {
    // The wedge the review demonstrated: addRepo throws, the repo dir stays
    // populated, and the group entry blocks every retry. Force the addRepo
    // failure by pre-claiming the GROUP entry with a different path.
    const studio = await import('../../../lib/studio.js');
    studio.addRepo(root, 'twin-idea', '.', {});
    expect(() => onboardStudio(root, { idea: 'twin idea' })).toThrow(/already in the group/);

    // The unwind: the repo dir this flow created is gone again.
    expect(fs.existsSync(path.join(root, 'repos', 'twin-idea'))).toBe(false);

    // Resolve the real conflict the way a user could (rename the old entry) and
    // the same idea now succeeds — no hidden residue.
    const cfg = studio.readStudioConfig(root);
    delete cfg.repos['twin-idea'];
    studio.writeStudioConfig(root, cfg);
    const r = onboardStudio(root, { idea: 'twin idea' });
    expect(r.project).toBe('twin-idea');
    expect(fs.existsSync(path.join(root, '.bobby', 'twin-idea', 'tickets'))).toBe(true);
  });

  test('B3: the stack is whitelisted — client input never reaches loadStack as a path', () => {
    expect(() => onboardStudio(root, { idea: 'anything at all', stack: '../package' }))
      .toThrow(/Unknown stack/);
    expect(fs.existsSync(path.join(root, 'repos', 'anything-at-all'))).toBe(false);
  });

  test('N2: the collision refusal speaks human — no repo paths on a first-run screen', () => {
    onboardStudio(root, { idea: 'twin project' });
    let msg = '';
    try { onboardStudio(root, { idea: 'twin project' }); } catch (e) { msg = e.message; }
    expect(msg).toMatch(/describe this one a little differently/i);
    expect(msg).not.toMatch(/repos\//);
  });

  test('a non-studio root is refused — v1 dashboards already have a project', () => {
    const v1 = path.join(tmp, 'v1');
    fs.mkdirSync(v1, { recursive: true });
    fs.writeFileSync(path.join(v1, '.bobbyrc.yml'), 'project: solo\n');
    expect(() => onboardStudio(v1, { idea: 'anything' })).toThrow(/single-project/);
  });
});

describe('inferStack — "Let Bobby pick" is legible, not magic', () => {
  test('the words people actually use', () => {
    expect(inferStack('an API for shipments')).toBe('go');
    expect(inferStack('a script that scrapes prices')).toBe('python-flask');
    expect(inferStack('a blog about hiking')).toBe('blog');
    expect(inferStack('a content site with an admin')).toBe('rails-react');
    expect(inferStack('a site for bakeries')).toBe('nextjs');
    expect(inferStack('')).toBe('nextjs');
  });
});
