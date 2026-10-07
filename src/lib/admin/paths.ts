import { adminSettings } from './settings';

export const COLLECTIONS = [
  'posts',
  'publications',
  'announcements',
  'people',
  'projects',
  'talks',
  'positions',
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];
export const CONFIG_FILES = ['site', 'research', 'feeds', 'cv', 'cv-upload'] as const;
export type ConfigFile = (typeof CONFIG_FILES)[number];
export const FEEDS_JSON = 'src/data/feeds.json';
/** Last backup cron result (Postgres mode): admin-only, never rendered. */
export const BACKUP_JSON = 'src/data/backup.json';
/** Images referenced by plain URLs (config files, Markdown bodies): served from public/. */
export const SITE_MEDIA = { dir: 'public/images', url: '/images' };

/** A path or name outside the allowlist; the API answers 400. */
export class PathError extends Error {}

const SLUG = /^[a-z0-9-]{1,80}$/;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const IMAGE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

export function assertSlug(slug: unknown): string {
  if (typeof slug !== 'string' || !SLUG.test(slug)) {
    throw new PathError('A slug is 1–80 lowercase letters, digits or dashes');
  }
  return slug;
}

export function assertCollection(name: unknown): CollectionName {
  if (!COLLECTIONS.includes(name as CollectionName)) throw new PathError(`Unknown collection "${String(name)}"`);
  return name as CollectionName;
}

export function assertConfigFile(file: unknown): ConfigFile {
  if (!CONFIG_FILES.includes(file as ConfigFile)) throw new PathError(`Unknown config file "${String(file)}"`);
  return file as ConfigFile;
}

export const collectionDir = (name: CollectionName) => `src/content/${name}`;
export const collectionPath = (name: CollectionName, slug: string, ext: 'md' | 'mdx' = 'md') =>
  `${collectionDir(name)}/${assertSlug(slug)}.${ext}`;
export const configPath = (file: ConfigFile) => `config/${file}.yml`;

/** An image file inside `dir` whose every segment is a plain name (no dot-files, so no `..`). */
function isImageUnder(path: string, dir: string): boolean {
  return (
    path.startsWith(`${dir}/`) &&
    IMAGE.test(path) &&
    path
      .slice(dir.length + 1)
      .split('/')
      .every((segment) => SEGMENT.test(segment))
  );
}

export function isMediaPath(path: string): boolean {
  return isImageUnder(path, adminSettings().mediaFolder) || isImageUnder(path, SITE_MEDIA.dir);
}

export function assertMediaPath(path: unknown): string {
  if (typeof path !== 'string' || !isMediaPath(path)) throw new PathError('Not a media file path');
  return path;
}

/** The write allowlist: every path the admin may commit. */
export function assertAllowed(path: string): void {
  if (
    CONFIG_FILES.some((file) => path === configPath(file)) ||
    path === FEEDS_JSON ||
    path === BACKUP_JSON ||
    isMediaPath(path)
  )
    return;
  const entry = /^src\/content\/([^/]+)\/([^/]+)\.md$/.exec(path);
  if (entry && COLLECTIONS.includes(entry[1] as CollectionName) && SLUG.test(entry[2])) return;
  throw new PathError(`Path not allowed: ${path}`);
}
