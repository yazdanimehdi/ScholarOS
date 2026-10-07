import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_COOKIE, sealSession } from './lib/admin/session';
import { adminLogin, adminSettings } from './lib/admin/settings';
import { onRequest } from './middleware';

process.env.SESSION_SECRET = 'm'.repeat(32);
const ORIGIN = 'https://site.test';
const admin = `/${adminSettings().adminPath}`;
const user = { login: adminLogin(adminSettings().adminUsers[0]), name: 'Jane', avatar: '' };

function context(path: string, opts: { method?: string; cookie?: string; origin?: string } = {}) {
  const url = new URL(path, ORIGIN);
  return {
    url,
    isPrerendered: false,
    locals: {} as { user?: unknown },
    request: new Request(url, { method: opts.method ?? 'GET', headers: opts.origin ? { origin: opts.origin } : {} }),
    cookies: { get: (name: string) => (name === SESSION_COOKIE && opts.cookie ? { value: opts.cookie } : undefined) },
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  };
}
const run = (ctx: ReturnType<typeof context>) =>
  onRequest(ctx as never, async () => new Response('ok')) as Promise<Response>;

test('public pages pass through untouched', async () => {
  const res = await run(context('/blog'));
  assert.equal(await res.text(), 'ok');
  assert.equal(res.headers.get('cache-control'), null);
});

test('without a session: API → 401, pages → login; the login page and auth routes stay open', async () => {
  assert.equal((await run(context('/api/admin/me'))).status, 401);
  const page = await run(context(`${admin}/cv`));
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), `${admin}/login`);
  const login = await run(context(`${admin}/login`));
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('cache-control'), 'no-store');
  assert.equal(login.headers.get('x-robots-tag'), 'noindex');
  assert.equal((await run(context('/api/admin/auth/login'))).status, 200);
});

test('a valid session reaches the route with locals.user set; a forged one does not', async () => {
  const ctx = context(admin, { cookie: await sealSession(user, process.env.SESSION_SECRET!) });
  const res = await run(ctx);
  assert.equal(res.status, 200);
  assert.deepEqual(ctx.locals.user, user);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const forged = await sealSession(user, 'x'.repeat(32));
  assert.equal((await run(context('/api/admin/me', { cookie: forged }))).status, 401);
});

test('writes need a same-origin Origin header', async () => {
  const cookie = await sealSession(user, process.env.SESSION_SECRET!);
  const put = (origin?: string) => run(context('/api/admin/config/site', { method: 'PUT', cookie, origin }));
  assert.equal((await put('https://evil.test')).status, 403);
  assert.equal((await put()).status, 403, 'missing Origin');
  assert.equal((await put(ORIGIN)).status, 200);
  assert.equal(
    (await run(context('/api/admin/auth/logout', { method: 'POST', origin: 'https://evil.test' }))).status,
    403,
  );
});

test('a valid session for a login no longer in adminUsers is treated as signed out', async () => {
  const cookie = await sealSession({ ...user, login: 'removed-admin' }, process.env.SESSION_SECRET!);
  assert.equal((await run(context('/api/admin/me', { cookie }))).status, 401);
  const page = await run(context(`${admin}/cv`, { cookie }));
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), `${admin}/login`);
});

test('the bare /api/admin path is guarded too', async () => {
  const res = await run(context('/api/admin'));
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal((await run(context('/api/admin', { method: 'POST', origin: 'https://evil.test' }))).status, 403);
});

test('the cron route skips the session check (it checks CRON_SECRET itself); its neighbours do not', async () => {
  const cron = await run(context('/api/admin/cron/backup'));
  assert.equal(cron.status, 200);
  assert.equal(await cron.text(), 'ok');
  assert.equal(cron.headers.get('cache-control'), 'no-store');
  assert.equal((await run(context('/api/admin/cronx'))).status, 401);
  assert.equal((await run(context('/api/admin/collections/posts'))).status, 401);
});
