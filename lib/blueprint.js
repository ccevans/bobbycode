// lib/blueprint.js
// The glimpse before you build.
//
// Definition produces four markdown artifacts and a pile of tickets — true,
// traceable, and impossible to see the shape of. This derives one model from
// them (deterministically, no model calls) so the whole plan can be read on
// one page before a line is written: who it's for, the journey that matters,
// every ticket grouped by track and traceable back, and what's out of scope.
//
// Everything here is parsed from files the define pipeline already writes:
//   .bobby/product/{brief,personas,journeys,feature-map}.md  +  ticket frontmatter
import fs from 'fs';
import path from 'path';
import { listTickets, findTicket } from './tickets.js';

/** `**Label:** value` → value (first match wins). */
function field(md, label) {
  const m = md.match(new RegExp(`^\\s*-?\\s*\\*\\*${label}:?\\*\\*[:\\s]*(.+)$`, 'im'));
  if (!m) return null;
  // Header lines pack several fields: `**Locked:** date · **Status:** approved`
  return m[1].split('·')[0].trim();
}

/**
 * The body under a `## Heading`, up to the next heading of the same-or-higher
 * level. Sliced rather than lookahead-matched: with the `m` flag a `$` in a
 * lookahead matches end-of-LINE, which silently truncates every section at its
 * first line.
 */
function section(md, heading) {
  const start = md.match(new RegExp(`^##+\\s*${heading}[^\\n]*\\n`, 'im'));
  if (!start) return '';
  const from = start.index + start[0].length;
  const rest = md.slice(from);
  const next = rest.search(/^##\s/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function read(dir, name) {
  const p = path.join(dir, name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/** Strip markdown emphasis so values render as plain text. */
function plain(s) {
  return String(s || '').replace(/\*\*/g, '').replace(/^\s*[-–—]\s*/, '').trim();
}

/** Parse a GitHub-style table into row objects keyed by header. */
export function parseTable(md) {
  const lines = md.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
  if (lines.length < 2) return [];
  const cells = (l) => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const headers = cells(lines[0]).map(h => h.toLowerCase());
  return lines.slice(2)
    .map(l => cells(l))
    .filter(r => r.length === headers.length && r.some(Boolean))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

function parseBrief(md) {
  if (!md) return null;
  const decided = section(md, 'Decided');
  // Non-goals are a nested list under their own bullet: take the indented
  // lines that follow, stopping at the next top-level bullet.
  const ngStart = decided.search(/^\s*-\s*\*\*Non-goals/im);
  const nonGoals = ngStart === -1 ? [] : decided.slice(ngStart).split('\n').slice(1)
    .filter(l => /^\s+[-*]\s/.test(l))
    .map(l => plain(l)).filter(Boolean);
  return {
    idea: plain(field(decided, 'Idea \\(verbatim from the epic\\)') || field(decided, 'Idea')),
    problem: plain(field(decided, 'Problem')),
    outcome: plain(field(decided, 'Outcome')),
    metric: plain(field(decided, 'Success metric')),
    constraints: plain(field(decided, 'Constraints')),
    positioning: plain(field(decided, 'Positioning')),
    nonGoals,
    locked: field(md, 'Locked'),
    status: field(md, 'Status'),
  };
}

function parsePersonas(md) {
  if (!md) return [];
  const out = [];
  const blocks = md.split(/^##\s+(?=P\d)/m).slice(1);
  for (const b of blocks) {
    const head = b.split('\n')[0];
    const id = (head.match(/^(P\d+)/) || [])[1];
    if (!id) continue;
    out.push({
      id,
      name: plain(head.replace(/^P\d+\s*[—-]\s*/, '').replace(/·\s*PRIMARY/i, '')),
      primary: /PRIMARY/i.test(head),
      goal: plain(field(b, 'Goal')),
      context: plain(field(b, 'Context')),
      proxy: plain(field(b, 'Proxy')),
      assumed: /assum/i.test(field(b, 'Proxy') || ''),
    });
  }
  return out;
}

function parseJourneys(md) {
  if (!md) return [];
  const out = [];
  const blocks = md.split(/^##\s+(?=J\d)/m).slice(1);
  for (const b of blocks) {
    const head = b.split('\n')[0];
    const id = (head.match(/^(J\d+)/) || [])[1];
    if (!id) continue;
    const rows = parseTable(b);
    out.push({
      id,
      name: plain(head.replace(/^J\d+\s*[—-]\s*/, '').replace(/\(persona:[^)]*\)/i, '').replace(/·\s*THE journey/i, '')),
      persona: (head.match(/persona:\s*(P\d+)/i) || [])[1] || null,
      headline: /THE journey/i.test(head),
      trigger: plain(field(b, 'Trigger')),
      success: plain(field(b, 'Success')),
      steps: rows.map(r => ({
        id: r.step,
        actor: plain(r[Object.keys(r)[1]] || ''),
        product: plain(r[Object.keys(r)[2]] || ''),
        risk: plain(r[Object.keys(r)[3]] || ''),
      })).filter(s => s.id),
    });
  }
  return out;
}

/**
 * The OPTIONAL mockups artifact — written only when the human picked a
 * direction at the mockups gate. Skipping that stage writes nothing, and this
 * returns null: absence must cost the blueprint nothing.
 */
function parseMockups(md) {
  if (!md) return null;
  return {
    direction: plain(field(md, 'Chosen direction') || field(md, 'Direction')),
    locked: field(md, 'Locked'),
    status: field(md, 'Status'),
  };
}

function parseFeatures(md) {
  if (!md) return [];
  return parseTable(md).map(r => ({
    id: r.id,
    name: plain(r.feature),
    journey: r['serves journey step(s)'] || r['serves journey step'] || '',
    persona: r.persona || '',
    moscow: (r.moscow || '').toLowerCase(),
    notes: plain(r.notes || ''),
  })).filter(f => /^F\d/.test(f.id || ''));
}

/**
 * The crux: the journey step a human named as their give-up point, and the
 * feature that serves it. Recorded by the journeys gate as a "give up" line.
 */
function findCrux(journeysMd, features) {
  if (!journeysMd) return null;
  const vetted = section(journeysMd, 'Vetted — from the human') || section(journeysMd, 'Vetted');
  const m = vetted.match(/give up:?\s*\*{0,2}(J\d+\.S\d+)/i);
  if (!m) return null;
  const step = m[1];
  return { step, feature: features.find(f => (f.journey || '').includes(step)) || null };
}

/** Group tickets into build tracks by their feature family. */
const TRACKS = [
  { key: 'foundation', label: 'Foundation', match: (f) => /^F4\./.test(f) || f === 'F6.3',
    why: 'Nothing is testable before the channel exists.' },
  { key: 'core', label: 'The core journey', match: (f) => /^F1\./.test(f),
    why: 'What the success metric actually measures.' },
  { key: 'flow', label: 'The second journey', match: (f) => /^F2\./.test(f), why: '' },
  { key: 'enablers', label: 'Enablers', match: (f) => /^F6\./.test(f),
    why: 'The work no user journey can name — and the usual reason a build feels unfinished.' },
  { key: 'other', label: 'Everything else', match: () => true, why: '' },
];

/**
 * Build the blueprint model. Pure: reads files, returns data, renders nothing.
 *
 * @param {string} productDir  .bobby/product
 * @param {string} ticketsDir  .bobby/tickets
 * @param {string} epicId      the epic the definition belongs to
 */
export function buildBlueprint(productDir, ticketsDir, epicId = null) {
  const briefMd = read(productDir, 'brief.md');
  const personasMd = read(productDir, 'personas.md');
  const journeysMd = read(productDir, 'journeys.md');
  const featuresMd = read(productDir, 'feature-map.md');
  const mockupsMd = read(productDir, 'mockups.md');

  if (!featuresMd) {
    throw new Error(`No feature map in ${productDir} — run \`bobby run define <epicId>\` first.`);
  }

  const brief = parseBrief(briefMd);
  const personas = parsePersonas(personasMd);
  const journeys = parseJourneys(journeysMd);
  const features = parseFeatures(featuresMd);
  const mockups = parseMockups(mockupsMd);
  const crux = findCrux(journeysMd, features);

  const epic = epicId ? findTicket(ticketsDir, epicId) : null;
  const all = listTickets(ticketsDir);
  const children = all.filter(t => (epicId ? t.parent === epicId : t.feature) && t.type !== 'epic');
  const byFeature = new Map(children.filter(t => t.feature).map(t => [t.feature, t]));

  // Every Must row, with its ticket if one exists — the drift check made visible.
  const must = features.filter(f => f.moscow === 'must');
  const rows = must.map(f => ({
    feature: f,
    ticket: byFeature.get(f.id) || null,
    isCrux: !!(crux && crux.feature && crux.feature.id === f.id),
  }));

  const tracks = TRACKS.map(t => ({
    ...t,
    rows: rows.filter(r => TRACKS.find(x => x.match(r.feature.id)) === t),
  })).filter(t => t.rows.length > 0);

  const started = children.filter(t => !['backlog', 'blocked'].includes(t.stage)).length;

  return {
    project: path.basename(path.resolve(productDir, '..', '..')),
    epicId,
    epicTitle: epic ? epic.data.title : null,
    brief,
    personas,
    journeys,
    features,
    mockups,
    crux,
    tracks,
    later: features.filter(f => f.moscow === 'later' || f.moscow === 'should'),
    never: features.filter(f => f.moscow === 'never'),
    counts: {
      must: must.length,
      tickets: children.length,
      traced: rows.filter(r => r.ticket).length,
      untraced: rows.filter(r => !r.ticket).length,
      orphans: children.filter(t => t.feature && !features.some(f => f.id === t.feature)).length,
      started,
    },
  };
}
