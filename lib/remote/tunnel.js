// lib/remote/tunnel.js
// The host side of `bobby remote`: one outbound WebSocket to the relay, and a
// strict proxy from decrypted phone requests into the local dashboard API.
//
// Shape of the trust boundary, because it is the whole point:
//   - Outbound-only. Nothing listens on the network; NAT stays closed.
//   - The phone can reach exactly the dashboard's /api/* surface — the same
//     verbs the local UI has. Never a shell, never a file path.
//   - Every frame in either direction is AES-GCM under the pairing key
//     (lib/remote/crypto.js). The relay routes ciphertext by channel id.
//
// Frame protocol (inside encryption):
//   phone → host  {t:'req', id, project, method, path, body}   one HTTP round trip
//   phone → host  {t:'sub', id, project, path}                 open an SSE stream
//   phone → host  {t:'unsub', id, project}                     close it
//   phone → host  {t:'who'}                                    ask for the roster
//   host  → phone {t:'res', id, project, status, body}
//   host  → phone {t:'ev', id, project, data}                  one SSE event
//   host  → phone {t:'end', id, project}                       stream closed
//   host  → phone {t:'hi', project, projectId, version}        roster entry, one
//                                                              per served project
// `project` on req/sub/unsub/res/ev/end is a projectId (slug + short path
// hash, see projectIdFor). Since pair-once, ONE channel carries every project
// on this machine, so frames are addressed: a frame for a projectId this
// tunnel does not serve is ignored silently. In `hi`, `project` is the human
// name and `projectId` the routing id. Phones that predate pair-once send no
// `project` field; when exactly one project is served we route to it anyway,
// so a migrated pairing keeps working.
// Relay envelope (plaintext): {type:'attach'|'frame'|'presence', ...} — the
// relay sees routing metadata only.
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import { WebSocket } from 'ws';
import { encrypt, decrypt } from './crypto.js';

const MAX_BODY = 1_000_000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/** Only the dashboard API, only sane components. */
export function isAllowedPath(p) {
  return typeof p === 'string'
    && /^\/api\/[A-Za-z0-9/_.-]*$/.test(p)
    && !p.includes('..');
}

const ALLOWED_METHODS = new Set(['GET', 'POST']);

/**
 * The routing id a project answers to on the shared studio channel:
 * a readable slug of the name plus a short hash of the path, so two
 * checkouts named "app" never collide.
 */
export function projectIdFor(name, root) {
  const slug = String(name || path.basename(root || '') || 'project')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  const hash = crypto.createHash('sha256').update(path.resolve(root || '/')).digest('hex').slice(0, 8);
  return `${slug}-${hash}`;
}

export class RemoteTunnel {
  /**
   * One tunnel serves one OR many projects on a single channel — the relay
   * allows one host per channel (newest wins), so multi-project means
   * multiplexing here, not more sockets. Pass either the single-project
   * shorthand ({localPort, project, projectId}) or `projects`:
   * [{projectId, name, localPort, version}].
   */
  constructor({
    relayUrl, channel, key, localPort, project = '', projectId = '',
    projects = null, version = '', log = () => {},
  }) {
    this.relayUrl = relayUrl;
    this.channel = channel;
    this.key = key;
    this.version = version;
    this.log = log;
    // projectId → {name, localPort, version}. Map keeps routing O(1) and
    // makes "is this frame ours?" a single lookup.
    this.projects = new Map();
    for (const p of projects || []) {
      this.projects.set(p.projectId, { name: p.name || '', localPort: p.localPort, version: p.version ?? version });
    }
    if (!projects && localPort != null) {
      this.projects.set(projectId, { name: project, localPort, version });
    }
    this.ws = null;
    this.subs = new Map(); // `${projectId}:${sub id}` → abort fn
    this.closed = false;
    this.attempts = 0;
    this.status = 'connecting';
  }

  connect() {
    if (this.closed) return;
    this.status = 'connecting';
    const ws = new WebSocket(this.relayUrl, { maxPayload: MAX_BODY * 2 });
    this.ws = ws;

    ws.on('open', () => {
      this.attempts = 0;
      this.status = 'connected';
      ws.send(JSON.stringify({ type: 'attach', channel: this.channel, role: 'host', v: 1 }));
      this.sendRoster();
      this.log('relay connected');
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (msg.type === 'presence') {
        // A phone just attached (or came back). Greet it — phones normally
        // arrive after the host, so the attach-time greeting alone would miss
        // every real client.
        if (msg.clients > 0) this.sendRoster();
        return;
      }
      if (msg.type !== 'frame' || typeof msg.data !== 'string') return;
      let frame;
      try { frame = decrypt(this.key, msg.data); } catch {
        // Wrong key or noise. Say nothing — an attacker probing the channel
        // learns nothing from silence.
        return;
      }
      this.handleFrame(frame).catch((e) => this.log(`frame error: ${e.message}`));
    });

    const retry = () => {
      if (this.closed) return;
      this.stopAllSubs();
      this.status = 'reconnecting';
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.attempts++);
      this.log(`relay lost — retrying in ${Math.round(delay / 1000)}s`);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
    ws.on('close', retry);
    ws.on('error', () => { /* close fires next; avoid crash-on-error default */ });
  }

  sendFrame(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'frame', data: encrypt(this.key, obj) }));
    }
  }

  /** Announce every served project — on attach, on presence, and on {t:'who'}. */
  sendRoster() {
    for (const [projectId, p] of this.projects) {
      this.sendFrame({ t: 'hi', project: p.name, projectId, version: p.version || this.version });
    }
  }

  /**
   * Which served project a frame is addressed to, or null if none — in which
   * case we say nothing: on a shared channel, silence about projects other
   * hosts (or nobody) serve is the correct answer. Frames without a `project`
   * field come from pre-pair-once phones; they only ever knew one project, so
   * when we serve exactly one, that is unambiguously it.
   */
  routeFor(frame) {
    if (frame.project != null) {
      return this.projects.has(frame.project) ? frame.project : null;
    }
    return this.projects.size === 1 ? this.projects.keys().next().value : null;
  }

  async handleFrame(frame) {
    if (frame.t === 'who') return this.sendRoster();
    const projectId = this.routeFor(frame);
    if (projectId == null) return; // not ours — ignore silently
    if (frame.t === 'req') return this.handleRequest(frame, projectId);
    if (frame.t === 'sub') return this.handleSubscribe(frame, projectId);
    if (frame.t === 'unsub') {
      const stop = this.subs.get(`${projectId}:${frame.id}`);
      if (stop) stop();
      return;
    }
  }

  handleRequest({ id, method, path: reqPath, body }, projectId) {
    method = String(method || 'GET').toUpperCase();
    if (!ALLOWED_METHODS.has(method) || !isAllowedPath(reqPath)) {
      this.sendFrame({ t: 'res', id, project: projectId, status: 403, body: { error: 'not allowed' } });
      return;
    }
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1',
      port: this.projects.get(projectId).localPort,
      method,
      path: reqPath,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {},
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { req.destroy(); }
        else chunks.push(c);
      });
      res.on('end', () => {
        let parsed;
        const raw = Buffer.concat(chunks).toString('utf8');
        try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { raw: raw.slice(0, 2000) }; }
        this.sendFrame({ t: 'res', id, project: projectId, status: res.statusCode, body: parsed });
      });
    });
    req.on('error', (e) => this.sendFrame({ t: 'res', id, project: projectId, status: 502, body: { error: e.message } }));
    if (payload) req.write(payload);
    req.end();
  }

  /** Open a local SSE stream and forward each event as an encrypted frame. */
  handleSubscribe({ id, path: reqPath }, projectId) {
    // Sub ids are scoped per project: two phones (or one phone, two project
    // views) may pick the same id without trampling each other's streams.
    const subKey = `${projectId}:${id}`;
    if (!isAllowedPath(reqPath) || this.subs.has(subKey)) {
      this.sendFrame({ t: 'end', id, project: projectId });
      return;
    }
    const req = http.request({
      host: '127.0.0.1', port: this.projects.get(projectId).localPort, method: 'GET', path: reqPath,
      headers: { Accept: 'text/event-stream' },
    }, (res) => {
      if (res.statusCode !== 200) {
        this.sendFrame({ t: 'end', id, project: projectId });
        this.subs.delete(subKey);
        return;
      }
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        // SSE events are blocks separated by a blank line.
        let sep;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const data = block.split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = { raw: data }; }
          this.sendFrame({ t: 'ev', id, project: projectId, data: parsed });
        }
        if (buffer.length > MAX_BODY) buffer = ''; // pathological stream; drop
      });
      res.on('end', () => {
        this.sendFrame({ t: 'end', id, project: projectId });
        this.subs.delete(subKey);
      });
    });
    req.on('error', () => {
      this.sendFrame({ t: 'end', id, project: projectId });
      this.subs.delete(subKey);
    });
    req.end();
    this.subs.set(subKey, () => { req.destroy(); this.subs.delete(subKey); });
  }

  stopAllSubs() {
    for (const stop of [...this.subs.values()]) stop();
    this.subs.clear();
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    this.stopAllSubs();
    if (this.ws) try { this.ws.close(); } catch { /* already gone */ }
  }
}
