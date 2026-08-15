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
import { execSync } from 'child_process';
import { createRequire } from 'module';
// Jest's ESM runtime does not inject the `jest` global — it has to be imported.
import { jest } from '@jest/globals';
import { moveTicket, updateTicket } from '../../../lib/tickets.js';
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
  /** Each step as "state:Label" — the glyph and the word it belongs to. */
  const stepStates = () => page.evaluate(() => [...globalThis.document
    .querySelectorAll('#view-feature .pipeline .steps li')]
    .map((li) => `${li.className}:${li.querySelector('.label').textContent}`));

  /**
   * An epic whose four children sit one in each design stage, declaring no
   * workflow of its own — the TKT-055 repro exactly.
   */
  const seedDesignFeature = ({ workflow = null } = {}) => {
    const epic = app.ticket({ title: 'Design the feature view', type: 'epic', workflow });
    const at = (title, stage, agent) => {
      const id = app.ticket({ title, parent: epic });
      moveTicket(app.ticketsDir, id, stage, agent);
      return id;
    };
    at('Gather the references', 'design-research', 'bobby-design-research');
    at('Tear each reference down', 'design-analyze', 'bobby-design-analyze');
    at('Build the options', 'design-mockup', 'bobby-design-mockup');
    at('Lock the spec', 'design-spec', 'bobby-design-spec');
    return epic;
  };

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
   * TKT-055 — the pipeline had no vocabulary for the design stages
   *
   * The track has always come from /api/workflows; nothing ever SELECTED the
   * workflow, so an epic with no `workflow:` fell through to `default` and a
   * design feature was drawn as "0 of 5" with every glyph hollow, above four
   * children the very next section described as in progress.
   * ---------------------------------------------------------------- */

  describe('a design-workflow feature', () => {
    it('draws the design workflow’s seven steps even when the epic declares no workflow', async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = seedDesignFeature();

      await open(`#/feature/${epic}`);
      await waitForSteps(7);

      expect(await stepLabels()).toEqual([
        'Design Research', 'Design Analyze', 'Design Mockup', 'Design Spec',
        'Design Build', 'Design Check', 'Merge',
      ]);
      // Stage names as words, never as ids.
      expect((await stepLabels()).some((l) => l.includes('-'))).toBe(false);
      // The signature survives the longer route.
      expect(await page.locator('#view-feature .pipeline .steps li.finish .flagmark').count()).toBe(1);
    });

    // The contradiction itself: no step a ticket is standing on may be hollow,
    // and the Pipeline's count must agree with the Tickets header beneath it.
    it('never says nothing has started while its own rows say in progress', async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = seedDesignFeature();

      await open(`#/feature/${epic}`);
      await waitForSteps(7);

      expect(await stepStates()).toEqual([
        'now:Design Research', 'now:Design Analyze', 'now:Design Mockup', 'now:Design Spec',
        'todo:Design Build', 'todo:Design Check', 'finish:Merge',
      ]);
      expect(await text('#view-feature .pipeline .sechead .count')).toBe('0 of 7');
      expect(await text('#view-feature .tickets .sechead .count')).toBe('0 of 4 done');
      // Every row that reads "in progress" has a step drawn as current.
      const rows = await page.locator('#view-feature .tickets .row .s').allTextContents();
      expect(rows.filter((r) => r.endsWith('· in progress'))).toHaveLength(4);
      // One step only is announced as current, however many are drawn so.
      expect(await page.locator('#view-feature .pipeline [aria-current="step"]').count()).toBe(1);
    });

    it('marks the steps behind the least advanced ticket done, and the parked ones current', async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = app.ticket({ title: 'Design the marketing site', type: 'epic', workflow: 'design' });
      const a = app.ticket({ title: 'Style tiles', parent: epic });
      const b = app.ticket({ title: 'Token sheet', parent: epic });
      moveTicket(app.ticketsDir, a, 'design-mockup', 'bobby-design-mockup');
      moveTicket(app.ticketsDir, b, 'design-spec', 'bobby-design-spec');

      await open(`#/feature/${epic}`);
      await waitForSteps(7);

      expect(await stepStates()).toEqual([
        'done:Design Research', 'done:Design Analyze', 'now:Design Mockup', 'now:Design Spec',
        'todo:Design Build', 'todo:Design Check', 'finish:Merge',
      ]);
      expect(await text('#view-feature .pipeline .sechead .count')).toBe('2 of 7');
    });

    /* -------------------------------------------------------------- *
     * TKT-057 — the same contradiction pointing the other way.
     *
     * `clearedSteps` short-circuited on the epic's own stage, so an epic
     * moved ahead of one of its children (a send-back, or a run that
     * advanced the epic while a child stayed put) drew "3 of 7", two done
     * checks on steps no ticket had reached, and the blue road running out
     * of the glyph the page said you were standing on.
     * -------------------------------------------------------------- */

    const seedEpicAhead = async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = app.ticket({ title: 'Ship the relay', type: 'epic', workflow: 'design' });
      const behind = app.ticket({ title: 'Still gathering', parent: epic });
      const ahead = app.ticket({ title: 'Spec drafted', parent: epic });
      moveTicket(app.ticketsDir, behind, 'design-research', 'bobby-design-research');
      moveTicket(app.ticketsDir, ahead, 'design-spec', 'bobby-design-spec');
      // The epic's own field, moved on without its least advanced child.
      updateTicket(app.ticketsDir, epic, { stage: 'design-spec' });
      await open(`#/feature/${epic}`);
      await waitForSteps(7);
      return epic;
    };

    it('counts nothing cleared while the least advanced ticket is still on step one', async () => {
      await seedEpicAhead();

      expect(await stepStates()).toEqual([
        'now:Design Research', 'todo:Design Analyze', 'todo:Design Mockup', 'now:Design Spec',
        'todo:Design Build', 'todo:Design Check', 'finish:Merge',
      ]);
      expect(await text('#view-feature .pipeline .sechead .count')).toBe('0 of 7');
      expect(await page.locator('#view-feature .pipeline .bar').getAttribute('aria-label'))
        .toBe('0 of 7 stages complete');
      // No done check anywhere: no step has been cleared by every ticket.
      expect(await page.locator('#view-feature .pipeline .steps li.done').count()).toBe(0);
    });

    it('never paints the connector past the first glyph drawn as current', async () => {
      await seedEpicAhead();

      const road = await page.evaluate(() => {
        const list = globalThis.document.querySelector('#view-feature .steps');
        const style = globalThis.getComputedStyle(list);
        const top = list.getBoundingClientRect().top;
        const first = [...list.querySelectorAll('li')].find((li) => li.className === 'now');
        const mark = first.querySelector('.mark').getBoundingClientRect();
        return {
          blueEnd: parseFloat(style.getPropertyValue('--seg-done-top'))
            + parseFloat(style.getPropertyValue('--seg-done-h')),
          firstNowCentre: mark.top + mark.height / 2 - top,
        };
      });
      // The blue length is the count, so this is the count and the glyphs
      // agreeing in pixels rather than in words.
      expect(road.blueEnd).toBeLessThanOrEqual(road.firstNowCentre + 1);
    });

    // The rule is the least advanced TICKET, so an epic left behind its own
    // children does not drag the count back down either.
    it('reads the children, not the epic, when the epic is the one lagging', async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = app.ticket({ title: 'Design the marketing site', type: 'epic', workflow: 'design' });
      const a = app.ticket({ title: 'Style tiles', parent: epic });
      const b = app.ticket({ title: 'Token sheet', parent: epic });
      moveTicket(app.ticketsDir, a, 'design-mockup', 'bobby-design-mockup');
      moveTicket(app.ticketsDir, b, 'design-spec', 'bobby-design-spec');
      updateTicket(app.ticketsDir, epic, { stage: 'design-research' });

      await open(`#/feature/${epic}`);
      await waitForSteps(7);

      expect(await text('#view-feature .pipeline .sechead .count')).toBe('2 of 7');
    });

    // The inference is deliberately conservative: a board `default` can name in
    // full is default, so an ordinary feature can never be promoted onto
    // another workflow by accident.
    it('leaves an ordinary feature on the default workflow', async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = seedFeature();
      moveTicket(app.ticketsDir, 'TKT-002', 'building', 'bobby-build');
      moveTicket(app.ticketsDir, 'TKT-003', 'reviewing', 'bobby-review');

      await open(`#/feature/${epic}`);
      await waitForSteps(5);
      expect(await stepLabels()).toEqual(['Plan', 'Build', 'Review', 'Test', 'Merge']);
    });
  });

  // The other half of TKT-057: the count stops reading the epic's stage, and
  // the decision button — which is a statement about the RUN — must not lose
  // it. Epic at `reviewing`, one child still at `building`.
  it('counts by the least advanced ticket while the button names the run’s next step', async () => {
    app = await startApp({ appDir: APP_DIR });
    const epic = seedFeature();
    moveTicket(app.ticketsDir, 'TKT-002', 'planning', 'bobby-plan');
    moveTicket(app.ticketsDir, 'TKT-002', 'building', 'bobby-build');
    moveTicket(app.ticketsDir, 'TKT-003', 'planning', 'bobby-plan');
    moveTicket(app.ticketsDir, 'TKT-003', 'building', 'bobby-build');
    moveTicket(app.ticketsDir, 'TKT-003', 'reviewing', 'bobby-review');
    moveTicket(app.ticketsDir, epic, 'planning', 'bobby-plan');
    updateTicket(app.ticketsDir, epic, { stage: 'reviewing' });
    app.openWorkspace({ ticketId: epic, agent: 'feature', status: 'awaiting_approval', stage: 'reviewing' });

    await open(`#/feature/${epic}`);
    await waitForSteps(5);

    expect(await stepStates()).toEqual([
      'done:Plan', 'now:Build', 'now:Review', 'todo:Test', 'finish:Merge',
    ]);
    expect(await text('#view-feature .pipeline .sechead .count')).toBe('1 of 5');
    expect(await text('#view-feature .decision .btn-primary')).toBe('Approve — send to test');
  });

  /* ---------------------------------------------------------------- *
   * TKT-059 — one stage, one word, on the whole Feature view
   *
   * The pipeline names a step from the workflow step; the rows named the
   * stage. On `design` and `secure` the two coincide often enough to hide
   * it, but on `default` the page carried both vocabularies a couple of
   * inches apart: the step read "Build" and the row beneath "Building".
   * ---------------------------------------------------------------- */

  describe('one word per stage across the Feature view', () => {
    const rowWords = async () => (await page.locator('#view-feature .tickets .row .s')
      .allTextContents()).map((t) => t.split(' · ')[0]);

    it('names a default-workflow row with the pipeline’s own word', async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = seedFeature();
      moveTicket(app.ticketsDir, 'TKT-002', 'planning', 'bobby-plan');
      moveTicket(app.ticketsDir, 'TKT-002', 'building', 'bobby-build');
      moveTicket(app.ticketsDir, 'TKT-003', 'planning', 'bobby-plan');

      await open(`#/feature/${epic}`);
      await waitForSteps(5);

      expect(await stepLabels()).toEqual(['Plan', 'Build', 'Review', 'Test', 'Merge']);
      expect(await rowWords()).toEqual(['Build', 'Plan']);
    });

    // The general rule, not the one case: every word a row uses for a stage
    // that is on the track is a word the pipeline above it is showing.
    it('uses no word for an on-track stage that the pipeline does not', async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = seedFeature();
      moveTicket(app.ticketsDir, 'TKT-002', 'planning', 'bobby-plan');
      moveTicket(app.ticketsDir, 'TKT-002', 'building', 'bobby-build');
      moveTicket(app.ticketsDir, 'TKT-003', 'planning', 'bobby-plan');
      moveTicket(app.ticketsDir, 'TKT-003', 'building', 'bobby-build');
      moveTicket(app.ticketsDir, 'TKT-003', 'reviewing', 'bobby-review');

      await open(`#/feature/${epic}`);
      await waitForSteps(5);

      const steps = await stepLabels();
      const offTrack = new Set(['Backlog', 'Done', 'Blocked', 'Shipping']);
      const strangers = (await rowWords()).filter((w) => !steps.includes(w) && !offTrack.has(w));
      expect(strangers).toEqual([]);
    });

    // `design-build` parks a ticket in `building` and `design-check` in
    // `reviewing` (lib/workflow.js STAGE_MAP), so the stage cannot name those
    // two steps — which is why the step's word is the one both use.
    it('names a design child parked in `building` after the step it is on', async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = app.ticket({ title: 'Design the feature view', type: 'epic', workflow: 'design' });
      const child = app.ticket({ title: 'Build the real thing', parent: epic });
      moveTicket(app.ticketsDir, child, 'building', 'bobby-design-build');

      await open(`#/feature/${epic}`);
      await waitForSteps(7);

      expect((await stepLabels())[4]).toBe('Design Build');
      expect(await rowWords()).toEqual(['Design Build']);
    });

    // A stage this workflow has no step for is nobody's word to borrow, so
    // the stage's own words stand.
    it('keeps the stage’s own words for a stage that is off the track', async () => {
      app = await startApp({ appDir: APP_DIR });
      // `workflow: default` declared, so `security` cannot pull the inference
      // onto `secure` — the point here is a stage with no step on this track.
      const epic = seedFeature({ workflow: 'default' });
      updateTicket(app.ticketsDir, 'TKT-002', { stage: 'security' });

      await open(`#/feature/${epic}`);
      await waitForSteps(5);

      expect((await rowWords())[0]).toBe('Security');
    });
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

    // "Build", not "Building": on the Feature view a stage is named by the
    // step the pipeline above is drawing for it (TKT-059).
    await page.waitForFunction(
      (sel) => globalThis.document.querySelector(sel)?.textContent.startsWith('Build ·'),
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
    // Ideas is measured with rows on it AND at its longest sentence — a
    // captured idea is free text, and the note under the list quotes it back.
    await app.api('POST', '/api/ideas', {
      text: 'let the board filter by area, and remember the filter between sessions',
    });
    await open('#/');

    const routes = [
      ['home', '#/', () => page.locator('#view-home .appcol').waitFor()],
      ['board', '#/board', () => page.locator('#view-board h1').waitFor()],
      // The Delete button is the LAST node this page draws, so waiting on it
      // means the whole column — head, list, note and decision — is up.
      ['ideas', '#/ideas', () => page.locator('#view-ideas .actions .btn-quiet').waitFor()],
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
   * TKT-012 — the sublabel names the repo, not the project slug
   *
   * The spec's Feature head reads `ccevans/bobbycode · TKT-001`. The API had
   * only the project NAME — a slug someone typed at `bobby init` — so the page
   * said `e2e-app · TKT-001`. /api/config carries `repo` now, and it is null
   * whenever nothing can honestly answer.
   * ---------------------------------------------------------------- */

  describe('the Feature sublabel', () => {
    // The remote has to exist before the page boots: /api/config is fetched
    // once, in the boot block, and the sublabel is drawn from what it said.
    const withOrigin = (url) => execSync(`git init -q . && git remote add origin ${url}`, {
      cwd: app.repoRoot, stdio: 'pipe', shell: '/bin/sh',
    });

    it('shows owner/repo when the repo has an origin remote', async () => {
      app = await startApp({ appDir: APP_DIR });
      withOrigin('git@github.com:ccevans/bobbycode.git');
      const epic = seedFeature();

      await open(`#/feature/${epic}`);
      await waitForSteps(5);

      expect(await text('#view-feature .sub')).toBe(`ccevans/bobbycode · ${epic}`);
    });

    // The degrade. A project `bobby new` just made has a git repo and no
    // remote, and that must read as it always did rather than as a gap.
    it('falls back to the project name when there is no remote', async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = seedFeature();

      await open(`#/feature/${epic}`);
      await waitForSteps(5);

      expect(await text('#view-feature .sub')).toBe(`e2e-app · ${epic}`);
    });
  });

  /* ---------------------------------------------------------------- *
   * TKT-013 follow-up — the merge time the API already returned
   *
   * TKT-017/013/019 put `mergedAt` on every child of /api/features/:id as a
   * valid ISO string or null, and deliberately stopped there. The row still
   * read "Done · merged".
   * ---------------------------------------------------------------- */

  describe('a merged child row', () => {
    const seedMerged = async (mergedAt) => {
      app = await startApp({ appDir: APP_DIR });
      const epic = seedFeature();
      moveTicket(app.ticketsDir, 'TKT-002', 'building', 'bobby-build');
      updateTicket(app.ticketsDir, 'TKT-002', { stage: 'done', mergedAt });
      await open(`#/feature/${epic}`);
      await page.locator('#view-feature .row[href="#/ticket/TKT-002"]').waitFor();
      return text('#view-feature .row[href="#/ticket/TKT-002"] .s');
    };

    it('says how long ago it merged', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(await seedMerged(twoHoursAgo)).toBe('Done · merged 2h ago');
    });

    // Every ticket merged before the field existed. The row says what it always
    // said — never "Invalid Date", and never a 1970 epoch.
    it('degrades to plain “merged” with no timestamp', async () => {
      expect(await seedMerged(null)).toBe('Done · merged');
    });

    it('degrades to plain “merged” when the timestamp is nonsense', async () => {
      expect(await seedMerged('last tuesday')).toBe('Done · merged');
    });
  });

  /* ---------------------------------------------------------------- *
   * TKT-018 — Ideas
   *
   * `bobby idea "…"` writes to .bobby/ideas.yml and was invisible in the app.
   * The page is Home's and the Board's sibling on the same `.appview` chrome:
   * bare rows in one container, the decision under the container acting on the
   * selected row, and an empty state that says what an idea IS and hands over
   * the control that makes one.
   * ---------------------------------------------------------------- */

  describe('the Ideas view', () => {
    const capture = (text_) => app.api('POST', '/api/ideas', { text: text_ });
    const openIdeas = async () => {
      await open('#/ideas');
      await page.locator('#view-ideas h1').waitFor();
    };
    const openRows = () => page.locator('#view-ideas .sec', {
      has: page.locator('h2', { hasText: 'Open' }),
    }).locator('.row');

    it('is reachable from the nav and lists what the CLI captured', async () => {
      app = await startApp({ appDir: APP_DIR });
      await capture('let the board filter by area');
      await capture('a keyboard shortcut for approve');
      await open('#/');

      await page.locator('.nav-btn[data-route="ideas"]').click();
      await page.locator('#view-ideas h1').waitFor();

      expect(await text('#view-ideas h1')).toBe('Ideas');
      expect(await text('#view-ideas .sub')).toBe('2 ideas waiting');
      expect(await openRows().locator('.t').allTextContents())
        .toEqual(['let the board filter by area', 'a keyboard shortcut for approve']);
      // The number the CLI addresses an idea by is on screen, so `bobby idea
      // rm 1` and this page are one vocabulary.
      // A date, not a relative time: `created` is date-only, so "2h ago"
      // would be precision the field does not carry (see capturedLine).
      expect(await openRows().first().locator('.s').textContent())
        .toMatch(/^#1 · captured \d{4}-\d{2}-\d{2}$/);
    });

    // The empty state is the common case — a fresh project has no ideas — so it
    // has to teach and to hand over a control, not just say "none".
    it('explains what ideas are for when there are none, and offers the way in', async () => {
      app = await startApp({ appDir: APP_DIR });
      await openIdeas();

      expect(await text('#view-ideas .sub')).toBe('Nothing captured yet');
      const empty = await text('#view-ideas .quiet-state');
      expect(empty).toContain('An idea is a thought');
      expect(empty).toContain('promote it into a ticket');
      // A sentence with nothing to press is the failure mode this guards.
      expect(await text('#view-ideas .actions .btn-primary')).toBe('Capture an idea');
    });

    it('captures an idea through the sheet', async () => {
      app = await startApp({ appDir: APP_DIR });
      await openIdeas();

      await page.locator('#view-ideas .actions .btn-primary').click();
      await page.locator('#idea-sheet').waitFor();
      expect(await activeElementId()).toBe('ni-text');
      await page.locator('#ni-text').fill('ship the ideas tab');
      await page.locator('#ni-ok').click();
      await page.locator('#idea-sheet').waitFor({ state: 'hidden' });

      await page.waitForFunction(() => globalThis.document
        .querySelectorAll('#view-ideas .row').length === 1);
      expect(await openRows().locator('.t').textContent()).toBe('ship the ideas tab');
      expect((await app.api('GET', '/api/ideas')).body.ideas.map((i) => i.text))
        .toEqual(['ship the ideas tab']);
    });

    // The decision belongs to the SELECTED row and sits under the container —
    // Home's grammar. Two buttons per row would put ten controls on a page of
    // five ideas.
    it('moves the decision onto whichever idea you select', async () => {
      app = await startApp({ appDir: APP_DIR });
      await capture('first thought');
      await capture('second thought');
      await openIdeas();

      // The first is selected by default, and says so in more than colour.
      expect(await openRows().nth(0).getAttribute('aria-current')).toBe('true');
      expect(await text('#view-ideas .saidby')).toContain('first thought');

      await openRows().nth(1).click();
      await page.waitForFunction(() => globalThis.document
        .querySelector('#view-ideas .saidby')?.textContent.includes('second thought'));
      expect(await openRows().nth(1).getAttribute('aria-current')).toBe('true');
      expect(await openRows().nth(0).getAttribute('aria-current')).toBeNull();
    });

    it('promotes an idea into a ticket and lands on it', async () => {
      app = await startApp({ appDir: APP_DIR });
      await capture('let the board filter by area');
      await openIdeas();

      await page.locator('#view-ideas .actions .btn-primary', { hasText: 'Promote to ticket' }).click();
      await page.locator('#view-ticket h1').waitFor();

      // The ticket is real, and it is the one the idea named.
      expect(await text('#view-ticket h1')).toBe('let the board filter by area');
      const tickets = (await app.api('GET', '/api/tickets')).body.tickets;
      expect(tickets.map((t) => t.title)).toEqual(['let the board filter by area']);
      expect(tickets[0].stage).toBe('backlog');
    });

    // Promoted ideas do not vanish: an idea that disappears gives you no way to
    // see that the thing you captured is now real. The row links to the ticket.
    it('keeps a promoted idea, as a link to the ticket it became', async () => {
      app = await startApp({ appDir: APP_DIR });
      await capture('let the board filter by area');
      const promoted = await app.api('POST', '/api/ideas/1/promote', {});
      const id = promoted.body.ticket.id;
      await openIdeas();

      const row = page.locator(`#view-ideas .row[href="#/ticket/${id}"]`);
      expect(await row.count()).toBe(1);
      expect(await row.locator('.s').textContent()).toMatch(new RegExp(`^${id} · promoted \\d{4}-`));
      // It is out of the Open section, so it cannot be promoted twice.
      expect(await openRows().count()).toBe(0);
    });

    // Deleting has no undo, so it takes the confirm sheet — and cancelling has
    // to leave the idea exactly where it was.
    it('deletes an idea only after the sheet is confirmed', async () => {
      app = await startApp({ appDir: APP_DIR });
      await capture('a thought I will change my mind about');
      await openIdeas();

      const del = page.locator('#view-ideas .actions .btn-quiet');
      await del.click();
      await page.locator('#confirm').waitFor();
      expect(await text('#confirm-title')).toBe('Delete this idea?');
      await page.locator('#confirm-cancel').click();
      await page.locator('#confirm').waitFor({ state: 'hidden' });
      expect((await app.api('GET', '/api/ideas')).body.ideas).toHaveLength(1);

      await del.click();
      await page.locator('#confirm').waitFor();
      await page.locator('#confirm-ok').click();
      await page.waitForFunction(() => globalThis.document
        .querySelectorAll('#view-ideas .row').length === 0);
      expect((await app.api('GET', '/api/ideas')).body.ideas).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------- *
   * TKT-050 — no ticket may be drawn nowhere
   *
   * The Pro UI's views/board.js used to filter tickets against a literal
   * BOARD_ORDER of eight stage names. lib/stages.js has thirteen. A ticket in
   * one of the four `design-*` stages matched no lane and was not blocked and
   * not an epic, so nothing on the page claimed it — it rendered NOWHERE. The
   * board derives its lanes from the stage list now (served by /api/config),
   * and anything the list does not name gets a lane of its own at the end.
   *
   * These three tests are the guard on that: a listed stage, a stage that was
   * missed, and a stage nobody has ever heard of.
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
    // which is what stops the two tests below from passing for the wrong reason.
    it('draws a ticket whose stage is early in the pipeline', async () => {
      const { building } = await seedBoard();
      expect(await page.locator(`#view-board .row[href="#/ticket/${building}"]`).count()).toBe(1);
    });

    // The bug itself. Was `it.failing` while BOARD_ORDER was hardcoded.
    it('draws a ticket in a design-pipeline stage (TKT-050)', async () => {
      const { designed } = await seedBoard();
      expect(await page.locator(`#view-board .row[href="#/ticket/${designed}"]`).count()).toBe(1);
    });

    // The regression guard that outlives the four stages this ticket was
    // about. Deriving lanes from the stage list fixes every stage that IS in
    // the list; it does nothing for one that is not, and a ticket file is text
    // a human can edit. `updateTicket` rather than `moveTicket` on purpose —
    // `moveTicket` validates against STAGES and would refuse to write this,
    // which is exactly the door this test comes through.
    it('draws a ticket whose stage is in no list at all', async () => {
      app = await startApp({ appDir: APP_DIR });
      const stray = app.ticket({ title: 'Filed under something new' });
      updateTicket(app.ticketsDir, stray, { stage: 'archaeology' });
      await open('#/board');
      await page.locator('#view-board h1').waitFor();
      expect(await page.locator(`#view-board .row[href="#/ticket/${stray}"]`).count()).toBe(1);
      // In a lane that names it, not swept into an unlabelled bucket.
      expect(await page.locator('#view-board h2', { hasText: 'Archaeology' }).count()).toBe(1);
    });

    // Lanes run in pipeline order, which is the one thing deriving them could
    // plausibly have cost. `design-spec` sits before `building` in
    // lib/stages.js, so it must sit before it here — and an unknown stage goes
    // last, after every stage the list does name.
    it('orders its lanes by the pipeline, not the alphabet', async () => {
      app = await startApp({ appDir: APP_DIR });
      const designed = app.ticket({ title: 'Out at design' });
      const building = app.ticket({ title: 'Being built' });
      const stray = app.ticket({ title: 'Filed under something new' });
      moveTicket(app.ticketsDir, designed, 'design-spec', 'bobby-design-spec');
      moveTicket(app.ticketsDir, building, 'building', 'bobby-build');
      updateTicket(app.ticketsDir, stray, { stage: 'archaeology' });
      await open('#/board');
      await page.locator('#view-board h1').waitFor();
      const lanes = await page.locator('#view-board .sec h2').allTextContents();
      expect(lanes).toEqual(['Design Spec', 'Building', 'Archaeology']);
    });
  });

  /* ---------------------------------------------------------------- *
   * TKT-054 — a lane heading is what names its section to a screen
   * reader, so no two of them may share an id.
   *
   * `stageWords` and `stageSlug` are both many-to-one: `Design Spec` and
   * `design-spec` prettified to one phrase and slugged to one id, and `!!!`
   * and `???` both slugged to `unnamed`. `aria-labelledby` resolves to the
   * FIRST element with the id, so one lane was announced as another.
   *
   * `updateTicket` rather than `moveTicket` throughout: `moveTicket` validates
   * against STAGES and would refuse to write these, which is exactly the door
   * a hand-edited ticket file comes through.
   * ---------------------------------------------------------------- */

  describe('lane headings are unique, however the stage was written', () => {
    /**
     * TKT-058: the fixture used to seed four plain tickets and nothing else,
     * so the Board's two hard-coded section ids — `features-head` and
     * `lane-blocked-head` — were never on the page beside the lanes and the
     * collision they cause could not be seen. An epic, a really blocked
     * ticket, and the two hand-edited stages that mint those same ids are all
     * seeded here for that reason.
     */
    const seedAwkwardBoard = async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = app.ticket({ title: 'Take money with Stripe', type: 'epic' });
      app.ticket({ title: 'Checkout form', parent: epic });
      const stuck = app.ticket({ title: 'Publish the HQ relay' });
      moveTicket(app.ticketsDir, stuck, 'testing', 'bobby-test');
      moveTicket(app.ticketsDir, stuck, 'blocked', 'ccevans', 'waiting on the hosting account');
      const canonical = app.ticket({ title: 'Lock the spec' });
      moveTicket(app.ticketsDir, canonical, 'design-spec', 'bobby-design-spec');
      for (const [title, stage] of [
        ['Spec written by hand', 'Design Spec'],
        ['Typed the stage with a capital', 'Blocked'],
        ['Typed the stage as a word', 'Features'],
        ['Filed under bangs', '!!!'],
        ['Filed under queries', '???'],
      ]) {
        updateTicket(app.ticketsDir, app.ticket({ title }), { stage });
      }
      await open('#/board');
      await page.locator('#view-board .sec').first().waitFor();
    };

    it('gives every lane an id of its own', async () => {
      await seedAwkwardBoard();
      const ids = await page.locator('#view-board .sec h2').evaluateAll((hs) => hs.map((h) => h.id));
      // Features, Blocked, Backlog, and the six stage lanes.
      expect(ids).toHaveLength(9);
      expect(new Set(ids).size).toBe(ids.length);
    });

    // Not just among the lanes: `aria-labelledby` resolves against the whole
    // document, so the page's fixed section ids count too.
    it('leaves no duplicate id anywhere in the app', async () => {
      await seedAwkwardBoard();
      const dupes = await page.evaluate(() => {
        const ids = [...globalThis.document.querySelectorAll('#app [id]')].map((n) => n.id);
        return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
      });
      expect(dupes).toEqual([]);
    });

    it('resolves every aria-labelledby to that lane’s own heading', async () => {
      await seedAwkwardBoard();
      const wrong = await page.evaluate(() => [...globalThis.document.querySelectorAll('#view-board .sec')]
        .filter((s) => globalThis.document.getElementById(s.getAttribute('aria-labelledby')) !== s.querySelector('h2'))
        .map((s) => s.querySelector('h2').textContent));
      expect(wrong).toEqual([]);
    });

    // Two lanes that prettify to one phrase both fall back to the raw stage,
    // so the page itself says why "Design Spec" appears twice.
    it('tells two lanes apart on screen when their words collide', async () => {
      await seedAwkwardBoard();
      const headings = await page.locator('#view-board .sec h2').allTextContents();
      expect(headings).toEqual([
        'Features', 'Blocked', 'Backlog', 'design-spec',
        '!!!', '???', 'Blocked (stage)', 'Design Spec', 'Features (stage)',
      ]);
    });

    // No two headings read the same words either — a heading is what names its
    // section on screen as well as to a screen reader.
    it('draws no two section headings that read the same', async () => {
      await seedAwkwardBoard();
      const headings = await page.locator('#view-board .sec h2').allTextContents();
      expect(new Set(headings).size).toBe(headings.length);
    });
  });

  /* ---------------------------------------------------------------- *
   * TKT-056 — a row must not repeat the heading an inch above it
   * ---------------------------------------------------------------- */

  describe('rows say what their heading does not', () => {
    const seedMixedBoard = async () => {
      app = await startApp({ appDir: APP_DIR });
      const epic = seedFeature();
      const designed = app.ticket({ title: 'Out at design' });
      moveTicket(app.ticketsDir, designed, 'design-research', 'bobby-design-research');
      const stuck = app.ticket({ title: 'Publish the HQ relay' });
      moveTicket(app.ticketsDir, stuck, 'testing', 'bobby-test');
      moveTicket(app.ticketsDir, stuck, 'blocked', 'ccevans', 'waiting on the hosting account');
      await open('#/board');
      await page.locator('#view-board .sec').first().waitFor();
      return { epic, designed, stuck };
    };

    it('opens a stage lane’s rows with the id, not with the lane’s own word', async () => {
      const { designed } = await seedMixedBoard();
      const lane = page.locator('#view-board .sec', { has: page.locator('h2', { hasText: 'Design Research' }) });
      expect(await lane.locator('.row .s').textContent()).toBe(designed);
    });

    it('never restates a lane heading in the rows beneath it', async () => {
      await seedMixedBoard();
      const echoes = await page.evaluate(() => [...globalThis.document.querySelectorAll('#view-board .sec')]
        .flatMap((s) => {
          const heading = s.querySelector('h2').textContent;
          if (heading === 'Features' || heading === 'Blocked') return [];   // not stages
          return [...s.querySelectorAll('.row .s')]
            .map((n) => n.textContent)
            .filter((t) => t.startsWith(heading))
            .map((t) => `${heading} → ${t}`);
        }));
      expect(echoes).toEqual([]);
    });

    // The two sections where the stage word is new information keep it.
    it('still names the stage under Blocked and under Features', async () => {
      const { stuck } = await seedMixedBoard();
      const blocked = page.locator('#view-board .sec', { has: page.locator('h2', { hasText: 'Blocked' }) });
      expect(await blocked.locator('.row .s').textContent())
        .toBe(`Testing · ${stuck} · waiting on the hosting account`);

      const features = page.locator('#view-board .sec', { has: page.locator('h2', { hasText: 'Features' }) });
      expect(await features.locator('.row .s').textContent()).toBe('Backlog · 0 of 2 done');
    });
  });
});
