// build.js — a tiny, dependency-free static blog generator.
//
// Reads  posts/*.md   (frontmatter + markdown)
// Writes public/      (index.html, posts/<slug>.html, feed.xml)
//
// No dependencies, no framework, no build toolchain. `node build.js` and the
// site is on disk — open it, commit it, or serve it from anywhere static.
//
//   node build.js            # build (drafts skipped)
//   node build.js --drafts   # build, including posts with `draft: true`
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG = {
  title: 'Blog',
  description: '',
  url: '',
  author: '',
};

// ---------------------------------------------------------------- escaping --

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Only http(s), protocol-relative, root/relative and anchor URLs survive. Keeps
// `javascript:` and `data:` links out of generated pages.
function safeUrl(url) {
  const u = String(url).trim();
  if (/^(https?:)?\/\//i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^https?:/i.test(u)) return '#';
  return u;
}

// ------------------------------------------------------------ frontmatter --

/**
 * Parse `---`-delimited frontmatter. Supports `key: value`, quoted values,
 * booleans, and inline lists (`tags: [a, b]`) — the subset a blog post needs.
 */
export function parseFrontmatter(raw) {
  const text = String(raw).replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: text };

  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (/^\[.*\]$/.test(value)) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }
    value = value.replace(/^["']|["']$/g, '');
    if (value === 'true' || value === 'false') data[key] = value === 'true';
    else data[key] = value;
  }
  return { data, body: text.slice(m[0].length) };
}

// ---------------------------------------------------------------- markdown --

// Inline spans: code, images, links, bold, italic, strikethrough.
function inline(text) {
  const codes = [];
  let s = escapeHtml(text);

  // Pull code spans out first so their contents dodge every other rule.
  s = s.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  s = s.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_, alt, src, title) =>
      `<img src="${safeUrl(src)}" alt="${alt}"${title ? ` title="${title}"` : ''} />`
  );
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_, label, href, title) =>
      `<a href="${safeUrl(href)}"${title ? ` title="${title}"` : ''}>${label}</a>`
  );

  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w`])_([^_\n]+)_(?![\w])/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[Number(n)]}</code>`);
}

const BLOCK_START = /^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+[.)]\s)/;
const HR = /^(-{3,}|\*{3,}|_{3,})\s*$/;

/**
 * Render the markdown subset a blog actually uses: headings, paragraphs, lists,
 * blockquotes, fenced code, horizontal rules, and inline formatting.
 */
export function markdown(src) {
  const lines = String(src).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i += 1; // closing fence
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      out.push(`<pre><code${cls}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (HR.test(line)) { out.push('<hr />'); i += 1; continue; }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>\n${markdown(buf.join('\n'))}\n</blockquote>`);
      continue;
    }

    const ordered = /^\s*\d+[.)]\s+/.test(line);
    if (ordered || /^\s*[-*+]\s+/.test(line)) {
      const marker = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
      const items = [];
      while (i < lines.length && marker.test(lines[i])) {
        let item = lines[i++].replace(marker, '');
        // Wrapped lines belong to the item they follow.
        while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i]) && !HR.test(lines[i])) {
          item += ` ${lines[i++].trim()}`;
        }
        items.push(`<li>${inline(item.trim())}</li>`);
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>\n${items.join('\n')}\n</${tag}>`);
      continue;
    }

    const buf = [];
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i]) && !HR.test(lines[i])) {
      buf.push(lines[i++].trim());
    }
    out.push(`<p>${inline(buf.join('\n'))}</p>`);
  }

  return out.join('\n');
}

// ------------------------------------------------------------------ posts --

// `2026-07-26-hello-world.md` -> slug `hello-world`, date `2026-07-26`.
function fromFilename(file) {
  const base = path.basename(file, '.md');
  const dated = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  return dated ? { slug: dated[2], date: dated[1] } : { slug: base, date: '' };
}

// First paragraph of the body, trimmed to a card-sized blurb.
function autoSummary(body) {
  const para = body.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#') && !p.startsWith('```'));
  if (!para) return '';
  const text = para.replace(/[*_`>]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\n/g, ' ');
  return text.length > 200 ? `${text.slice(0, 197).trimEnd()}…` : text;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Dates are formatted from their own string — no timezone shifting a post a day.
function displayDate(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

function rfc822(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toUTCString();
}

/** Read every post in `postsDir`, newest first. */
export function readPosts(postsDir, { drafts = false } = {}) {
  if (!fs.existsSync(postsDir)) return [];
  return fs
    .readdirSync(postsDir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const { data, body } = parseFrontmatter(fs.readFileSync(path.join(postsDir, file), 'utf8'));
      const named = fromFilename(file);
      return {
        file,
        slug: data.slug || named.slug,
        date: data.date || named.date,
        title: data.title || named.slug.replace(/-/g, ' '),
        summary: data.summary || autoSummary(body),
        tags: Array.isArray(data.tags) ? data.tags : [],
        draft: data.draft === true,
        body,
      };
    })
    .filter((p) => drafts || !p.draft)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
}

// ------------------------------------------------------------------ pages --

function layout(config, { title, description, canonical, body }) {
  const pageTitle = title === config.title ? title : `${title} · ${config.title}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(description || config.description)}" />
${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />\n` : ''}<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)}" href="/feed.xml" />
<link rel="stylesheet" href="/style.css" />
</head>
<body>
<header class="site">
  <a class="site-title" href="/">${escapeHtml(config.title)}</a>
  ${config.description ? `<p class="site-desc">${escapeHtml(config.description)}</p>` : ''}
</header>
<main>
${body}
</main>
<footer class="site">
  <p>${config.author ? `${escapeHtml(config.author)} · ` : ''}<a href="/feed.xml">RSS</a></p>
</footer>
</body>
</html>
`;
}

function renderIndex(config, posts) {
  const items = posts.length
    ? posts
        .map(
          (p) => `  <li class="post-item">
    <a class="post-link" href="/posts/${escapeHtml(p.slug)}.html">${escapeHtml(p.title)}</a>
    ${p.date ? `<time datetime="${escapeHtml(p.date)}">${escapeHtml(displayDate(p.date))}</time>` : ''}
    ${p.summary ? `<p class="post-summary">${escapeHtml(p.summary)}</p>` : ''}
  </li>`
        )
        .join('\n')
    : '  <li class="post-item empty"><p>No posts yet. Add a markdown file to <code>posts/</code> and run <code>npm run build</code>.</p></li>';

  return layout(config, {
    title: config.title,
    description: config.description,
    canonical: config.url ? `${config.url.replace(/\/$/, '')}/` : '',
    body: `<ul class="post-list">\n${items}\n</ul>`,
  });
}

function renderPost(config, post) {
  const base = config.url ? config.url.replace(/\/$/, '') : '';
  const tags = post.tags.length
    ? `<p class="tags">${post.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')}</p>`
    : '';
  return layout(config, {
    title: post.title,
    description: post.summary,
    canonical: base ? `${base}/posts/${post.slug}.html` : '',
    body: `<article class="post">
<h1>${escapeHtml(post.title)}</h1>
${post.date ? `<p class="meta"><time datetime="${escapeHtml(post.date)}">${escapeHtml(displayDate(post.date))}</time></p>` : ''}
${markdown(post.body)}
${tags}
</article>
<p class="back"><a href="/">← All posts</a></p>`,
  });
}

function renderFeed(config, posts) {
  const base = config.url ? config.url.replace(/\/$/, '') : '';
  const items = posts
    .map((p) => {
      const link = `${base}/posts/${p.slug}.html`;
      return `  <item>
    <title>${escapeHtml(p.title)}</title>
    <link>${escapeHtml(link)}</link>
    <guid isPermaLink="true">${escapeHtml(link)}</guid>
    ${p.date ? `<pubDate>${rfc822(p.date)}</pubDate>` : ''}
    <description>${escapeHtml(p.summary)}</description>
  </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeHtml(config.title)}</title>
  <link>${escapeHtml(base || '/')}</link>
  <description>${escapeHtml(config.description)}</description>
${items}
</channel>
</rss>
`;
}

// ------------------------------------------------------------------ build --

export function readConfig(root = ROOT) {
  const file = path.join(root, 'blog.config.json');
  if (!fs.existsSync(file)) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    throw new Error(`blog.config.json is not valid JSON: ${e.message}`);
  }
}

/**
 * Build the whole site. Returns { posts, outDir } so callers (and tests) can
 * assert on what was written.
 */
export function buildSite(root = ROOT, { drafts = false } = {}) {
  const config = readConfig(root);
  const posts = readPosts(path.join(root, 'posts'), { drafts });
  const outDir = path.join(root, 'public');
  const postsOut = path.join(outDir, 'posts');

  // Generated pages only — hand-written assets in public/ (style.css, images)
  // are left alone.
  fs.rmSync(postsOut, { recursive: true, force: true });
  fs.mkdirSync(postsOut, { recursive: true });

  for (const post of posts) {
    fs.writeFileSync(path.join(postsOut, `${post.slug}.html`), renderPost(config, post), 'utf8');
  }
  fs.writeFileSync(path.join(outDir, 'index.html'), renderIndex(config, posts), 'utf8');
  fs.writeFileSync(path.join(outDir, 'feed.xml'), renderFeed(config, posts), 'utf8');

  return { posts, outDir, config };
}

if (process.argv[1] && path.basename(process.argv[1]) === 'build.js') {
  const drafts = process.argv.includes('--drafts');
  const { posts, outDir } = buildSite(ROOT, { drafts });
  const label = posts.length === 1 ? 'post' : 'posts';
  console.log(`Built ${posts.length} ${label}${drafts ? ' (including drafts)' : ''} → ${path.relative(process.cwd(), outDir) || 'public'}/`);
}
