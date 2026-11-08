// commands/assign.js
import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { findTicket, writeTicket } from '../lib/tickets.js';
import { success, error, dim } from '../lib/colors.js';
import chalk from 'chalk';
import { tryLogEntry } from '../lib/session.js';
import { machineName, unfilledSections, renderHandoffTemplate, parseHandoff } from '../lib/owner.js';

/** Put a `> Handed off ...` line directly under the title, replacing an earlier one. */
function withHandoffLine(text, line) {
  const lines = text.split('\n').filter(l => !l.startsWith('> Handed off '));
  const titleIdx = lines.findIndex(l => l.startsWith('# '));
  if (titleIdx === -1) return `${line}\n\n${lines.join('\n')}`;
  lines.splice(titleIdx + 1, 0, '', line);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function registerAssign(program) {
  program
    .command('assign <id> <name>')
    .description('Assign ticket to someone')
    .option('--session <name>', 'Record the session that owns this ticket, and this machine, in owner:')
    .action((id, name, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const found = findTicket(ticketsDir, id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }

        if (opts.session !== undefined && !opts.session.trim()) {
          error('--session needs a session name');
          process.exit(1);
        }

        const data = { ...found.data };
        data.assigned = name;
        if (opts.session !== undefined) {
          data.owner = { session: opts.session.trim(), machine: machineName(), since: new Date().toISOString() };
        }
        data.updated = new Date().toISOString().split('T')[0];
        writeTicket(found.path, data, found.content);

        success(`${id} assigned to ${chalk.cyan(name)}`);
        if (data.owner && opts.session !== undefined) {
          console.log(`  owner: ${data.owner.session} on ${data.owner.machine}`);
        }
        tryLogEntry(root, config, { type: 'assign', ticket: id, agent: name });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  program
    .command('handoff <id>')
    .description('Hand a ticket to another session: fills progress.md, sets owner, commits the ticket')
    .requiredOption('--to <session>', 'Session taking over')
    .option('--machine <name>', 'Computer the receiving session runs on (otherwise left unset; the receiver claims it with assign --session)')
    .action((id, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = resolveTicketsDir(root, config);
        const found = findTicket(ticketsDir, id);
        if (!found) { error(`Ticket ${id} not found`); process.exit(1); }

        const to = opts.to.trim();
        if (!to) { error('--to needs a session name'); process.exit(1); }
        if (opts.machine !== undefined && !opts.machine.trim()) { error('--machine needs a computer name'); process.exit(1); }

        const progressPath = path.join(found.path, 'progress.md');
        const rel = path.relative(process.cwd(), progressPath) || progressPath;
        const text = fs.existsSync(progressPath) ? fs.readFileSync(progressPath, 'utf8') : '';

        if (parseHandoff(text).size < 6) {
          fs.writeFileSync(progressPath, renderHandoffTemplate(id, text), 'utf8');
          error(`Wrote the handoff template to ${rel}. Fill all six sections (write "none" where nothing applies), then rerun: bobby ticket handoff ${id} --to "${to}"`);
          process.exit(1);
        }
        const unfilled = unfilledSections(text);
        if (unfilled.length > 0) {
          error(`Handoff refused — still placeholders in: ${unfilled.join(', ')}. Edit ${rel} and rerun.`);
          process.exit(1);
        }

        const prev = found.data.owner;
        const since = new Date().toISOString();
        const machine = opts.machine !== undefined ? opts.machine.trim() : null;
        const line = `> Handed off ${since} from ${prev?.session ?? 'no recorded owner'}${prev?.machine ? ` on ${prev.machine}` : ''} to ${to}${machine ? ` on ${machine}` : ''}`;

        const data = { ...found.data, owner: { session: to, machine, since } };
        data.updated = since.split('T')[0];
        fs.writeFileSync(progressPath, withHandoffLine(text, line), 'utf8');
        writeTicket(found.path, data, found.content);

        let top = null;
        try {
          top = execSync('git rev-parse --show-toplevel', { cwd: found.path, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        } catch { /* not a git repo */ }
        if (top) {
          const rel = path.relative(top, found.path);
          try {
            // Own commit step: --only with a pathspec commits just the ticket folder and leaves other staged files staged.
            execFileSync('git', ['add', '--', rel], { cwd: top, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
            execFileSync('git', ['commit', '--only', '-m', `${id}: handoff to ${to}`, '--', rel], { cwd: top, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
          } catch (e) {
            const detail = String(e.stderr || e.message).trim();
            error(`${id}: owner and progress.md were written in ${rel} but NOT committed: ${detail}\n  Rerun the same command once git is free, or commit the ticket folder yourself.`);
            process.exit(1);
          }
        } else console.log(`  ${dim('not a git repo — not committed')}`);

        success(`${id} handed off to ${chalk.cyan(to)}`);
        tryLogEntry(root, config, { type: 'handoff', ticket: id, to });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
