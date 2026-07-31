// views/board.js — the ticket board and ticket detail.
import { $, el, STAGE_LAMP, confirmSheet, toastError } from '../lib/ui.js';
import { store, refresh } from '../lib/store.js';

const BOARD_ORDER = ['backlog', 'planning', 'building', 'reviewing', 'testing', 'shipping', 'blocked', 'done'];

export function renderBoard() {
  const root = $('#view-board');
  root.replaceChildren();

  const head = el('div', 'btn-row');
  const newBtn = el('button', 'btn', '+ New ticket');
  newBtn.onclick = openTicketSheet;
  head.append(newBtn);
  root.append(head);

  const lanes = el('div', null);
  lanes.id = 'board-lanes';
  root.append(lanes);

  let any = false;
  for (const stage of BOARD_ORDER) {
    const here = store.tickets.filter((t) => (t.stage || 'backlog') === stage);
    if (here.length === 0) continue;
    any = true;
    const lane = el('div', 'lane');
    const h = el('h2', 'rail-head');
    h.append(document.createTextNode(`${stage} `));
    h.append(el('span', 'stage-count', String(here.length)));
    lane.append(h);
    for (const t of here) {
      const card = el('button', 'card');
      card.style.setProperty('--stage', STAGE_LAMP[stage] || 'var(--lamp-idle)');
      const ch = el('div', 'card-head');
      ch.append(el('span', 'card-id', t.id));
      if (t.priority) ch.append(el('span', 'card-stage', t.priority));
      card.append(ch);
      card.append(el('div', 'card-title', t.title || ''));
      card.onclick = () => { location.hash = `#/ticket/${t.id}`; };
      lane.append(card);
    }
    lanes.append(lane);
  }
  if (!any) {
    lanes.append(el('p', 'quiet-state', 'No tickets yet. Create the first one — a sentence is enough.'));
  }
}

export async function renderTicket(id) {
  const root = $('#view-ticket');
  root.replaceChildren();
  const back = el('button', 'backlink', '← Board');
  back.onclick = () => { location.hash = '#/board'; };
  root.append(back);

  const res = await store.transport.request('GET', `/api/tickets/${id}`);
  if (res.status !== 200) { root.append(el('p', 'quiet-state', 'Ticket not found.')); return; }
  const t = res.body.ticket;

  const head = el('div', 'card-head');
  head.append(el('span', 'card-id', t.id));
  const stage = el('span', 'card-stage', t.stage || 'backlog');
  stage.style.setProperty('--stage', STAGE_LAMP[t.stage] || 'var(--lamp-idle)');
  stage.prepend(el('span', 'lamp'));
  head.append(stage);
  root.append(head);
  root.append(el('div', 'next-reason', t.title || ''));

  const meta = el('dl', 'meta-grid');
  for (const [k, v] of [['priority', t.priority], ['type', t.type], ['area', t.area], ['workflow', t.workflow]]) {
    if (!v) continue;
    meta.append(el('dt', null, k));
    meta.append(el('dd', null, String(v)));
  }
  root.append(meta);

  const actions = el('div', 'detail-actions');
  const active = store.workspaces.find((w) => w.ticketId === t.id && w.status !== 'merged');
  if (active) {
    const view = el('button', 'btn btn-primary', 'View the work in progress');
    view.onclick = () => { location.hash = `#/workspace/${active.id}`; };
    actions.append(view);
  } else {
    const start = el('button', 'btn btn-primary', 'Start work (full workflow)');
    start.onclick = () => startAgent(t, 'workflow');
    actions.append(start);
  }
  root.append(actions);

  if (t.content && t.content.trim()) {
    root.append(el('div', 'ticket-body', t.content.trim()));
  }
}

async function startAgent(t, agent) {
  const body = el('span');
  body.append(document.createTextNode(`Plan → build → review → test on ${t.id}. `));
  body.append(document.createTextNode('Agents work on your machine and use your Claude subscription.'));
  if (!(await confirmSheet({ title: `Start work on ${t.id}?`, body, action: 'Start' }))) return;
  try {
    const created = await store.transport.request('POST', '/api/workspaces', { ticketId: t.id, agent });
    if (created.status >= 400) { toastError(created.body?.error || 'could not create a workspace'); return; }
    const wsId = created.body.workspace.id;
    const run = await store.transport.request('POST', `/api/workspaces/${wsId}/run`, {});
    if (run.status >= 400) { toastError(run.body?.error || 'could not start the agent'); return; }
    location.hash = `#/workspace/${wsId}`;
  } catch (e) { toastError(e.message); }
  refresh().catch(() => {});
}

function openTicketSheet() {
  const sheet = $('#ticket-sheet');
  $('#nt-title').value = '';
  $('#nt-desc').value = '';
  $('#nt-priority').value = 'medium';
  sheet.hidden = false;
  $('#nt-title').focus();

  const close = () => {
    sheet.hidden = true;
    ok.onclick = cancel.onclick = sheet.onclick = null;
  };
  const ok = $('#nt-ok');
  const cancel = $('#nt-cancel');
  cancel.onclick = close;
  sheet.onclick = (e) => { if (e.target === sheet) close(); };
  ok.onclick = async () => {
    const title = $('#nt-title').value.trim();
    if (!title) return;
    try {
      const res = await store.transport.request('POST', '/api/tickets', {
        title,
        description: $('#nt-desc').value.trim(),
        priority: $('#nt-priority').value,
      });
      if (res.status >= 400) { toastError(res.body?.error || 'could not create the ticket'); return; }
      close();
      refresh().catch(() => {});
    } catch (e) { toastError(e.message); }
  };
}
