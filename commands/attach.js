// commands/attach.js
import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { findTicket } from '../lib/tickets.js';
import { success, error, warn } from '../lib/colors.js';
import { summarizeLog, ensureGitignoreLines, ticketLogPattern } from '../lib/ticket-logs.js';

export function registerAttach(program) {
  program
    .command('attach <id> <files...>')
    .description('Attach files (screenshots, logs, etc.) to a ticket')
    .option('--dir <subdir>', 'Subdirectory inside test-evidence', 'screenshots')
    .option('--move', 'Move the file instead of copying (removes the original)')
    .option('--log', 'Treat files as logs: raw copy to the gitignored logs/ folder, plus a committed <name>.log.md summary')
    .option('--cmd <command>', 'With --log: the command that produced the log, recorded in the summary')
    .action((id, files, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);

        const found = findTicket(ticketsDir, id);
        if (!found) {
          error(`Ticket ${id} not found`);
          process.exit(1);
        }

        if (opts.log) {
          attachLogs(id, found.path, files, opts);
          return;
        }

        const destDir = path.join(found.path, 'test-evidence', opts.dir);
        fs.mkdirSync(destDir, { recursive: true });

        let attached = 0;
        for (const file of files) {
          const resolved = path.resolve(file);
          if (!fs.existsSync(resolved)) {
            warn(`File not found: ${file}`);
            continue;
          }
          const basename = path.basename(resolved);
          const dest = path.join(destDir, basename);
          fs.copyFileSync(resolved, dest);
          if (opts.move) fs.unlinkSync(resolved); // copy is the default — never destroy the original silently
          attached++;
        }

        if (attached === 0) {
          error('No files were attached');
          process.exit(1);
        }

        success(`Attached ${attached} file${attached === 1 ? '' : 's'} to ${id} in test-evidence/${opts.dir}/`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  program
    .command('untrack-logs')
    .description('One-time: stop tracking raw .log files under ticket folders (git rm --cached; files stay on disk; history untouched)')
    .option('--dry-run', 'List what would be untracked')
    .action((opts) => {
      try {
        untrackLogs(opts);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}

function attachLogs(id, ticketPath, files, opts) {
  const destDir = path.join(ticketPath, 'logs');
  fs.mkdirSync(destDir, { recursive: true });
  let attached = 0;
  for (const file of files) {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) {
      warn(`File not found: ${file}`);
      continue;
    }
    const base = path.basename(resolved);
    const rawName = base.endsWith('.log') ? base : `${base}.log`; // keeps the ignore pattern covering it
    const raw = path.join(destDir, rawName);
    // The source may already be the destination (logs/<name>.log in the ticket). Copying onto itself
    // is a no-op, and --move's unlink would then delete the only copy (raw logs are gitignored).
    const sameFile = fs.existsSync(raw) && fs.realpathSync(resolved) === fs.realpathSync(raw);
    if (!sameFile) fs.copyFileSync(resolved, raw);
    fs.writeFileSync(
      `${raw}.md`,
      summarizeLog(fs.readFileSync(resolved, 'utf8'), { name: rawName, source: resolved, command: opts.cmd }),
      'utf8'
    );
    if (opts.move && !sameFile) fs.unlinkSync(resolved);
    attached++;
    // exit 0 = ignored, 1 = not ignored, 128 = not a git repo (nothing to warn about)
    const ignored = spawnSync('git', ['check-ignore', '-q', raw], { cwd: ticketPath });
    if (ignored.status === 1) warn(`${rawName} is not gitignored — run bobby init --refresh`);
  }
  if (attached === 0) {
    error('No files were attached');
    process.exit(1);
  }
  success(`Attached ${attached} log${attached === 1 ? '' : 's'} to ${id}: summaries in logs/*.log.md (commit these), raw logs gitignored`);
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
}

function untrackLogs(opts) {
  const root = findProjectRoot();
  const config = readConfig(root); // not resolveTicketsDir: a studio's pattern covers every project's board
  try {
    git(['rev-parse', '--show-toplevel'], root);
  } catch {
    throw new Error('untrack-logs needs a git repo');
  }
  // git resolves pathspecs and prints paths relative to cwd, so run everything from the project root.
  const files = git(['ls-files', '-z', '--', `:(glob)${ticketLogPattern(config)}`], root).split('\0').filter(Boolean);

  if (files.length === 0) {
    success('No tracked ticket logs');
    return;
  }
  if (opts.dryRun) {
    files.forEach(f => console.log(`  ${f}`));
    console.log(`\n${files.length} tracked log file${files.length === 1 ? '' : 's'} would be untracked (dry run, nothing changed)`);
    return;
  }

  ensureGitignoreLines(root, [ticketLogPattern(config)]);
  for (let i = 0; i < files.length; i += 200) {
    git(['rm', '--cached', '--quiet', '--', ...files.slice(i, i + 200)], root);
  }
  success(`Untracked ${files.length} log file${files.length === 1 ? '' : 's'} (still on disk)`);
  console.log('  Removals are staged, history is untouched. Review and commit:');
  console.log('    git commit -m "Untrack raw ticket logs"');
}
