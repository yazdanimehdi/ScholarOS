import type { MarkdownHeading } from '@astrojs/markdown-remark';
import type { CollectionEntry, CollectionKey } from 'astro:content';
import { getSql } from '../db';
import { renderMarkdownDocument } from '../markdown';
import { getMode } from '../mode';
import { isPublished } from '../utils';
import { memo, readSiteFile, requestContext } from './context';
import { parseDocuments, type DocumentCollection, type DocumentEntry } from './documents';

const FEEDS_JSON = 'src/data/feeds.json';

/** A query while rendering: a failure marks the request so the middleware answers 503, not a cached error page. */
async function query<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    requestContext().dbFailed = true;
    throw e;
  }
}

async function loadCollection(name: DocumentCollection): Promise<DocumentEntry[]> {
  if (name === 'feeds') {
    const content = readSiteFile(FEEDS_JSON); // in the request snapshot already
    return content === null ? [] : parseDocuments('feeds', [{ path: FEEDS_JSON, content }]);
  }
  const rows = await query(
    () =>
      getSql()<{ path: string; content: string }>`
        select path, content from documents where starts_with(path, ${`src/content/${name}/`}) order by path`,
  );
  return parseDocuments(name, rows);
}

// ponytail: in Postgres mode image fields are URL strings typed as ImageMetadata; resolveImage and <Image> take both.
const asEntries = <C extends CollectionKey>(entries: DocumentEntry[]) => entries as unknown as CollectionEntry<C>[];

/** Posts are public once published (not a draft, date reached); other collections pass through. */
function onlyPublished<T>(name: string, entries: T[]): T[] {
  return name === 'posts'
    ? entries.filter((e) => isPublished(e as unknown as Parameters<typeof isPublished>[0]))
    : entries;
}

/** Every entry of a collection, shaped like getCollection's. Postgres mode: from the database, tagged col:<name>. */
export async function getEntries<C extends CollectionKey>(name: C): Promise<CollectionEntry<C>[]> {
  if (getMode() !== 'postgres') return onlyPublished(name, await (await import('astro:content')).getCollection(name));
  requestContext().tags.add(`col:${name}`);
  // A copy: callers sort in place, and the memo is shared by the whole request.
  return onlyPublished(name, [
    ...asEntries<C>(await memo(`col:${name}`, () => loadCollection(name as DocumentCollection))),
  ]);
}

/** One entry, or undefined. Postgres mode: tagged doc:<name>/<id>, so edits to other entries don't purge it. */
export async function getEntry<C extends CollectionKey>(name: C, id: string): Promise<CollectionEntry<C> | undefined> {
  if (getMode() !== 'postgres') {
    const { getEntry: astroGetEntry } = await import('astro:content');
    const entry = await (astroGetEntry as (c: string, i: string) => Promise<CollectionEntry<C> | undefined>)(name, id);
    return entry && onlyPublished(name, [entry])[0];
  }
  requestContext().tags.add(`doc:${name}/${id}`);
  if (name === 'feeds') return (await getEntries(name)).find((e) => e.id === id);
  const base = `src/content/${name}/${id}`;
  const rows = await query(
    () =>
      getSql()<{ path: string; content: string }>`
        select path, content from documents where path = any(${[`${base}.md`, `${base}.mdx`]}::text[])
        order by path`,
  );
  return onlyPublished(name, asEntries<C>(parseDocuments(name as DocumentCollection, rows)))[0];
}

type Paths<P> = { params: Record<string, string | number | undefined>; props: P }[];

/**
 * The props getStaticPaths gave this page. Postgres mode renders on demand, so getStaticPaths never ran: run it now
 * and pick the entry matching the URL. null (unknown id, draft, deleted entry) → the page answers 404.
 */
export async function staticProps<P>(
  astro: { props: unknown; params: Record<string, string | undefined> },
  paths: () => Promise<Paths<P>>,
): Promise<P | null> {
  if (getMode() !== 'postgres') return astro.props as P;
  const hit = (await paths()).find((p) => Object.entries(p.params).every(([k, v]) => String(v) === astro.params[k]));
  return hit?.props ?? null;
}

const rendered = new WeakMap<object, Promise<{ html: string; headings: MarkdownHeading[] }>>();

/** Postgres mode: an entry body as HTML (once per entry object). MDX needs the build, so it gets a notice. */
export function renderEntryHtml(entry: { body?: string; filePath?: string }) {
  let out = rendered.get(entry);
  if (!out) {
    out = entry.filePath?.endsWith('.mdx')
      ? Promise.resolve({
          html: '<p>This post uses MDX, which is only supported in static/git mode.</p>',
          headings: [],
        })
      : renderMarkdownDocument(entry.body ?? '');
    rendered.set(entry, out);
  }
  return out;
}

/** Headings for a table of contents, in every mode. */
export async function entryHeadings(entry: CollectionEntry<CollectionKey>): Promise<MarkdownHeading[]> {
  if (getMode() !== 'postgres') return (await (await import('astro:content')).render(entry)).headings;
  return (await renderEntryHtml(entry)).headings;
}
