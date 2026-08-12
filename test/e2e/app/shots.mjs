// test/e2e/app/shots.mjs — verification screenshots, driven by the real server.
//
// Run:  BOBBY_APP_DIR=/path/to/pro-dashboard/app node test/e2e/app/shots.mjs
//
// Uses the same harness the e2e suite does, so the orchestrator is stubbed and
// nothing here can spawn `claude`.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { chromium } from 'playwright';
import { moveTicket, updateTicket } from '../../../lib/tickets.js';
import { startApp } from './harness.js';

const APP_DIR = path.resolve(process.env.BOBBY_APP_DIR);
const OUT = process.argv[2] || path.resolve('.bobby/design/mockups/shots');
const WIDTHS = [390, 1440];

fs.mkdirSync(OUT, { recursive: true });

const shoot = async (page, name, width) => {
  const file = path.join(OUT, `final-${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${file}`);
};

const browser = await chromium.launch();

/* ---- Feature: owner/repo in the sublabel, and a merged child row ---- */
{
  const app = await startApp({ appDir: APP_DIR });
  execSync('git init -q . && git remote add origin git@github.com:ccevans/bobbycode.git', {
    cwd: app.repoRoot, stdio: 'pipe', shell: '/bin/sh',
  });
  const epic = app.ticket({ title: 'Payments', type: 'epic', description: 'Take money.' });
  app.ticket({ title: 'Checkout form', parent: epic });
  app.ticket({ title: 'Stripe webhook', parent: epic });
  app.ticket({ title: 'Refund endpoint', parent: epic });
  moveTicket(app.ticketsDir, 'TKT-002', 'building', 'bobby-build');
  updateTicket(app.ticketsDir, 'TKT-002', {
    stage: 'done',
    mergedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  });
  moveTicket(app.ticketsDir, 'TKT-003', 'building', 'bobby-build');
  moveTicket(app.ticketsDir, epic, 'planning', 'bobby-plan');
  moveTicket(app.ticketsDir, epic, 'building', 'bobby-build');

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${app.base}/#/feature/${epic}`);
    await page.locator('#view-feature .pipeline .steps li').first().waitFor();
    await page.waitForFunction(() => globalThis.document
      .querySelector('#view-feature .sub')?.textContent.includes('/'));
    await shoot(page, 'feature', width);
    await ctx.close();
  }
  await app.stop();
}

/* ---- Ideas: populated ---- */
{
  const app = await startApp({ appDir: APP_DIR });
  for (const text of [
    'let the board filter by area, and remember the filter between sessions',
    'a keyboard shortcut for approve',
    'ship a weekly digest of what the agents did',
  ]) {
    await app.api('POST', '/api/ideas', { text });
  }
  await app.api('POST', '/api/ideas', { text: 'surface bobby idea in the app' });
  await app.api('POST', '/api/ideas/4/promote', {});

  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${app.base}/#/ideas`);
    await page.locator('#view-ideas .actions .btn-quiet').waitFor();
    await shoot(page, 'ideas', width);
    await ctx.close();
  }
  await app.stop();
}

/* ---- Ideas: empty ---- */
{
  const app = await startApp({ appDir: APP_DIR });
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${app.base}/#/ideas`);
    await page.locator('#view-ideas .quiet-state').waitFor();
    await shoot(page, 'ideas-empty', width);
    await ctx.close();
  }
  await app.stop();
}

await browser.close();
