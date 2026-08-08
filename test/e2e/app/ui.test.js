// test/e2e/app/ui.test.js
//
// The Bobby App UI in a real browser, against the real server.
//
// ---------------------------------------------------------------------------
// Why this suite skips, and when
// ---------------------------------------------------------------------------
// The app UI is not in this repo. It ships in @bobbycode/pro-dashboard (a paid
// product); bobbycode is MIT and its CI must never need a private package to be
// green. Playwright is not a dependency either — `npm install` and `npm test`
// have to work for someone who has never downloaded a browser.
//
// So this file gates on two things it can check without installing anything:
//
//   1. BOBBY_APP_DIR points at an app UI (the same dev override `bobby app`
//      already honours — see commands/app.js).
//   2. `playwright` resolves from this repo.
//
// Miss either and the whole describe is skipped with the reason in its name.
// The API half of this suite (api-loop.test.js) has neither dependency and
// always runs — it is deliberately a separate file so it can never be gated
// behind this one.
//
// To run it:
//   npm i --no-save playwright && npx playwright install chromium
//   BOBBY_APP_DIR=/path/to/pro-dashboard/app npm test
//
// Nothing here spawns `claude`: the orchestrator is stubbed in harness.js.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
// Jest's ESM runtime does not inject the `jest` global — it has to be imported.
import { jest } from '@jest/globals';
import { moveTicket } from '../../../lib/tickets.js';
import { startApp, waitFor } from './harness.js';

const require_ = createRequire(import.meta.url);

const APP_DIR = (() => {
  if (!process.env.BOBBY_APP_DIR) return null;
  const dir = path.resolve(process.env.BOBBY_APP_DIR);
  return fs.existsSync(path.join(dir, 'index.html')) ? dir : null;
})();

const HAS_PLAYWRIGHT = (() => {
  try { require_.resolve('playwright'); return true; } catch { return false; }
})();

const SKIP_REASON = !APP_DIR
  ? 'BOBBY_APP_DIR is not set to an app UI directory (one containing index.html)'
  : !HAS_PLAYWRIGHT
    ? 'playwright is not installed (npm i --no-save playwright && npx playwright install chromium)'
    : null;

if (SKIP_REASON) {
  console.log(`\n  Bobby App UI e2e: skipped — ${SKIP_REASON}.\n  The API half (test/e2e/app/api-loop.test.js) runs regardless.\n`);
}

const describeUi = SKIP_REASON ? describe.skip : describe;

// A browser launch and a page load are slow relative to a unit test, and this
// file drives four viewports across four views in one of them.
jest.setTimeout(120000);

describeUi(SKIP_REASON ? `E2E: the Bobby App UI (skipped — ${SKIP_REASON})` : 'E2E: the Bobby App UI', () => {
  let browser;
  let context;
  let page;
  let app;

  beforeAll(async () => {
    const { chromium } = await import('playwright');
    try {
      browser = await chromium.launch();
    } catch (e) {
      throw new Error(`Could not launch Chromium: ${e.message}\nRun: npx playwright install chromium`);
    }
  });

  afterAll(async () => { await browser?.close(); });

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await context?.close();
    await app?.stop();
    app = null;
  });

  /* ---------------------------------------------------------------- *
   * Fixtures and waits
   * ---------------------------------------------------------------- */

  /** An epic with two children. `workflow` sets the epic's frontmatter field. */
  const seedFeature = ({ workflow = null } = {}) => {
    const epic = app.ticket({ title: 'Payments', type: 'epic', description: 'Take money.', workflow });
    app.ticket({ title: 'Checkout form', parent: epic });
    app.ticket({ title: 'Stripe webhook', parent: epic });
    return epic;
  };

  /**
   * Load the app at a route and wait for it to have finished booting.
   * `body.dataset.view` is set by the router's show(), which runs once the
   * first route has been resolved — a real signal, not a guessed delay.
   */
  const open = async (hash = '#/') => {
    await page.goto(`${app.base}/${hash}`);
    await page.waitForFunction(() => globalThis.document.body.dataset.view !== undefined);
  };

  /** Move to another route the way a link does, and wait for the view to draw. */
  const go = async (hash, ready) => {
    await page.evaluate((h) => { globalThis.location.hash = h; }, hash);
    await ready();
  };

  const text = (selector) => page.locator(selector).textContent();
  const activeElementText = () => page.evaluate(() => globalThis.document.activeElement?.textContent);
  const activeElementId = () => page.evaluate(() => globalThis.document.activeElement?.id);

  const stepLabels = () => page.locator('#view-feature .pipeline .steps li .label').allTextContents();
  const waitForSteps = (n) => page.waitForFunction(
    (count) => globalThis.document.querySelectorAll('#view-feature .pipeline .steps li').length === count,
    n,
  );

  /* ---------------------------------------------------------------- *
   * Navigation
   * ---------------------------------------------------------------- */

  it('walks board → feature → ticket and back to the board', async () => {
    app = await startApp({ appDir: APP_DIR });
    const epic = seedFeature();
    await open('#/board');

    expect(await text('#view-board h1')).toBe('Board');

    await page.locator(`#view-board .row[href="#/feature/${epic}"]`).click();
    await page.locator('#view-feature h1').waitFor();
    expect(await text('#view-feature h1')).toBe('Payments');

    await page.locator('#view-feature .row[href="#/ticket/TKT-002"]').click();
    await page.locator('#view-ticket h1').waitFor();
    expect(await text('#view-ticket h1')).toBe('Checkout form');

    // The board glyph in the ticket's top bar.
    await page.locator('#view-ticket .topbar .iconbtn').click();
    await page.locator('#view-board h1').waitFor();
    expect(await page.locator('#view-ticket').isVisible()).toBe(false);
  });

  it('sends #/ticket/<epic> to the feature view instead of the ticket page', async () => {
    app = await startApp({ appDir: APP_DIR });
    const epic = seedFeature();

    await open(`#/ticket/${epic}`);

    await page.waitForFunction((h) => globalThis.location.hash === h, `#/feature/${epic}`);
    await page.locator('#view-feature h1').waitFor();
    expect(await text('#view-feature h1')).toBe('Payments');
  });

  /* ---------------------------------------------------------------- *
   * The pipeline is drawn from the workflow, not from a constant
   * ---------------------------------------------------------------- */

  it('draws one pipeline step per workflow stage, plus the Merge terminus', async () => {
    app = await startApp({ appDir: APP_DIR });
    const epic = seedFeature();

    await open(`#/feature/${epic}`);
    await waitForSteps(5);

    expect(await stepLabels()).toEqual(['Plan', 'Build', 'Review', 'Test', 'Merge']);
    expect(await text('#view-feature .pipeline .sechead .count')).toBe('0 of 5');
    expect(await page.locator('#view-feature .pipeline .steps li.finish .flagmark').count()).toBe(1);
  });

  // TKT-047/048/049: a feature on `quick` or `secure` drew the default four
  // stages, because the track was a constant rather than the workflow's own.
  it('draws a custom workflow’s own stages', async () => {
    app = await startApp({ appDir: APP_DIR });
    const quick = seedFeature({ workflow: 'quick' });
    const secure = app.ticket({ title: 'Auth', type: 'epic', workflow: 'secure' });
    app.ticket({ title: 'Session cookies', parent: secure });

    await open(`#/feature/${quick}`);
    await waitForSteps(4);
    expect(await stepLabels()).toEqual(['Plan', 'Build', 'Test', 'Merge']);

    await go(`#/feature/${secure}`, () => waitForSteps(6));
    expect(await stepLabels()).toEqual(['Plan', 'Build', 'Security', 'Review', 'Test', 'Merge']);
    expect(await text('#view-feature .pipeline .sechead .count')).toBe('0 of 6');
  });

  /* ---------------------------------------------------------------- *
   * Live progress
   * ---------------------------------------------------------------- */

  // TKT-051: child stages come from the SHARED board. `bobby ticket move`
  // resolves to the main checkout from inside any worktree, so a run's progress
  // is only ever visible if the app reads it from there.
  it('shows a child stage change written by `bobby ticket move`', async () => {
    app = await startApp({ appDir: APP_DIR });
    const epic = seedFeature();
    app.openWorkspace({ ticketId: epic, agent: 'feature', status: 'running', stage: 'building' });

    await open(`#/feature/${epic}`);
    const childRow = '#view-feature .row[href="#/ticket/TKT-002"] .s';
    await page.waitForFunction(
      (sel) => globalThis.document.querySelector(sel)?.textContent.startsWith('Backlog'),
      childRow,
    );

    // Exactly what an agent does mid-run, then the store event the app listens
    // for. Waiting for the stream to be connected first is what keeps this
    // deterministic — a broadcast with no subscriber is dropped.
    moveTicket(app.ticketsDir, 'TKT-002', 'building', 'bobby-build');
    await app.waitForLiveClient();
    app.notifyStore();

    await page.waitForFunction(
      (sel) => globalThis.document.querySelector(sel)?.textContent.startsWith('Building'),
      childRow,
    );
  });

  /* ---------------------------------------------------------------- *
   * The confirm sheet is the token guardrail
   * ---------------------------------------------------------------- */

  it('creates nothing when the confirm sheet is cancelled, and starts the run when it is confirmed', async () => {
    app = await startApp({ appDir: APP_DIR });
    const ticket = app.ticket({ title: 'Add login' });
    await open(`#/ticket/${ticket}`);

    const start = page.locator('#view-ticket .decision .btn-primary');
    await start.waitFor();
    expect(await start.textContent()).toBe('Start work (full workflow)');

    // Cancel — nothing may be created.
    await start.click();
    await page.locator('#confirm').waitFor();
    expect(await text('#confirm-title')).toBe(`Start work on ${ticket}?`);
    // Focus lands on the safe answer, not on the button that spends tokens.
    expect(await activeElementId()).toBe('confirm-cancel');
    await page.locator('#confirm-cancel').click();
    await page.locator('#confirm').waitFor({ state: 'hidden' });

    expect(app.calls).toEqual([]);
    expect((await app.api('GET', '/api/workspaces')).body.workspaces).toEqual([]);
    expect(await activeElementText()).toBe('Start work (full workflow)');

    // Confirm — now, and only now, a workspace is created and run.
    await start.click();
    await page.locator('#confirm').waitFor();
    await page.locator('#confirm-ok').click();
    await waitFor(() => app.calls.length >= 2, { what: 'the workspace to be created and run' });

    expect(app.calls).toEqual([['create', ticket, 'workflow'], ['run', 'ws-1']]);
  });

  /* ---------------------------------------------------------------- *
   * Sheets
   * ---------------------------------------------------------------- */

  it('closes a sheet on cancel, on Escape and on a backdrop click, and hands focus back each time', async () => {
    app = await startApp({ appDir: APP_DIR });
    app.ticket({ title: 'Something already on the board' });
    await open('#/board');

    const add = page.locator('#view-board .actions .btn-primary');
    await add.waitFor();
    expect(await add.textContent()).toBe('New ticket');
    const sheet = page.locator('#ticket-sheet');

    for (const close of [
      async () => page.locator('#nt-cancel').click(),
      async () => page.keyboard.press('Escape'),
      async () => sheet.click({ position: { x: 4, y: 4 } }),   // the backdrop
    ]) {
      await add.click();
      await sheet.waitFor();
      // The sheet claims aria-modal, so the page behind it really is inert.
      expect(await activeElementId()).toBe('nt-title');
      expect(await page.evaluate(() => globalThis.document.getElementById('app').inert)).toBe(true);

      await close();
      await sheet.waitFor({ state: 'hidden' });
      expect(await page.evaluate(() => globalThis.document.getElementById('app').inert)).toBe(false);
      expect(await activeElementText()).toBe('New ticket');
    }

    // Three sheets opened and closed, no ticket created.
    expect((await app.api('GET', '/api/tickets')).body.tickets).toHaveLength(1);
  });

  /* ---------------------------------------------------------------- *
   * Approve / send back / merge
   * ---------------------------------------------------------------- */

  it('wires approve and send back, and names the stage approval sends the work to', async () => {
    app = await startApp({ appDir: APP_DIR });
    const epic = seedFeature();
    moveTicket(app.ticketsDir, epic, 'planning', 'bobby-plan');
    const ws = app.openWorkspace({ ticketId: epic, agent: 'feature', status: 'awaiting_approval', stage: 'planning' });

    await open(`#/feature/${epic}`);
    const primary = page.locator('#view-feature .decision .btn-primary');
    await primary.waitFor();
    // Derived from the workflow's own next step — not a hardcoded word.
    expect(await primary.textContent()).toBe('Approve — send to build');

    await primary.click();
    await waitFor(() => app.calls.some((c) => c[0] === 'approve'), { what: 'the approve call' });
    expect(app.calls).toContainEqual(['approve', ws.id]);

    await page.locator('#view-feature .decision .btn-quiet').click();
    await page.locator('#reject-sheet').waitFor();
    await page.locator('#reject-reason').fill('Needs a migration');
    await page.locator('#reject-ok').click();
    await waitFor(() => app.calls.some((c) => c[0] === 'reject'), { what: 'the send-back call' });

    expect(app.calls).toContainEqual(['reject', ws.id, 'Needs a migration']);
  });

  it('wires merge to main', async () => {
    app = await startApp({ appDir: APP_DIR });
    const epic = seedFeature();
    const ws = app.openWorkspace({ ticketId: epic, agent: 'feature', status: 'ready_to_merge', stage: 'testing' });

    await open(`#/feature/${epic}`);
    const primary = page.locator('#view-feature .decision .btn-primary');
    await primary.waitFor();
    expect(await primary.textContent()).toBe('Merge to main');

    await primary.click();
    await waitFor(() => app.calls.some((c) => c[0] === 'merge'), { what: 'the merge call' });
    expect(app.calls).toContainEqual(['merge', ws.id, undefined]);
  });

  /* ---------------------------------------------------------------- *
   * Layout invariants
   * ---------------------------------------------------------------- */

  // Both of these regressed repeatedly by eye. 375 is the smallest phone the
  // design targets, 390 the reference, 768 the tablet break, 1440 the desktop.
  it('never scrolls sideways, and never renders text under 13px, at 375/390/768/1440', async () => {
    app = await startApp({ appDir: APP_DIR });
    const epic = seedFeature();
    await open('#/');

    const routes = [
      ['home', '#/', () => page.locator('#view-home .appcol').waitFor()],
      ['board', '#/board', () => page.locator('#view-board h1').waitFor()],
      ['feature', `#/feature/${epic}`, () => waitForSteps(5)],
      ['ticket', '#/ticket/TKT-002', () => page.locator('#view-ticket .decision .btn').waitFor()],
    ];

    for (const width of [375, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, hash, ready] of routes) {
        await go(hash, ready);
        const where = `${name} @ ${width}px`;

        const box = await page.evaluate(() => {
          const d = globalThis.document.documentElement;
          return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth };
        });
        expect(`${where}: ${box.scrollWidth}`).toBe(`${where}: ${box.clientWidth}`);

        // Every element that renders its own text, at its computed size. The
        // floor is 13px; anything under it is unreadable on a phone.
        const tooSmall = await page.evaluate(() => {
          const out = [];
          for (const node of globalThis.document.querySelectorAll('#app *')) {
            if (!node.getClientRects().length) continue;
            const ownText = [...node.childNodes]
              .some((c) => c.nodeType === 3 && c.textContent.trim() !== '');
            if (!ownText) continue;
            const size = parseFloat(globalThis.getComputedStyle(node).fontSize);
            if (size < 13) out.push(`${node.tagName.toLowerCase()}[${node.className}] ${size}px`);
          }
          return [...new Set(out)];
        });
        expect(`${where}: ${JSON.stringify(tooSmall)}`).toBe(`${where}: []`);
      }
    }
  });

  /* ---------------------------------------------------------------- *
   * TKT-050 — a known bug, pinned so fixing it is visible
   * ---------------------------------------------------------------- */

  describe('every stage a ticket can be in has somewhere to appear on the board', () => {
    const seedBoard = async () => {
      app = await startApp({ appDir: APP_DIR });
      const building = app.ticket({ title: 'Being built' });
      const designed = app.ticket({ title: 'Out at design' });
      moveTicket(app.ticketsDir, building, 'building', 'bobby-build');
      moveTicket(app.ticketsDir, designed, 'design-spec', 'bobby-design-spec');
      await open('#/board');
      await page.locator('#view-board h1').waitFor();
      return { building, designed };
    };

    // The control. If the fixture or the board itself breaks, this goes red —
    // which is what stops the pinned test below from passing for the wrong
    // reason (a `.failing` test passes on ANY throw).
    it('draws a ticket whose stage BOARD_ORDER does list', async () => {
      const { building } = await seedBoard();
      expect(await page.locator(`#view-board .row[href="#/ticket/${building}"]`).count()).toBe(1);
    });

    // TKT-050 — KNOWN BUG. BOARD_ORDER in the Pro UI's views/board.js lists
    // eight stages. The four `design-*` stages are real stages in
    // lib/stages.js, and the `design` workflow parks tickets in them, but they
    // match no lane and are not "blocked" or an epic — so the ticket is drawn
    // nowhere and disappears from the board entirely. The server is not at
    // fault: api-loop.test.js asserts /api/tickets returns it.
    //
    // `test.failing` passes while the bug is present and fails the moment it is
    // fixed. When TKT-050 lands, delete the `.failing` and this goes green.
    it.failing('draws a ticket whose stage BOARD_ORDER does not list (TKT-050)', async () => {
      const { designed } = await seedBoard();
      expect(await page.locator(`#view-board .row[href="#/ticket/${designed}"]`).count()).toBe(1);
    });
  });
});
