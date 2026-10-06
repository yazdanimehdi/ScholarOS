import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown';

test('renderMarkdown: renders Markdown paragraphs to HTML', async () => {
  const html = await renderMarkdown('I study **NLP**.\n\nSecond paragraph.');
  assert.match(html, /<p>I study <strong>NLP<\/strong>\.<\/p>/);
  assert.match(html, /<p>Second paragraph\.<\/p>/);
});

test('renderMarkdown: empty input renders nothing', async () => {
  assert.equal(await renderMarkdown(undefined), '');
  assert.equal(await renderMarkdown('  \n'), '');
});
