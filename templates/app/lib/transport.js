// templates/app/lib/transport.js
// The one seam between the UI and the machine running the agents.
//
// Views never know which side of the seam they are on: locally this is plain
// fetch + EventSource against the same origin; remotely (Phase 3) the same
// interface is implemented over the E2E-encrypted relay frames. Keep the
// interface tiny and boring — that is what makes the phone app free.
//
//   request(method, path, body) → Promise<{ status, body }>
//   subscribe(path, onEvent)    → unsubscribe()
//   on('status'|'presence', fn)

export class LocalTransport {
  constructor() {
    this.listeners = { status: [], presence: [] };
    this.online = true;
  }

  on(evt, fn) { this.listeners[evt].push(fn); }
  emit(evt, arg) { for (const fn of this.listeners[evt]) fn(arg); }

  async request(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      this.setOnline(false);
      throw new Error('Bobby is not reachable — is `bobby app` still running?');
    }
    this.setOnline(true);
    let parsed = {};
    try { parsed = await res.json(); } catch { /* empty body */ }
    return { status: res.status, body: parsed };
  }

  subscribe(path, onEvent) {
    let es = new EventSource(path);
    let closed = false;
    es.onmessage = (e) => {
      this.setOnline(true);
      try { onEvent(JSON.parse(e.data)); } catch { /* skip malformed */ }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; reflect the gap in the presence dot.
      this.setOnline(false);
    };
    es.onopen = () => this.setOnline(true);
    return () => {
      if (closed) return;
      closed = true;
      es.close();
    };
  }

  setOnline(v) {
    if (this.online === v) return;
    this.online = v;
    this.emit('presence', v);
    this.emit('status', v ? 'online' : 'offline');
  }
}
