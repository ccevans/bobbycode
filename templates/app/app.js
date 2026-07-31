// Bobby — the app. Boot, routing, and live wiring.
//
// Routes (hash-based, so the server stays a dumb file server):
//   #/                 Home — needs-you, do-this-next, team
//   #/board            Ticket board
//   #/ticket/<id>      Ticket detail
//   #/workspace/<id>   Workspace detail (live log)
import { LocalTransport } from './lib/transport.js';
import { store, refresh, onChange, noteLog } from './lib/store.js';
import { $, describeEvent } from './lib/ui.js';
import { renderHome } from './views/home.js';
import { renderBoard, renderTicket } from './views/board.js';
import { renderWorkspace, leaveWorkspace } from './views/workspace.js';

const transport = new LocalTransport();
store.transport = transport;

/* ---------- presence ---------- */
const presenceEl = $('#presence');
transport.on('presence', (online) => {
  presenceEl.dataset.state = online ? 'online' : 'offline';
  if (online) refresh().catch(() => {});
});

/* ---------- routing ---------- */
const views = ['home', 'board', 'ticket', 'workspace'];

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, arg] = hash.split('/');
  if (name === 'board') return { view: 'board' };
  if (name === 'ticket' && arg) return { view: 'ticket', arg };
  if (name === 'workspace' && arg) return { view: 'workspace', arg };
  return { view: 'home' };
}

function show(view) {
  for (const v of views) $(`#view-${v}`).hidden = v !== view;
  for (const b of document.querySelectorAll('.nav-btn')) {
    b.classList.toggle('active', b.dataset.route === (view === 'ticket' ? 'board' : view === 'workspace' ? 'home' : view));
  }
}

function route() {
  leaveWorkspace();
  const r = currentRoute();
  show(r.view);
  if (r.view === 'home') renderHome();
  if (r.view === 'board') renderBoard();
  if (r.view === 'ticket') renderTicket(r.arg);
  if (r.view === 'workspace') renderWorkspace(r.arg);
}

window.addEventListener('hashchange', route);
for (const b of document.querySelectorAll('.nav-btn')) {
  b.onclick = () => { location.hash = b.dataset.route === 'home' ? '#/' : `#/${b.dataset.route}`; };
}

/* ---------- live wiring ---------- */
// Store changes re-render whichever list view is showing (detail views manage
// their own subscriptions).
onChange(() => {
  const r = currentRoute();
  if (r.view === 'home') renderHome();
  if (r.view === 'board') renderBoard();
});

// One global stream: any store event refreshes the world; running-agent
// heartbeat lines land on the Home cards. Opened only after the window has
// finished loading — an EventSource opened during load keeps the load event
// (and the tab spinner) hanging forever.
function openGlobalStream() {
  transport.subscribe('/api/events', (ev) => {
    if (ev.type === 'store') { refresh().catch(() => {}); return; }
    if (ev.workspaceId) noteLog(ev.workspaceId, describeEvent(ev));
  });
}
if (document.readyState === 'complete') openGlobalStream();
else window.addEventListener('load', openGlobalStream);

/* ---------- boot ---------- */
(async () => {
  try {
    const health = await transport.request('GET', '/api/health');
    presenceEl.dataset.state = health.status === 200 ? 'online' : 'offline';
  } catch { presenceEl.dataset.state = 'offline'; }
  try {
    const brief = await transport.request('GET', '/api/brief');
    // The server knows the project name only via config; brief carries state.
    // Use the page origin's title until hello exists on this transport.
    if (brief.status === 200) store.brief = brief.body.brief;
  } catch { /* offline start */ }
  // Project name from config via capabilities? Keep it simple: fetch tickets
  // dir name is not exposed; use document.title default and config later.
  await refresh().catch(() => {});
  const name = await projectName();
  if (name) $('#project-name').textContent = name;
  route();
})();

async function projectName() {
  // /api/capabilities is the one route that reflects server identity today.
  // The project name lives in config; expose it cheaply via brief in Phase 2.
  try {
    const res = await transport.request('GET', '/api/config');
    if (res.status === 200 && res.body.project) return res.body.project;
  } catch { /* fine */ }
  return null;
}
