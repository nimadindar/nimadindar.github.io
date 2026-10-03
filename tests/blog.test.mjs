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
    for (const path of ['_templates', '_writing', 'content', 'images', 'index.html', 'research.html', 'resume.html', 'style.css']) {
      await cp(resolve(path), join(root, path), { recursive: true });
    }
    assert.equal(await build(root), 0);
    assert.match(await readFile(join(root, 'blog.html'), 'utf8'), /Nothing here just yet/);
    const photoVersion = html => html.match(/images\/profile\.jpg\?v=([a-f0-9]{12})/)[1];
    const originalPhotoVersion = photoVersion(await readFile(join(root, 'index.html'), 'utf8'));
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
    assert.match(article, /href="..\/style\.css\?v=[a-f0-9]{12}"/);
    assert.match(article, /datetime="2026-10-03"/);
    // Every page uses the same cache version; rebuilding alone leaves it stable.
    const version = html => html.match(/style\.css\?v=([a-f0-9]{12})/)[1];
    const originalVersion = version(article);
    await build(root);
    const renderedPages = ['index.html', 'research.html', 'resume.html', 'blog.html', 'blog/newer.html'];
    for (const file of renderedPages) {
      assert.equal(version(await readFile(join(root, file), 'utf8')), originalVersion);
    }
    assert.equal(photoVersion(await readFile(join(root, 'index.html'), 'utf8')), originalPhotoVersion);
    // Editing CSS updates the URLs on both existing pages and generated articles.
    await writeFile(join(root, 'style.css'), 'body { color: #123456; }');
    await build(root);
    const updatedVersion = version(await readFile(join(root, 'index.html'), 'utf8'));
    assert.notEqual(updatedVersion, originalVersion);
    for (const file of renderedPages) {
      const html = await readFile(join(root, file), 'utf8');
      assert.equal(version(html), updatedVersion);
      assert.equal((html.match(/style\.css\?v=/g) || []).length, 1);
    }
    // Replacing the photo changes only its version, independently of CSS changes.
    assert.equal(photoVersion(await readFile(join(root, 'index.html'), 'utf8')), originalPhotoVersion);
    await writeFile(join(root, 'images/profile.jpg'), 'replacement photo bytes');
    await build(root);
    const updatedHome = await readFile(join(root, 'index.html'), 'utf8');
    assert.notEqual(photoVersion(updatedHome), originalPhotoVersion);
    assert.equal(version(updatedHome), updatedVersion);
    assert.equal((updatedHome.match(/profile\.jpg\?v=/g) || []).length, 1);
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
