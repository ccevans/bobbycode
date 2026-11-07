// lib/usage.js
//
// WHAT BOBBY'S AGENTS ACTUALLY COST, read from Claude Code's own transcripts.
//
// Every subagent run leaves `<session>/subagents/agent-<id>.jsonl` (the turns,
// each assistant turn carrying its token usage) and `agent-<id>.meta.json`
// (whose `agentType` names the agent file it ran, e.g. `bobby-build`). Nothing
// here is estimated: turns, context and output tokens are the API's own
// numbers, minutes are first-to-last timestamp.
//
// The two derived signals are the ones that point at a fix:
//   shellReadShare  — share of all tool output that came from reading files
//                     through the shell (cat / sed / head / grep ...). Whole-
//                     file dumps stay in context and are re-sent every turn.
//   batchedShare    — share of tool-calling turns that issued more than one
//                     call. Low means one round trip per read, so more turns.

import fs from 'fs';
import os from 'os';
import path from 'path';

const SHELL_READ = /^(cat|sed|head|tail|grep|rg|ugrep|find|ls|awk|nl|wc|less|more)\b/;

/** Claude Code's transcript folder for a project root. */
export function transcriptsDirFor(root) {
  return path.join(os.homedir(), '.claude', 'projects', root.replace(/[^A-Za-z0-9]/g, '-'));
}

/** The first real command in a Bash call, past `cd x &&` / `export X=y;` prefixes. */
export function firstCommand(cmd = '') {
  let c = cmd.trim();
  for (;;) {
    const next = c.replace(/^(cd\s+[^&;|]+|export\s+[^&;|]+)\s*(&&|;)\s*/, '');
    if (next === c) break;
    c = next;
  }
  return c;
}

export function isShellRead(cmd) {
  return SHELL_READ.test(firstCommand(cmd));
}

/**
 * Claude Code writes one transcript line per content block, so a single API
 * turn with three tool calls is three `assistant` lines sharing `message.id`,
 * each repeating the turn's usage. Counting lines would inflate turns and
 * tokens and hide every batched call. Merge them: one turn per id, its blocks
 * concatenated, its usage from the last line written.
 */
export function mergeTurns(events) {
  const out = [];
  const byId = new Map();
  for (const e of events) {
    const id = e.type === 'assistant' ? e.message?.id : null;
    if (!id) { out.push(e); continue; }
    const content = Array.isArray(e.message.content) ? e.message.content : [];
    if (!byId.has(id)) {
      const turn = { ...e, message: { ...e.message, content: [...content] } };
      byId.set(id, turn);
      out.push(turn);
    } else {
      const turn = byId.get(id);
      turn.message.content.push(...content);
      if (e.message.usage) turn.message.usage = e.message.usage;
      if (e.timestamp) turn.timestamp = e.timestamp;
    }
  }
  return out;
}

/** One run's numbers from its transcript lines (already parsed). */
export function summarizeRun(lines) {
  const events = mergeTurns(lines);
  let turns = 0; let toolTurns = 0; let batched = 0;
  let context = 0; let output = 0; let start = null; let peak = 0;
  let first = null; let last = null;
  let toolOut = 0; let shellReadOut = 0;
  const pendingReads = new Set();

  // Wall-clock from the raw lines: a merged turn carries only one timestamp.
  for (const e of lines) {
    if (e.timestamp) { first = first || e.timestamp; last = e.timestamp; }
  }
  for (const e of events) {
    const content = Array.isArray(e.message?.content) ? e.message.content : [];
    if (e.type === 'assistant') {
      const u = e.message?.usage || {};
      const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      turns += 1; context += ctx; output += u.output_tokens || 0;
      if (start === null) start = ctx;
      peak = Math.max(peak, ctx);
      const calls = content.filter(b => b?.type === 'tool_use');
      if (calls.length) { toolTurns += 1; if (calls.length > 1) batched += 1; }
      for (const b of calls) {
        if (b.name === 'Bash' && isShellRead(b.input?.command)) pendingReads.add(b.id);
      }
    } else if (e.type === 'user') {
      for (const b of content) {
        if (b?.type !== 'tool_result') continue;
        const size = typeof b.content === 'string' ? b.content.length : JSON.stringify(b.content ?? '').length;
        toolOut += size;
        if (pendingReads.delete(b.tool_use_id)) shellReadOut += size;
      }
    }
  }
  const minutes = first && last ? (Date.parse(last) - Date.parse(first)) / 60000 : 0;
  return { turns, toolTurns, batched, context, output, start: start || 0, peak, minutes, toolOut, shellReadOut, first };
}

function readJsonl(file) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* a torn last line from a run still writing */ }
  }
  return out;
}

/** Every subagent run under a transcripts dir: [{ agent, ...summarizeRun }]. */
export function collectRuns(dir, { since = null, all = false } = {}) {
  if (!fs.existsSync(dir)) throw new Error(`No Claude Code transcripts at ${dir}`);
  const runs = [];
  for (const session of fs.readdirSync(dir)) {
    const sub = path.join(dir, session, 'subagents');
    if (!fs.existsSync(sub)) continue;
    for (const f of fs.readdirSync(sub)) {
      if (!f.endsWith('.meta.json')) continue;
      let meta;
      try { meta = JSON.parse(fs.readFileSync(path.join(sub, f), 'utf8')); } catch { continue; }
      const agent = meta.agentType;
      if (!agent || (!all && !agent.startsWith('bobby-'))) continue;
      const jsonl = path.join(sub, f.replace(/\.meta\.json$/, '.jsonl'));
      if (!fs.existsSync(jsonl)) continue;
      const run = summarizeRun(readJsonl(jsonl));
      if (!run.turns) continue;
      if (since && run.first && run.first < since) continue;
      runs.push({ agent, ...run });
    }
  }
  return runs;
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Per-agent rollup, most total context first. */
export function rollup(runs) {
  const by = new Map();
  for (const r of runs) {
    if (!by.has(r.agent)) by.set(r.agent, []);
    by.get(r.agent).push(r);
  }
  return [...by.entries()].map(([agent, rs]) => {
    const sum = k => rs.reduce((a, r) => a + r[k], 0);
    const toolOut = sum('toolOut'); const toolTurns = sum('toolTurns');
    return {
      agent,
      runs: rs.length,
      turns: median(rs.map(r => r.turns)),
      startK: median(rs.map(r => r.start)) / 1e3,
      peakK: median(rs.map(r => r.peak)) / 1e3,
      contextM: sum('context') / rs.length / 1e6,
      outputK: sum('output') / rs.length / 1e3,
      minutes: median(rs.map(r => r.minutes)),
      shellReadShare: toolOut ? sum('shellReadOut') / toolOut : 0,
      batchedShare: toolTurns ? sum('batched') / toolTurns : 0,
      totalContextM: sum('context') / 1e6,
    };
  }).sort((a, b) => b.totalContextM - a.totalContextM);
}
