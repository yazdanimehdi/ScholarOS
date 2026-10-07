import type { APIContext, APIRoute } from 'astro';
import { ZodError } from 'astro/zod';
import { ImportError } from './cv-import';
import { getStore } from './get-store';
import { MediaError } from './media';
import { PathError, assertAllowed } from './paths';
import { PostgresStore } from './postgres-store';
import type { SessionUser } from './session';
import { affectsCvPdf, generateCvPdf } from '../cv-pdf/generate';
import { ConflictError, UpstreamError, type Author, type Change, type CommitResult, type ContentStore } from './store';

export type { CommitResult };

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const authorOf = (user: SessionUser): Author => ({
  name: user.name || user.login,
  email: `${user.login}@users.noreply.github.com`,
});

/** Zod issues keyed like the admin's form fields: { "authors.0": "Required" }. */
export function fieldErrors(error: ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((i) => [i.path.join('.') || '_', i.message]));
}

function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message, details: e.details }, e.status);
  if (e instanceof ZodError) return json({ error: 'Some fields are invalid', details: fieldErrors(e) }, 400);
  if (e instanceof PathError) return json({ error: e.message }, 400);
  if (e instanceof ConflictError) return json({ error: e.message, details: { path: e.path } }, 409);
  if (e instanceof MediaError) return json({ error: e.message }, e.status);
  if (e instanceof ImportError) return json({ error: e.message, details: e.details }, 422);
  if (e instanceof UpstreamError) return json({ error: e.message }, e.status);
  // eslint-disable-next-line no-console
  console.error(e);
  return json({ error: 'Internal error' }, 500);
}

type Handler = (ctx: APIContext, store: ContentStore, user: SessionUser) => Promise<Response>;

/** An admin API route: needs the session user (set by the middleware), gets a per-request store, maps errors. */
export function route(handler: Handler): APIRoute {
  return async (ctx) => {
    const user = ctx.locals.user;
    if (!user) return json({ error: 'Not signed in' }, 401);
    try {
      return await handler(ctx, getStore(authorOf(user)), user);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readBody<T>(ctx: APIContext): Promise<T> {
  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    throw new HttpError(400, 'The request body must be JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'The request body must be a JSON object');
  }
  return body as T;
}

/** Checks every path against the allowlist, commits once, regenerates the CV PDF when a Postgres-mode save changes it, and returns the new version of each file. */
export async function commitChanges(
  store: ContentStore,
  changes: Change[],
  message: string,
  base: Record<string, string | null>,
): Promise<CommitResult> {
  if (new Set(changes.map((c) => c.path)).size !== changes.length) {
    throw new HttpError(400, 'The same file appears twice in one save');
  }
  for (const c of changes) assertAllowed(c.path);
  const result = await store.commit(changes, message, base);
  if (!(store instanceof PostgresStore) || !affectsCvPdf(changes.map((c) => c.path))) return result;
  try {
    await generateCvPdf(store);
    return result;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[cv-pdf]', e);
    // ponytail: one warning per response; a failed cache purge wins because it carries the Retry action.
    return result.warning
      ? result
      : { ...result, warning: 'pdf-failed', detail: e instanceof Error ? e.message : String(e) };
  }
}

/** History and cache purges only exist in Postgres mode. */
export function postgresOnly(store: ContentStore): PostgresStore {
  if (!(store instanceof PostgresStore)) throw new HttpError(404, 'Only available in Postgres mode');
  return store;
}
