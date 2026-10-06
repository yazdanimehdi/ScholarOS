import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_UPLOAD, MediaError, prepareUpload, sniffImage } from './media';

const bytes = (...parts: (number | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p, 'latin1')] : [p])));
const PNG = bytes(0x89, 'PNG\r\n\x1a\n', 0, 0, 0, 13);
const isMediaError = (status: number) => (e: unknown) => e instanceof MediaError && e.status === status;

test('sniffImage recognizes each allowed type by its bytes, not its name', () => {
  assert.equal(sniffImage(PNG), 'png');
  assert.equal(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0)), 'jpg');
  assert.equal(sniffImage(bytes('GIF89a')), 'gif');
  assert.equal(sniffImage(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 ')), 'webp');
  assert.equal(sniffImage(bytes(0, 0, 0, 0x1c, 'ftypavif')), 'avif');
  assert.equal(sniffImage(bytes('<?xml version="1.0"?>\n<!-- c -->\n<svg xmlns="http://www.w3.org/2000/svg"/>')), 'svg');
  assert.equal(sniffImage(bytes('<html><svg></svg></html>')), null);
  assert.equal(sniffImage(bytes('%PDF-1.7')), null);
  assert.equal(sniffImage(new Uint8Array([0xc3, 0x28])), null, 'invalid UTF-8 is not an SVG');
});

test('prepareUpload: slug + content hash + sniffed extension', () => {
  const a = prepareUpload('My Figure (final).PNG', PNG);
  assert.match(a.filename, /^my-figure-final-[0-9a-f]{6}\.png$/);
  const b = prepareUpload('other.jpg', PNG);
  assert.equal(b.filename.slice(-10), a.filename.slice(-10), 'same bytes, same hash; the real type wins');
  assert.equal(Buffer.from(a.base64, 'base64').length, PNG.length);
  assert.match(prepareUpload('Été ü.png', PNG).filename, /^t-[0-9a-f]{6}\.png$|^image-[0-9a-f]{6}\.png$/);
});

test('prepareUpload rejects big, unknown and scripted files', () => {
  assert.throws(() => prepareUpload('big.png', new Uint8Array(MAX_UPLOAD + 1)), isMediaError(413));
  assert.throws(() => prepareUpload('notes.txt', bytes('hello')), isMediaError(415));
  const evil = [
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><a href="javascript:alert(1)">x</a></svg>',
    '<svg><foreignObject><div/></foreignObject></svg>',
    // Namespace-prefixed script and foreignObject
    '<svg xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>',
    '<svg xmlns:s="http://www.w3.org/2000/svg"><s:foreignObject><div/></s:foreignObject></svg>',
    // Event handler without space before 'on'
    '<svg/onload="alert(1)"></svg>',
    '<svg"onload="alert(1)"></svg>',
    "<svg'onload=\"alert(1)\"></svg>",
    // Entity-encoded javascript:
    '<svg><a href="&#106;avascript:alert(1)">x</a></svg>',
    '<svg><a href="jav&#x61;script:alert(1)">x</a></svg>',
    '<svg><a href="java&#9;script:alert(1)">x</a></svg>',
  ];
  for (const svg of evil) assert.throws(() => prepareUpload('x.svg', bytes(svg)), isMediaError(415), svg);
  // Clean SVG with harmless entity is accepted
  assert.match(prepareUpload('Logo.svg', bytes('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')).filename, /^logo-[0-9a-f]{6}\.svg$/);
  assert.match(prepareUpload('Safe.svg', bytes('<svg><text>A&#160;B</text></svg>')).filename, /^safe-[0-9a-f]{6}\.svg$/);
});

test('sniffImage handles ReDoS on many comments', () => {
  // A pathological case with many comments should complete quickly, not hang
  const start = Date.now();
  const result = sniffImage(bytes('<!--a-->'.repeat(50000) + 'X'));
  const elapsed = Date.now() - start;
  assert.equal(result, null);
  assert(elapsed < 200, `ReDoS: parsing took ${elapsed}ms, expected < 200ms`);
});

test('sniffImage still recognizes SVG with comment prefix', () => {
  assert.equal(sniffImage(bytes('<!-- comment --><svg xmlns="http://www.w3.org/2000/svg"/>')), 'svg');
  assert.equal(sniffImage(bytes('<!-- comment 1 --><!-- comment 2 --><svg/>')), 'svg');
});
