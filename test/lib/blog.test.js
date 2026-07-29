// test/lib/blog.test.js
// Covers the static blog generator shipped by the `blog` starter. It runs in
// the scaffolded project, not here, so these tests exercise it directly from
// the template directory.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildSite, markdown, parseFrontmatter, readPosts } from '../../templates/starters/blog/build.js';

function fixture(posts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-blog-'));
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

describe('blog generator', () => {
  let tmpDir;
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  test('parses frontmatter values, booleans, and inline lists', () => {
    const { data, body } = parseFrontmatter('---\ntitle: Hi\ndraft: true\ntags: [a, b]\n---\nBody\n');
    expect(data).toMatchObject({ title: 'Hi', draft: true, tags: ['a', 'b'] });
    expect(body.trim()).toBe('Body');
  });

  test('renders the markdown blocks a post uses', () => {
    const html = markdown('# T\n\nA **bold** claim.\n\n- one\n- two\n\n> quoted\n\n```js\nconst x = 1;\n```\n');
    expect(html).toContain('<h1>T</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<pre><code class="language-js">const x = 1;</code></pre>');
  });

  test('escapes HTML in post bodies', () => {
    const html = markdown('<img src=x onerror=alert(1)>\n');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  test('drops javascript: and data: link targets', () => {
    expect(markdown('[x](javascript:alert(1))')).toContain('href="#"');
    expect(markdown('[x](data:text/html,hi)')).toContain('href="#"');
    expect(markdown('[x](/posts/ok.html)')).toContain('href="/posts/ok.html"');
    expect(markdown('[x](https://example.com)')).toContain('href="https://example.com"');
  });

  test('code spans survive inline formatting intact', () => {
    // The placeholder mechanism must not mangle bare numbers in prose.
    const html = markdown('Use `a_b_c` in 2026 and 42 items.');
    expect(html).toContain('<code>a_b_c</code>');
    expect(html).toContain('in 2026 and 42 items');
  });

  test('sorts newest first and hides drafts unless asked', () => {
    tmpDir = fixture({
      'old.md': '---\ntitle: Old\ndate: 2020-01-01\n---\nOld\n',
      'new.md': '---\ntitle: New\ndate: 2026-01-01\n---\nNew\n',
      'wip.md': '---\ntitle: WIP\ndate: 2026-06-01\ndraft: true\n---\nWIP\n',
    });
    const postsDir = path.join(tmpDir, 'posts');
    expect(readPosts(postsDir).map((p) => p.title)).toEqual(['New', 'Old']);
    expect(readPosts(postsDir, { drafts: true })).toHaveLength(3);
  });

  test('strips the date prefix from filenames for clean URLs', () => {
    tmpDir = fixture({ '2026-05-04-hello.md': '---\ntitle: Hello\n---\nHi\n' });
    const [post] = readPosts(path.join(tmpDir, 'posts'));
    expect(post.slug).toBe('hello');
    expect(post.date).toBe('2026-05-04');
  });

  test('builds an index, a page per post, and an RSS feed', () => {
    tmpDir = fixture({ '2026-05-04-first.md': '---\ntitle: First Post\n---\nHello there.\n' });
    const { posts } = buildSite(tmpDir);
    expect(posts).toHaveLength(1);

    const read = (...p) => fs.readFileSync(path.join(tmpDir, 'public', ...p), 'utf8');
    expect(read('index.html')).toContain('/posts/first.html');
    expect(read('posts', 'first.html')).toContain('<h1>First Post</h1>');
    expect(read('posts', 'first.html')).toContain('May 4, 2026');
    expect(read('feed.xml')).toContain('https://example.com/posts/first.html');
  });

  test('rebuild removes pages for deleted posts but keeps hand-written assets', () => {
    tmpDir = fixture({ 'gone.md': '---\ntitle: Gone\ndate: 2026-01-01\n---\nBye\n' });
    fs.writeFileSync(path.join(tmpDir, 'public', 'style.css'), 'body{}');
    buildSite(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'public', 'posts', 'gone.html'))).toBe(true);

    fs.rmSync(path.join(tmpDir, 'posts', 'gone.md'));
    buildSite(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'public', 'posts', 'gone.html'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'public', 'style.css'))).toBe(true);
  });

  test('an empty posts dir still builds a usable site', () => {
    tmpDir = fixture({});
    const { posts } = buildSite(tmpDir);
    expect(posts).toHaveLength(0);
    const index = fs.readFileSync(path.join(tmpDir, 'public', 'index.html'), 'utf8');
    expect(index).toContain('No posts yet');
    expect(fs.existsSync(path.join(tmpDir, 'public', 'feed.xml'))).toBe(true);
  });
});
