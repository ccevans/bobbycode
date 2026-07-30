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
import { listTickets } from '../tickets.js';
import { AGENT_REGISTRY } from '../agent-registry.js';
import { readSession, listSessions } from '../session.js';

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
    let html = body.toString('utf8')
      .replace('href="/style.css"', `href="/style.css?v=${cssMtime}"`)
      .replace('src="/app.js"', `src="/app.js?v=${jsMtime}"`);
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
}) {
  const routes = [];

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

  /**
   * What is unlocked here. The free UI reads this to render paid features as
   * visible-but-locked rather than pretending they do not exist — a buy prompt
   * at the moment of wanting beats a command that refuses to start.
   */
  route('GET', '/api/capabilities', (req, res) => {
    sendJson(res, 200, {
      core: {
        workspaces: true, logs: true, diff: true, files: true, runs: true,
        approve: true, merge: true, discard: true,
      },
      pro: pluginStatus,
      extensions: plugins.map((p) => ({ name: p.name, version: p.version, features: p.features })),
    });
  });

  route('GET', '/api/workspaces', (req, res) => {
    sendJson(res, 200, { workspaces: store.list() });
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
    const filePath = path.join(TEMPLATE_DIR, safePath);
    return filePath.startsWith(TEMPLATE_DIR + path.sep) ? filePath : null;
  }

  // --- Server instance ---
  const server = http.createServer(async (req, res) => {
    try {
      // Static files
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        let urlPath = req.url.split('?')[0];
        if (urlPath === '/') urlPath = '/index.html';
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
