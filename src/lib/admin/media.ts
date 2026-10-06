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

/** Root element is <svg>, after an optional BOM, XML declaration, comments and doctype. */
const SVG_ROOT = /^﻿?\s*(<\?xml[\s\S]*?\?>\s*)?((<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s>/]/i;
const SVG_DANGER: [RegExp, string][] = [
  [/<script/i, 'scripts'],
  [/\son[a-z]+\s*=/i, 'event handler attributes'],
  [/javascript:/i, 'javascript: URLs'],
  [/<foreignObject/i, '<foreignObject>'],
];

function svgText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return SVG_ROOT.test(text) ? text : null;
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
    const danger = SVG_DANGER.find(([re]) => re.test(svgText(bytes)!));
    if (danger) throw new MediaError(`SVG files with ${danger[1]} are not allowed`, 415);
  }
  const base =
    slugify(name.replace(/\.[^.]*$/, ''))
      .slice(0, 60)
      .replace(/-+$/, '') || 'image';
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 6);
  return { filename: `${base}-${hash}.${ext}`, base64: Buffer.from(bytes).toString('base64') };
}
