// commands/workspace.js — v2 workspace/project/repo commands.
import path from 'path';
import { findProjectRoot, listWorkspaceProjects } from '../lib/config.js';
import { listTickets } from '../lib/tickets.js';
import {
  upgradeToV2, createProject, setActiveProject, getActiveProject,
  addRepo, listRepos, isV2, readProjectConfig, setupRepos,
} from '../lib/workspace.js';
import { success, error, bold, dim, warn } from '../lib/colors.js';

function workspaceRoot() {
  const root = findProjectRoot();
  if (!isV2(root)) throw new Error('This is not a v2 workspace. Run `bobby workspace init` to enable projects.');
  return root;
}

export function registerWorkspace(program) {
  const ws = program.command('workspace').description('Manage the v2 workspace (a group of repos, many projects)');
  ws.command('init')
    .description('Turn the current directory into a v2 workspace (adds repos/ and project support)')
    .action(() => {
      try {
        // A workspace is created in the current directory — bootstrap from an
        // empty dir, or upgrade an existing v1 project in place.
        let root;
        try { root = findProjectRoot(); } catch { root = process.cwd(); }
        const cfg = upgradeToV2(root);
        success(`Workspace '${cfg.workspace}' ready (layout v2)`);
        console.log(`  ${dim('repos/ created · add repos with `bobby repo add`, then `bobby project new`')}`);
      } catch (e) { error(e.message); process.exit(1); }
    });

  ws.command('setup')
    .description('Restore the repo group on a fresh checkout — clone any missing repo that has a url')
    .action(() => {
      try {
        const root = workspaceRoot();
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

  const project = program.command('project').description('Projects in this workspace (each has its own board)');
  project.command('new <name>')
    .description('Create a project')
    .option('--prefix <prefix>', 'Ticket ID prefix (e.g. RO)')
    .option('--repos <names>', 'Comma-separated repos from the group this project uses')
    .action((name, opts) => {
      try {
        const root = workspaceRoot();
        const repos = opts.repos ? opts.repos.split(',').map(s => s.trim()).filter(Boolean) : [];
        const { config } = createProject(root, name, { prefix: opts.prefix, repos });
        if (!getActiveProject(root)) setActiveProject(root, name);
        success(`Project '${name}' created  [prefix ${config.prefix}]  repos: ${repos.join(', ') || '(none yet)'}`);
      } catch (e) { error(e.message); process.exit(1); }
    });
  project.command('use <name>')
    .description('Set the active project')
    .action((name) => {
      try { const root = workspaceRoot(); setActiveProject(root, name); success(`Active project → ${name}`); }
      catch (e) { error(e.message); process.exit(1); }
    });
  project.command('list')
    .description('List projects with board summary')
    .action(() => {
      try {
        const root = workspaceRoot();
        const active = getActiveProject(root);
        const names = listWorkspaceProjects(root);
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
        const root = workspaceRoot();
        const entry = addRepo(root, name, target, { stack: opts.stack, test: opts.test });
        success(`Repo '${name}' added → ${entry.path}`);
      } catch (e) { error(e.message); process.exit(1); }
    });
  repo.command('list')
    .description('List repos in the group')
    .action(() => {
      try {
        const root = workspaceRoot();
        const repos = listRepos(root);
        console.log('');
        console.log(`  ${bold('Repo group')}`);
        if (!repos.length) { console.log(`  ${dim('Empty. Add one: bobby repo add <name> <path|url>')}`); console.log(''); return; }
        for (const r of repos) console.log(`  ${bold(r.name.padEnd(16))} ${dim(r.stack.padEnd(12))} ${r.path}`);
        console.log('');
      } catch (e) { error(e.message); process.exit(1); }
    });
}
