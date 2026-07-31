// views/home.js — the app IS this screen.
//
// Three things, in the order a solo builder needs them: what needs you (the
// amber queue), the one next action (brief's nextAction as a single button),
// and what the team is doing right now.
import { $, el, workspaceLamp, STATUS_LABEL, confirmSheet, rejectSheet, toastError } from '../lib/ui.js';
import { store, refresh, ticketTitle } from '../lib/store.js';

export function renderHome() {
  const root = $('#view-home');
  root.replaceChildren();

  // --- Needs you ---
  root.append(el('h2', 'rail-head', 'Needs you'));
  const needs = store.workspaces.filter((w) => w.status === 'awaiting_approval' || w.status === 'ready_to_merge');
  if (needs.length === 0) {
    const active = store.workspaces.some((w) => w.status === 'running');
    root.append(el('p', 'quiet-state', active
      ? 'Nothing needs you. Your team is heads-down.'
      : 'Nothing needs you.'));
  }
  for (const ws of needs) {
    const card = el('div', 'attn-card');
    const ready = ws.status === 'ready_to_merge';
    card.append(el('div', 'attn-eyebrow', ready ? 'Ready to merge' : 'Waiting on you'));
    card.append(el('div', 'attn-title', `${ws.ticketId} — ${ws.agent || ws.stage || 'agent'} finished`));
    card.append(el('div', 'attn-sub', ticketTitle(ws.ticketId)));
    const row = el('div', 'btn-row');
    const ok = el('button', 'btn btn-primary', ready ? 'Merge' : 'Approve');
    ok.onclick = () => act(ws.id, ready ? 'merge' : 'approve');
    const back = el('button', 'btn btn-danger', 'Send back');
    back.onclick = async () => {
      const reason = await rejectSheet();
      if (reason !== null) act(ws.id, 'reject', { reason });
    };
    const view = el('button', 'btn btn-quiet', 'Look first');
    view.onclick = () => { location.hash = `#/workspace/${ws.id}`; };
    row.append(ok, back, view);
    card.append(row);
    root.append(card);
  }

  // --- Do this next ---
  root.append(el('h2', 'rail-head', 'Next'));
  const next = store.brief?.nextAction;
  if (next && next.argv) {
    const card = el('div', 'next-card');
    card.append(el('div', 'next-eyebrow', 'Do this next'));
    card.append(el('div', 'next-reason', next.reason || 'Make progress'));
    card.append(el('div', 'next-cmd', next.command || next.argv.join(' ')));
    const btn = el('button', 'btn btn-primary', 'Do it');
    btn.disabled = store.busy;
    btn.onclick = async () => {
      const body = el('span');
      body.append(document.createTextNode('This will run '));
      body.append(el('code', null, next.command || next.argv.join(' ')));
      body.append(document.createTextNode(' — an agent works on your machine and uses your Claude subscription.'));
      if (!(await confirmSheet({ title: next.reason || 'Run the next step?', body, action: 'Run it' }))) return;
      store.busy = true;
      try {
        const res = await store.transport.request('POST', '/api/go', { argv: next.argv });
        if (res.status >= 400) toastError(res.body?.error || 'That did not start');
        else if (res.body.kind === 'workspace' && res.body.workspace) {
          location.hash = `#/workspace/${res.body.workspace.id}`;
        }
      } catch (e) { toastError(e.message); }
      store.busy = false;
      refresh().catch(() => {});
    };
    card.append(btn);
    root.append(card);
  } else {
    root.append(el('p', 'quiet-state', 'All caught up. Add a ticket on the Board when inspiration strikes.'));
  }

  // --- Team ---
  root.append(el('h2', 'rail-head', 'Team'));
  const active = store.workspaces.filter((w) => !needs.includes(w));
  if (active.length === 0) {
    root.append(el('p', 'quiet-state', store.workspaces.length > 0
      ? 'Everyone is in the queue above.'
      : 'No workspaces. Starting the next step will create one.'));
  }
  for (const ws of active) {
    root.append(workspaceCard(ws));
  }
}

function workspaceCard(ws) {
  const card = el('button', 'card');
  card.style.setProperty('--stage', workspaceLamp(ws));
  const head = el('div', 'card-head');
  head.append(el('span', 'card-id', ws.ticketId));
  const stage = el('span', 'card-stage', STATUS_LABEL[ws.status] || ws.status);
  stage.prepend(el('span', `lamp${ws.status === 'running' ? ' live' : ''}`));
  head.append(stage);
  card.append(head);
  card.append(el('div', 'card-title', ticketTitle(ws.ticketId)));
  const last = store.lastLog.get(ws.id);
  if (last && ws.status === 'running') card.append(el('div', 'card-log', last));
  card.onclick = () => { location.hash = `#/workspace/${ws.id}`; };
  return card;
}

export async function act(id, verb, body) {
  try {
    const res = await store.transport.request('POST', `/api/workspaces/${id}/${verb}`, body || {});
    if (res.status >= 400) toastError(res.body?.error || `${verb} failed`);
  } catch (e) { toastError(e.message); }
  refresh().catch(() => {});
}
