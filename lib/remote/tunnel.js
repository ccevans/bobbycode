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
//   phone → host  {t:'req', id, method, path, body}     one HTTP round trip
//   phone → host  {t:'sub', id, path}                   open an SSE stream
//   phone → host  {t:'unsub', id}                       close it
//   host  → phone {t:'res', id, status, body}
//   host  → phone {t:'ev', id, data}                    one SSE event
//   host  → phone {t:'end', id}                         stream closed
//   host  → phone {t:'hi', project, projects, version}  greeting on attach
//   phone → host  req/sub frames MAY carry `project` — the studio project the
//                 frame targets. Forwarded to the local API as x-bobby-project,
//                 which resolves that board per request (BOB-067): one pairing,
//                 every project, statelessly — no global switch to race.
// Relay envelope (plaintext): {type:'attach'|'frame'|'presence', ...} — the
// relay sees routing metadata only, plus:
//   host → relay  {type:'notify', kind}   wake the phone; see sendNotify()
import http from 'http';
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
 * The push kinds the host will put on the wire. A subset of the relay's
 * `KINDS` (pro hq/relay/push.js) — `done` is deliberately absent; see
 * sendNotify() and lib/remote/notifier.js `kindFor`.
 */
const NOTIFY_KINDS = new Set(['needs_you', 'failed']);

export class RemoteTunnel {
  constructor({ relayUrl, channel, key, localPort, project = '', projects = null, version = '', log = () => {} }) {
    this.relayUrl = relayUrl;
    this.channel = channel;
    this.key = key;
    this.localPort = localPort;
    this.project = project;
    // The studio's project roster, for the phone's picker (BOB-067). Supplied by
    // the caller so this class needs no studio imports; [] off-studio.
    this.projects = projects || (this.project ? [this.project] : []);
    this.version = version;
    this.log = log;
    this.ws = null;
    this.subs = new Map(); // sub id → abort fn
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
      this.sendFrame({ t: 'hi', project: this.project, projects: this.projects, version: this.version });
      this.log('relay connected');
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (msg.type === 'presence') {
        // A phone just attached (or came back). Greet it — phones normally
        // arrive after the host, so the attach-time greeting alone would miss
        // every real client.
        if (msg.clients > 0) this.sendFrame({ t: 'hi', project: this.project, projects: this.projects, version: this.version });
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

  /**
   * Wake the phone. PLAINTEXT, on purpose — and the ONLY plaintext this host
   * ever sends besides `attach`.
   *
   * The relay must be able to hand something to Apple/Google while staying
   * unable to read the E2E frames, so the host chooses to reveal exactly one
   * enum value and nothing else (pro hq/PUSH.md, hq/relay/server.js). The
   * payload is built here from the kind alone — never a ticket id, title, stage
   * or error — which is why this is its own named method and not a flag on
   * sendFrame(). Mirrors the app's sendPushSubscribe() carve-out.
   *
   * Undeliverable notifies are dropped, never queued: if the socket is down
   * there is no phone listening, and a `needs_you` replayed minutes later on
   * reconnect points at a queue the user may already have drained.
   */
  sendNotify(kind) {
    if (!NOTIFY_KINDS.has(kind)) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'notify', kind }));
  }

  async handleFrame(frame) {
    if (frame.t === 'req') return this.handleRequest(frame);
    if (frame.t === 'sub') return this.handleSubscribe(frame);
    if (frame.t === 'unsub') {
      const stop = this.subs.get(frame.id);
      if (stop) stop();
      return;
    }
  }

  handleRequest({ id, method, path: reqPath, body, project }) {
    method = String(method || 'GET').toUpperCase();
    if (!ALLOWED_METHODS.has(method) || !isAllowedPath(reqPath)) {
      this.sendFrame({ t: 'res', id, status: 403, body: { error: 'not allowed' } });
      return;
    }
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1',
      port: this.localPort,
      method,
      path: reqPath,
      // The project this frame targets, stamped per request (BOB-067). A header
      // rather than a context switch: switching mutates the ONE global active
      // project, so a frame for B arriving before A's proxied request was
      // served would mis-scope it — and the desktop would have its board
      // flipped under it besides. Stateless survives both. Absent → the active
      // project, exactly as before.
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(project ? { 'x-bobby-project': String(project) } : {}),
      },
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
        this.sendFrame({ t: 'res', id, status: res.statusCode, body: parsed });
      });
    });
    req.on('error', (e) => this.sendFrame({ t: 'res', id, status: 502, body: { error: e.message } }));
    if (payload) req.write(payload);
    req.end();
  }

  /** Open a local SSE stream and forward each event as an encrypted frame. */
  handleSubscribe({ id, path: reqPath, project }) {
    if (!isAllowedPath(reqPath) || this.subs.has(id)) {
      this.sendFrame({ t: 'end', id });
      return;
    }
    const req = http.request({
      host: '127.0.0.1', port: this.localPort, method: 'GET', path: reqPath,
      // Same per-frame scoping as requests: the stream captures its project at
      // subscribe time (BOB-067).
      headers: { Accept: 'text/event-stream', ...(project ? { 'x-bobby-project': String(project) } : {}) },
    }, (res) => {
      if (res.statusCode !== 200) {
        this.sendFrame({ t: 'end', id });
        this.subs.delete(id);
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
          this.sendFrame({ t: 'ev', id, data: parsed });
        }
        if (buffer.length > MAX_BODY) buffer = ''; // pathological stream; drop
      });
      res.on('end', () => {
        this.sendFrame({ t: 'end', id });
        this.subs.delete(id);
      });
    });
    req.on('error', () => {
      this.sendFrame({ t: 'end', id });
      this.subs.delete(id);
    });
    req.end();
    this.subs.set(id, () => { req.destroy(); this.subs.delete(id); });
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
