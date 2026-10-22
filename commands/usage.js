// commands/usage.js
import { findProjectRoot } from '../lib/config.js';
import { transcriptsDirFor, collectRuns, rollup } from '../lib/usage.js';
import { bold, dim, error } from '../lib/colors.js';

const pct = x => `${Math.round(x * 100)}%`;

export function registerUsage(program) {
  program
    .command('usage')
    .description('What each Bobby agent costs per run — turns, context, minutes — from Claude Code transcripts')
    .option('--since <date>', 'Only runs started on or after this date (YYYY-MM-DD)')
    .option('--all', 'Include non-Bobby agents (Explore, general-purpose, ...)')
    .option('--dir <path>', 'Transcripts folder (default: ~/.claude/projects/<this project>)')
    .option('--json', 'Machine-readable output')
    .action((opts) => {
      try {
        const dir = opts.dir || transcriptsDirFor(findProjectRoot());
        const rows = rollup(collectRuns(dir, { since: opts.since || null, all: !!opts.all }));
        if (opts.json) { console.log(JSON.stringify(rows, null, 2)); return; }
        if (!rows.length) { console.log(`\n  ${dim('No agent runs found.')}\n`); return; }

        console.log('');
        console.log(`  ${bold('Agent usage')}  ${dim(`per run, medians unless noted${opts.since ? ` · since ${opts.since}` : ''}`)}`);
        console.log('');
        const head = ['agent', 'runs', 'turns', 'start', 'peak', 'ctx/run', 'out/run', 'min', 'shell reads', 'batched'];
        const body = rows.map(r => [
          r.agent, r.runs, Math.round(r.turns), `${Math.round(r.startK)}k`, `${Math.round(r.peakK)}k`,
          `${r.contextM.toFixed(1)}M`, `${Math.round(r.outputK)}k`, Math.round(r.minutes),
          pct(r.shellReadShare), pct(r.batchedShare),
        ].map(String));
        const w = head.map((h, i) => Math.max(h.length, ...body.map(b => b[i].length)));
        const line = cells => '  ' + cells.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('  ');
        console.log(dim(line(head)));
        for (const b of body) console.log(line(b));
        console.log('');
        console.log(`  ${dim('start/peak: context on the first and largest turn · ctx/run, out/run: means')}`);
        console.log(`  ${dim('shell reads: share of tool output from cat/sed/grep/head via Bash · batched: tool turns with 2+ calls')}`);
        console.log('');
      } catch (e) {
        error(e.message);
        process.exitCode = 1;
      }
    });
}
