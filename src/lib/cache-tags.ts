/** Every cached response carries it; purging it empties the whole cache. */
export const ALL = 'all';
/** Vercel keeps at most 128 tags per response. */
const MAX_TAGS = 128;

/**
 * The cache tags a stored file feeds: config/x.yml → cfg:x; src/content/<name>/<id>.md(x) → col:<name>, doc:<name>/<id>;
 * src/data/feeds.json → col:feeds; other src/data/<x>.json → data:<x>; images → none; anything else → all.
 * Reads (request context, data layer) and purges (PostgresStore) both use this, so they always agree.
 */
export function tagsForPath(path: string): string[] {
  let m: RegExpExecArray | null;
  if ((m = /^config\/([^/]+)\.yml$/.exec(path))) return [`cfg:${m[1]}`];
  if ((m = /^src\/content\/([^/]+)\/([^/]+)\.mdx?$/.exec(path))) return [`col:${m[1]}`, `doc:${m[1]}/${m[2]}`];
  if (path === 'src/data/feeds.json') return ['col:feeds'];
  if ((m = /^src\/data\/([^/]+)\.json$/.exec(path))) return [`data:${m[1]}`];
  if (/^https:\/\//.test(path) || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(path)) return [];
  return [ALL];
}

export function tagsForPaths(paths: string[]): string[] {
  return [...new Set(paths.flatMap(tagsForPath))];
}

export const isValidTag = (tag: string) => tag.length > 0 && Buffer.byteLength(tag) <= 256 && !tag.includes(',');

/** The Vercel-Cache-Tag value for a response: its tags plus `all`; too many or an invalid tag → just `all`. */
export function cacheTagHeader(tags: Iterable<string>): string {
  const list = [...new Set([...tags].filter((t) => t !== ALL))];
  if (list.length + 1 > MAX_TAGS || !list.every(isValidTag)) return ALL;
  return [...list, ALL].join(',');
}
