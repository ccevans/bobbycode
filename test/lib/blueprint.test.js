// test/lib/blueprint.test.js
//
// The blueprint is derived, never authored — so these guard the derivation:
// that it reads what the define pipeline actually writes, and that its drift
// check can't be fooled.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildBlueprint, parseTable } from '../../lib/blueprint.js';
import { renderBlueprint } from '../../lib/blueprint-html.js';
import { createTicket } from '../../lib/tickets.js';

let tmp, productDir, ticketsDir;

const BRIEF = `# Product Brief — TKT-001: A thing

**Locked:** 2026-08-01 · **Status:** approved

## Decided
- **Idea (verbatim from the epic):** "an app for runners"
- **Problem:** Runners lose track of their training.
- **Outcome:** They see the week at a glance.
- **Success metric:** Five runners log a week without being asked.
- **Non-goals:**
  - NOT a social network.
  - NOT a coaching service.

## Changelog
- 2026-08-01 — created
`;

const PERSONAS = `# Personas — TKT-001

**Locked:** 2026-08-01 · **Status:** approved

## P1 — Dana, marathoner · PRIMARY
- **Goal:** see the week at a glance
- **Context:** after every run
- **Proxy:** a real friend

## P2 — Sam, casual jogger
- **Goal:** keep a streak
- **Proxy:** none — assumption
`;

const JOURNEYS = `# Journeys — TKT-001

**Locked:** 2026-08-01 · **Status:** approved

## J1 — Log a run (persona: P1) · THE journey
**Trigger:** finishing a run
**Success:** the run is on the week view

| Step | What P1 does | What the product does | Drop-off risk |
|---|---|---|---|
| J1.S1 | Opens the app | Shows today | low |
| J1.S2 | Taps log | **Asks for distance** | the killer risk |

## Vetted — from the human
- The step where Dana would give up: **J1.S2** — too much typing.
`;

const MAP = `# Feature Map — TKT-001

**Locked:** 2026-08-01 · **Status:** approved

| ID | Feature | Serves journey step(s) | Persona | MoSCoW | Notes |
|---|---|---|---|---|---|
| F1.1 | Week view | J1.S1 | P1 | Must | |
| F1.2 | One-tap logging | J1.S2 | P1 | Must | the crux |
| F2.1 | Streaks | J1.S1 | P2 | Later | |
| F0.1 | Social feed | — | — | Never | cites Non-goal: NOT a social network |
`;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-bp-'));
  productDir = path.join(tmp, '.bobby', 'product');
  ticketsDir = path.join(tmp, '.bobby', 'tickets');
  fs.mkdirSync(productDir, { recursive: true });
  fs.mkdirSync(ticketsDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'brief.md'), BRIEF);
  fs.writeFileSync(path.join(productDir, 'personas.md'), PERSONAS);
  fs.writeFileSync(path.join(productDir, 'journeys.md'), JOURNEYS);
  fs.writeFileSync(path.join(productDir, 'feature-map.md'), MAP);
  createTicket(ticketsDir, { prefix: 'TKT', title: 'The epic', type: 'epic' });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const withTickets = () => {
  createTicket(ticketsDir, { prefix: 'TKT', title: 'Week view', parent: 'TKT-001', feature: 'F1.1', persona: 'P1' });
  createTicket(ticketsDir, { prefix: 'TKT', title: 'One-tap logging', parent: 'TKT-001', feature: 'F1.2', persona: 'P1' });
};

describe('parseTable', () => {
  it('keys rows by header and ignores the separator row', () => {
    const rows = parseTable('| ID | Name |\n|---|---|\n| F1.1 | Week view |');
    expect(rows).toEqual([{ id: 'F1.1', name: 'Week view' }]);
  });
});

describe('buildBlueprint', () => {
  it('reads the brief without truncating at the first line', () => {
    // A section regex using `$` with the /m flag silently cuts every section
    // to one line — this is the regression guard for that.
    const bp = buildBlueprint(productDir, ticketsDir, 'TKT-001');

    expect(bp.brief.problem).toMatch(/lose track/);
    expect(bp.brief.metric).toMatch(/Five runners/);
    expect(bp.brief.nonGoals).toHaveLength(2);
  });

  it('strips packed fields and markdown from values', () => {
    const bp = buildBlueprint(productDir, ticketsDir, 'TKT-001');

    // `**Locked:** date · **Status:** approved` must not leak the status.
    expect(bp.brief.locked).toBe('2026-08-01');
    // Journey cells carry markdown emphasis.
    expect(bp.journeys[0].steps[1].product).toBe('Asks for distance');
  });

  it('marks the primary persona and flags assumed ones', () => {
    const bp = buildBlueprint(productDir, ticketsDir, 'TKT-001');

    expect(bp.personas.map(p => p.id)).toEqual(['P1', 'P2']);
    expect(bp.personas[0].primary).toBe(true);
    expect(bp.personas[0].assumed).toBe(false);
    expect(bp.personas[1].assumed).toBe(true);
  });

  it('finds the crux the human named, and the feature that serves it', () => {
    const bp = buildBlueprint(productDir, ticketsDir, 'TKT-001');

    expect(bp.crux.step).toBe('J1.S2');
    expect(bp.crux.feature.id).toBe('F1.2');
  });

  it('separates Must from Later and Never', () => {
    const bp = buildBlueprint(productDir, ticketsDir, 'TKT-001');

    expect(bp.counts.must).toBe(2);
    expect(bp.later.map(f => f.id)).toEqual(['F2.1']);
    expect(bp.never.map(f => f.id)).toEqual(['F0.1']);
  });

  it('reports no drift when every Must row has exactly one ticket', () => {
    withTickets();

    const bp = buildBlueprint(productDir, ticketsDir, 'TKT-001');

    expect(bp.counts).toMatchObject({ must: 2, traced: 2, untraced: 0, orphans: 0 });
  });

  it('catches a Must feature with no ticket', () => {
    createTicket(ticketsDir, { prefix: 'TKT', title: 'Week view', parent: 'TKT-001', feature: 'F1.1', persona: 'P1' });

    const bp = buildBlueprint(productDir, ticketsDir, 'TKT-001');

    expect(bp.counts.untraced).toBe(1);
  });

  it('catches a ticket pointing at a feature that is not in the map', () => {
    withTickets();
    createTicket(ticketsDir, { prefix: 'TKT', title: 'Invented work', parent: 'TKT-001', feature: 'F9.9' });

    const bp = buildBlueprint(productDir, ticketsDir, 'TKT-001');

    expect(bp.counts.orphans).toBe(1);
  });

  it('refuses to build without a feature map, naming the fix', () => {
    fs.rmSync(path.join(productDir, 'feature-map.md'));

    expect(() => buildBlueprint(productDir, ticketsDir, 'TKT-001')).toThrow(/bobby run define/);
  });
});

describe('renderBlueprint', () => {
  it('renders a self-contained page — no CDN, no scripts, no network', () => {
    withTickets();
    const html = renderBlueprint(buildBlueprint(productDir, ticketsDir, 'TKT-001'));

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('shows the tickets, the crux, and the drift verdict', () => {
    withTickets();
    const html = renderBlueprint(buildBlueprint(productDir, ticketsDir, 'TKT-001'));

    expect(html).toContain('TKT-002');
    expect(html).toContain('the crux');
    expect(html).toContain('No drift');
  });

  it('says so loudly when a Must feature has no ticket', () => {
    const html = renderBlueprint(buildBlueprint(productDir, ticketsDir, 'TKT-001'));

    expect(html).toContain('no ticket');
    expect(html).toMatch(/Drift: 2 Must feature/);
  });

  it('escapes content rather than trusting the artifacts', () => {
    fs.writeFileSync(path.join(productDir, 'brief.md'), BRIEF.replace('A thing', '<img src=x onerror=alert(1)>'));
    const html = renderBlueprint(buildBlueprint(productDir, ticketsDir, 'TKT-001'));

    expect(html).not.toContain('<img src=x');
  });
});

// The mockups artifact is OPTIONAL — a skipped mockups stage must cost the
// blueprint nothing. Presence adds one design-direction line; absence changes
// nothing at all.
describe('optional mockups input', () => {
  const MOCKUPS = `# Mockups — TKT-001

**Locked:** 2026-08-23 · **Status:** approved

- **Chosen direction:** Ledger-style week view, warm paper ground
`;

  it('absent mockups.md: model.mockups is null and the page renders without a design-direction line', () => {
    const bp = buildBlueprint(productDir, ticketsDir, 'TKT-001');
    expect(bp.mockups).toBeNull();
    const html = renderBlueprint(bp);
    expect(html).not.toContain('Design direction');
  });

  it('present mockups.md: the model carries it and the page shows the chosen direction', () => {
    fs.writeFileSync(path.join(productDir, 'mockups.md'), MOCKUPS);
    const bp = buildBlueprint(productDir, ticketsDir, 'TKT-001');
    expect(bp.mockups).not.toBeNull();
    const html = renderBlueprint(bp);
    expect(html).toContain('Design direction');
    expect(html).toContain('Ledger-style week view');
  });
});
