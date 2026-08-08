// test/e2e/app/api-loop.test.js
//
// The app's loop over real HTTP, with no browser involved.
//
// This half of the app e2e suite is MIT top to bottom — the server, the
// tickets, the stages and the workflows all live in this repo — so it runs
// everywhere, always, with no Pro UI and no Playwright. It asserts the
// contracts the UI is drawn from: if one of these breaks, the app renders the
// wrong thing no matter how good the markup is.
//
// The orchestrator is stubbed (see harness.js). Nothing here can spawn an
// executor or spend a token.
import { moveTicket } from '../../../lib/tickets.js';
import { startApp } from './harness.js';

let app;
afterEach(async () => { await app?.stop(); app = null; });

/** An epic with two children — the shape every feature assertion needs. */
const seedFeature = () => {
  const epic = app.ticket({ title: 'Payments', type: 'epic', description: 'Take money.' });
  app.ticket({ title: 'Checkout form', parent: epic });
  app.ticket({ title: 'Stripe webhook', parent: epic });
  return epic;
};

describe('E2E: the Bobby app loop over HTTP', () => {
  it('serves every ticket to the board, whatever stage it sits in', async () => {
    app = await startApp();
    app.ticket({ title: 'In the backlog' });
    const building = app.ticket({ title: 'Being built' });
    const designed = app.ticket({ title: 'Out at design' });
    moveTicket(app.ticketsDir, building, 'building', 'bobby-build');
    // A real stage from lib/stages.js that the `design` workflow parks tickets
    // in — and the one the Pro UI's BOARD_ORDER has no lane for (TKT-050).
    // The server half is correct: it returns the ticket. See the pinned test in
    // ui.test.js for the half that is not.
    moveTicket(app.ticketsDir, designed, 'design-spec', 'bobby-design-spec');

    const { status, body } = await app.api('GET', '/api/tickets');

    expect(status).toBe(200);
    expect(body.tickets.map((t) => t.id).sort()).toEqual(['TKT-001', 'TKT-002', 'TKT-003']);
    expect(body.tickets.find((t) => t.id === designed).stage).toBe('design-spec');
  });

  it('describes every workflow as stage+agent steps — what the pipeline is drawn from', async () => {
    app = await startApp();

    const { status, body } = await app.api('GET', '/api/workflows');

    expect(status).toBe(200);
    // The feature view draws one step per stage in THIS map plus a Merge
    // terminus. A workflow missing from it falls back to `default`, which is
    // how a `secure` feature ended up drawing four stages (TKT-047/048/049).
    for (const name of body.workflows) {
      expect(Array.isArray(body.stages[name])).toBe(true);
      expect(body.stages[name].length).toBeGreaterThan(0);
      for (const step of body.stages[name]) {
        expect(typeof step.stage).toBe('string');
        expect(typeof step.agent).toBe('string');
      }
    }
    expect(body.stages.default.map((s) => s.stage))
      .toEqual(['planning', 'building', 'reviewing', 'testing']);
    expect(body.stages.quick.map((s) => s.stage))
      .toEqual(['planning', 'building', 'testing']);
    // `security` is a stage of its own, not a second step on `reviewing`.
    expect(body.stages.secure.map((s) => s.stage))
      .toEqual(['planning', 'building', 'security', 'reviewing', 'testing']);
  });

  it('describes a workflow defined in config too — the pipeline is not a hardcoded four', async () => {
    app = await startApp({ config: { workflows: { hotfix: ['build', 'test'] } } });

    const { body } = await app.api('GET', '/api/workflows');

    expect(body.workflows).toContain('hotfix');
    expect(body.stages.hotfix.map((s) => s.stage)).toEqual(['building', 'testing']);
    expect(body.stages.hotfix.map((s) => s.agent)).toEqual(['bobby-build', 'bobby-test']);
  });

  it('serves an epic as a feature, and marks it epic on the ticket route', async () => {
    app = await startApp();
    const epic = seedFeature();

    // The app opens #/ticket/<id>, sees type epic, and redirects to the
    // feature view. That redirect keys on this field.
    const asTicket = await app.api('GET', `/api/tickets/${epic}`);
    expect(asTicket.body.ticket.type).toBe('epic');

    const asFeature = await app.api('GET', `/api/features/${epic}`);
    expect(asFeature.status).toBe(200);
    expect(asFeature.body.epic.id).toBe(epic);
    expect(asFeature.body.epic.content).toContain('Take money.');
    expect(asFeature.body.children.map((c) => c.title))
      .toEqual(['Checkout form', 'Stripe webhook']);
  });

  it('reports live child stages from the shared board while a run is open (TKT-051)', async () => {
    app = await startApp();
    const epic = seedFeature();

    // Exactly the sequence the UI performs: create the workspace, then read
    // progress back through the id the server handed out.
    const created = await app.api('POST', '/api/workspaces', { ticketId: epic, agent: 'feature' });
    expect(created.status).toBe(201);
    const wsId = created.body.workspace.id;

    // The builder advances a child the only way an agent can — and that write
    // lands on the main checkout, not on any worktree copy.
    moveTicket(app.ticketsDir, 'TKT-002', 'building', 'bobby-build');

    const { status, body } = await app.api('GET', `/api/workspaces/${wsId}/feature`);

    expect(status).toBe(200);
    const stages = Object.fromEntries(body.children.map((c) => [c.id, c.stage]));
    expect(stages).toEqual({ 'TKT-002': 'building', 'TKT-003': 'backlog' });
  });

  it('spends nothing just by being looked at — no workspace exists until one is asked for', async () => {
    app = await startApp();
    const epic = seedFeature();

    // Every route the app hits on boot and on a full refresh.
    for (const p of [
      '/api/health', '/api/config', '/api/capabilities', '/api/brief',
      '/api/tickets', '/api/workspaces', '/api/workflows', '/api/features',
      `/api/features/${epic}`, `/api/tickets/${epic}`,
    ]) {
      expect((await app.api('GET', p)).status).toBe(200);
    }

    expect(app.calls).toEqual([]);
    expect((await app.api('GET', '/api/workspaces')).body.workspaces).toEqual([]);
  });

  it('wires start, run, approve, send back and merge to the orchestrator', async () => {
    app = await startApp();
    const epic = seedFeature();

    const created = await app.api('POST', '/api/workspaces', { ticketId: epic, agent: 'feature' });
    const wsId = created.body.workspace.id;
    expect((await app.api('POST', `/api/workspaces/${wsId}/run`, {})).status).toBe(200);
    expect((await app.api('POST', `/api/workspaces/${wsId}/approve`, {})).status).toBe(200);
    expect((await app.api('POST', `/api/workspaces/${wsId}/reject`, { reason: 'Needs a migration' })).status).toBe(200);
    expect((await app.api('POST', `/api/workspaces/${wsId}/merge`, {})).status).toBe(200);

    expect(app.calls).toEqual([
      ['create', epic, 'feature'],
      ['run', wsId],
      ['approve', wsId],
      ['reject', wsId, 'Needs a migration'],
      ['merge', wsId, undefined],
    ]);
  });
});
