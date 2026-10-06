import { parse } from 'yaml';
import { adminCollections, configSchemas } from '../schemas';
import { HttpError } from './http';
import { collectionDir, collectionPath, configPath, type CollectionName, type ConfigFile } from './paths';
import { parseMarkdown, serializeMarkdown, updateYaml } from './serialize';
import type { Change, ContentStore } from './store';

export interface EntrySummary {
  slug: string;
  data: Record<string, unknown>;
  version: string;
  /** .mdx entries: listed and readable, never written. */
  readonly?: boolean;
}

export interface Entry {
  data: Record<string, unknown>;
  body: string;
  version: string;
  readonly: boolean;
}

const slugOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.mdx?$/, '');

export async function listEntries(store: ContentStore, name: CollectionName): Promise<EntrySummary[]> {
  const files = (await store.list(collectionDir(name))).filter((f) => /\.mdx?$/.test(f.path));
  // ponytail: one read per entry (N GitHub requests); batch through GraphQL if long lists get slow.
  return Promise.all(
    files.map(async (f) => {
      const file = await store.read(f.path);
      return {
        slug: slugOf(f.path),
        data: file ? parseMarkdown(file.content).data : {},
        version: f.version,
        ...(f.path.endsWith('.mdx') ? { readonly: true } : {}),
      };
    }),
  );
}

export async function readEntry(store: ContentStore, name: CollectionName, slug: string): Promise<Entry | null> {
  for (const ext of ['md', 'mdx'] as const) {
    const file = await store.read(collectionPath(name, slug, ext));
    if (file) return { ...parseMarkdown(file.content), version: file.version, readonly: ext === 'mdx' };
  }
  return null;
}

/** Fields the form left empty are dropped: every schema treats absent and '' alike. */
function withoutEmpty(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

/** Validates front matter with the collection's schema; writes the raw values in schema key order. */
export function entryChange(name: CollectionName, slug: string, data: unknown, body: unknown): Change {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, '`data` must be an object');
  const schema = adminCollections[name];
  const fields = withoutEmpty(data as Record<string, unknown>);
  schema.parse(fields);
  return {
    path: collectionPath(name, slug),
    content: serializeMarkdown(fields, typeof body === 'string' ? body : '', Object.keys(schema.shape)),
  };
}

export async function readConfig(
  store: ContentStore,
  file: ConfigFile,
): Promise<{ data: Record<string, unknown>; version: string | null; source: string }> {
  const found = await store.read(configPath(file));
  let data: unknown;
  try {
    data = found ? parse(found.content) : null;
  } catch (e) {
    // yaml's message is "<problem> at line L, column C:" plus a code frame; the first line is enough.
    const message = (e as Error).message.split('\n')[0].replace(/:$/, '');
    throw new HttpError(500, `${configPath(file)} is not valid YAML: ${message}. Fix it in the repository.`);
  }
  return {
    data: (data ?? {}) as Record<string, unknown>,
    version: found?.version ?? null,
    source: found?.content ?? '',
  };
}

/** Validates a whole config object and rewrites the file around it (comments and order kept). */
export function configChange(file: ConfigFile, source: string, data: unknown): Change {
  configSchemas[file].parse(data);
  return { path: configPath(file), content: updateYaml(source, data) };
}
