// lib/blueprint-html.js
// Renders the blueprint model as one self-contained HTML page.
//
// No build step, no CDN, no fonts fetched, no scripts — it opens from the
// filesystem, works offline, and prints. The journey flow is HTML/CSS rather
// than a diagram library for exactly that reason. Colour follows the Bobby
// app's system: semantic lamps, amber reserved for what needs a human.
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const SEV = { critical: 'crit', high: 'high', medium: 'med', low: 'med' };

function ticketCard(row) {
  const t = row.ticket;
  const sev = t ? (SEV[t.priority] || 'med') : 'med';
  const id = t ? t.id : '—';
  const title = t ? t.title : row.feature.name;
  const missing = !t;
  return `
        <div class="ticket ${row.isCrux ? 'is-crux' : ''} ${missing ? 'is-missing' : ''}" style="--sev: var(--${sev})">
          <div class="row">
            <span class="id">${esc(id)}</span>
            <span class="sev">${missing ? 'no ticket' : esc(t.priority)}${row.isCrux ? ' · the crux' : ''}</span>
          </div>
          <div class="title">${esc(title)}</div>
          <div class="trace">
            <span>${esc(row.feature.id)}</span>
            ${row.feature.journey ? `<span>· ${esc(row.feature.journey)}</span>` : ''}
            ${row.feature.persona ? `<span>· ${esc(row.feature.persona)}</span>` : ''}
          </div>
        </div>`;
}

/**
 * The journey as a flow of steps — rendered in HTML/CSS, not a diagram
 * library. A journey is a linear chain, which CSS draws perfectly well, and
 * this keeps the page true to its promise: opens from the filesystem, works
 * offline, themes with everything else, and prints.
 */
function journeyFlow(j, crux) {
  if (!j || j.steps.length === 0) return '';
  return `<ol class="flow">${j.steps.map((s) => {
    const isCrux = crux && crux.step === s.id;
    return `
      <li class="step ${isCrux ? 'is-crux' : ''}">
        <span class="step-id">${esc(s.id)}</span>
        <span class="step-actor">${esc(s.actor)}</span>
        ${s.product ? `<span class="step-product">${esc(s.product)}</span>` : ''}
        ${s.risk && s.risk !== '—' ? `<span class="step-risk">${esc(s.risk)}</span>` : ''}
      </li>`;
  }).join('')}</ol>`;
}

export function renderBlueprint(bp) {
  const headline = bp.journeys.find(j => j.headline) || bp.journeys[0];
  const primary = bp.personas.find(p => p.primary);

  const tracks = bp.tracks.map(t => `
      <div class="track">
        <div class="track-head"><h3>${esc(t.label)}</h3><span class="count">${t.rows.length} ticket${t.rows.length === 1 ? '' : 's'}</span></div>
        ${t.why ? `<p class="why">${esc(t.why)}</p>` : ''}
        <div class="tickets">${t.rows.map(ticketCard).join('')}</div>
      </div>`).join('');

  const outRows = (list) => list.length === 0
    ? '<li>Nothing recorded.</li>'
    : list.map(f => `<li><b>${esc(f.name)}</b>${f.notes ? ` — ${esc(f.notes)}` : ''}</li>`).join('');

  const drift = bp.counts.untraced === 0 && bp.counts.orphans === 0;

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(bp.project)} — Build Blueprint</title>
<style>
:root{
  --ground:#101418;--surface:#1A2026;--line:#2B343D;--ink:#E8EDF2;--ink-dim:#8A97A3;--ink-faint:#5C6873;
  --attn:#FFB03A;--crit:#FF6B6B;--high:#FFB03A;--med:#6E7C88;--ok:#67D67E;--info:#8FB4FF;
  --paper:#FBFAF8;--paper-line:#E4E0DA;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --measure:68ch;--pad:clamp(18px,4vw,34px);
}
@media (prefers-color-scheme:light){:root{
  --ground:#F6F5F2;--surface:#FFFFFF;--line:#E2DED7;--ink:#16191C;--ink-dim:#5A626B;--ink-faint:#8B939B;
  --attn:#B5721A;--crit:#C0392F;--high:#B5721A;--med:#7C858E;--ok:#2C8F44;--info:#3D6FD0;}}
:root[data-theme="dark"]{--ground:#101418;--surface:#1A2026;--line:#2B343D;--ink:#E8EDF2;--ink-dim:#8A97A3;--ink-faint:#5C6873;--attn:#FFB03A;--crit:#FF6B6B;--high:#FFB03A;--med:#6E7C88;--ok:#67D67E;--info:#8FB4FF;}
:root[data-theme="light"]{--ground:#F6F5F2;--surface:#FFFFFF;--line:#E2DED7;--ink:#16191C;--ink-dim:#5A626B;--ink-faint:#8B939B;--attn:#B5721A;--crit:#C0392F;--high:#B5721A;--med:#7C858E;--ok:#2C8F44;--info:#3D6FD0;}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.55;-webkit-text-size-adjust:100%}
.sheet{max-width:1080px;margin:0 auto;padding:var(--pad) var(--pad) 90px}
.masthead{border-bottom:1px solid var(--line);padding-bottom:24px;margin-bottom:32px}
.kicker{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-faint);display:flex;flex-wrap:wrap;gap:6px 14px;margin-bottom:18px}
.kicker .live{color:var(--attn)}
h1{font-family:var(--mono);font-weight:700;font-size:clamp(24px,4vw,40px);line-height:1.14;letter-spacing:-.015em;margin:0 0 14px;text-wrap:balance}
.thesis{font-size:clamp(15px,2vw,18px);color:var(--ink-dim);max-width:var(--measure);margin:0}
section{margin-top:50px}
h2{font-family:var(--mono);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint);margin:0 0 6px;font-weight:600}
.lede{font-size:17px;margin:0 0 20px;max-width:var(--measure)}
p{max-width:var(--measure)}
.metric{background:linear-gradient(135deg,color-mix(in srgb,var(--attn) 14%,var(--surface)),var(--surface));border:1px solid color-mix(in srgb,var(--attn) 40%,var(--line));border-radius:12px;padding:20px 22px;margin-top:24px}
.metric .label{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--attn);margin-bottom:8px}
.metric .value{font-size:clamp(16px,2.2vw,21px);font-weight:600;margin:0;max-width:48ch}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px}
.card.primary{border-color:color-mix(in srgb,var(--attn) 45%,var(--line))}
.card h3{font-family:var(--mono);font-size:14px;margin:0 0 4px}
.card .role{font-size:13px;color:var(--ink-dim);margin:0 0 10px}
.card p{font-size:14px;margin:0;color:var(--ink-dim)}
.tag{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:2px 7px;border-radius:20px;border:1px solid currentColor;margin-left:8px;vertical-align:2px}
.tag.real{color:var(--ok)}.tag.assumed{color:var(--ink-faint)}
.flow{list-style:none;margin:22px 0 12px;padding:0;display:flex;flex-direction:column;gap:0}
.step{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px 12px 16px;display:flex;flex-direction:column;gap:3px;margin-bottom:22px}
.step:last-child{margin-bottom:0}
.step::after{content:"";position:absolute;left:28px;bottom:-17px;width:2px;height:12px;background:var(--line)}
.step:last-child::after{display:none}
.step.is-crux{border-color:color-mix(in srgb,var(--attn) 55%,var(--line));box-shadow:0 0 0 1px color-mix(in srgb,var(--attn) 30%,transparent)}
.step-id{font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--ink-faint)}
.step.is-crux .step-id{color:var(--attn)}
.step-actor{font-size:15px;font-weight:600}
.step-product{font-size:14px;color:var(--ink-dim)}
.step-risk{font-size:13px;color:var(--crit);opacity:.85}
@media (min-width:820px){
  .flow{flex-direction:row;align-items:stretch;gap:0}
  .step{flex:1;margin-bottom:0;margin-right:20px}
  .step:last-child{margin-right:0}
  .step::after{left:auto;right:-13px;bottom:auto;top:50%;width:8px;height:2px}
}
.caption{font-size:13px;color:var(--ink-faint);margin:0;max-width:var(--measure)}
.crux{border-left:3px solid var(--attn);background:var(--surface);padding:14px 18px;border-radius:0 10px 10px 0;margin:22px 0}
.crux .label{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--attn);margin-bottom:6px}
.crux p{margin:0;font-size:15px}
.track{margin-top:28px}
.track-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:4px}
.track-head h3{font-family:var(--mono);font-size:15px;margin:0}
.track-head .count{font-family:var(--mono);font-size:12px;color:var(--ink-faint);font-variant-numeric:tabular-nums}
.why{font-size:14px;color:var(--ink-dim);margin:0 0 12px;max-width:var(--measure)}
.tickets{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:10px}
.ticket{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--sev,var(--med));border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:5px}
.ticket.is-crux{border-color:color-mix(in srgb,var(--attn) 45%,var(--line));border-left-color:var(--attn)}
.ticket.is-missing{border-style:dashed;opacity:.85}
.ticket .row{display:flex;align-items:baseline;gap:8px}
.ticket .id{font-family:var(--mono);font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
.ticket .sev{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--sev,var(--med));margin-left:auto}
.ticket .title{font-size:14.5px;line-height:1.4}
.trace{font-family:var(--mono);font-size:11px;color:var(--ink-faint);display:flex;gap:8px;flex-wrap:wrap}
.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.out{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px}
.out h3{font-family:var(--mono);font-size:13px;margin:0 0 10px}
.out ul{margin:0;padding-left:18px}
.out li{font-size:14px;color:var(--ink-dim);margin-bottom:6px}
.out li b{color:var(--ink);font-weight:600}
.out.never h3{color:var(--crit)}.out.later h3{color:var(--info)}
.drift{display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:13px;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--check,var(--ok));border-radius:8px;padding:12px 14px;margin-top:18px}
.drift .dot{width:8px;height:8px;border-radius:50%;background:var(--check,var(--ok));flex:none}
footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);font-family:var(--mono);font-size:11.5px;color:var(--ink-faint);display:flex;flex-wrap:wrap;gap:6px 18px}
@media print{body{background:#fff;color:#000}.sheet{max-width:none}}
</style></head>
<body><div class="sheet">

<header class="masthead">
  <div class="kicker">
    <span>Build blueprint</span>
    ${bp.epicId ? `<span>${esc(bp.epicId)} · ${esc(bp.project)}</span>` : `<span>${esc(bp.project)}</span>`}
    ${bp.brief && bp.brief.locked ? `<span class="live">Definition locked ${esc(bp.brief.locked)}</span>` : ''}
    <span>${bp.counts.tickets} tickets · ${bp.counts.started} started</span>
  </div>
  <h1>${esc(bp.epicTitle || bp.project)}</h1>
  ${bp.brief && bp.brief.outcome ? `<p class="thesis">${esc(bp.brief.outcome)}</p>` : ''}
  ${bp.brief && bp.brief.problem ? `<p class="thesis" style="margin-top:12px">${esc(bp.brief.problem)}</p>` : ''}
  ${bp.brief && bp.brief.metric ? `
  <div class="metric">
    <div class="label">Success — the one thing that must happen</div>
    <p class="value">${esc(bp.brief.metric)}</p>
  </div>` : ''}
</header>

${bp.personas.length ? `
<section>
  <h2>Who it's for</h2>
  ${primary ? `<p class="lede">Everything below is built for ${esc(primary.name.split(',')[0])}.</p>` : ''}
  <div class="cards">
    ${bp.personas.map(p => `
    <div class="card ${p.primary ? 'primary' : ''}">
      <h3>${esc(p.id)} · ${esc(p.name.split(',')[0])}
        <span class="tag ${p.assumed ? 'assumed' : 'real'}">${p.assumed ? 'assumed' : 'real proxy'}</span></h3>
      ${p.name.includes(',') ? `<p class="role">${esc(p.name.split(',').slice(1).join(',').trim())}</p>` : ''}
      <p>${esc(p.goal || p.context || '')}</p>
    </div>`).join('')}
  </div>
</section>` : ''}

${headline ? `
<section>
  <h2>The journey the product lives on</h2>
  <p class="lede">${esc(headline.id)} — ${esc(headline.name)}${headline.trigger ? `. Trigger: ${esc(headline.trigger)}` : ''}</p>
  ${journeyFlow(headline, bp.crux)}
  ${bp.journeys.length > 1 ? `<p class="caption">Also mapped: ${bp.journeys.filter(j => j !== headline).map(j => `<b>${esc(j.id)}</b> ${esc(j.name)}`).join(' · ')}</p>` : ''}
  ${bp.crux ? `
  <div class="crux">
    <div class="label">The crux — named by a human at the gate</div>
    <p>${esc(bp.crux.step)} is where it falls down${bp.crux.feature ? ` — which makes <strong>${esc(bp.crux.feature.id)} ${esc(bp.crux.feature.name)}</strong> the product` : ''}. Over-invest here; everything else is plumbing around it.</p>
  </div>` : ''}
</section>` : ''}

<section>
  <h2>What we're building</h2>
  <p class="lede">${bp.counts.must} Must features → ${bp.counts.traced} tickets, each traceable to a feature, a journey step, and a persona.</p>
  ${tracks}
  <div class="drift" style="--check: var(--${drift ? 'ok' : 'crit'})">
    <span class="dot"></span>
    <span>${drift
    ? `No drift: every Must feature has exactly one ticket, and every ticket's ref resolves.`
    : `Drift: ${bp.counts.untraced} Must feature(s) without a ticket, ${bp.counts.orphans} ticket(s) referencing a feature not in the map.`}</span>
  </div>
</section>

<section>
  <h2>What we're deliberately not building</h2>
  <div class="split">
    <div class="out later"><h3>Later — not yet earned</h3><ul>${outRows(bp.later)}</ul></div>
    <div class="out never"><h3>Never — the fences</h3><ul>${outRows(bp.never.length ? bp.never : (bp.brief ? bp.brief.nonGoals.map(n => ({ name: n, notes: '' })) : []))}</ul></div>
  </div>
</section>

<footer>
  <span>Generated by bobby blueprint</span>
  <span>from .bobby/product/ + the board</span>
  ${bp.epicId ? `<span>Next: bobby run feature ${esc(bp.epicId)}</span>` : ''}
</footer>

</div>
</body></html>`;
}
