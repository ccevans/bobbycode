// commands/retro.js
import fs from 'fs';
import path from 'path';
import { readConfig, findProjectRoot, resolveTicketsDir, resolveSessionsDir } from '../lib/config.js';
import { findTicket, listTickets, slugify } from '../lib/tickets.js';
import { success, error, bold, dim } from '../lib/colors.js';
import { listSessions, readSession } from '../lib/session.js';
import { autoSync } from '../lib/auto-sync.js';

/**
 * Parse session logs from .bobby/sessions/ and extract metrics
 */
function parseSessionLogs(sessionsDir, sinceDays = 7) {
  const sessions = listSessions(sessionsDir);
  const empty = { sessions: [], rejectionReasons: {}, agentRejections: {}, stageDurations: {}, totalDuration: 0, ticketsProcessed: new Set(), totalRejections: 0, ticketOutcomes: {} };
  if (sessions.length === 0) return empty;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - sinceDays);

  const recentSessions = sessions.filter(s => s.startTime && s.startTime >= cutoff);
  const rejectionReasons = {};
  const agentRejections = {};
  const stageDurations = {};
  const ticketsProcessed = new Set();
  const ticketOutcomes = {}; // ticket -> { finalStage, retries }
  let totalDuration = 0;
  let totalRejections = 0;

  for (const session of recentSessions) {
    totalDuration += session.durationMs;
    const entries = readSession(sessionsDir, session.id);
    const moves = entries.filter(e => e.type === 'move');

    // Track per-ticket outcomes
    for (const move of moves) {
      ticketsProcessed.add(move.ticket);
      if (!ticketOutcomes[move.ticket]) ticketOutcomes[move.ticket] = { finalStage: move.to, retries: 0 };
      ticketOutcomes[move.ticket].finalStage = move.to;

      if (move.detail?.startsWith('REJECTED')) {
        totalRejections++;
        ticketOutcomes[move.ticket].retries++;
        const reason = move.detail.replace('REJECTED: ', '');
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;

        // Find the last assign before this rejection to identify the agent
        const moveIdx = entries.indexOf(move);
        const priorAssign = entries.slice(0, moveIdx).reverse().find(e => e.type === 'assign' && e.ticket === move.ticket);
        const agent = priorAssign?.agent || 'unknown';
        agentRejections[agent] = (agentRejections[agent] || 0) + 1;
      }
    }

    // Track stage durations
    const lastMoveByTicket = {};
    for (const move of moves) {
      if (lastMoveByTicket[move.ticket]) {
        const prev = lastMoveByTicket[move.ticket];
        const stage = prev.to;
        const elapsed = new Date(move.ts) - new Date(prev.ts);
        if (!stageDurations[stage]) stageDurations[stage] = [];
        stageDurations[stage].push(elapsed);
      }
      lastMoveByTicket[move.ticket] = move;
    }
  }

  return { sessions: recentSessions, rejectionReasons, agentRejections, stageDurations, totalDuration, ticketsProcessed, totalRejections, ticketOutcomes };
}

/**
 * Generate a weekly retrospective report
 */
function generateWeeklyRetro(config, root) {
  const ticketsDir = resolveTicketsDir(root, config);
  const sessionsDir = resolveSessionsDir(root, config);
  const retroDir = path.join(ticketsDir, 'retrospectives');
  fs.mkdirSync(retroDir, { recursive: true });

  const dt = new Date().toISOString().split('T')[0];

  // Parse session logs from the past 7 days
  const sessionData = parseSessionLogs(sessionsDir, 7);

  // Derive metrics from session data
  const totalTickets = sessionData.ticketsProcessed.size;
  const totalRejections = sessionData.totalRejections;
  const ticketOutcomes = sessionData.ticketOutcomes;
  const passedStages = ['done', 'shipping'];
  const totalPassed = Object.values(ticketOutcomes).filter(t => passedStages.includes(t.finalStage)).length;
  const avgRetries = totalTickets > 0 ? (totalRejections / totalTickets).toFixed(1) : '0';
  const successRate = totalTickets > 0 ? Math.round((totalPassed / totalTickets) * 100) : 0;

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

  // Build session results table
  const sessionResultsTable = Object.keys(ticketOutcomes).length > 0
    ? Object.entries(ticketOutcomes).map(([ticket, data]) => {
      const outcome = passedStages.includes(data.finalStage) ? 'passed' : data.finalStage;
      return `| ${ticket} | ${data.finalStage} | ${data.retries} | ${outcome} |`;
    }).join('\n')
    : null;

  // Build report
  const report = `# Weekly Retrospective — ${dt}

## Summary

| Metric | Value |
|--------|-------|
| Sessions | ${sessionData.sessions.length} |
| Tickets processed | ${totalTickets} |
| Tickets shipped | ${recentlyDone.length} |
| Success rate | ${successRate}% |
| Average retries | ${avgRetries} |
| Total rejections | ${totalRejections} |
| Avg session duration | ${sessionData.sessions.length > 0 ? formatDurationMs(sessionData.totalDuration / sessionData.sessions.length) : 'N/A'} |
| Learnings added | ${learningsCount} |
| Retrospectives filed | ${weekRetros} |

## Board Snapshot

| Stage | Count |
|-------|-------|
${Object.entries(stageCounts).map(([s, c]) => `| ${s} | ${c} |`).join('\n')}

## Session Results

${sessionResultsTable ? `| Ticket | Final Stage | Retries | Outcome |
|--------|-------------|---------|---------|
${sessionResultsTable}` : '_No sessions this week._'}

## Rejection Hotspots

${totalRejections > 0
  ? `Total rejections: ${totalRejections}. Consider adding learnings to \`.claude/skills/bobby-build/learnings.md\` to prevent repeat issues.`
  : '_No rejections this week._'}
${Object.keys(sessionData.rejectionReasons).length > 0 ? `
### Top Rejection Reasons

| Reason | Count |
|--------|-------|
${Object.entries(sessionData.rejectionReasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => `| ${reason} | ${count} |`).join('\n')}
` : ''}
${Object.keys(sessionData.agentRejections).length > 0 ? `
### Rejection Rate by Agent

| Agent | Rejections |
|-------|------------|
${Object.entries(sessionData.agentRejections).sort((a, b) => b[1] - a[1]).map(([agent, count]) => `| ${agent} | ${count} |`).join('\n')}
` : ''}
${Object.keys(sessionData.stageDurations).length > 0 ? `
### Avg Time per Stage

| Stage | Avg Duration | Transitions |
|-------|-------------|-------------|
${Object.entries(sessionData.stageDurations).map(([stage, times]) => {
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return `| ${stage} | ${formatDurationMs(avg)} | ${times.length} |`;
}).join('\n')}
` : ''}

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

  return { file: retroFile, report, recentlyDone, sessionData, totalTickets, successRate };
}

function formatDurationMs(ms) {
  if (ms < 1000) return '0s';
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
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
        const ticketsDir = resolveTicketsDir(root, config);

        // Weekly retro mode
        if (opts.weekly) {
          const result = generateWeeklyRetro(config, root);
          console.log('');
          console.log(`  ${bold('Weekly Retrospective')}`);
          console.log(`  ${dim(`${result.sessionData.sessions.length} sessions, ${result.totalTickets} tickets processed, ${result.recentlyDone.length} shipped, ${result.successRate}% success rate`)}`);
          console.log('');
          success(`Created ${path.relative(root, result.file)}`);
          autoSync(root, config.bobby_dir || '.bobby');
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
        autoSync(root, config.bobby_dir || '.bobby');
        success(`Created ${retroId} — ${pattern}`);
        console.log(`  → ${config.tickets_dir}/retrospectives/${retroId}--${slug}.md`);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
