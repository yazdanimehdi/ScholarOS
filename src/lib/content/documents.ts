import type { z } from 'astro/zod';
import { parseMarkdown } from '../admin/serialize';
import { adminCollections, feedItemSchema } from '../schemas';

/** The public collections in Postgres mode. Image fields are URL strings (images live in Vercel Blob). */
export const documentSchemas = { ...adminCollections, feeds: feedItemSchema };
export type DocumentCollection = keyof typeof documentSchemas;

export interface DocumentEntry {
  id: string;
  collection: string;
  data: Record<string, unknown>;
  body?: string;
  filePath?: string;
}

/** Database documents → entries shaped like getCollection's. A bad document is logged and skipped, never fatal. */
export function parseDocuments(name: DocumentCollection, docs: { path: string; content: string }[]): DocumentEntry[] {
  if (name === 'feeds') return docs.flatMap((d) => parseFeeds(d.path, d.content));
  const schema = documentSchemas[name] as z.ZodTypeAny;
  return docs.flatMap(({ path, content }) => {
    const id = /\/([^/]+)\.mdx?$/.exec(path)?.[1];
    if (!id) return [];
    let parsed: { data: Record<string, unknown>; body: string };
    try {
      parsed = parseMarkdown(content);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[content] ${path}: invalid front matter, skipped`, (e as Error).message);
      return [];
    }
    const result = schema.safeParse(parsed.data);
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.error(`[content] ${path}: invalid, skipped`, result.error.issues);
      return [];
    }
    return [{ id, collection: name, data: result.data, body: parsed.body, filePath: path }];
  });
}

function parseFeeds(path: string, content: string): DocumentEntry[] {
  let items: unknown;
  try {
    items = JSON.parse(content);
  } catch {
    // eslint-disable-next-line no-console
    console.error(`[content] ${path}: not valid JSON, skipped`);
    return [];
  }
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const result = feedItemSchema.safeParse(item);
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.error(`[content] ${path}: invalid item, skipped`, result.error.issues);
      return [];
    }
    return [{ id: result.data.id, collection: 'feeds', data: result.data }];
  });
}
