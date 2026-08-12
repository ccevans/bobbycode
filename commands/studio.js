// commands/studio.js — studio / project / repo commands.
import path from 'path';
import { findProjectRoot, listStudioProjects, configExists } from '../lib/config.js';
import { listTickets } from '../lib/tickets.js';
import {
  initStudio, createProject, setActiveProject, getActiveProject,
  addRepo, listRepos, isStudio, readProjectConfig, readStudioConfig, setupRepos,
  promoteV1ToStudio,
} from '../lib/studio.js';
import { success, error, bold, dim, warn } from '../lib/colors.js';

// Read-only / management commands: require a studio that already exists.
function studioRoot() {
  const root = findProjectRoot();
  if (!isStudio(root)) {
    throw new Error('Single-project setup. Add a second project (`bobby project new <name>`) or a repo (`bobby repo add …`) and it becomes a studio.');
  }
  return root;
}

// Growth commands (project new / repo add): auto-promote a single-board project
// into a studio in place, preserving its board as the first project. This is
// the "one model" collapse — no separate setup step.
function growStudioRoot() {
  const root = findProjectRoot();
  if (!isStudio(root)) promoteV1ToStudio(root);
  return root;
}

export function registerStudio(program) {
  const studio = program.command('studio').description('Manage the studio (a group of repos, many projects)');
  studio.command('init')
    .description('Turn the current directory into a studio (adds repos/ and project support)')
    .action(() => {
      try {
        // A studio is created in the current directory — bootstrap from an empty
        // dir, or promote an existing single-board project (preserving its board).
        let root;
        try { root = findProjectRoot(); } catch { root = process.cwd(); }
        if (isStudio(root)) { success(`Already a studio ('${readStudioConfig(root).studio}')`); return; }
        if (configExists(root)) promoteV1ToStudio(root);   // legacy project → first project
        else initStudio(root);                             // empty dir → fresh studio
        success(`Studio '${readStudioConfig(root).studio}' ready`);
        console.log(`  ${dim('repos/ created · add repos with `bobby repo add`, then `bobby project new`')}`);
      } catch (e) { error(e.message); process.exit(1); }
    });

  studio.command('setup')
    .description('Restore the repo group on a fresh checkout — clone any missing repo that has a url')
    .action(() => {
      try {
        const root = studioRoot();
        const results = setupRepos(root);
        console.log('');
        for (const r of results) {
          if (r.status === 'cloned') success(`cloned ${r.name} → ${r.path}`);
          else if (r.status === 'present') console.log(`  ${dim(`ok      ${r.name} (${r.path})`)}`);
          else warn(`${r.name}: missing and has no url — add it: bobby repo add ${r.name} <path|url>`);
        }
        console.log('');
      } catch (e) { error(e.message); process.exit(1); }
    });

  const project = program.command('project').description('Projects in this studio (each has its own board)');
  project.command('new <name>')
    .description('Create a project')
    .option('--prefix <prefix>', 'Ticket ID prefix (e.g. RO)')
    .option('--repos <names>', 'Comma-separated repos from the group this project uses')
    .action((name, opts) => {
      try {
        const root = growStudioRoot();
        const repos = opts.repos ? opts.repos.split(',').map(s => s.trim()).filter(Boolean) : [];
        const { config } = createProject(root, name, { prefix: opts.prefix, repos });
        if (!getActiveProject(root)) setActiveProject(root, name);
        success(`Project '${name}' created  [prefix ${config.prefix}]  repos: ${repos.join(', ') || '(none yet)'}`);
      } catch (e) { error(e.message); process.exit(1); }
    });
  project.command('use <name>')
    .description('Set the active project')
    .action((name) => {
      try { const root = studioRoot(); setActiveProject(root, name); success(`Active project → ${name}`); }
      catch (e) { error(e.message); process.exit(1); }
    });
  project.command('list')
    .description('List projects with board summary')
    .action(() => {
      try {
        const root = studioRoot();
        const active = getActiveProject(root);
        const names = listStudioProjects(root);
        console.log('');
        console.log(`  ${bold('Projects')}`);
        if (!names.length) { console.log(`  ${dim('None yet. Create one: bobby project new <name>')}`); console.log(''); return; }
        for (const name of names) {
          const cfg = readProjectConfig(root, name);
          let count = 0;
          try { count = listTickets(path.join(root, '.bobby', name, 'tickets')).length; } catch { /* ignore */ }
          const star = name === active ? bold('*') : ' ';
          const repos = (cfg.repos || []).join(', ');
          console.log(`  ${star} ${bold(name.padEnd(14))} ${String(count).padStart(3)} tickets   ${dim(`repos: [${repos}]`)}`);
        }
        console.log('');
      } catch (e) { error(e.message); process.exit(1); }
    });

  const repo = program.command('repo').description('The shared repo group any project can use');
  repo.command('add <name> <pathOrUrl>')
    .description('Add a repo to the group (clones a URL into repos/, or links a path)')
    .option('--stack <stack>', 'Stack hint (rails-react, nextjs, generic, …)')
    .option('--test <cmd>', 'Test command for this repo')
    .action((name, target, opts) => {
      try {
        const root = growStudioRoot();
        const entry = addRepo(root, name, target, { stack: opts.stack, test: opts.test });
        success(`Repo '${name}' added → ${entry.path}`);
      } catch (e) { error(e.message); process.exit(1); }
    });
  repo.command('list')
    .description('List repos in the group')
    .action(() => {
      try {
        const root = studioRoot();
        const repos = listRepos(root);
        console.log('');
        console.log(`  ${bold('Repo group')}`);
        if (!repos.length) { console.log(`  ${dim('Empty. Add one: bobby repo add <name> <path|url>')}`); console.log(''); return; }
        for (const r of repos) console.log(`  ${bold(r.name.padEnd(16))} ${dim(r.stack.padEnd(12))} ${r.path}`);
        console.log('');
      } catch (e) { error(e.message); process.exit(1); }
    });
}
