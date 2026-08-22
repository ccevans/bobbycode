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
import { readTicketClaim, claimFileForTicket } from './ticket-claim.js';
import { listRuns, RUN_STATUSES } from './state.js';
import { AGENT_REGISTRY, runsWithoutTicket } from '../agent-registry.js';
import { readSession, listSessions } from '../session.js';
import { buildBrief } from '../brief.js';
import { listWorkflows, describeWorkflows } from '../workflow.js';
import { STAGES } from '../stages.js';
import { originRepo } from '../git-remote.js';
import { listIdeas, addIdea, findIdea, markPromoted, removeIdea } from '../ideas.js';
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
  '.png': 'image/png',   // the App's iOS icon set (BOB-093)
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
  // Conversational planning (TKT-021). Optional: absent means the chat routes
  // 501 rather than 404, so a client can tell "this host is too old" from a
  // typo'd path.
  chatManager = null,
  plugins = [], pluginStatus = { state: 'absent' },
  // The app UI: when set, this dir is served at / and the classic dashboard
  // stays reachable at /classic/ for one release.
  appDir = null,
  sprintsDir = null,
  // Where `bobby idea` keeps its list. Passed in for the same reason sprintsDir
  // is: the CLI resolves it against the MAIN worktree (one list per repository,
  // like the ticket board), and only the caller knows which checkout it is in.
  ideasFile = null,
}) {
  const routes = [];
  const templateDir = appDir || TEMPLATE_DIR;
  const resolvedSprintsDir = sprintsDir
    || path.join(repoRoot || '.', (config && config.sprints_dir) || '.bobby/sprints');
  const ideasFilePath = ideasFile
    || path.join(repoRoot || '.', (config && config.bobby_dir) || '.bobby', 'ideas.yml');

  // The active project's board (TKT-022). In studio mode the orchestrator's
  // `ticketsDir` moves with the selected project, so every ticket/brief/feature
  // route reads it LIVE rather than the value captured at boot — otherwise a
  // POST /api/tickets after a switch would land on the old project. Falls back
  // to the boot `ticketsDir` for non-studio hosts and tests with a bare
  // orchestrator stub.
  /**
   * The board a REQUEST is scoped to (BOB-067).
   *
   * A phone reaches this server through the tunnel, which stamps the project
   * its frame named onto the proxied request as `x-bobby-project`. Honouring it
   * here, per request and statelessly, is what lets one pairing serve every
   * project in a studio without the phone and the desktop fighting over the one
   * global active project — the switch route mutates that global for everyone,
   * which is fine as a default and wrong as an addressing mechanism.
   *
   * No header (every existing caller, and every non-studio host) falls through
   * to the active project exactly as before. An unknown project 400s at the
   * routes via the throw here, naming the real ones.
   */
  const requestScope = (req) => {
    const name = req?.headers?.['x-bobby-project'];
    const pc = (orchestrator && orchestrator.projectContext) || null;
    if (!name || !pc || !pc.isStudio() || name === pc.projectName) return null;
    return pc.resolve(name);   // throws on an unknown project — callers 400 it
  };
  const boardDir = (req) => {
    const scope = requestScope(req);
    if (scope) return scope.ticketsDir;
    return (orchestrator && orchestrator.ticketsDir) || ticketsDir;
  };

  // The active project's session log dir, live for the same reason as the board
  // above: a switch must move which project's sessions the log routes list, or
  // the app shows beta's board beside alpha's session history.
  const sessionsBoardDir = (req) => {
    const scope = requestScope(req);
    if (scope) return scope.sessionsDir;
    return (orchestrator && orchestrator.sessionsDir)
      || path.join(repoRoot, (config && config.sessions_dir) || '.bobby/sessions');
  };

  // The project context, when one is wired. `null` on a single-project
  // dashboard and on old hosts — the project routes read this to 400.
  const projectContext = () => (orchestrator && orchestrator.projectContext) || null;

  // The ACTIVE project's config. Re-scoping the board without re-scoping the
  // config is a half-switch, and it shows: `ticket_prefix` is per-project, so a
  // server booted on alpha and switched to beta minted AL-001 into beta's board.
  // Falls back to the boot config off-studio and on hosts with no context.
  const activeConfig = (req) => {
    const scope = requestScope(req);
    if (scope) return scope.config;
    return activeConfigGlobal();
  };
  const activeConfigGlobal = () => {
    const pc = projectContext();
    return (pc && pc.config) || config;
  };

  /**
   * The workspaces the ACTIVE project owns (TKT-022).
   *
   * A workspace records the board it was created on, so ownership is that
   * recorded value — an exact answer that survives the ticket being renamed,
   * merged away, or duplicated onto another project's board. Records written
   * before that field existed have none, so they fall back to membership: is
   * this id on the active board? By board and never by ticket-prefix, so two
   * projects that happen to share a prefix do not bleed into each other's list.
   * That fallback reads the board ONCE per request rather than once per
   * workspace — this route is polled, and `findTicket` is a readdir each time.
   *
   * Repo runs (no ticket, they act on the main checkout) and pre-context hosts
   * are never filtered. Off-studio the whole list passes through unchanged.
   */
  const scopeToProject = (workspaces, req) => {
    const pc = projectContext();
    if (!pc || !pc.isStudio() || !pc.projectName) return workspaces;
    const dir = boardDir(req);
    if (!dir) return workspaces;

    let onBoard = null;   // built only if an unpinned record needs it
    const idsOnBoard = () => {
      if (!onBoard) onBoard = new Set(listTickets(dir).map((t) => t.id));
      return onBoard;
    };

    return workspaces.filter((ws) => {
      if (!ws.ticketId) return true;
      if (ws.ticketsDir) return ws.ticketsDir === dir;
      return idsOnBoard().has(ws.ticketId);
    });
  };

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

  // `version` is this host's API generation — the number the app compares
  // against the one it was built for, so a phone can tell "your Mac's Bobby is
  // older than this app" from a route that is simply broken (PRO-015). Bump it
  // whenever a route the app depends on is added or changed; the app's
  // APP_API_VERSION (bobbycode-pro app/lib/skew.js) is bumped in lockstep, so a
  // current host always matches and only a genuinely older one trips the banner.
  route('GET', '/api/health', (req, res) => sendJson(res, 200, { ok: true, version: 2 }));

  // --- The loop: brief, go, tickets, workflows (the app's Home + Board) ---

  /** Where you left off — in-flight, blocked, backlog top, and the one next action. */
  route('GET', '/api/brief', (req, res) => {
    try {
      const brief = buildBrief(boardDir(req), resolvedSprintsDir);
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
      const argv = body.argv || buildBrief(boardDir(req), resolvedSprintsDir).nextAction.argv;
      const result = await executeGoAction(argv, { orchestrator, ticketsDir: boardDir(req) });
      sendJson(res, 200, { argv, ...result });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('GET', '/api/tickets/:id', (req, res, params) => {
    const found = findTicket(boardDir(req), params.id);
    if (!found) return sendError(res, 404, `Ticket ${params.id} not found`);
    sendJson(res, 200, { ticket: { ...withMergedAt(found.data), content: found.content, path: found.path } });
  });

  route('POST', '/api/tickets', async (req, res) => {
    try {
      const body = await readBody(req);
      if (!body.title) return sendError(res, 400, 'title is required');
      const created = createTicket(boardDir(req), {
        prefix: activeConfig(req).ticket_prefix || 'TKT',
        title: body.title,
        type: body.type || 'feature',
        priority: body.priority || 'medium',
        area: body.area || '',
        description: body.description || '',
        criteria: body.criteria || [],
        workflow: body.workflow || null,
        author: 'app',
      });
      const found = findTicket(boardDir(req), created.id);
      sendJson(res, 201, { ticket: { ...found.data, content: found.content } });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('POST', '/api/tickets/:id/move', async (req, res, params) => {
    try {
      const body = await readBody(req);
      if (!body.stage) return sendError(res, 400, 'stage is required');
      moveWithAlias(boardDir(req), params.id, body.stage, { reason: body.reason || '' });
      const found = findTicket(boardDir(req), params.id);
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
      updateTicket(boardDir(req), params.id, updates);
      const found = findTicket(boardDir(req), params.id);
      sendJson(res, 200, { ticket: { ...found.data, content: found.content } });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('POST', '/api/tickets/:id/comments', async (req, res, params) => {
    try {
      const body = await readBody(req);
      if (!body.text) return sendError(res, 400, 'text is required');
      addComment(boardDir(req), params.id, 'app', body.text);
      const found = findTicket(boardDir(req), params.id);
      sendJson(res, 200, { ticket: { ...found.data, content: found.content } });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  /* --- Ideas: the thoughts that arrive mid-task, before they are tickets ---
   *
   * An idea is deliberately NOT a ticket. `bobby idea "…"` writes a numbered
   * line to `.bobby/ideas.yml` precisely so that capturing one costs nothing
   * and does not disturb the board — the board is what you are working from,
   * and a half-formed thought filed into it is noise in the one list that is
   * supposed to be true. Promotion is the moment it becomes work.
   *
   * So these four routes are a thin skin over lib/ideas.js and write the same
   * file the CLI does. There is no second store: an idea captured on the phone
   * is in `bobby idea list` at the desk, and one promoted from the app is gone
   * from the CLI's open list, because both are reading one YAML file.
   *
   * Every mutation is a POST. That is the house style for this server (`/move`,
   * `/comments`, `/approve`, `/discard` — there is no DELETE anywhere in it),
   * and it is load-bearing rather than cosmetic: `bobby remote` tunnels GET and
   * POST only, so a `DELETE /api/ideas/:n` would work at the desk and fail on
   * the phone, which is the surface these were most wanted on.
   */

  /** The n in /api/ideas/:n, or null when it is not a number at all. */
  const ideaNumber = (raw) => {
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  };

  route('GET', '/api/ideas', (req, res) => {
    try {
      // Open ideas by default, `?all=true` to include the promoted ones —
      // the same default and the same flag as `bobby idea list [--all]`.
      const all = query(req).get('all') === 'true';
      sendJson(res, 200, { ideas: listIdeas(ideasFilePath, { all }) });
    } catch (e) {
      sendError(res, 500, e.message);
    }
  });

  route('POST', '/api/ideas', async (req, res) => {
    try {
      const body = await readBody(req);
      if (!body.text || !String(body.text).trim()) return sendError(res, 400, 'text is required');
      sendJson(res, 201, { idea: addIdea(ideasFilePath, String(body.text)) });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  /**
   * Promote an idea into a backlog ticket — the one action an idea exists for.
   *
   * The ticket is created first and the idea is marked second, deliberately: a
   * crash between the two leaves a real ticket and an idea that still looks
   * open, which is a duplicate you can see and delete. The other order leaves
   * an idea pointing at a ticket that was never written.
   */
  route('POST', '/api/ideas/:n/promote', async (req, res, params) => {
    try {
      const body = await readBody(req).catch(() => ({}));
      const n = ideaNumber(params.n);
      if (n === null) return sendError(res, 400, `Idea number must be a number (got "${params.n}")`);

      const idea = findIdea(ideasFilePath, n);
      if (!idea) return sendError(res, 404, `Idea #${n} not found`);
      if (idea.promoted) return sendError(res, 400, `Idea #${n} was already promoted to ${idea.promoted}.`);

      const created = createTicket(boardDir(req), {
        prefix: activeConfig(req).ticket_prefix || 'TKT',
        title: idea.text,
        type: body.epic ? 'epic' : 'feature',
        priority: body.priority || 'medium',
        area: body.area || '',
        author: 'idea',
      });
      const promoted = markPromoted(ideasFilePath, n, created.id);
      const found = findTicket(boardDir(req), created.id);
      sendJson(res, 201, { idea: promoted, ticket: { ...found.data, content: found.content } });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  route('POST', '/api/ideas/:n/delete', (req, res, params) => {
    try {
      const n = ideaNumber(params.n);
      if (n === null) return sendError(res, 400, `Idea number must be a number (got "${params.n}")`);
      sendJson(res, 200, { ok: true, idea: removeIdea(ideasFilePath, n) });
    } catch (e) {
      const status = /not found/i.test(e.message) ? 404 : 400;
      sendError(res, status, e.message);
    }
  });

  route('GET', '/api/workflows', (req, res) => {
    // `workflows` (names) predates `stages` — keep both so nothing breaks.
    sendJson(res, 200, {
      // The ACTIVE project's workflows: `workflows` is a project key, so a
      // server booted on alpha listed alpha's pipelines after switching to
      // beta — and createWorkspace, which validates against the same config,
      // then refused the beta workflow the UI had just offered.
      workflows: listWorkflows(activeConfig(req) || {}),
      stages: describeWorkflows(activeConfig(req) || {}),
    });
  });

  // --- Projects: studio mode (TKT-022) ---
  //
  // A studio holds many projects; these two routes let the running app move
  // between them without a restart. Both 400 on a single-project (non-studio)
  // dashboard — the picker is hidden there and the feature simply does not
  // apply. The selection is persisted by the project context (.bobby/active-
  // project), so a page reload returns to the same project via GET /api/config.
  const noStudio = 'Project switching is not available — this is a single-project dashboard, not a studio.';

  route('GET', '/api/projects', (req, res) => {
    const pc = projectContext();
    if (!pc || !pc.isStudio()) return sendError(res, 400, noStudio);
    sendJson(res, 200, { projects: pc.listProjects(), active: pc.projectName });
  });

  route('POST', '/api/projects/select', async (req, res) => {
    const pc = projectContext();
    if (!pc || !pc.isStudio()) return sendError(res, 400, noStudio);
    try {
      const body = await readBody(req);
      if (!body.name) return sendError(res, 400, 'name is required');
      orchestrator.switchProject(body.name);
      sendJson(res, 200, { active: pc.projectName, projects: pc.listProjects() });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });

  // --- Features: an epic plus its children, the app's Feature view ---

  route('GET', '/api/features', (req, res) => {
    try {
      sendJson(res, 200, { features: listEpics(boardDir(req)) });
    } catch (e) {
      sendError(res, 500, e.message);
    }
  });

  route('GET', '/api/features/:id', (req, res, params) => {
    try {
      const { epic, children } = getFeatureTickets(boardDir(req), params.id);
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
   *
   * `repo` is `owner/repo` for the origin remote, and it is the one fact config
   * cannot supply: `project` is a slug someone typed at `bobby init`, while the
   * Feature view's sublabel is specified as `ccevans/bobbycode · TKT-001` — where
   * the code actually lives (TKT-012). It is **null** whenever nothing can
   * honestly answer — no remote, a remote that is a path on this machine, no git
   * on the box — and the UI falls back to `project`. Read per request rather
   * than at boot, because `git remote add` can happen while the server is up and
   * a cached null would outlive the reason for it.
   */
  route('GET', '/api/config', (req, res) => {
    const pc = projectContext();
    sendJson(res, 200, {
      // From the ACTIVE project's config, not the boot one: after a switch these
      // three described the project you had left, so this route contradicted the
      // `activeProject` two lines below it.
      project: activeConfig(req).project || path.basename(repoRoot || ''),
      repo: originRepo(repoRoot),
      stack: activeConfig(req).stack || null,
      target: activeConfig(req).target || 'claude-code',
      stages: [...STAGES],
      // Studio mode (TKT-022): whether the project picker is available, and
      // which project the app should show on load. `activeProject` is what makes
      // the selection survive a reload — the client reads it back here.
      isStudio: !!(pc && pc.isStudio()),
      activeProject: pc ? pc.projectName : null,
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
    sendJson(res, 200, { workspaces: scopeToProject(store.list(), req) });
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

  // --- Chats: conversational planning (TKT-021) ---
  //
  // A chat is a planning conversation about one ticket, backed by a workspace
  // in `plan` (read-only) mode with `--resume` so the agent keeps context
  // across turns and cannot write files mid-argument. Committing the plan runs
  // one final write-capable turn. Every mutation is a POST — the house style,
  // and what `bobby remote` tunnels.
  //
  // 501, not 404, when no ChatManager is wired: the route EXISTS, this host just
  // cannot serve it yet, which a skew banner reads differently from a typo.
  const withChat = (res, fn) => {
    if (!chatManager) return sendError(res, 501, 'Conversational planning is not available on this host.');
    return fn();
  };

  route('POST', '/api/chats', (req, res) => withChat(res, async () => {
    try {
      const body = await readBody(req);
      if (!body.ticketId) return sendError(res, 400, 'ticketId is required');
      const chat = chatManager.startChat(body.ticketId);
      sendJson(res, 200, { chatId: chat.id, ticketId: chat.ticketId, status: chat.status, chat });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  }));

  route('GET', '/api/chats', (req, res) => withChat(res, () => {
    sendJson(res, 200, { chats: chatManager.listChats() });
  }));

  route('GET', '/api/chats/:id', (req, res, params) => withChat(res, () => {
    const chat = chatManager.getChat(params.id);
    if (!chat) return sendError(res, 404, `Chat ${params.id} not found`);
    sendJson(res, 200, { chat });
  }));

  route('POST', '/api/chats/:id/message', (req, res, params) => withChat(res, async () => {
    try {
      const body = await readBody(req);
      if (!body.message) return sendError(res, 400, 'message is required');
      const chat = await chatManager.sendMessage(params.id, body.message);
      sendJson(res, 200, { chat });
    } catch (e) {
      const status = /not found/i.test(e.message) ? 404 : 400;
      sendError(res, status, e.message);
    }
  }));

  route('POST', '/api/chats/:id/commit', (req, res, params) => withChat(res, async () => {
    try {
      const chat = await chatManager.commitPlan(params.id);
      sendJson(res, 200, { chat });
    } catch (e) {
      const status = /not found/i.test(e.message) ? 404 : 400;
      sendError(res, status, e.message);
    }
  }));

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

  /**
   * Attach the live run claim, so a client can render "in progress elsewhere"
   * rather than offering a Start-work control that will be refused (BOB-120).
   *
   * `running` is the honest question — is a run in flight on this ticket right
   * now — which the static `assigned` field cannot answer: it survives the run
   * ending and nothing clears it on a crash. A stale claim reads as free, the
   * same answer the acquire path would give.
   */
  const withClaim = (t) => {
    let record = null;
    try { record = readTicketClaim(claimFileForTicket(t)); } catch { /* unreadable board: not running */ }
    return record
      ? { ...t, running: true, runningBy: record.holder, runningSince: record.startedAt }
      : { ...t, running: false };
  };

  route('GET', '/api/tickets', (req, res) => {
    // Tolerant listing: one bad ticket must not kill the whole list. We first
    // try the fast path (listTickets), then fall back to per-directory reads
    // that skip + report any tickets whose YAML fails to parse.
    const dir = boardDir(req);
    try {
      const tickets = listTickets(dir).map(withClaim);
      sendJson(res, 200, { tickets, skipped: [] });
    } catch {
      const tickets = [];
      const skipped = [];
      if (!fs.existsSync(dir)) return sendJson(res, 200, { tickets, skipped });
      for (const entry of fs.readdirSync(dir)) {
        if (entry.startsWith('.')) continue;
        const full = path.join(dir, entry);
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }
        if (!stat.isDirectory()) continue;
        const ticketFile = path.join(full, 'ticket.md');
        if (!fs.existsSync(ticketFile)) continue;
        try {
          const raw = fs.readFileSync(ticketFile, 'utf8');
          const { data } = matter(raw);
          // Decorated here TOO. One hand-edited ticket with a broken quote makes
          // listTickets throw, and every ticket on the board then came back with
          // `running: undefined` — so the app would offer Start work on tickets
          // that are actively running, which is the collision AC4 exists to
          // prevent, in exactly the degraded state where nobody is watching.
          tickets.push(withClaim({ ...data, path: full, dirname: entry }));
        } catch (err) {
          skipped.push({ dirname: entry, error: err.message });
        }
      }
      sendJson(res, 200, { tickets, skipped });
    }
  });

  route('GET', '/api/sessions', (req, res) => {
    try {
      const sessions = listSessions(sessionsBoardDir(req));
      sendJson(res, 200, { sessions });
    } catch (e) {
      sendError(res, 500, e.message);
    }
  });

  route('GET', '/api/sessions/:id', (req, res, params) => {
    try {
      const entries = readSession(sessionsBoardDir(req), params.id);
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
