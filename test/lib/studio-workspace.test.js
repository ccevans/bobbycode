// Editor workspace generation for a studio (BOB-153).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initStudio, createProject, setActiveProject, addRepo } from '../../lib/studio.js';
import { createTicket, moveTicket } from '../../lib/tickets.js';
import {
  buildSettings, buildExtensions, studioIndex, renderIndex, writeWorkspace,
} from '../../lib/studio-workspace.js';

describe('studio workspace', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-ws-'));
    initStudio(root);
    for (const name of ['ui', 'api']) fs.mkdirSync(path.join(root, 'repos', name), { recursive: true });
    addRepo(root, 'ui', path.join(root, 'repos', 'ui'), { stack: 'nextjs' });
    addRepo(root, 'api', path.join(root, 'repos', 'api'), { stack: 'rails' });
    createProject(root, 'alpha', { prefix: 'AL', repos: ['ui', 'api'] });
    createProject(root, 'beta', { prefix: 'BE', repos: ['ui'] });
    setActiveProject(root, 'alpha');
    const alphaTickets = path.join(root, '.bobby', 'alpha', 'tickets');
    const t1 = createTicket(alphaTickets, { prefix: 'AL', title: 'one' });
    createTicket(alphaTickets, { prefix: 'AL', title: 'two' });
    moveTicket(alphaTickets, t1.id, 'building', 'test');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('settings scan git two levels so repos under repos/ reach Source Control', () => {
    const s = buildSettings(root);
    expect(s['git.repositoryScanMaxDepth']).toBe(2);
  });

  test('excludes are the union of shared noise and every stack in the group', () => {
    const s = buildSettings(root);
    expect(s['search.exclude']['**/node_modules']).toBe(true);   // shared
    expect(s['search.exclude']['**/.next']).toBe(true);          // nextjs
    expect(s['search.exclude']['**/vendor/bundle']).toBe(true);  // rails
    expect(s['search.exclude']['**/target']).toBeUndefined();    // rust — not in the group
    // watcher mirrors search, with the /** suffix VS Code's watcher wants
    expect(s['files.watcherExclude']['**/.next/**']).toBe(true);
  });

  test('extensions follow the stacks, deduped', () => {
    const { recommendations } = buildExtensions(root);
    expect(recommendations).toContain('shopify.ruby-lsp');
    expect(recommendations).toContain('dbaeumer.vscode-eslint');
    expect(new Set(recommendations).size).toBe(recommendations.length);
  });

  test('index lists every project with prefix, repos, ticket counts by stage, and the active marker', () => {
    const idx = studioIndex(root);
    expect(idx.projects.map(p => p.name)).toEqual(['alpha', 'beta']);
    const alpha = idx.projects.find(p => p.name === 'alpha');
    expect(alpha.prefix).toBe('AL');
    expect(alpha.repos).toEqual(['ui', 'api']);
    expect(alpha.tickets).toBe(2);
    expect(alpha.byStage).toEqual({ backlog: 1, building: 1 });
    expect(alpha.active).toBe(true);
    expect(idx.projects.find(p => p.name === 'beta').active).toBe(false);
    expect(idx.repos.map(r => r.name)).toEqual(['ui', 'api']);
  });

  test('STUDIO.md names every project and repo and flags a repo with no origin', () => {
    const md = renderIndex(studioIndex(root));
    expect(md).toMatch(/^# /);
    for (const n of ['alpha', 'beta', 'ui', 'api']) expect(md).toContain(`**${n}**`);
    expect(md).toContain('`AL`');
    expect(md).toContain('backlog 1 · building 1');
    // the fixture repos are plain dirs with no origin — say so, it matters for setup
    expect(md).toMatch(/none — cannot be restored/);
  });

  test('writeWorkspace writes the three files and reports them', () => {
    const r = writeWorkspace(root);
    expect(r.files).toEqual(['.vscode/settings.json', '.vscode/extensions.json', 'STUDIO.md']);
    for (const f of r.files) expect(fs.existsSync(path.join(root, f))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, '.vscode', 'settings.json'), 'utf8'))['git.repositoryScanMaxDepth']).toBe(2);
  });

  test('dry run writes nothing', () => {
    writeWorkspace(root, { dryRun: true });
    expect(fs.existsSync(path.join(root, '.vscode'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'STUDIO.md'))).toBe(false);
  });

  test('re-running merges: the user\'s own settings and extensions survive, Bobby\'s keys win', () => {
    fs.mkdirSync(path.join(root, '.vscode'));
    fs.writeFileSync(path.join(root, '.vscode', 'settings.json'), JSON.stringify({
      'editor.fontSize': 15,                 // the user's — must survive
      'git.repositoryScanMaxDepth': 1,       // Bobby's — must be corrected
    }));
    fs.writeFileSync(path.join(root, '.vscode', 'extensions.json'), JSON.stringify({
      recommendations: ['someone.custom-ext'],
    }));
    writeWorkspace(root);
    const s = JSON.parse(fs.readFileSync(path.join(root, '.vscode', 'settings.json'), 'utf8'));
    expect(s['editor.fontSize']).toBe(15);
    expect(s['git.repositoryScanMaxDepth']).toBe(2);
    const e = JSON.parse(fs.readFileSync(path.join(root, '.vscode', 'extensions.json'), 'utf8'));
    expect(e.recommendations).toContain('someone.custom-ext');
    expect(e.recommendations).toContain('anthropic.claude-code');
  });

  test('STUDIO.md is regenerated whole, so a stale hand edit does not survive', () => {
    writeWorkspace(root);
    fs.appendFileSync(path.join(root, 'STUDIO.md'), '\nHAND EDIT\n');
    writeWorkspace(root);
    expect(fs.readFileSync(path.join(root, 'STUDIO.md'), 'utf8')).not.toContain('HAND EDIT');
  });
});
