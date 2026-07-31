// templates/app/lib/ui.js — shared DOM helpers and the stage/status language.

export const $ = (sel) => document.querySelector(sel);

export const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export const STAGE_LAMP = {
  plan: 'var(--lamp-planning)', planning: 'var(--lamp-planning)',
  build: 'var(--lamp-building)', building: 'var(--lamp-building)',
  review: 'var(--lamp-reviewing)', reviewing: 'var(--lamp-reviewing)',
  test: 'var(--lamp-testing)', testing: 'var(--lamp-testing)',
  ship: 'var(--lamp-shipping)', shipping: 'var(--lamp-shipping)', done: 'var(--lamp-shipping)',
  workflow: 'var(--lamp-building)', backlog: 'var(--lamp-idle)', blocked: 'var(--lamp-failed)',
};

export const STATUS_LABEL = {
  idle: 'idle', running: 'running', awaiting_approval: 'needs review',
  ready_to_merge: 'ready to merge', merged: 'merged', failed: 'failed',
  stopped: 'stopped', unknown: 'lost',
};

export function workspaceLamp(ws) {
  if (ws.status === 'failed' || ws.status === 'unknown') return 'var(--lamp-failed)';
  return STAGE_LAMP[ws.stage || ws.agent] || 'var(--lamp-idle)';
}

/** One SSE entry → one human log line (or null to drop it). */
export function describeEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.type === 'store') return `» ${ev.workspace?.status || ev.event}`;
  const entry = ev.entry || ev;
  if (entry.type === 'tool_use') return `⚙ ${entry.tool || 'tool'}${entry.detail ? ` — ${String(entry.detail).slice(0, 200)}` : ''}`;
  if (entry.text) return String(entry.text).slice(0, 500);
  if (entry.message) return String(entry.message).slice(0, 500);
  if (entry.result) return String(entry.result).slice(0, 500);
  if (entry.raw) return String(entry.raw).slice(0, 500);
  return null;
}

export function toastError(msg) {
  const bar = el('div', 'toast', msg);
  $('#main').prepend(bar);
  setTimeout(() => bar.remove(), 5000);
}

/**
 * The confirm sheet — the token-burn guardrail. Nothing runs an agent
 * without first saying, in plain words, what will happen.
 */
export function confirmSheet({ title, body, action = 'Run' }) {
  return new Promise((resolve) => {
    const sheet = $('#confirm');
    $('#confirm-title').textContent = title;
    const bodyEl = $('#confirm-body');
    bodyEl.replaceChildren();
    if (body instanceof Node) bodyEl.append(body);
    else bodyEl.textContent = body || '';
    $('#confirm-ok').textContent = action;
    sheet.hidden = false;

    const done = (answer) => {
      sheet.hidden = true;
      okBtn.onclick = cancelBtn.onclick = sheet.onclick = null;
      resolve(answer);
    };
    const okBtn = $('#confirm-ok');
    const cancelBtn = $('#confirm-cancel');
    okBtn.onclick = () => done(true);
    cancelBtn.onclick = () => done(false);
    sheet.onclick = (e) => { if (e.target === sheet) done(false); };
  });
}

/** The send-back sheet: reject with a reason. Resolves to the reason or null. */
export function rejectSheet() {
  return new Promise((resolve) => {
    const sheet = $('#reject-sheet');
    $('#reject-reason').value = '';
    sheet.hidden = false;
    $('#reject-reason').focus();

    const done = (answer) => {
      sheet.hidden = true;
      okBtn.onclick = cancelBtn.onclick = sheet.onclick = null;
      resolve(answer);
    };
    const okBtn = $('#reject-ok');
    const cancelBtn = $('#reject-cancel');
    okBtn.onclick = () => done($('#reject-reason').value.trim() || 'Rejected');
    cancelBtn.onclick = () => done(null);
    sheet.onclick = (e) => { if (e.target === sheet) done(null); };
  });
}
