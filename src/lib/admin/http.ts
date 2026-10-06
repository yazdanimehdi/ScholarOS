import type { APIContext, APIRoute } from 'astro';
import { ZodError } from 'astro/zod';
import { ImportError } from './cv-import';
import { getStore } from './get-store';
import { MediaError } from './media';
import { PathError, assertAllowed } from './paths';
import type { SessionUser } from './session';
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
  return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
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
  try {
    return (await ctx.request.json()) as T;
  } catch {
    throw new HttpError(400, 'The request body must be JSON');
  }
}

/** Checks every path against the allowlist, commits once, and returns the new version of each file. */
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
  return store.commit(changes, message, base);
}
