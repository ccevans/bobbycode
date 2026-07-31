// templates/app/lib/store.js — app state, one refresh path, tiny pub/sub.

export const store = {
  transport: null,
  brief: null,
  workspaces: [],
  tickets: [],
  lastLog: new Map(),   // workspace id → last log line (for running cards)
  listeners: new Set(),
  busy: false,          // an action (go/approve/…) is in flight
};

export function onChange(fn) {
  store.listeners.add(fn);
  return () => store.listeners.delete(fn);
}

function notify() {
  for (const fn of store.listeners) fn();
}

/** One refresh path: brief + workspaces + tickets, then re-render everyone. */
export async function refresh() {
  const t = store.transport;
  const [briefRes, wsRes, tkRes] = await Promise.all([
    t.request('GET', '/api/brief'),
    t.request('GET', '/api/workspaces'),
    t.request('GET', '/api/tickets'),
  ]);
  if (briefRes.status === 200) store.brief = briefRes.body.brief;
  if (wsRes.status === 200) {
    store.workspaces = (wsRes.body.workspaces || [])
      .filter((w) => w.status !== 'merged')
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }
  if (tkRes.status === 200) store.tickets = tkRes.body.tickets || [];
  notify();
}

export function ticketTitle(id) {
  const t = store.tickets.find((t) => t.id === id);
  return t ? t.title : '';
}

export function noteLog(workspaceId, line) {
  if (!line) return;
  store.lastLog.set(workspaceId, line);
  notify();
}
