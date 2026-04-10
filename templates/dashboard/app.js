// Bobby Dashboard frontend — vanilla JS, no framework, no bundler.
// Talks to the REST + SSE API exposed by lib/dashboard/server.js.

const state = {
  workspaces: [],
  selectedId: null,
  agents: [],
  tickets: [],
  activeTab: 'logs',
  logs: [],
  wsEventSource: null,
};

// ---------- API helpers ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---------- Rendering ----------
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'onclick') e.addEventListener('click', v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function formatDuration(startISO) {
  if (!startISO) return '';
  const diff = Date.now() - new Date(startISO).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function renderWorkspaceList() {
  const list = document.getElementById('ws-list');
  const count = document.getElementById('ws-count');
  count.textContent = state.workspaces.length;
  list.innerHTML = '';
  if (state.workspaces.length === 0) {
    list.appendChild(el('li', { class: 'ws-item' },
      el('div', { class: 'ws-meta' }, 'No workspaces yet. Click "+ New Workspace".')
    ));
    return;
  }
  for (const ws of state.workspaces) {
    const active = ws.id === state.selectedId ? ' active' : '';
    const item = el('li', {
      class: 'ws-item' + active,
      onclick: () => selectWorkspace(ws.id),
    },
      el('div', { class: 'ws-ticket' }, ws.ticketId),
      el('div', { class: 'ws-meta' },
        el('span', { class: `status-dot ${ws.status}` }),
        el('span', {}, ws.agent || '—'),
        el('span', {}, ws.status),
        ws.status === 'running' && ws.startedAt
          ? el('span', {}, formatDuration(ws.startedAt))
          : null
      )
    );
    list.appendChild(item);
  }
}

function renderAgentList() {
  const container = document.getElementById('agent-list');
  container.innerHTML = '';
  for (const a of state.agents) {
    container.appendChild(el('span', { class: 'agent-chip' }, a.key));
  }
}

function setStatusChip(el, status) {
  el.className = 'chip status ' + status;
  el.textContent = status;
}

function selectWorkspace(id) {
  state.selectedId = id;
  state.logs = [];
  renderWorkspaceList();
  renderDetail();
  subscribeWorkspace(id);
  loadTab(state.activeTab);
}

function renderDetail() {
  const empty = document.getElementById('detail-empty');
  const pane = document.getElementById('detail-pane');
  const ws = state.workspaces.find(w => w.id === state.selectedId);
  if (!ws) {
    empty.hidden = false;
    pane.hidden = true;
    return;
  }
  empty.hidden = true;
  pane.hidden = false;

  document.getElementById('d-title').textContent = `${ws.ticketId}`;
  document.getElementById('d-ticket').textContent = ws.ticketId;
  document.getElementById('d-agent').textContent = ws.agent || '—';
  document.getElementById('d-stage').textContent = ws.stage || 'no stage';
  setStatusChip(document.getElementById('d-status'), ws.status);
  document.getElementById('d-branch').textContent = ws.branch;
  document.getElementById('d-worktree').textContent = ws.worktreePath;

  // Button enable/disable based on status
  const canRun = ws.status !== 'running';
  const canStop = ws.status === 'running';
  const canApprove = ws.status === 'awaiting_approval' || ws.status === 'idle';
  const canMerge = ws.status === 'ready_to_merge';
  document.getElementById('btn-run').disabled = !canRun;
  document.getElementById('btn-stop').disabled = !canStop;
  document.getElementById('btn-approve').disabled = !canApprove;
  document.getElementById('btn-reject').disabled = ws.status !== 'awaiting_approval';
  document.getElementById('btn-merge').disabled = !canMerge;
}

function renderLogs() {
  const container = document.getElementById('logs');
  container.innerHTML = '';
  for (const entry of state.logs) {
    const time = (entry.ts || entry.at || '').slice(11, 19);
    const type = entry.type || 'event';
    let detail = '';
    if (entry.kind === 'json') {
      detail = JSON.stringify(entry.data);
    } else if (entry.kind === 'text') {
      detail = entry.data;
    } else if (entry.text) {
      detail = entry.text;
    } else {
      const { ts, at, type: _t, ...rest } = entry;
      detail = JSON.stringify(rest);
    }
    container.appendChild(el('div', { class: 'log-entry' },
      el('span', { class: 'log-time' }, time),
      el('span', { class: 'log-type ' + type }, type.padEnd(12, ' ')),
      el('span', {}, ' ' + detail)
    ));
  }
  container.scrollTop = container.scrollHeight;
}

function renderDiff(diffText, truncated) {
  const container = document.getElementById('diff');
  container.innerHTML = '';
  if (!diffText) {
    container.textContent = 'No changes yet.';
    return;
  }
  for (const line of diffText.split('\n')) {
    let cls = '';
    if (line.startsWith('+++') || line.startsWith('---')) cls = 'line-head';
    else if (line.startsWith('+')) cls = 'line-add';
    else if (line.startsWith('-')) cls = 'line-del';
    else if (line.startsWith('@@')) cls = 'line-hunk';
    container.appendChild(el('div', { class: cls }, line));
  }
  if (truncated) {
    container.appendChild(el('div', { class: 'line-hunk' }, '--- diff truncated ---'));
  }
}

function renderFiles(files) {
  const list = document.getElementById('files');
  list.innerHTML = '';
  if (!files || files.length === 0) {
    list.appendChild(el('li', {}, 'No changes yet.'));
    return;
  }
  for (const f of files) {
    list.appendChild(el('li', {},
      el('span', {}, f.file),
      el('span', { class: 'stats' },
        el('span', { class: 'added' }, `+${f.added ?? 0}`),
        el('span', { class: 'removed' }, `-${f.removed ?? 0}`)
      )
    ));
  }
}

function renderRuns(ws) {
  const list = document.getElementById('runs');
  list.innerHTML = '';
  const runs = ws?.runs || [];
  if (runs.length === 0) {
    list.appendChild(el('li', {}, 'No runs yet.'));
    return;
  }
  for (const r of runs.slice().reverse()) {
    list.appendChild(el('li', {},
      el('div', { class: 'run-agent' }, `${r.agent} → exit ${r.exitCode ?? '?'}`),
      el('div', { class: 'run-meta' },
        `session ${r.sessionId} · ${r.startedAt?.slice(11, 19)} → ${r.endedAt?.slice(11, 19)}${r.error ? ' · ' + r.error : ''}`
      )
    ));
  }
}

// ---------- Data loaders ----------
async function loadWorkspaces() {
  const { workspaces } = await api('/api/workspaces');
  state.workspaces = workspaces;
  renderWorkspaceList();
  renderDetail();
}

async function loadAgents() {
  const { agents } = await api('/api/agents');
  state.agents = agents;
  renderAgentList();
  const sel = document.getElementById('new-agent');
  sel.innerHTML = '';
  // Orchestration agents first (pipeline / next), then stage agents, then
  // specialists. Skip 'ship' — it's a cross-workspace action.
  const order = ['pipeline', 'feature', 'next', 'plan', 'build', 'review', 'test'];
  const labels = {
    pipeline: 'pipeline — run plan → build → review → test in one go',
    feature: 'feature — epic workflow (ticket must be an epic)',
    next: 'next — run the agent for current stage',
  };
  const sorted = [
    ...order.map(k => agents.find(a => a.key === k)).filter(Boolean),
    ...agents.filter(a => !order.includes(a.key) && a.key !== 'ship'),
  ];
  for (const a of sorted) {
    const label = labels[a.key] || `${a.key} — ${a.label}`;
    sel.appendChild(el('option', { value: a.key }, label));
  }
}

async function loadTickets() {
  console.log('[bobby] loadTickets() fetching /api/tickets');
  const resp = await api('/api/tickets');
  console.log('[bobby] /api/tickets response:', resp);
  const { tickets, skipped } = resp;
  state.tickets = tickets;
  const sel = document.getElementById('new-ticket');
  if (!sel) { console.error('[bobby] #new-ticket element not found'); return; }
  sel.innerHTML = '';
  console.log('[bobby] tickets is array:', Array.isArray(tickets), 'length:', tickets?.length);
  if (!tickets || tickets.length === 0) {
    sel.appendChild(el('option', { value: '', disabled: 'disabled' }, 'No tickets found'));
  } else {
    for (const t of tickets) {
      const title = t.title || t.data?.title || '(no title)';
      const stage = t.stage || t.data?.stage || '?';
      sel.appendChild(el('option', { value: t.id }, `${t.id} — ${title} [${stage}]`));
    }
    console.log('[bobby] appended', sel.children.length, 'options to #new-ticket');
  }
  const err = document.getElementById('new-error');
  const errLines = [];
  if (skipped && skipped.length > 0) {
    errLines.push(`Skipped ${skipped.length}: ${skipped.map(s => s.dirname).join(', ')}`);
  }
  errLines.push(`Loaded ${tickets?.length || 0} tickets at ${new Date().toLocaleTimeString()}`);
  err.textContent = errLines.join(' · ');
}

async function loadTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  if (!state.selectedId) return;
  if (tab === 'diff') {
    try {
      const { diff, truncated } = await api(`/api/workspaces/${state.selectedId}/diff`);
      renderDiff(diff, truncated);
    } catch (e) {
      document.getElementById('diff').textContent = 'Error: ' + e.message;
    }
  } else if (tab === 'files') {
    try {
      const { files } = await api(`/api/workspaces/${state.selectedId}/files`);
      renderFiles(files);
    } catch (e) {
      document.getElementById('files').innerHTML = `<li>Error: ${e.message}</li>`;
    }
  } else if (tab === 'runs') {
    const ws = state.workspaces.find(w => w.id === state.selectedId);
    renderRuns(ws);
  }
}

// ---------- SSE ----------
function subscribeGlobal() {
  const es = new EventSource('/api/events');
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'store') {
        // Refresh list from server to keep order consistent
        loadWorkspaces();
      }
    } catch {}
  };
  es.onerror = () => { /* EventSource auto-reconnects */ };
}

function subscribeWorkspace(id) {
  if (state.wsEventSource) {
    state.wsEventSource.close();
    state.wsEventSource = null;
  }
  const es = new EventSource(`/api/workspaces/${id}/events`);
  state.wsEventSource = es;
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'session_event') {
        state.logs.push(msg.entry);
        if (state.activeTab === 'logs') renderLogs();
      } else if (msg.event === 'exec_event') {
        state.logs.push({ ts: msg.at, type: msg.data.type, ...msg.data });
        if (state.activeTab === 'logs') renderLogs();
      } else if (msg.type === 'store') {
        // Patch in workspace updates
        if (msg.workspace?.id === id) {
          const idx = state.workspaces.findIndex(w => w.id === id);
          if (idx >= 0) state.workspaces[idx] = msg.workspace;
          else state.workspaces.unshift(msg.workspace);
          renderWorkspaceList();
          renderDetail();
          if (state.activeTab === 'diff' || state.activeTab === 'files') loadTab(state.activeTab);
        }
      }
    } catch {}
  };
}

// ---------- Event handlers ----------
function hookTabs() {
  document.querySelectorAll('.tab').forEach(b => {
    b.addEventListener('click', () => loadTab(b.dataset.tab));
  });
}

function hookActions() {
  const wsFor = () => state.selectedId;
  const act = async (fn) => {
    const id = wsFor();
    if (!id) return;
    try {
      await fn(id);
      await loadWorkspaces();
    } catch (e) {
      alert(e.message);
    }
  };
  document.getElementById('btn-run').addEventListener('click', () => act(id => api(`/api/workspaces/${id}/run`, { method: 'POST' })));
  document.getElementById('btn-stop').addEventListener('click', () => act(id => api(`/api/workspaces/${id}/stop`, { method: 'POST' })));
  document.getElementById('btn-approve').addEventListener('click', () => act(id => api(`/api/workspaces/${id}/approve`, { method: 'POST' })));
  document.getElementById('btn-reject').addEventListener('click', () => {
    const reason = prompt('Rejection reason?');
    if (reason === null) return;
    act(id => api(`/api/workspaces/${id}/reject`, { method: 'POST', body: { reason } }));
  });
  document.getElementById('btn-merge').addEventListener('click', () => {
    if (!confirm('Merge this workspace into main?')) return;
    act(id => api(`/api/workspaces/${id}/merge`, { method: 'POST' }));
  });
  document.getElementById('btn-discard').addEventListener('click', () => {
    if (!confirm('Discard workspace (worktree + branch)?')) return;
    act(id => api(`/api/workspaces/${id}/discard`, { method: 'POST', body: { force: true } }));
  });
  document.getElementById('btn-stop-all').addEventListener('click', async () => {
    const running = state.workspaces.filter(w => w.status === 'running');
    for (const w of running) {
      try { await api(`/api/workspaces/${w.id}/stop`, { method: 'POST' }); } catch {}
    }
    await loadWorkspaces();
  });
}

function hookModal() {
  const modal = document.getElementById('modal');
  const open = async () => {
    const err = document.getElementById('new-error');
    err.textContent = '';
    modal.hidden = false; // Show modal first so errors are visible.
    try { await loadTickets(); } catch (e) { err.textContent = 'Tickets: ' + e.message; }
    try { await loadAgents(); } catch (e) { err.textContent += (err.textContent ? ' · ' : '') + 'Agents: ' + e.message; }
  };
  const close = () => { modal.hidden = true; };
  document.getElementById('btn-new').addEventListener('click', open);
  document.getElementById('btn-cancel').addEventListener('click', close);
  document.getElementById('btn-create').addEventListener('click', async () => {
    const ticketId = document.getElementById('new-ticket').value;
    const agent = document.getElementById('new-agent').value;
    try {
      const { workspace } = await api('/api/workspaces', { method: 'POST', body: { ticketId, agent } });
      close();
      await loadWorkspaces();
      selectWorkspace(workspace.id);
    } catch (e) {
      document.getElementById('new-error').textContent = e.message;
    }
  });
}

// ---------- Boot ----------
async function preloadTicketCount() {
  const btn = document.getElementById('btn-new');
  try {
    const { tickets, skipped } = await api('/api/tickets');
    const n = (tickets || []).length;
    const s = (skipped || []).length;
    btn.textContent = `+ New Workspace (${n} tickets${s ? `, ${s} skipped` : ''})`;
    console.log('[bobby] preloadTicketCount:', n, 'tickets,', s, 'skipped');
  } catch (e) {
    btn.textContent = `+ New Workspace (tickets: ERROR)`;
    console.error('[bobby] preloadTicketCount failed:', e.message);
  }
}

async function boot() {
  console.log('[bobby] boot() starting, build:', document.currentScript?.src || location.href);
  hookTabs();
  hookActions();
  hookModal();
  await loadAgents();
  await loadWorkspaces();
  await preloadTicketCount();
  subscribeGlobal();
  // Auto-refresh list every 5s so durations tick
  setInterval(() => renderWorkspaceList(), 5000);
  console.log('[bobby] boot() complete');
}

boot().catch(e => {
  document.body.innerHTML = `<pre style="color:red;padding:24px">${e.message}\n${e.stack || ''}</pre>`;
});
