// test/skills/lighthouse-audit.test.js
//
// The lighthouse-audit skill ships an executable runner. Its whole value is that it
// proposes work, which makes its failure modes expensive in both directions: propose
// noise and people stop reading the report, miss a real gap and the report is worse than
// nothing. These cases pin the classification logic the runner is built on. They exercise
// the pure exports only — no browser, no network — so they run in CI like any unit test.

import { pagesFromSitemap, failingAudits, findDuplicate } from '../../templates/skills/bobby-lighthouse/lighthouse-audit.mjs';

/** Minimal Lighthouse-shaped report. */
function report(auditRefs, audits) {
  return { categories: { accessibility: { auditRefs } }, audits };
}

describe('lighthouse-audit: which findings become tickets', () => {
  test('collects only audits that actually failed', () => {
    const r = report(
      [{ id: 'passing', weight: 10 }, { id: 'failing', weight: 7 }, { id: 'na', weight: 3 }],
      {
        passing: { title: 'Fine', score: 1, details: { items: [] } },
        failing: { title: 'Broken', score: 0, details: { items: [{ node: { snippet: '<p>' } }] } },
        na: { title: 'N/A', score: null }, // not applicable to this page is not a gap
      }
    );
    const out = failingAudits(r, 'accessibility');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('failing');
  });

  test('records node counts so a zero-node timing audit can be excluded', () => {
    // interactive and max-potential-fid "fail" on a slow run with no defect present.
    const r = report([{ id: 'timing', weight: 10 }, { id: 'real', weight: 10 }], {
      timing: { title: 'Time to Interactive', score: 0.4 },
      real: { title: 'Contrast', score: 0, details: { items: [{ node: { snippet: '<a>' } }, { node: { snippet: '<b>' } }] } },
    });
    const out = failingAudits(r, 'accessibility');
    expect(out.find((a) => a.id === 'timing').nodes).toBe(0);
    expect(out.find((a) => a.id === 'real').nodes).toBe(2);
  });

  test('survives audits whose details.items is not an array', () => {
    // Real reports carry debugdata and object-shaped details; assuming array shape crashes.
    const r = report([{ id: 'odd', weight: 5 }], {
      odd: { title: 'Odd', score: 0, details: { type: 'debugdata', items: { not: 'an array' } } },
    });
    expect(() => failingAudits(r, 'accessibility')).not.toThrow();
    expect(failingAudits(r, 'accessibility')[0].nodes).toBe(0);
  });

  test('carries sample selectors so a ticket needs no re-investigation', () => {
    const r = report([{ id: 'contrast', weight: 7 }], {
      contrast: { title: 'Contrast', score: 0, details: { items: [{ node: { snippet: '<p class="a">' } }, { node: { selector: '.b' } }, { url: 'https://x/y.js' }] } },
    });
    expect(failingAudits(r, 'accessibility')[0].samples).toEqual(['<p class="a">', '.b', 'https://x/y.js']);
  });

  test('ranks by category weight so the biggest movers surface first', () => {
    const r = report([{ id: 'light', weight: 1 }, { id: 'heavy', weight: 10 }], {
      light: { title: 'Light', score: 0, details: { items: [{ node: { snippet: 'x' } }] } },
      heavy: { title: 'Heavy', score: 0, details: { items: [{ node: { snippet: 'y' } }] } },
    });
    expect(failingAudits(r, 'accessibility').map((a) => a.id)).toEqual(['heavy', 'light']);
  });
});

describe('lighthouse-audit: template discovery from the sitemap', () => {
  test('groups URLs into templates and counts each one', () => {
    const locs = [
      'https://e.com/',
      ...Array.from({ length: 5 }, (_, i) => `https://e.com/blog/post-${i}`),
      ...Array.from({ length: 3 }, (_, i) => `https://e.com/guides/g-${i}`),
    ];
    const pages = pagesFromSitemap(locs);
    expect(pages.find((p) => p.name === 'blog').count).toBe(5);
    expect(pages.find((p) => p.name === 'guides').count).toBe(3);
    expect(pages.find((p) => p.name === 'blog').sitemapMatch).toBe('/blog/');
  });

  test('always includes the homepage and orders templates by size', () => {
    const locs = [
      ...Array.from({ length: 2 }, (_, i) => `https://e.com/small/${i}`),
      ...Array.from({ length: 9 }, (_, i) => `https://e.com/big/${i}`),
    ];
    const pages = pagesFromSitemap(locs);
    expect(pages[0].name).toBe('homepage');
    expect(pages[1].name).toBe('big');
  });

  test('ignores one-off pages that are not really a template', () => {
    const locs = ['https://e.com/about', 'https://e.com/contact', ...Array.from({ length: 4 }, (_, i) => `https://e.com/blog/${i}`)];
    const names = pagesFromSitemap(locs).map((p) => p.name);
    expect(names).toContain('blog');
    expect(names).not.toContain('about');
  });

  test('does not throw on malformed sitemap entries', () => {
    const locs = ['not-a-url', '', 'https://e.com/blog/a', 'https://e.com/blog/b'];
    expect(() => pagesFromSitemap(locs)).not.toThrow();
    expect(pagesFromSitemap(locs).some((p) => p.name === 'blog')).toBe(true);
  });
});

describe('lighthouse-audit: never re-file what is already open', () => {
  const TICKETS = [
    { id: 'TKT-1', stage: 'backlog', body: 'store pages fail color-contrast and heading-order'.toLowerCase() },
    { id: 'TKT-2', stage: 'done', body: 'footer color-contrast on the homepage'.toLowerCase() },
  ];

  test('matches an open ticket covering the same audit and section', () => {
    expect(findDuplicate(TICKETS, 'color-contrast', 'store')?.id).toBe('TKT-1');
  });

  test('ignores done tickets, so a regression can be re-filed', () => {
    expect(findDuplicate(TICKETS, 'color-contrast', 'homepage')).toBeUndefined();
  });

  test('does not match a different audit on the same section', () => {
    expect(findDuplicate(TICKETS, 'image-alt', 'store')).toBeUndefined();
  });

  test('does not match the same audit on an unrelated section', () => {
    expect(findDuplicate(TICKETS, 'color-contrast', 'checkout')).toBeUndefined();
  });

  test('short section names cannot match by accident', () => {
    const tickets = [{ id: 'X', stage: 'backlog', body: 'the api color-contrast issue'.toLowerCase() }];
    expect(findDuplicate(tickets, 'color-contrast', 'api')).toBeUndefined();
  });

  test('matches a ticket that names the section by URL path, not the discovered name', () => {
    // Discovery names a section "products" after its URL segment; the human called it "store".
    const tickets = [{ id: 'TKT-9', stage: 'backlog', body: 'the store: /products/* urls fail color-contrast'.toLowerCase() }];
    expect(findDuplicate(tickets, 'color-contrast', 'products', '/products/widget')?.id).toBe('TKT-9');
  });

  test('the path fallback still cannot match an unrelated section', () => {
    const tickets = [{ id: 'Y', stage: 'backlog', body: 'blog color-contrast'.toLowerCase() }];
    expect(findDuplicate(tickets, 'color-contrast', 'guides', '/guides/x')).toBeUndefined();
  });
});

describe('lighthouse-audit: dedupe requires the audit and section to be ABOUT each other', () => {
  test('does not match when the audit id and section token are far apart in the body', () => {
    // A real over-match caught against a live backlog: a homeowners-directory ticket
    // carried a comparison table with a "blog" row and mentioned unused-javascript in a
    // separate paragraph. Matching both anywhere wrongly suppressed a real blog gap, which
    // is worse than a duplicate because the work then silently never gets proposed.
    const far = 'homeowner directory accessibility. ' + 'x'.repeat(400) +
      ' comparison table: | blog | 96 | ' + 'y'.repeat(400) + ' perf: unused-javascript about 26 kb.';
    const tickets = [{ id: 'TKT-292', stage: 'backlog', body: far.toLowerCase() }];
    expect(findDuplicate(tickets, 'unused-javascript', 'blog', '/blog/x')).toBeUndefined();
  });

  test('still matches when the audit id and section token are close together', () => {
    const tickets = [{ id: 'TKT-282', stage: 'backlog', body: 'blog pages: remaining color-contrast failures'.toLowerCase() }];
    expect(findDuplicate(tickets, 'color-contrast', 'blog', '/blog/x')?.id).toBe('TKT-282');
  });
});
