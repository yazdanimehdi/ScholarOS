import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

// Tiptap needs a DOM even without a mounted view.
const window = new Window();
window.document.write('<!DOCTYPE html><html><body></body></html>');
Object.defineProperty(window.document, 'compatMode', { value: 'CSS1Compat' });
Object.assign(globalThis, { window, document: window.document });
for (const key of ['navigator', 'Node', 'HTMLElement', 'Element', 'getComputedStyle', 'DOMParser', 'MutationObserver']) {
  (globalThis as Record<string, unknown>)[key] ??= (window as unknown as Record<string, unknown>)[key];
}

const { Editor } = await import('@tiptap/core');
const { editorExtensions } = await import('./extensions');

const editor = (markdown: string) => new Editor({ extensions: editorExtensions(), content: markdown, contentType: 'markdown' });
const roundTrip = (markdown: string) => editor(markdown).getMarkdown();
const tidy = (s: string) => s.replace(/\n{3,}/g, '\n\n').trim();

/** Written the way the editor writes it (tables padded), so the round trip is exact. */
const CANONICAL = [
  '## Heading',
  '',
  'Some **bold** and *italic* text with a [link](https://example.com) and `code`.',
  '',
  '- one',
  '- two',
  '',
  '1. first',
  '2. second',
  '',
  '> quoted',
  '',
  '```python',
  'print("hi")',
  '```',
  '',
  'Inline math $E = mc^2$ here.',
  '',
  '$$',
  '\\int_0^1 x\\,dx',
  '$$',
  '',
  '![alt text](/images/fig.png)',
  '',
  '| a   | b   |',
  '| --- | --- |',
  '| 1   | 2   |',
].join('\n');

test('headings, lists, code, inline and block math, images and tables survive a round trip', () => {
  assert.equal(tidy(roundTrip(CANONICAL)), tidy(CANONICAL));
});

test('the round trip is stable', () => {
  const once = roundTrip(CANONICAL);
  assert.equal(roundTrip(once), once);
});

test('dollar amounts stay text; real inline math is math', () => {
  assert.equal(roundTrip('Costs $500K and $1M per year.').trim(), 'Costs $500K and $1M per year.');
  assert.equal(roundTrip('Price is $5.').trim(), 'Price is $5.');
  assert.ok(!JSON.stringify(editor('Costs $500K and $1M per year.').getJSON()).includes('inlineMath'));
  assert.ok(JSON.stringify(editor('Inline $E = mc^2$ and $x$.').getJSON()).includes('"latex":"E = mc^2"'));
  assert.equal(roundTrip('Inline $E = mc^2$ and $x$.').trim(), 'Inline $E = mc^2$ and $x$.');
});
