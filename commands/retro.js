// commands/retro.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot } from '../lib/config.js';
import { findTicket, listTickets, slugify } from '../lib/tickets.js';
import { success, error, bold, dim } from '../lib/colors.js';

/**
 * Parse run log files from .bobby/runs/ and extract metrics
 */
function parseRunLogs(runsDir, sinceDays = 7) {
  if (!fs.existsSync(runsDir)) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - sinceDays);

  const files = fs.readdirSync(runsDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();

  const runs = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(runsDir, file), 'utf8');

    // Extract date from filename: run-YYYYMMDD-HHmmss.md or feature-TKT-XXX-YYYYMMDD-HHmmss.md
    const dateMatch = file.match(/(\d{8})-(\d{6})\.md$/);
    if (!dateMatch) continue;
    const dateStr = dateMatch[1];
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const runDate = new Date(`${year}-${month}-${day}`);
    if (runDate < cutoff) continue;

    // Extract results table rows
    const tableRows = [];
    const rowPattern = /\|\s*(TKT-\d+|[A-Z]+-\d+)\s*\|\s*(\w+)\s*\|\s*(\d+)\s*\|\s*(.*?)\s*\|/g;
    let match;
    while ((match = rowPattern.exec(content)) !== null) {
      tableRows.push({
        ticket: match[1],
        finalStage: match[2],
        retries: parseInt(match[3], 10),
        outcome: match[4].trim(),
      });
    }

    const isFeature = file.startsWith('feature-');
    runs.push({
      file,
      date: `${year}-${month}-${day}`,
      isFeature,
      tickets: tableRows,
    });
  }

  return runs;
}

/**
 * Generate a weekly retrospective report
 */
function generateWeeklyRetro(config, root) {
  const ticketsDir = path.join(root, config.tickets_dir);
  const runsDir = path.join(root, config.runs_dir);
  const retroDir = path.join(ticketsDir, 'retrospectives');
  fs.mkdirSync(retroDir, { recursive: true });

  const dt = new Date().toISOString().split('T')[0];

  // Parse run logs from the past 7 days
  const runs = parseRunLogs(runsDir, 7);

  // Aggregate metrics
  let totalTickets = 0;
  let totalRetries = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  const rejectionStages = {};
  const ticketOutcomes = {};

  for (const run of runs) {
    for (const row of run.tickets) {
      totalTickets++;
      totalRetries += row.retries;
      if (row.outcome.startsWith('passed') || row.outcome.startsWith('shipped') || row.finalStage === 'done' || row.finalStage === 'shipping') {
        totalPassed++;
      } else {
        totalFailed++;
      }
      ticketOutcomes[row.ticket] = row;

      // Track which stage rejections came from
      if (row.retries > 0) {
        // We can't know the exact stage from the log, but retries imply review/test rejection
        rejectionStages['review/test'] = (rejectionStages['review/test'] || 0) + row.retries;
      }
    }
  }

  // Count tickets by current stage
  const allTickets = listTickets(ticketsDir);
  const stageCounts = {};
  for (const t of allTickets) {
    if (t.archived) continue;
    stageCounts[t.stage] = (stageCounts[t.stage] || 0) + 1;
  }

  // Count recently shipped (done in last 7 days)
  const recentlyDone = allTickets.filter(t =>
    t.stage === 'done' && t.updated && daysSince(t.updated) <= 7
  );

  // Count learnings added this week
  const learningsDir = path.join(root, '.claude', 'skills');
  let learningsCount = 0;
  if (fs.existsSync(learningsDir)) {
    const skills = fs.readdirSync(learningsDir).filter(d => {
      const p = path.join(learningsDir, d);
      return fs.statSync(p).isDirectory();
    });
    for (const skill of skills) {
      const learningsFile = path.join(learningsDir, skill, 'learnings.md');
      if (fs.existsSync(learningsFile)) {
        const content = fs.readFileSync(learningsFile, 'utf8');
        // Count lines that look like learning entries added this week
        const lines = content.split('\n').filter(l => l.includes(dt.slice(0, 7)));
        learningsCount += lines.length;
      }
    }
  }

  // Count retrospectives this week
  const retros = fs.existsSync(retroDir) ?
    fs.readdirSync(retroDir).filter(f => f.endsWith('.md') && !f.startsWith('weekly-')) : [];
  let weekRetros = 0;
  for (const r of retros) {
    const content = fs.readFileSync(path.join(retroDir, r), 'utf8');
    if (content.includes(`**Discovered:** ${dt.slice(0, 7)}`)) weekRetros++;
  }

  // Calculate averages
  const avgRetries = totalTickets > 0 ? (totalRetries / totalTickets).toFixed(1) : '0';
  const successRate = totalTickets > 0 ? Math.round((totalPassed / totalTickets) * 100) : 0;

  // Build report
  const report = `# Weekly Retrospective — ${dt}

## Summary

| Metric | Value |
|--------|-------|
| Pipeline runs | ${runs.length} |
| Tickets processed | ${totalTickets} |
| Tickets shipped | ${recentlyDone.length} |
| Success rate | ${successRate}% |
| Average retries | ${avgRetries} |
| Total rejections | ${totalRetries} |
| Learnings added | ${learningsCount} |
| Retrospectives filed | ${weekRetros} |

## Board Snapshot

| Stage | Count |
|-------|-------|
${Object.entries(stageCounts).map(([s, c]) => `| ${s} | ${c} |`).join('\n')}

## Pipeline Results

${runs.length > 0 ? runs.map(run => {
  const rows = run.tickets.map(t =>
    `| ${t.ticket} | ${t.finalStage} | ${t.retries} | ${t.outcome} |`
  ).join('\n');
  return `### ${run.file} (${run.date})

| Ticket | Final Stage | Retries | Outcome |
|--------|-------------|---------|---------|
${rows}`;
}).join('\n\n') : '_No pipeline runs this week._'}

## Rejection Hotspots

${totalRetries > 0 ?
  `Total rejection loops: ${totalRetries}. Most rejections came from the review/test stages. Consider adding learnings to \`.claude/skills/bobby-build/learnings.md\` to prevent repeat issues.` :
  '_No rejections this week._'}

## Recently Shipped

${recentlyDone.length > 0 ?
  recentlyDone.map(t => `- ${t.id}: ${t.title} (${t.type}, ${t.priority})`).join('\n') :
  '_No tickets shipped this week._'}

## Action Items

<!-- Fill in after reviewing the data above -->
- [ ] Review rejection patterns — are the same issues repeating?
- [ ] Check stale tickets — any blockers that need attention?
- [ ] Update learnings — capture anything new this week
`;

  const retroFile = path.join(retroDir, `weekly-${dt}.md`);
  fs.writeFileSync(retroFile, report, 'utf8');

  return { file: retroFile, report, recentlyDone, runs, totalTickets, successRate };
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr + 'T00:00:00');
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
}

export function registerRetro(program) {
  program
    .command('retro [id] [pattern]')
    .description('Create a retrospective from a ticket, or generate a weekly summary')
    .option('--weekly', 'Generate a weekly retrospective with aggregated metrics')
    .action((id, pattern, opts) => {
      try {
        const root = findProjectRoot();
        const config = readConfig(root);
        const ticketsDir = path.join(root, config.tickets_dir);

        // Weekly retro mode
        if (opts.weekly) {
          const result = generateWeeklyRetro(config, root);
          console.log('');
          console.log(`  ${bold('Weekly Retrospective')}`);
          console.log(`  ${dim(`${result.runs.length} pipeline runs, ${result.totalTickets} tickets processed, ${result.recentlyDone.length} shipped, ${result.successRate}% success rate`)}`);
          console.log('');
          success(`Created ${path.relative(root, result.file)}`);
          console.log('');
          console.log(result.report);
          return;
        }

        // Single ticket retro mode (original behavior)
        if (!id || !pattern) {
          error('Usage: bobby retro <id> <pattern>  or  bobby retro --weekly');
          process.exit(1);
        }

        const retroDir = path.join(ticketsDir, 'retrospectives');
        fs.mkdirSync(retroDir, { recursive: true });

        // Get next retro ID
        const counterFile = path.join(retroDir, '.retro-counter');
        let num = 0;
        if (fs.existsSync(counterFile)) {
          num = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10) || 0;
        }
        num++;
        fs.writeFileSync(counterFile, String(num), 'utf8');
        const retroId = `RETRO-${String(num).padStart(3, '0')}`;

        // Get ticket metadata
        const found = findTicket(ticketsDir, id);
        let ticketTitle = '', ticketPriority = '', ticketArea = '', rejectionHistory = '';
        const currentStage = found ? found.stage : 'unknown';
        if (found) {
          ticketTitle = found.data.title || '';
          ticketPriority = found.data.priority || '';
          ticketArea = found.data.area || '';
          const content = fs.readFileSync(path.join(found.path, 'ticket.md'), 'utf8');
          rejectionHistory = content.split('\n').filter(l => l.includes('REJECTED:')).join('\n') || '_No rejection history found._';
        }

        const dt = new Date().toISOString().split('T')[0];
        const slug = slugify(pattern);
        const retroFile = path.join(retroDir, `${retroId}--${slug}.md`);

        const retroContent = `# ${retroId}: ${pattern}

**Discovered:** ${dt}
**Source tickets:** ${id}
**Stage caught:** ${currentStage}
**Category:** <!-- code-quality | process | testing | security | performance -->

## Ticket Context
- **Title:** ${ticketTitle || 'Unknown'}
- **Priority:** ${ticketPriority || 'Unknown'}
- **Area:** ${ticketArea || 'Unknown'}

## Rejection History
${rejectionHistory}

## Problem
<!-- What went wrong -->

## Root Cause
<!-- Why it happened -->

## Fix
<!-- How to prevent it -->

## Applies To
<!-- Which skills/stages should check for this -->
`;
        fs.writeFileSync(retroFile, retroContent, 'utf8');
        success(`Created ${retroId} — ${pattern}`);
        console.log(`  → ${config.tickets_dir}/retrospectives/${retroId}--${slug}.md`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
