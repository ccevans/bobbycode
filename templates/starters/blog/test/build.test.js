import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildSite, markdown, parseFrontmatter, readPosts } from '../build.js';

function fixture(posts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-'));
  fs.mkdirSync(path.join(dir, 'posts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'blog.config.json'),
    JSON.stringify({ title: 'Test Blog', description: 'testing', url: 'https://example.com' })
  );
  for (const [name, body] of Object.entries(posts)) {
    fs.writeFileSync(path.join(dir, 'posts', name), body);
  }
  return dir;
}

test('frontmatter parses strings, booleans, and lists', () => {
  const { data, body } = parseFrontmatter('---\ntitle: Hi\ndraft: true\ntags: [a, b]\n---\nBody text\n');
  assert.strictEqual(data.title, 'Hi');
  assert.strictEqual(data.draft, true);
  assert.deepStrictEqual(data.tags, ['a', 'b']);
  assert.strictEqual(body.trim(), 'Body text');
});

test('markdown renders the blocks a post uses', () => {
  const html = markdown('# Title\n\nSome **bold** text.\n\n- one\n- two\n\n```js\nconst x = 1;\n```\n');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<ul>[\s\S]*<li>one<\/li>/);
  assert.match(html, /<pre><code class="language-js">const x = 1;<\/code><\/pre>/);
});

test('markdown escapes HTML and blocks javascript: links', () => {
  const html = markdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="#"/);
});

test('posts sort newest first and drafts are excluded by default', () => {
  const dir = fixture({
    'old.md': '---\ntitle: Old\ndate: 2020-01-01\n---\nOld post\n',
    'new.md': '---\ntitle: New\ndate: 2026-01-01\n---\nNew post\n',
    'wip.md': '---\ntitle: WIP\ndate: 2026-06-01\ndraft: true\n---\nNot ready\n',
  });
  assert.deepStrictEqual(readPosts(path.join(dir, 'posts')).map((p) => p.title), ['New', 'Old']);
  assert.strictEqual(readPosts(path.join(dir, 'posts'), { drafts: true }).length, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('build writes an index, a page per post, and a feed', () => {
  const dir = fixture({
    '2026-05-04-first.md': '---\ntitle: First Post\n---\nHello there.\n',
  });
  const { posts } = buildSite(dir);

  assert.strictEqual(posts.length, 1);
  const index = fs.readFileSync(path.join(dir, 'public', 'index.html'), 'utf8');
  assert.match(index, /First Post/);
  assert.match(index, /\/posts\/first\.html/);

  const post = fs.readFileSync(path.join(dir, 'public', 'posts', 'first.html'), 'utf8');
  assert.match(post, /<h1>First Post<\/h1>/);
  assert.match(post, /May 4, 2026/);
  assert.match(post, /Hello there\./);

  const feed = fs.readFileSync(path.join(dir, 'public', 'feed.xml'), 'utf8');
  assert.match(feed, /<rss version="2\.0">/);
  assert.match(feed, /https:\/\/example\.com\/posts\/first\.html/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('rebuilding removes pages for deleted posts', () => {
  const dir = fixture({ 'gone.md': '---\ntitle: Gone\ndate: 2026-01-01\n---\nBye\n' });
  buildSite(dir);
  assert.ok(fs.existsSync(path.join(dir, 'public', 'posts', 'gone.html')));

  fs.rmSync(path.join(dir, 'posts', 'gone.md'));
  buildSite(dir);
  assert.ok(!fs.existsSync(path.join(dir, 'public', 'posts', 'gone.html')));

  fs.rmSync(dir, { recursive: true, force: true });
});
