import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import {
  COLLECTIONS,
  CONFIG_FILES,
  DATA_FILES,
  FEEDS_JSON,
  SITE_MEDIA,
  collectionDir,
  configPath,
  isDocumentPath,
} from './admin/paths';
import { parseMarkdown } from './admin/serialize';

const IMAGE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

/** Repo-relative POSIX paths of the files under `dir`; [] when it doesn't exist. */
function walk(root: string, dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(path.join(root, dir), { recursive: true, encoding: 'utf8' });
  } catch {
    return [];
  }
  return names
    .map((n) => `${dir}/${n.split(path.sep).join('/')}`)
    .filter((p) => fs.statSync(path.join(root, p)).isFile());
}

/** The repo files Postgres mode stores, and the content files it can't (reported, never silently dropped). */
export function seedFiles(root: string): { documents: string[]; skipped: string[] } {
  const candidates = [
    ...CONFIG_FILES.map(configPath),
    FEEDS_JSON,
    ...DATA_FILES,
    ...COLLECTIONS.flatMap((name) => walk(root, collectionDir(name))),
  ].filter((p) => fs.existsSync(path.join(root, p)));
  return { documents: candidates.filter(isDocumentPath), skipped: candidates.filter((p) => !isDocumentPath(p)) };
}

export function mediaFiles(root: string, mediaFolder: string): string[] {
  return [...new Set([...walk(root, mediaFolder), ...walk(root, SITE_MEDIA.dir)])].filter((p) => IMAGE.test(p));
}

/** The repo file a reference inside `docPath` points at: a public/ URL, a public_folder URL, or a relative path. */
export function resolveReference(
  ref: string,
  docPath: string,
  publicFolder: string,
  mediaFolder: string,
): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) return null;
  if (ref.startsWith(`${publicFolder}/`)) return mediaFolder + ref.slice(publicFolder.length);
  if (ref.startsWith('/')) return `public${ref}`;
  if (ref.startsWith('./') || ref.startsWith('../')) return path.posix.join(path.posix.dirname(docPath), ref);
  return null;
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function references(docPath: string, content: string): string[] {
  try {
    if (docPath.endsWith('.yml')) return strings(parse(content));
    if (!/\.mdx?$/.test(docPath)) return [];
    const { data, body } = parseMarkdown(content);
    return [
      ...strings(data),
      ...[...body.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)].map((m) => m[1]),
      ...[...body.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]),
    ];
  } catch {
    return []; // unparsable documents are copied as they are
  }
}

/** Rewrites image references (YAML and front-matter string values, Markdown images, <img src>) to Blob URLs. */
export function rewriteReferences(
  docPath: string,
  content: string,
  urls: Map<string, string>,
  folders: { publicFolder: string; mediaFolder: string },
): string {
  let out = content;
  // Longest first, so a reference that contains a shorter one is replaced whole.
  for (const ref of [...new Set(references(docPath, content))].sort((a, b) => b.length - a.length)) {
    const target = resolveReference(ref, docPath, folders.publicFolder, folders.mediaFolder);
    const url = target ? urls.get(path.posix.normalize(target)) : undefined;
    if (url) {
      // Whole tokens only: not inside an external URL or a longer path that merely contains the reference.
      const token = new RegExp(`(?<![\\w./:-])${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w./-])`, 'g');
      out = out.replace(token, () => url);
    }
  }
  return out;
}

/** Where db:export writes a document, or null: the database never chooses where files go. */
export function exportTarget(dir: string, docPath: string): string | null {
  if (!isDocumentPath(docPath)) return null;
  const base = path.resolve(dir);
  const target = path.resolve(base, docPath);
  return target.startsWith(base + path.sep) ? target : null;
}
