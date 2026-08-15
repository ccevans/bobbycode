// lib/project.js
//
// Turn a one-line idea into a scaffolded project with an MVP epic (TKT-025).
//
// This was the body of the closure `commands/new.js` hands to commander, so the
// CLI was the only thing that could reach it. The app needs it twice over —
// onboarding (TKT-024) and registering a new project in studio mode (TKT-022) —
// and neither of those is a terminal, so the extraction is about the interface
// rather than the location:
//
//   * **`cwd` is an argument.** The old code used `process.cwd()`, which for a
//     server is the repo it is already serving — never where a new project
//     belongs.
//   * **Facts come back as values.** Nothing here writes to stdout. The handoff
//     the CLI prints (the epic id, the starter's dev command and URL, whether
//     the initial commit landed) is in the return value, so a web UI can render
//     the same information as a page.
//   * **Failures throw.** No `process.exit`, so a caller that has other work to
//     do survives one that fails; the CLI catches and exits exactly as before.
//   * **The best-effort commit reports rather than warns.** `commitError` is a
//     string the caller may show however it shows things.
//
// `scaffoldProject` / `loadStack` still come from `commands/init.js`, which is
// where `bobby init` has always kept them and where every existing test imports
// them from. They take no input and print nothing, so they are not the CLI
// coupling this ticket is about — but the import direction is backwards, and
// moving them into lib/ is the follow-up this note exists to record.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { scaffoldProject, loadStack } from '../commands/init.js';
import { aggregateAreas, aggregateHealthChecks } from './services.js';
import { renderTemplate } from './template.js';
import { createTicket, slugify, readTicket, writeTicket } from './tickets.js';
import { applyStarter } from './starters.js';

/**
 * Stacks `bobby new` will scaffold. Stacks with a built-in runnable starter
 * come first — they are the point of `new` — and framework stacks scaffold
 * Bobby only until they get one.
 *
 * Exported so the CLI's `--stack` help and any picker the app grows read from
 * one list. Two copies of this would drift the moment a starter is added.
 */
export const PROJECT_STACKS = [
  'node', 'web', 'blog', 'nextjs', 'rails-react', 'django',
  'python-flask', 'go', 'rust', 'polyglot', 'generic',
];

/** Bake the idea into the epic's description so plan/build know the goal. */
function injectIdea(ticketDir, idea) {
  const t = readTicket(ticketDir);
  if (!t) return;
  const body = t.content.replace(
    /## Description\n\n\[[^\]]*\]/,
    `## Description\n\n**The idea:** ${idea}\n\nThis is the MVP epic. Break it into the smallest set of tickets that make the ` +
    `idea real and runnable, then build them. Favor the shortest path to something a user can actually try.`
  );
  writeTicket(ticketDir, t.data, body);
}

/**
 * Scaffold a new Bobby project from an idea.
 *
 * @param {string} idea                  the one-line idea; becomes the MVP epic
 * @param {object} [options]
 * @param {string} [options.dir]         directory name (default: a slug of the idea)
 * @param {string} [options.stack]       one of PROJECT_STACKS (default: 'node')
 * @param {string} [options.cwd]         directory to create it IN (default: process.cwd())
 *
 * @returns {{
 *   root: string, dirName: string, stack: string, config: object,
 *   epic: object, starter: ?object, committed: boolean, commitError: ?string
 * }}
 *
 * @throws {Error} blank idea, unknown stack, or a target directory that exists
 *                 and is not empty. The directory is checked BEFORE anything is
 *                 written, so a refusal leaves the disk untouched.
 */
export function createProject(idea, { dir, stack: stackName = 'node', cwd = process.cwd() } = {}) {
  const text = String(idea || '').trim();
  if (!text) throw new Error('Give me an idea: bobby new "a habit tracker for runners"');
  if (!PROJECT_STACKS.includes(stackName)) {
    throw new Error(`Unknown stack "${stackName}". Valid: ${PROJECT_STACKS.join(', ')}`);
  }

  const dirName = (dir || slugify(text)).slice(0, 50).replace(/-+$/, '') || 'new-project';
  const root = path.resolve(cwd, dirName);
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
    throw new Error(`"${dirName}" already exists and isn't empty. Pick a name with --dir <name>.`);
  }
  fs.mkdirSync(root, { recursive: true });

  const stack = loadStack(stackName, root) || loadStack('generic', root);

  const bobbyDir = '.bobby';
  const configBase = {
    project: dirName,
    stack: stackName,
    target: 'claude-code',
    bobby_dir: bobbyDir,
    tickets_dir: `${bobbyDir}/tickets`,
    sessions_dir: `${bobbyDir}/sessions`,
    health_checks: stack.health_checks,
    areas: stack.areas,
    ticket_prefix: 'TKT',
    commands: { ...stack.commands },
    testing_tools: stack.testing_tools || ['curl'],
    max_retries: 3,
  };
  const config = {
    ...configBase,
    areas: aggregateAreas(configBase),
    health_checks: aggregateHealthChecks(configBase),
  };

  // Scaffold Bobby (identical to `bobby init`): .bobby/, .claude/, config, git init.
  scaffoldProject(root, config);

  // Lay down a runnable app skeleton if this stack has a built-in starter.
  // `date` seeds any dated content a starter ships (e.g. the blog's first post).
  const starter = applyStarter(stackName, root, {
    project: dirName,
    idea: text,
    date: new Date().toISOString().slice(0, 10),
  });

  // New-project niceties: .gitignore + README seeded with the idea.
  try {
    fs.writeFileSync(path.join(root, '.gitignore'), renderTemplate('gitignore.ejs', { stack: stackName }), 'utf8');
  } catch { /* gitignore is best-effort */ }
  const readmePath = path.join(root, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, `# ${dirName}\n\n> ${text}\n`, 'utf8');
  }

  // Capture the idea as the MVP epic.
  const ticketsDir = path.join(root, config.tickets_dir);
  const epic = createTicket(ticketsDir, {
    prefix: config.ticket_prefix,
    title: text,
    type: 'epic',
    priority: 'high',
    author: 'new',
  });
  injectIdea(epic.path, text);

  // Initial commit — best-effort, and REPORTED rather than warned about. A
  // machine with no git identity configured still gets a complete project; the
  // caller decides whether that is a line on a terminal or a line on a page.
  let committed = true;
  let commitError = null;
  try {
    execSync('git add -A', { cwd: root, stdio: 'pipe' });
    execSync(`git commit -m ${JSON.stringify(`Scaffold ${epic.id}: ${text}`)}`, { cwd: root, stdio: 'pipe' });
  } catch (e) {
    committed = false;
    commitError = e.message.split('\n')[0];
  }

  return { root, dirName, stack: stackName, config, epic, starter, committed, commitError };
}
