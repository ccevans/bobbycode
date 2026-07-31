// views/workspace.js — one workspace: live log, diff, and the decision buttons.
import { $, el, workspaceLamp, STATUS_LABEL, rejectSheet, confirmSheet, toastError, describeEvent } from '../lib/ui.js';
import { store, refresh, ticketTitle, noteLog } from '../lib/store.js';
import { act } from './home.js';

let unsub = null;

export function leaveWorkspace() {
  if (unsub) { unsub(); unsub = null; }
}

export async function renderWorkspace(id) {
  leaveWorkspace();
  const root = $('#view-workspace');
  root.replaceChildren();
  const back = el('button', 'backlink', '← Home');
  back.onclick = () => { location.hash = '#/'; };
  root.append(back);

  const res = await store.transport.request('GET', `/api/workspaces/${id}`);
  if (res.status !== 200) { root.append(el('p', 'quiet-state', 'This workspace is gone.')); return; }
  const ws = res.body.workspace;

  const head = el('div', 'card-head');
  head.append(el('span', 'card-id', ws.ticketId));
  const stage = el('span', 'card-stage', STATUS_LABEL[ws.status] || ws.status);
  stage.style.setProperty('--stage', workspaceLamp(ws));
  stage.prepend(el('span', `lamp${ws.status === 'running' ? ' live' : ''}`));
  head.append(stage);
  root.append(head);
  root.append(el('div', 'next-reason', ticketTitle(ws.ticketId)));

  const meta = el('dl', 'meta-grid');
  const pairs = [['agent', ws.agent || '—'], ['branch', ws.branch || '—'], ['workflow', ws.pipeline || 'default']];
  if (ws.lastError) pairs.push(['error', ws.lastError]);
  for (const [k, v] of pairs) { meta.append(el('dt', null, k)); meta.append(el('dd', null, v)); }
  root.append(meta);

  const actions = el('div', 'detail-actions');
  const add = (label, cls, fn) => {
    const b = el('button', `btn ${cls || ''}`, label);
    b.onclick = fn;
    actions.append(b);
  };
  const sendBack = async () => {
    const reason = await rejectSheet();
    if (reason !== null) { await act(ws.id, 'reject', { reason }); renderWorkspace(id); }
  };
  if (ws.status === 'awaiting_approval') {
    add('Approve — next stage', 'btn-primary', async () => { await act(ws.id, 'approve'); renderWorkspace(id); });
    add('Send back', 'btn-danger', sendBack);
  } else if (ws.status === 'ready_to_merge') {
    add('Merge to main', 'btn-primary', async () => { await act(ws.id, 'merge'); location.hash = '#/'; });
    add('Send back', 'btn-danger', sendBack);
  } else if (ws.status === 'running') {
    add('Stop', 'btn-danger', async () => { await act(ws.id, 'stop'); renderWorkspace(id); });
  } else {
    add('Run agent', 'btn-primary', async () => { await act(ws.id, 'run'); renderWorkspace(id); });
    add('Discard workspace', 'btn-quiet', async () => {
      if (!(await confirmSheet({ title: 'Discard this workspace?', body: 'The worktree and any uncommitted work in it are deleted. The ticket stays.', action: 'Discard' }))) return;
      await act(ws.id, 'discard', { force: true });
      location.hash = '#/';
    });
  }
  root.append(actions);

  // Diff, collapsed until asked — big and only sometimes wanted.
  const diffHead = el('h2', 'rail-head', 'Changes');
  const diffBtn = el('button', 'btn btn-quiet', 'Show diff');
  const diffPane = el('div', 'diff-pane');
  diffPane.hidden = true;
  diffBtn.onclick = async () => {
    if (!diffPane.hidden) { diffPane.hidden = true; diffBtn.textContent = 'Show diff'; return; }
    const d = await store.transport.request('GET', `/api/workspaces/${id}/diff`);
    diffPane.replaceChildren();
    const text = d.status === 200 ? (d.body.diff || '(no changes yet)') : (d.body?.error || 'diff unavailable');
    for (const line of text.split('\n').slice(0, 2000)) {
      const cls = line.startsWith('+') && !line.startsWith('+++') ? 'add'
        : line.startsWith('-') && !line.startsWith('---') ? 'del'
        : line.startsWith('@@') ? 'hunk' : '';
      diffPane.append(el('div', cls, line));
    }
    if (d.body?.truncated) diffPane.append(el('div', 'hunk', '… diff truncated'));
    diffPane.hidden = false;
    diffBtn.textContent = 'Hide diff';
  };
  root.append(diffHead, diffBtn, diffPane);

  // Live log
  root.append(el('h2', 'rail-head', 'Live log'));
  const pane = el('div', 'log-pane');
  pane.textContent = ws.status === 'running' ? 'Waiting for output…' : 'Run history streams here while an agent works.';
  root.append(pane);

  let first = true;
  unsub = store.transport.subscribe(`/api/workspaces/${id}/events`, (ev) => {
    const line = describeEvent(ev);
    if (!line) return;
    noteLog(id, line);
    if (first) { pane.textContent = ''; first = false; }
    const type = (ev.entry && ev.entry.type) || ev.type;
    const cls = type === 'error' ? 'log-err' : type === 'tool_use' ? 'log-tool' : '';
    pane.append(el('div', cls, line));
    while (pane.children.length > 400) pane.removeChild(pane.firstChild);
    pane.scrollTop = pane.scrollHeight;
    // Status flips (running → needs review) re-render the buttons.
    if (ev.type === 'store' && ev.workspace && ev.workspace.id === id) {
      const current = STATUS_LABEL[ev.workspace.status];
      if (current && current !== stage.textContent) renderWorkspace(id);
    }
  });
}
