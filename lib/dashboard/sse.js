// lib/dashboard/sse.js
//
// Minimal Server-Sent Events broadcaster. Each channel is an independent set
// of connected clients; broadcast() writes to all of them. Used by the
// dashboard server to stream workspace events and global updates.

export class SSEHub {
  constructor() {
    /** @type {Map<string, Set<import('http').ServerResponse>>} */
    this.channels = new Map();
  }

  /**
   * Register a new SSE client response on the given channel. Sends the SSE
   * headers and a priming comment. Returns an unsubscribe function.
   */
  connect(channel, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    try { res.write(': connected\n\n'); } catch { /* client already gone */ }

    let set = this.channels.get(channel);
    if (!set) {
      set = new Set();
      this.channels.set(channel, set);
    }
    set.add(res);

    const unsubscribe = () => {
      const s = this.channels.get(channel);
      if (s) {
        s.delete(res);
        if (s.size === 0) this.channels.delete(channel);
      }
    };

    res.on('close', unsubscribe);
    res.on('error', unsubscribe);

    // Periodic heartbeat to keep the connection alive through proxies.
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { /* connection closed */ }
    }, 25000);
    heartbeat.unref?.();
    res.on('close', () => clearInterval(heartbeat));

    return unsubscribe;
  }

  /**
   * Broadcast a data event to all clients on a channel. `event` is optional;
   * when present it sets the SSE event name. `data` is JSON-serialized.
   */
  broadcast(channel, data, event) {
    const set = this.channels.get(channel);
    if (!set || set.size === 0) return;
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const lines = [];
    if (event) lines.push(`event: ${event}`);
    lines.push(`data: ${payload}`);
    const message = lines.join('\n') + '\n\n';
    for (const res of set) {
      try { res.write(message); } catch { /* client disconnected */ }
    }
  }

  /**
   * Close all connections on a channel (or all channels if no channel given).
   */
  closeAll(channel) {
    const close = (set) => {
      for (const res of set) {
        try { res.end(); } catch { /* ignore */ }
      }
      set.clear();
    };
    if (channel) {
      const set = this.channels.get(channel);
      if (set) close(set);
      this.channels.delete(channel);
    } else {
      for (const set of this.channels.values()) close(set);
      this.channels.clear();
    }
  }
}
