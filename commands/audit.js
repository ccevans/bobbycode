// commands/audit.js
import chalk from 'chalk';
import { readConfig, findProjectRoot, resolveTicketsDir } from '../lib/config.js';
import { auditRepo, findingToTicket, AREAS } from '../lib/audit.js';
import { listPacks, findPack } from '../lib/packs.js';
import { checkPackLicense, licenseHelp } from '../lib/license.js';
import { createTicket } from '../lib/tickets.js';
import { bold, dim, success, error } from '../lib/colors.js';
import { tryLogEntry } from '../lib/session.js';

const SEVERITY_COLOR = {
  critical: chalk.red,
  high: chalk.redBright,
  medium: chalk.yellow,
  low: chalk.dim,
};

function scoreColor(score) {
  if (score >= 90) return chalk.green;
  if (score >= 70) return chalk.yellow;
  return chalk.red;
}

function bar(score, width = 24) {
  const filled = Math.round((score / 100) * width);
  return scoreColor(score)('█'.repeat(filled)) + dim('░'.repeat(width - filled));
}

export function registerAudit(program) {
  program
    .command('audit')
    .description('Score this codebase on production readiness — the guards between a prototype and something you can put customers on')
    .option('--pack <ids>', 'Also score against platform pack(s) — comma-separated, or "all" for every installed pack')
    .option('--tickets', 'Create a ticket for each gap, ready for bobby go')
    .option('--json', 'Machine-readable output')
    .option('--all', 'Also list the checks that passed')
    .action((opts) => {
      try {
        // Audit works on any repo — a project Bobby has never touched is the
        // whole point, so fall back to the working directory.
        let root;
        try { root = findProjectRoot(); } catch { root = process.cwd(); }

        // Packs add domain expectations on top of the baseline: what a
        // multi-tenant SaaS (or marketplace, or AI product) still needs.
        let packs = [];
        if (opts.pack) {
          if (opts.pack === 'all') {
            // "all" quietly uses what you are entitled to, rather than erroring.
            packs = listPacks(root).filter((p) => checkPackLicense(p).ok);
          } else {
            for (const id of opts.pack.split(',').map((s) => s.trim()).filter(Boolean)) {
              const pack = findPack(id, root);
              if (!pack) throw new Error(`No pack "${id}" installed. Run: bobby pack list`);
              const lic = checkPackLicense(pack);
              if (!lic.ok) throw new Error(licenseHelp(lic));
              packs.push(pack);
            }
          }
        }

        const result = auditRepo(root, packs.length > 0 ? { packs } : {});

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log('');
        const packLabel = packs.length > 0 ? ` ${dim(`+ ${packs.map((p) => p.name).join(', ')}`)}` : '';
        console.log(`  ${bold('Production readiness')}${packLabel}  ${dim(`— ${result.fileCount} files scanned`)}`);
        console.log('');
        console.log(`  ${bar(result.score)}  ${scoreColor(result.score)(bold(`${result.score}/100`))}  ${dim(result.grade)}`);
        console.log('');

        for (const key of Object.keys(AREAS)) {
          const area = result.byArea[key];
          if (area.score === null) continue;
          const label = area.label.padEnd(20);
          console.log(`    ${label} ${scoreColor(area.score)(String(area.score).padStart(3))}${dim('/100')}  ${dim(`${area.passed}/${area.total} checks`)}`);
        }
        console.log('');

        if (result.findings.length === 0) {
          console.log(`  ${chalk.green('Every check passed.')} ${dim('Re-run after changes to keep it that way.')}`);
          console.log('');
          return;
        }

        console.log(`  ${bold(`${result.findings.length} gap(s)`)}  ${dim('— worst first')}`);
        console.log('');
        for (const f of result.findings) {
          const tag = SEVERITY_COLOR[f.severity](`[${f.severity.toUpperCase()}]`);
          console.log(`  ${tag} ${bold(f.title)}`);
          console.log(`      ${dim(f.why)}`);
          console.log(`      ${dim(`saw: ${f.detail}`)}`);
          console.log(`      ${dim('fix:')} ${f.fix}`);
          console.log('');
        }

        if (opts.all && result.passed.length > 0) {
          console.log(`  ${bold('Passing')}`);
          for (const p of result.passed) {
            console.log(`    ${chalk.green('✓')} ${p.title}  ${dim(p.detail)}`);
          }
          console.log('');
        }

        if (!opts.tickets) {
          console.log(`  ${dim('Turn these into work:')}  bobby audit --tickets`);
          console.log('');
          return;
        }

        // --tickets: seed the backlog so `bobby go` can start closing gaps.
        const root2 = safeProjectRoot();
        if (!root2) {
          console.log(`  ${dim('Not a Bobby project yet — run')} bobby init ${dim('here first, then')} bobby audit --tickets`);
          console.log('');
          return;
        }
        const config = readConfig(root2);
        const ticketsDir = resolveTicketsDir(root2, config);
        const created = [];
        for (const f of result.findings) {
          const fields = findingToTicket(f);
          const t = createTicket(ticketsDir, { prefix: config.ticket_prefix, author: 'bobby-audit', ...fields });
          created.push({ id: t.id, title: fields.title, workflow: fields.workflow });
        }
        console.log('');
        for (const c of created) {
          success(`${c.id} — ${c.title} ${dim(`(${c.workflow})`)}`);
        }
        console.log('');
        console.log(`  ${bold('Next')}  ${dim('— start closing the worst gap')}`);
        console.log('    bobby go');
        console.log('');
        tryLogEntry(root2, config, { type: 'audit', score: result.score, gaps: result.findings.length, created: created.map((c) => c.id) });
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}

function safeProjectRoot() {
  try { return findProjectRoot(); } catch { return null; }
}
