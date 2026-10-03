import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { build, parsePost } from '../scripts/build.mjs';

const post = (title, date, draft = false, body = 'A **useful** idea.') => `---\ntitle: ${JSON.stringify(title)}\ndate: ${date}\nsummary: "A summary with <tags> & quotes."\ndraft: ${draft}\n---\n\n${body}\n`;

test('validates metadata and calendar dates with clear errors', () => {
  assert.throws(() => parsePost('No metadata', 'test.md'), /YAML/);
  assert.throws(() => parsePost(post('Title', '2026-02-30'), 'test.md'), /real date/);
  assert.throws(() => parsePost(post('Title', '2026-10-03', 'yes'), 'test.md'), /draft must/);
  assert.throws(() => parsePost(post('Title', '2026-10-03', false, ''), 'test.md'), /need a body/);
  assert.throws(() => parsePost(post('Title', '2026-10-03'), 'Bad Name.md'), /filename/);
  assert.equal(parsePost(post('Title', '2026-10-03').replaceAll('\n', '\r\n'), 'test.md').date, '2026-10-03');
});

test('publishes Markdown, sorts posts, escapes metadata, and removes withdrawn posts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nima-blog-test-'));
  try {
    for (const path of ['_templates', '_writing', 'content', 'index.html', 'research.html', 'resume.html']) {
      await cp(resolve(path), join(root, path), { recursive: true });
    }
    assert.equal(await build(root), 0);
    assert.match(await readFile(join(root, 'blog.html'), 'utf8'), /Nothing here just yet/);
    await writeFile(join(root, '_writing/older.md'), post('Older', '2025-01-01'));
    await writeFile(join(root, '_writing/newer.md'), post('Newer <ideas> & "notes"', '2026-10-03', false, '## An idea\n\nA **useful** note.\n\n```js\nconst value = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |'));
    await writeFile(join(root, '_writing/draft.md'), post('Draft', '2026-10-04', true));
    assert.equal(await build(root), 2);
    const index = await readFile(join(root, 'blog.html'), 'utf8');
    assert.ok(index.indexOf('newer.html') < index.indexOf('older.html'));
    assert.match(index, /Newer &lt;ideas&gt; &amp; &quot;notes&quot;/);
    assert.doesNotMatch(index, /draft.html|Nothing here just yet/);
    assert.deepEqual((await readdir(join(root, 'blog'))).sort(), ['newer.html', 'older.html']);
    const article = await readFile(join(root, 'blog/newer.html'), 'utf8');
    assert.match(article, /<strong>useful<\/strong>/);
    assert.match(article, /<table>/);
    assert.match(article, /<code class="language-js">/);
    assert.match(article, /href="..\/style.css"/);
    assert.match(article, /datetime="2026-10-03"/);
    // Hand-authored pages are preserved when generated posts are removed.
    await writeFile(join(root, 'blog/manual.html'), '<p>Keep me.</p>');
    await writeFile(join(root, '_writing/newer.md'), post('Now a draft', '2026-10-03', true));
    await rm(join(root, '_writing/older.md'));
    assert.equal(await build(root), 0);
    assert.deepEqual(await readdir(join(root, 'blog')), ['manual.html']);
    assert.match(await readFile(join(root, 'index.html'), 'utf8'), /currently pursuing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
