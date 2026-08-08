// lib/dashboard/server.js
//
// Minimal HTTP server for the bobby dashboard. Uses Node's built-in `http`
// module — no Express, no middleware framework, no bundler. Serves static
// files from templates/dashboard/ and exposes a REST + SSE API.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { listTickets, findTicket, createTicket, updateTicket, addComment, listEpics, getFeatureTickets, normalizeMergedAt } from '../tickets.js';
import { listRuns, RUN_STATUSES } from './state.js';
import { AGENT_REGISTRY, runsWithoutTicket } from '../agent-registry.js';
import { readSession, listSessions } from '../session.js';
import { buildBrief } from '../brief.js';
import { listWorkflows, describeWorkflows } from '../workflow.js';
import { STAGES } from '../stages.js';
import { executeGoAction, moveWithAlias } from './actions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_DIR = path.resolve(__dirname, '../../templates/dashboard');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

function sendError(res, status, message, details) {
  sendJson(res, status, { error: message, details });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const LIMIT = 1_000_000; // 1 MB safety cap
    req.on('data', (c) => {
      size += c.length;
      if (size > LIMIT) {
        req.destroy();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, filePath, headTags = []) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendError(res, 404, 'Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  let body = fs.readFileSync(filePath);

  // For HTML, inject a cache-busting query on asset URLs so browsers can
  // never serve a stale app.js / style.css. The query is the file's mtime
  // in ms — stable between edits, unique across edits.
  if (ext === '.html') {
    const cssMtime = safeMtime(path.join(path.dirname(filePath), 'style.css'));
    const jsMtime = safeMtime(path.join(path.dirname(filePath), 'app.js'));
    // Relative asset paths, so the same HTML works at / and under /classic/.
    let html = body.toString('utf8')
      .replace(/href="\/?style\.css"/, `href="style.css?v=${cssMtime}"`)
      .replace(/src="\/?app\.js"/, `src="app.js?v=${jsMtime}"`);
    // Extension assets load after the core app, so they can extend a UI that
    // has already booted rather than racing it.
    if (headTags.length) {
      html = html.replace('</body>', `${headTags.join('\n  ')}\n</body>`);
    }
    body = Buffer.from(html, 'utf8');
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': body.length,
    // no-store is stricter than no-cache — required for dev dashboards so
    // browsers never hold a stale copy of our bundle-less JS.
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(body);
}

function safeMtime(p) {
  try { return Math.floor(fs.statSync(p).mtimeMs); }
  catch { return Date.now(); }
}

/** The query string of a request, whose path the router has already matched. */
function query(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

/**
 * A ticket with its merge timestamp made safe to render (TKT-013).
 *
 * Normalized here, at the boundary, rather than in each UI: `mergedAt` is
 * frontmatter, so it can be absent (every ticket merged before the field
 * existed) or hand-edited into nonsense, and a client that fed either straight
 * to `new Date()` would render "Invalid Date" or the 1970 epoch. Every consumer
 * gets either a real ISO timestamp or an explicit null.
 */
function withMergedAt(ticket) {
  return { ...ticket, mergedAt: normalizeMergedAt(ticket.mergedAt) };
}

/**
 * Tail a JSONL file and broadcast new entries to an SSE channel. Returns a
 * stop function.
 */
function tailJsonlToSse(filePath, sseHub, channel) {
  if (!fs.existsSync(filePath)) return () => {};
  // Emit existing entries first
  try {
    const existing = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of existing) {
      try {
        sseHub.broadcast(channel, { type: 'session_event', entry: JSON.parse(line) });
      } catch { /* skip malformed */ }
    }
  } catch { /* ignore */ }

  let lastSize = 0;
  try { lastSize = fs.statSync(filePath).size; } catch { /* ignore */ }

  const onChange = () => {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size <= lastSize) return;
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(stat.size - lastSize);
      fs.readSync(fd, buf, 0, buf.length, lastSize);
      fs.closeSync(fd);
      lastSize = stat.size;
      const text = buf.toString('utf8');
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          sseHub.broadcast(channel, { type: 'session_event', entry: JSON.parse(line) });
        } catch { /* skip malformed */ }
      }
    } catch { /* ignore */ }
  };

  fs.watchFile(filePath, { interval: 500 }, onChange);
  return () => fs.unwatchFile(filePath, onChange);
}

/**
 * Build the HTTP server. Returns a Node http.Server instance that is not yet
 * listening.
 */
export function buildServer({
  orchestrator, store, sseHub, config, repoRoot, ticketsDir,
  plugins = [], pluginStatus = { state: 'absent' },
  // The app UI: when set, this dir is served at / and the classic dashboard
  // stays reachable at /classic/ for one release.
  appDir = null,
  sprintsDir = null,
}) {
  const routes = [];
  const templateDir = appDir || TEMPLATE_DIR;
  const resolvedSprintsDir = sprintsDir
    || path.join(repoRoot || '.', (config && config.sprints_dir) || '.bobby/sprints');

  function route(method, pattern, handler) {
    // pattern: /api/workspaces/:id/run → regex + param names
    const paramNames = [];
    const regexSrc = pattern.replace(/:[^/]+/g, (m) => {
      paramNames.push(m.slice(1));
      return '([^/]+)';
    });
    routes.push({
      method,
      regex: new RegExp(`^${regexSrc}$`),
      paramNames,
      handler,
    });
  }

  // --- Routes ---

  route('GET', '/api/health', (req, res) => sendJson(res, 200, { ok: true, version: 1 }));

  // --- The loop: brief, go, tickets, workflows (the app's Home + Board) ---

  /** Where you left off — in-flight, blocked, backlog top, and the one next action. */
  route('GET', '/api/brief', (req, res) => {
    try {
      const brief = buildBrief(ticketsDir, resolvedSprintsDir);
      sendJson(res, 200, { brief });
    } catch (e) {
      sendError(res, 500, e.message);
    }
  });

  /**
   * Do the next thing. With no body, executes the brief's own nextAction;
   * with { argv }, executes that action (the client shows the user WHAT will
   * run before posting — the confirm sheet is the token-burn guardrail).
   */
  route('POST', '/api/go', async (req, res) => {
    try {
      const body = await readBody(req).catch(() => ({}));
      const argv = body.argv || buildBrief(ticketsDir, resolvedSprintsDir).nextAction.argv;
      const result = await executeGoAction(argv, { orchestrator, ticketsDir });
      sendJson(res, 200, { argv, ...result });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('GET', '/api/tickets/:id', (req, res, params) => {
    const found = findTicket(ticketsDir, params.id);
    if (!found) return sendError(res, 404, `Ticket ${params.id} not found`);
    sendJson(res, 200, { ticket: { ...withMergedAt(found.data), content: found.content, path: found.path } });
  });

  route('POST', '/api/tickets', async (req, res) => {
    try {
      const body = await readBody(req);
      if (!body.title) return sendError(res, 400, 'title is required');
      const created = createTicket(ticketsDir, {
        prefix: (config && config.ticket_prefix) || 'TKT',
        title: body.title,
        type: body.type || 'feature',
        priority: body.priority || 'medium',
        area: body.area || '',
        description: body.description || '',
        criteria: body.criteria || [],
        workflow: body.workflow || null,
        author: 'app',
      });
      const found = findTicket(ticketsDir, created.id);
      sendJson(res, 201, { ticket: { ...found.data, content: found.content } });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('POST', '/api/tickets/:id/move', async (req, res, params) => {
    try {
      const body = await readBody(req);
      if (!body.stage) return sendError(res, 400, 'stage is required');
      moveWithAlias(ticketsDir, params.id, body.stage, { reason: body.reason || '' });
      const found = findTicket(ticketsDir, params.id);
      sendJson(res, 200, { ticket: { ...found.data, content: found.content } });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('PATCH', '/api/tickets/:id', async (req, res, params) => {
    try {
      const body = await readBody(req);
      // Frontmatter only, and only fields a human edits — never stage (that
      // is what /move is for, with its transition rules).
      const allowed = ['title', 'priority', 'area', 'parent', 'workflow'];
      const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
      if (Object.keys(updates).length === 0) return sendError(res, 400, `Nothing to update. Editable: ${allowed.join(', ')}`);
      updateTicket(ticketsDir, params.id, updates);
      const found = findTicket(ticketsDir, params.id);
      sendJson(res, 200, { ticket: { ...found.data, content: found.content } });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('POST', '/api/tickets/:id/comments', async (req, res, params) => {
    try {
      const body = await readBody(req);
      if (!body.text) return sendError(res, 400, 'text is required');
      addComment(ticketsDir, params.id, 'app', body.text);
      const found = findTicket(ticketsDir, params.id);
      sendJson(res, 200, { ticket: { ...found.data, content: found.content } });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('GET', '/api/workflows', (req, res) => {
    // `workflows` (names) predates `stages` — keep both so nothing breaks.
    sendJson(res, 200, {
      workflows: listWorkflows(config || {}),
      stages: describeWorkflows(config || {}),
    });
  });

  // --- Features: an epic plus its children, the app's Feature view ---

  route('GET', '/api/features', (req, res) => {
    try {
      sendJson(res, 200, { features: listEpics(ticketsDir) });
    } catch (e) {
      sendError(res, 500, e.message);
    }
  });

  route('GET', '/api/features/:id', (req, res, params) => {
    try {
      const { epic, children } = getFeatureTickets(ticketsDir, params.id);
      sendJson(res, 200, {
        epic: { ...withMergedAt(epic.data), content: epic.content },
        children: children.map(withMergedAt),
      });
    } catch (e) {
      const status = /not found/i.test(e.message) ? 404 : 400;
      sendError(res, status, e.message);
    }
  });

  /**
   * Who am I — the safe, display-only slice of config.
   *
   * `stages` is lib/stages.js's STAGES verbatim: every stage a ticket may sit
   * in, in pipeline order. A UI that draws one lane per stage has to be told
   * what the stages ARE, or it restates them and drifts — which is exactly what
   * happened (TKT-050: the app board's hardcoded list omitted the four
   * `design-*` stages, so a ticket in one matched no lane and was drawn
   * nowhere at all).
   *
   * `/api/workflows` cannot answer this. It returns each workflow resolved to
   * its own steps, and the union of those misses `backlog`, `shipping`, `done`
   * and `blocked` — none of which is a workflow step — while merging N
   * orderings into one canonical order is a problem with no single answer.
   * This route is already fetched once at boot, so the list costs no request.
   */
  route('GET', '/api/config', (req, res) => {
    sendJson(res, 200, {
      project: (config && config.project) || path.basename(repoRoot || ''),
      stack: (config && config.stack) || null,
      target: (config && config.target) || 'claude-code',
      stages: [...STAGES],
    });
  });

  /**
   * What is unlocked here. The free UI reads this to render paid features as
   * visible-but-locked rather than pretending they do not exist — a buy prompt
   * at the moment of wanting beats a command that refuses to start.
   */
  route('GET', '/api/capabilities', (req, res) => {
    sendJson(res, 200, {
      core: {
        workspaces: true, logs: true, diff: true, files: true, runs: true,
        approve: true, merge: true, discard: true, repoRuns: true,
      },
      pro: pluginStatus,
      extensions: plugins.map((p) => ({ name: p.name, version: p.version, features: p.features })),
    });
  });

  route('GET', '/api/workspaces', (req, res) => {
    sendJson(res, 200, { workspaces: store.list() });
  });

  /**
   * Run history across the whole project (TKT-017).
   *
   * Runs live inside the workspace that produced them, which answers "what did
   * THIS workspace do" and nothing else. This flattens them into one list so
   * the project-level question — what has run, when, for how long, at what cost
   * — has somewhere to be asked. Repo runs are in it on equal terms, with a
   * null ticketId.
   *
   *   ?ticket=TKT-001   only that ticket's runs (a repo run matches nothing)
   *   ?status=…         completed | failed | stopped
   *   ?limit= &offset=  newest first, 100 per page by default, 500 at most
   *
   * `totals` covers the whole filtered set rather than the page, and says how
   * many runs it could not account for — see listRuns.
   *
   * Only FINISHED runs appear: a run is recorded when it exits, so an agent
   * still in flight has no duration, no outcome and no cost yet. It is visible
   * as a `running` workspace in /api/workspaces, which is where it belongs.
   */
  route('GET', '/api/runs', (req, res) => {
    try {
      const q = query(req);
      const status = q.get('status');
      // An unknown status silently returning an empty list would look exactly
      // like "nothing has failed yet", which is the opposite of the truth.
      if (status && !RUN_STATUSES.includes(status)) {
        return sendError(res, 400, `Unknown run status '${status}'. Valid: ${RUN_STATUSES.join(', ')}.`);
      }
      sendJson(res, 200, listRuns(store.list(), {
        ticketId: q.get('ticket') || undefined,
        status: status || undefined,
        limit: q.get('limit') ?? undefined,
        offset: q.get('offset') ?? undefined,
      }));
    } catch (e) {
      sendError(res, 500, e.message);
    }
  });

  route('POST', '/api/workspaces', async (req, res) => {
    try {
      const body = await readBody(req);
      if (!body.ticketId) return sendError(res, 400, 'ticketId is required');
      const agent = body.agent || 'plan';
      const workspace = orchestrator.createWorkspace({
        ticketId: body.ticketId,
        agent,
        pipelineName: body.pipeline,
      });
      sendJson(res, 201, { workspace });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  /**
   * Start a REPO RUN: a freeform agent against the main checkout, no ticket and
   * no worktree.
   *
   * Creates AND starts, unlike POST /api/workspaces. A created-but-unstarted
   * workspace is meaningful — its worktree exists and can be inspected — while
   * a created-but-unstarted repo run is nothing at all, so splitting it in two
   * would only invent a state the user can see and cannot use. A refusal (the
   * concurrency cap, or the main checkout being in use) drops the record again
   * rather than leaving a run that never ran sitting in the list.
   *
   * The result is an ordinary record in the same store, so /run, /stop, /diff,
   * /files, /discard and /events all address it by id already.
   */
  route('POST', '/api/repo-runs', async (req, res) => {
    let run;
    try {
      const body = await readBody(req).catch(() => ({}));
      if (!body.agent) return sendError(res, 400, 'agent is required');
      run = orchestrator.createRepoRun({ agent: body.agent });
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    try {
      const workspace = await orchestrator.runAgent(run.id);
      sendJson(res, 201, { workspace });
    } catch (e) {
      // The refusals that land here — the concurrency cap, the main checkout
      // being in use — mean nothing started, so the record goes with them.
      await orchestrator.discard(run.id);
      sendError(res, 400, e.message);
    }
  });

  route('GET', '/api/workspaces/:id', (req, res, params) => {
    const ws = store.get(params.id);
    if (!ws) return sendError(res, 404, 'Workspace not found');
    sendJson(res, 200, { workspace: ws });
  });

  route('POST', '/api/workspaces/:id/run', async (req, res, params) => {
    try {
      const body = await readBody(req).catch(() => ({}));
      const workspace = await orchestrator.runAgent(params.id, { agentOverride: body.agent });
      sendJson(res, 200, { workspace });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('POST', '/api/workspaces/:id/stop', async (req, res, params) => {
    try {
      await orchestrator.stop(params.id);
      sendJson(res, 200, { workspace: store.get(params.id) });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('POST', '/api/workspaces/:id/approve', async (req, res, params) => {
    try {
      const workspace = await orchestrator.approve(params.id);
      sendJson(res, 200, { workspace });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('POST', '/api/workspaces/:id/reject', async (req, res, params) => {
    try {
      const body = await readBody(req).catch(() => ({}));
      const workspace = await orchestrator.reject(params.id, { reason: body.reason });
      sendJson(res, 200, { workspace });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('POST', '/api/workspaces/:id/merge', async (req, res, params) => {
    try {
      const body = await readBody(req).catch(() => ({}));
      const workspace = await orchestrator.merge(params.id, { message: body.message });
      sendJson(res, 200, { workspace });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('POST', '/api/workspaces/:id/discard', async (req, res, params) => {
    try {
      const body = await readBody(req).catch(() => ({}));
      await orchestrator.discard(params.id, { force: !!body.force });
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('GET', '/api/workspaces/:id/diff', (req, res, params) => {
    try {
      const { diff, truncated } = orchestrator.getDiff(params.id);
      sendJson(res, 200, { diff, truncated });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('GET', '/api/workspaces/:id/files', (req, res, params) => {
    try {
      const files = orchestrator.getChangedFiles(params.id);
      sendJson(res, 200, { files });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  /**
   * Feature progress for a running workspace, keyed by workspace id instead of
   * epic id: the caller has a workspace in hand and need not know which ticket
   * it belongs to.
   *
   * It exists because it was believed to read something /api/features/:id could
   * not — child stages from the workspace's WORKTREE, on the theory that
   * children advance there during a run. They do not: `bobby ticket move`
   * resolves to the main checkout from inside any worktree, so the worktree copy
   * never changes (TKT-051). Both routes now read the same shared board and
   * return the same body; this one is a workspace-keyed alias. Kept because the
   * Pro app UI calls it first and falls back to /api/features/:id — retire the
   * two together, not this one alone.
   */
  route('GET', '/api/workspaces/:id/feature', (req, res, params) => {
    try {
      const { epic, children } = orchestrator.featureProgress(params.id);
      sendJson(res, 200, {
        epic: { ...withMergedAt(epic.data), content: epic.content },
        children: children.map(withMergedAt),
      });
    } catch (e) {
      const status = /not found/i.test(e.message) ? 404 : 400;
      sendError(res, status, e.message);
    }
  });

  route('GET', '/api/workspaces/:id/events', (req, res, params) => {
    const ws = store.get(params.id);
    if (!ws) return sendError(res, 404, 'Workspace not found');
    const channel = `workspace:${params.id}`;
    const unsub = sseHub.connect(channel, res);
    // Start a tailer for the current session file if any
    const sessionFile = orchestrator.readLatestSessionFile(params.id);
    let stopTail = () => {};
    if (sessionFile) stopTail = tailJsonlToSse(sessionFile, sseHub, channel);
    res.on('close', () => { stopTail(); unsub(); });
  });

  route('GET', '/api/events', (req, res) => {
    sseHub.connect('global', res);
  });

  route('GET', '/api/agents', (req, res) => {
    const agents = Object.entries(AGENT_REGISTRY).map(([key, entry]) => ({
      key,
      label: entry.label,
      agentName: entry.agentName || null,
      requiresTicket: !!entry.requiresTicket,
      cowork: !!entry.cowork,
      freeform: !!entry.freeform,
      custom: !!entry.custom,
      // Whether POST /api/repo-runs will take it. The flags above describe how
      // a prompt is BUILT; this one answers the question a UI actually has —
      // can I launch this with nothing selected? Without it the app listed
      // every agent and could run only some of them (TKT-014).
      repoRunnable: runsWithoutTicket(key),
    }));
    sendJson(res, 200, { agents });
  });

  route('GET', '/api/tickets', (req, res) => {
    // Tolerant listing: one bad ticket must not kill the whole list. We first
    // try the fast path (listTickets), then fall back to per-directory reads
    // that skip + report any tickets whose YAML fails to parse.
    try {
      const tickets = listTickets(ticketsDir);
      sendJson(res, 200, { tickets, skipped: [] });
    } catch {
      const tickets = [];
      const skipped = [];
      if (!fs.existsSync(ticketsDir)) return sendJson(res, 200, { tickets, skipped });
      for (const entry of fs.readdirSync(ticketsDir)) {
        if (entry.startsWith('.')) continue;
        const full = path.join(ticketsDir, entry);
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }
        if (!stat.isDirectory()) continue;
        const ticketFile = path.join(full, 'ticket.md');
        if (!fs.existsSync(ticketFile)) continue;
        try {
          const raw = fs.readFileSync(ticketFile, 'utf8');
          const { data } = matter(raw);
          tickets.push({ ...data, path: full, dirname: entry });
        } catch (err) {
          skipped.push({ dirname: entry, error: err.message });
        }
      }
      sendJson(res, 200, { tickets, skipped });
    }
  });

  route('GET', '/api/sessions', (req, res) => {
    try {
      const sessionsDir = path.join(repoRoot, config.sessions_dir || '.bobby/sessions');
      const sessions = listSessions(sessionsDir);
      sendJson(res, 200, { sessions });
    } catch (e) {
      sendError(res, 500, e.message);
    }
  });

  route('GET', '/api/sessions/:id', (req, res, params) => {
    try {
      const sessionsDir = path.join(repoRoot, config.sessions_dir || '.bobby/sessions');
      const entries = readSession(sessionsDir, params.id);
      sendJson(res, 200, { sessionId: params.id, entries });
    } catch (e) {
      sendError(res, 500, e.message);
    }
  });

  // --- Extensions ---
  //
  // Separately distributed extensions register here. They get the same `route`
  // helper the core uses, plus a static mount and a way to add their own assets
  // to the page. A plugin that throws is skipped — a paid add-on must never be
  // able to take the free dashboard down with it.
  const staticMounts = [];   // { prefix, dir }
  const headTags = [];

  for (const plugin of plugins) {
    const label = plugin.name || 'extension';
    try {
      plugin.register({
        // Core objects. Extensions drive the same orchestrator the UI does.
        orchestrator, store, sseHub, config, repoRoot, ticketsDir,
        // Reserve /api/pro/* for extensions so a future core route can never
        // collide with one, and core routes always win the match below.
        route(method, pattern, handler) {
          if (!pattern.startsWith('/api/pro/')) {
            throw new Error(`extension routes must start with /api/pro/ (got ${pattern})`);
          }
          route(method, pattern, handler);
        },
        // Serve an extension's own assets under /pro/<slug>/. The slug is
        // URL-safe so a scoped package name never lands a %2F in an asset URL.
        serveDir(dir) {
          const resolved = path.resolve(dir);
          if (!fs.existsSync(resolved)) throw new Error(`serveDir: ${resolved} does not exist`);
          const slug = label.replace(/^@/, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
          const prefix = `/pro/${slug}/`;
          staticMounts.push({ prefix, dir: resolved });
          return prefix;
        },
        // Inject a <script>/<link> into the page, after the core app boots.
        addScript(url) { headTags.push(`<script type="module" src="${url}"></script>`); },
        addStylesheet(url) { headTags.push(`<link rel="stylesheet" href="${url}">`); },
        // Shared response helpers, so extensions match core error shapes.
        helpers: { sendJson, sendText, sendError, readBody },
      });
    } catch (e) {
      console.error(`  Dashboard extension "${label}" failed to register: ${e.message}`);
    }
  }

  /**
   * Resolve a static URL to a file, checking extension mounts before the core
   * template dir. Returns null if the path escapes its root — callers 403.
   */
  function resolveStatic(rawPath) {
    // Decode before normalizing, or %2e%2e%2f slips past the traversal check.
    let urlPath;
    try { urlPath = decodeURIComponent(rawPath); } catch { return null; }
    if (urlPath.includes('\0')) return null;

    for (const mount of staticMounts) {
      if (!urlPath.startsWith(mount.prefix)) continue;
      const rel = path.normalize(urlPath.slice(mount.prefix.length)).replace(/^([/\\])+/, '');
      const filePath = path.join(mount.dir, rel);
      return filePath.startsWith(mount.dir + path.sep) ? filePath : null;
    }
    const safePath = path.normalize(urlPath).replace(/^([/\\])+/, '');
    const filePath = path.join(templateDir, safePath);
    return filePath.startsWith(templateDir + path.sep) ? filePath : null;
  }

  // The classic dashboard rides along at /classic/ while the app UI settles
  // in — frozen, never edited, removed one release later.
  if (appDir) staticMounts.push({ prefix: '/classic/', dir: TEMPLATE_DIR });

  // --- Server instance ---
  const server = http.createServer(async (req, res) => {
    try {
      // Static files
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        let urlPath = req.url.split('?')[0];
        if (urlPath === '/') urlPath = '/index.html';
        if (urlPath === '/classic' || urlPath === '/classic/') urlPath = '/classic/index.html';
        const filePath = resolveStatic(urlPath);
        if (!filePath) return sendError(res, 403, 'Forbidden');
        return serveStatic(res, filePath, headTags);
      }

      // API routing
      const urlOnly = req.url.split('?')[0];
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = urlOnly.match(r.regex);
        if (!m) continue;
        const params = {};
        r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
        await r.handler(req, res, params);
        return;
      }
      sendError(res, 404, `No route for ${req.method} ${urlOnly}`);
    } catch (e) {
      sendError(res, 500, 'Internal error', e.message);
    }
  });

  return server;
}
