import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdown } from './admin/serialize';
import { renderMarkdownDocument } from './markdown';

/** Postgres mode renders entry bodies at request time; they must match what the static build produced. */
const cases = [
  ['posts', 'blog'],
  ['announcements', 'news'],
].flatMap(([dir, route]) =>
  fs
    .readdirSync(`src/content/${dir}`)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({
      file: `src/content/${dir}/${f}`,
      page: path.join('dist', route, f.replace(/\.md$/, ''), 'index.html'),
    })),
);

/** Whitespace, and the class/style attributes shiki and Astro's compressor may write differently. */
const normalize = (html: string) =>
  html
    .replace(/\s(class|style|tabindex|data-language)="[^"]*"/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();

for (const c of cases) {
  test(
    `renderMarkdownDocument matches the build: ${c.file}`,
    { skip: !fs.existsSync(c.page) && 'no static build of this page' },
    async () => {
      const { html } = await renderMarkdownDocument(parseMarkdown(fs.readFileSync(c.file, 'utf8')).body);
      assert.ok(normalize(fs.readFileSync(c.page, 'utf8')).includes(normalize(html)), `${c.file} renders differently`);
    },
  );
}
