// lib/dashboard/onboard.js — "What do you want to build?" becomes a project (BOB-024).
//
// COMPOSED FROM STUDIO PRIMITIVES, deliberately. lib/project.js createProject
// scaffolds a standalone v1 project WITH ITS OWN .bobbyrc.yml — dropped under
// repos/ that file shadows the studio, and findProjectRoot resolves board writes
// to the repo instead of the studio board: the exact silent-wrong-board failure
// BOB-117 closed. So the repo here gets a starter, a README and git — never a
// bobbyrc. The studio's own config is what makes it resolvable.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { isStudio, addRepo, createProject as createStudioProject, readStudioConfig, writeStudioConfig } from '../studio.js';
import { loadStack } from '../../commands/init.js';
import { applyStarter } from '../starters.js';
import { createTicket } from '../tickets.js';
import { renderTemplate } from '../template.js';

/**
 * "Let Bobby pick" — the stack, inferred from the idea's own words.
 *
 * A person who cannot name a stack should not have to (the spec's first tile).
 * Deliberately tiny and legible: the words are the ones people actually use,
 * and anything unmatched lands on nextjs — a web app is the commonest thing a
 * non-dev means by "an app", and every stack here can be changed later.
 */
export function inferStack(idea) {
  const t = String(idea || '').toLowerCase();
  if (/\b(api|service|backend|webhook|endpoint)\b/.test(t)) return 'go';
  if (/\b(data|script|analysis|automation|scrape|report)\b/.test(t)) return 'python-flask';
  if (/\b(blog|newsletter|posts?)\b/.test(t)) return 'blog';
  if (/\b(admin|cms|back.?office|content)\b/.test(t)) return 'rails-react';
  return 'nextjs';
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'new-project';

/**
 * Idea → repo + studio project + first ticket. Returns what the app needs to
 * land the user on Home with something real to run.
 *
 * @returns {{ project: string, ticketId: string, stack: string }}
 */
export function onboardStudio(root, { idea, stack } = {}) {
  const text = String(idea || '').trim();
  if (!text) throw new Error('Describe what you want to build first.');
  if (!isStudio(root)) {
    throw new Error('Onboarding creates a studio project — this dashboard is single-project.');
  }
  // The stack names a directory under stacks/ — client input never becomes a
  // path segment unvalidated (review B3: '../package' reached loadStack and was
  // recorded into the studio config verbatim).
  const VALID = new Set(['auto', 'node', 'web', 'blog', 'nextjs', 'rails-react', 'django', 'python-flask', 'go', 'rust', 'polyglot', 'generic']);
  if (stack && !VALID.has(stack)) throw new Error(`Unknown stack "${String(stack).slice(0, 40)}".`);
  const chosen = stack && stack !== 'auto' ? stack : inferStack(text);
  const name = slugify(text);
  const repoDir = path.join(root, 'repos', name);
  if (fs.existsSync(repoDir) && fs.readdirSync(repoDir).length > 0) {
    throw new Error(`A project named "${name}" already exists — describe this one a little differently.`);
  }

  // Partial failure must not wedge (review B2: a failed addRepo left a populated
  // repo dir; clearing it as the message said then hit the group entry, a state
  // only hand-editing the studio config could fix). We know exactly what this
  // flow creates, so it unwinds what it created on any throw — a failed onboard
  // leaves the studio as it found it, and retrying the same idea just works.
  const undo = [];
  const unwind = () => { for (const fn of undo.reverse()) { try { fn(); } catch { /* best effort */ } } };

  // The repo: skeleton, git, README seeded with the idea — and NO .bobbyrc.yml.
  fs.mkdirSync(repoDir, { recursive: true });
  undo.push(() => fs.rmSync(repoDir, { recursive: true, force: true }));
  try {
  const stackDef = loadStack(chosen, repoDir) || loadStack('generic', repoDir);
  applyStarter(chosen, repoDir, { project: name, idea: text, date: new Date().toISOString().slice(0, 10) });
  try { fs.writeFileSync(path.join(repoDir, '.gitignore'), renderTemplate('gitignore.ejs', { stack: chosen }), 'utf8'); } catch { /* template optional */ }
  if (!fs.existsSync(path.join(repoDir, 'README.md'))) {
    fs.writeFileSync(path.join(repoDir, 'README.md'), `# ${name}\n\n${text}\n`);
  }
  try {
    execSync('git init -q && git add -A && git commit -q -m "bobby: new project" --allow-empty', { cwd: repoDir, stdio: 'pipe' });
  } catch { /* no git identity: the repo still works, the studio can commit later */ }

  // The studio wiring: group entry + project board.
  addRepo(root, name, path.join('repos', name), { stack: chosen });
  undo.push(() => removeRepoEntry(root, name));
  createStudioProject(root, name, { repos: [name] });
  undo.push(() => fs.rmSync(path.join(root, '.bobby', name), { recursive: true, force: true }));

  // The first ticket — a real one, from the idea, so Home has a next action.
  const ticketsDir = path.join(root, '.bobby', name, 'tickets');
  const ticket = createTicket(ticketsDir, {
    title: text.length > 70 ? `${text.slice(0, 67)}…` : text,
    type: 'feature',
    priority: 'high',
    description: `${text}\n\n(Filed by onboarding — refine with \`bobby run plan\`.)`,
  });
  return { project: name, ticketId: ticket.id, stack: chosen, healthChecks: stackDef.health_checks || [] };
  } catch (e) {
    unwind();
    throw e;
  }
}

/** Drop one repo-group entry — the unwind for addRepo. */
function removeRepoEntry(root, name) {
  const cfg = readStudioConfig(root);
  if (cfg.repos && cfg.repos[name]) { delete cfg.repos[name]; writeStudioConfig(root, cfg); }
}
