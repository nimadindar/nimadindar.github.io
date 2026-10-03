import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('Usage: npm run new-post -- "My post title"');
  process.exitCode = 1;
} else {
  const date = new Date().toISOString().slice(0, 10);
  const slug = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'post';
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../_writing');
  const filename = `${date}-${slug}.md`;
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(resolve(directory, filename), `---\n${stringify({ title, date, summary: 'A short description of this post.', draft: true })}---\n\nWrite your post here.\n\n## A first section\n\nContinue with Markdown: links, images, lists, and code blocks all work.\n`, { flag: 'wx' });
    console.log(`Created _writing/${filename}\nEdit the file, set draft: false when ready, then run npm run build.`);
  } catch (error) {
    console.error(error.code === 'EEXIST' ? `A post already exists at _writing/${filename}; choose a different title.` : error.message);
    process.exitCode = 1;
  }
}
