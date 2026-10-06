import { createHash } from 'node:crypto';
import { slugify } from '../utils';

export const MAX_UPLOAD = 4 * 1024 * 1024;

export class MediaError extends Error {
  constructor(
    message: string,
    readonly status: 413 | 415,
  ) {
    super(message);
  }
}

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

const SIGNATURES: [ext: string, test: (b: Uint8Array) => boolean][] = [
  ['png', (b) => b[0] === 0x89 && ascii(b, 1, 4) === 'PNG'],
  ['jpg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['gif', (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a'],
  ['webp', (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP'],
  ['avif', (b) => ascii(b, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(b, 8, 12))],
];

/**
 * True when some `<!DOCTYPE` reaches a `[` outside quoted strings before its `>`: an internal subset.
 * Every `<!DOCTYPE` starts a scan, but scans in the same state (outside, in "…", in '…') behave alike from
 * then on, so one forward pass tracks at most three of them: linear time on any input.
 */
function hasInternalSubset(text: string): boolean {
  let outside = false;
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '<' && text.slice(i, i + 9).toUpperCase() === '<!DOCTYPE') {
      outside = true;
      i += 8; // none of the token's characters change a scan's state
    } else if (c === '[') {
      if (outside) return true;
    } else if (c === '>') outside = false;
    else if (c === '"') [outside, inDouble] = [inDouble, outside];
    else if (c === "'") [outside, inSingle] = [inSingle, outside];
  }
  return false;
}

const SVG_DANGER: [{ test(text: string): boolean }, string][] = [
  // Internal DTD entities expand into markup (e.g. a <script>) that the checks below never see.
  [/<!ENTITY/i, 'DTD entities'],
  [{ test: hasInternalSubset }, 'DTD entities'],
  [/<([\w.-]+:)?script/i, 'scripts'],
  [/[\s"'/]on[a-z]+\s*=/i, 'event handler attributes'],
  [/javascript:/i, 'javascript: URLs'],
  [/<([\w.-]+:)?foreignObject/i, '<foreignObject>'],
];

/** Decode numeric character references (&#123; or &#x1a;) and control characters. */
function decodeCharRefs(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Check if svg contains any javascript: URLs, accounting for entity encoding and embedded whitespace. */
function hasJavaScriptUrl(text: string): boolean {
  const decoded = decodeCharRefs(text);
  // eslint-disable-next-line no-control-regex -- control characters are stripped on purpose
  return /javascript\s*:/i.test(decoded.replace(/[\x00-\x20]/g, ''));
}

/** Index of the first `[` or `>` at or after `from`, skipping quoted strings; -1 when there is none. */
function doctypeStop(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i = text.indexOf(c, i + 1);
      if (i === -1) return -1;
    } else if (c === '[' || c === '>') return i;
  }
  return -1;
}

/** Check if text is a valid SVG root element. Linear-time parse to avoid ReDoS. */
function isSvgRoot(text: string): boolean {
  let i = 0;
  // Skip BOM
  if (text.charCodeAt(i) === 0xfeff) i++;
  // Skip whitespace
  while (i < text.length && /\s/.test(text[i])) i++;
  // Skip XML declaration
  if (text.substr(i, 5) === '<?xml') {
    i = text.indexOf('?>', i);
    if (i === -1) return false;
    i += 2;
    while (i < text.length && /\s/.test(text[i])) i++;
  }
  // Skip comments and DOCTYPE in a linear loop
  while (i < text.length) {
    if (text.substr(i, 4) === '<!--') {
      i = text.indexOf('-->', i + 4);
      if (i === -1) return false;
      i += 3;
    } else if (text.substr(i, 9).toUpperCase() === '<!DOCTYPE') {
      const stop = doctypeStop(text, i + 9);
      if (stop === -1) return false;
      // An internal subset `[ … ]` can hold `>`; skip to its closing `]>`.
      i = text[stop] === '[' ? text.indexOf(']>', stop) + 1 : stop;
      if (i <= 0) return false;
      i++;
    } else {
      break;
    }
    while (i < text.length && /\s/.test(text[i])) i++;
  }
  // Check if the next thing is <svg
  return text.substr(i, 4).toLowerCase() === '<svg' && /[\s>/]/.test(text[i + 4] || '');
}

function svgText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return isSvgRoot(text) ? text : null;
  } catch {
    return null;
  }
}

/** The file's real type from its bytes, or null. */
export function sniffImage(bytes: Uint8Array): string | null {
  const hit = SIGNATURES.find(([, test]) => test(bytes));
  if (hit) return hit[0];
  return svgText(bytes) ? 'svg' : null;
}

/** Validates an upload and names it `<slug>-<6 hex of sha256>.<ext>`. Throws MediaError (413 / 415). */
export function prepareUpload(name: string, bytes: Uint8Array): { filename: string; base64: string } {
  if (bytes.length > MAX_UPLOAD) throw new MediaError('Files must be 4 MB or smaller', 413);
  const ext = sniffImage(bytes);
  if (!ext) throw new MediaError('Only PNG, JPEG, WebP, GIF, AVIF and SVG images can be uploaded', 415);
  if (ext === 'svg') {
    const text = svgText(bytes)!;
    const danger = SVG_DANGER.find(([re]) => re.test(text));
    if (danger || hasJavaScriptUrl(text)) {
      throw new MediaError(`SVG files with ${danger?.[1] || 'javascript: URLs'} are not allowed`, 415);
    }
  }
  const base =
    slugify(name.replace(/\.[^.]*$/, ''))
      .slice(0, 60)
      .replace(/-+$/, '') || 'image';
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 6);
  return { filename: `${base}-${hash}.${ext}`, base64: Buffer.from(bytes).toString('base64') };
}
