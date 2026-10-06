import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GET as callback } from '../../admin/routes/api/auth/callback';
import { OAUTH_STATE_COOKIE, SESSION_COOKIE, openSession } from './session';
import { adminLogin, adminSettings } from './settings';

Object.assign(process.env, {
  SESSION_SECRET: 's'.repeat(32),
  GITHUB_CLIENT_ID: 'id',
  GITHUB_CLIENT_SECRET: 'secret',
});
const { adminPath, adminUsers } = adminSettings();
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** GitHub's token and user endpoints, answering for `login`. */
function fakeGitHub(login: string) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'gho_x' });
    if (url === 'https://api.github.com/user') return Response.json({ login, name: 'Jane', avatar_url: 'a.png' });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

/** Runs the callback with a fake cookie jar; `state` is the cookie set by /auth/login. */
async function run(query: string, state?: string) {
  const set = new Map<string, string>();
  const ctx = {
    url: new URL(`https://site.test/api/admin/auth/callback${query}`),
    cookies: {
      get: (name: string) => (name === OAUTH_STATE_COOKIE && state ? { value: state } : undefined),
      delete: () => {},
      set: (name: string, value: string) => set.set(name, value),
    },
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  };
  const res = (await callback(ctx as never)) as Response;
  return { location: res.headers.get('location'), session: set.get(SESSION_COOKIE) };
}

test('missing or mismatched state → expired, no session cookie', async () => {
  fakeGitHub(adminLogin(adminUsers[0]));
  for (const [query, state] of [
    ['?code=c&state=abc', undefined],
    ['?code=c', 'abc'],
    ['?code=c&state=abc', 'other'],
  ] as const) {
    const { location, session } = await run(query, state);
    assert.equal(location, `/${adminPath}/login?error=expired`, `${query} / ${state}`);
    assert.equal(session, undefined);
  }
});

test('a login not in adminUsers → denied, no session cookie', async () => {
  fakeGitHub('not-an-admin');
  const { location, session } = await run('?code=c&state=abc', 'abc');
  assert.equal(location, `/${adminPath}/login?error=denied`);
  assert.equal(session, undefined);
});

test('an admin login gets a session cookie and lands on the admin', async () => {
  const login = adminLogin(adminUsers[0]);
  fakeGitHub(login.toUpperCase());
  const { location, session } = await run('?code=c&state=abc', 'abc');
  assert.equal(location, `/${adminPath}`);
  assert.equal((await openSession(session!, process.env.SESSION_SECRET!))?.login, login.toUpperCase());
});

test('a network error fetching the GitHub user → expired, no session cookie', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input) === 'https://github.com/login/oauth/access_token')
      return Response.json({ access_token: 'gho_x' });
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  const { location, session } = await run('?code=c&state=abc', 'abc');
  assert.equal(location, `/${adminPath}/login?error=expired`);
  assert.equal(session, undefined);
});
