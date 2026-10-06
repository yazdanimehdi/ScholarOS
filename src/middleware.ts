import type { MiddlewareHandler } from 'astro';
import { SESSION_COOKIE, openSession, sessionSecret } from './lib/admin/session';
import { adminSettings, isAdminUser } from './lib/admin/settings';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });

/** Guards the admin (pages under /<adminPath>, API under /api/admin): session, same-origin writes, no caching or indexing. */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  if (ctx.isPrerendered) return next();
  const { pathname } = ctx.url;
  const { adminPath, adminUsers } = adminSettings();
  const api = pathname === '/api/admin' || pathname.startsWith('/api/admin/');
  const page = pathname === `/${adminPath}` || pathname.startsWith(`/${adminPath}/`);
  if (!api && !page) return next();

  let res: Response;
  if (api && MUTATING.has(ctx.request.method) && ctx.request.headers.get('origin') !== ctx.url.origin) {
    res = jsonError(403, 'Cross-origin request refused');
  } else if (pathname.startsWith('/api/admin/auth/') || pathname === `/${adminPath}/login`) {
    res = await next();
  } else {
    const token = ctx.cookies.get(SESSION_COOKIE)?.value;
    const user = token ? await openSession(token, sessionSecret()) : null;
    // Removing someone from adminUsers ends their session at the next request.
    if (user && isAdminUser(user.login, adminUsers)) {
      ctx.locals.user = user;
      res = await next();
    } else {
      res = api ? jsonError(401, 'Not signed in') : ctx.redirect(`/${adminPath}/login`);
    }
  }
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Robots-Tag', 'noindex');
  return out;
};
