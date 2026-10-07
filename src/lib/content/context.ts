import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { tagsForPath } from '../cache-tags';
import type { Sql } from '../db';
import { getMode } from '../mode';

export interface RequestContext {
  /** config/* and src/data/* documents, loaded once per request so config reads can stay synchronous. */
  files: Map<string, string>;
  /** Cache tags of everything this response read. */
  tags: Set<string>;
  /** Per-request results (parsed config, collections). */
  memo: Map<string, unknown>;
  /** A query failed while rendering: the middleware answers 503 instead of caching an error page. */
  dbFailed: boolean;
}

const als = new AsyncLocalStorage<RequestContext>();

export const newContext = (files: Map<string, string>): RequestContext => ({
  files,
  tags: new Set(),
  memo: new Map(),
  dbFailed: false,
});

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => als.run(ctx, fn);

export function requestContext(): RequestContext {
  const ctx = als.getStore();
  if (!ctx) {
    throw new Error('Content read outside a request in Postgres mode (src/middleware.ts opens the request context)');
  }
  return ctx;
}

/** A site file as text, or null when missing: from disk, or in Postgres mode from the request's snapshot (tagged). */
export function readSiteFile(file: string): string | null {
  if (getMode() !== 'postgres') {
    try {
      return fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8');
    } catch {
      return null;
    }
  }
  const ctx = requestContext();
  for (const tag of tagsForPath(file)) ctx.tags.add(tag);
  return ctx.files.get(file) ?? null;
}

/** Inside a request: computed once per request. Outside (static/git builds): every call. */
export function memo<T>(key: string, compute: () => T): T {
  const ctx = als.getStore();
  if (!ctx) return compute();
  if (!ctx.memo.has(key)) ctx.memo.set(key, compute());
  return ctx.memo.get(key) as T;
}

/** The documents every page may read synchronously (config/*, src/data/*), in one query. */
export async function loadSiteFiles(sql: Sql): Promise<Map<string, string>> {
  const rows = await sql<{ path: string; content: string }>`
    select path, content from documents where starts_with(path, 'config/') or starts_with(path, 'src/data/')`;
  return new Map(rows.map((r) => [r.path, r.content]));
}
