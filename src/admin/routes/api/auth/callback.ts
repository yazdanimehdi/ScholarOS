import type { APIRoute } from 'astro';
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  oauthEnv,
  sealSession,
  sessionSecret,
} from '../../../../lib/admin/session';
import { adminSettings, isAdminUser } from '../../../../lib/admin/settings';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  const { adminPath, adminUsers } = adminSettings();
  const fail = (error: 'expired' | 'denied') => redirect(`/${adminPath}/login?error=${error}`);

  const expected = cookies.get(OAUTH_STATE_COOKIE)?.value;
  cookies.delete(OAUTH_STATE_COOKIE, { path: '/api/admin/auth' });
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || !expected || state !== expected) return fail('expired');

  const { clientId, clientSecret } = oauthEnv();
  const token = (await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${url.origin}/api/admin/auth/callback`,
    }),
  })
    .then((r) => r.json())
    .catch(() => ({}))) as { access_token?: string };
  if (!token.access_token) return fail('expired');

  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ScholarOS-admin',
    },
  }).catch(() => null);
  if (!res?.ok) return fail('expired');
  const gh = (await res.json()) as { login: string; name?: string | null; avatar_url?: string };
  if (!isAdminUser(gh.login, adminUsers)) return fail('denied');

  const session = await sealSession(
    { login: gh.login, name: gh.name || gh.login, avatar: gh.avatar_url ?? '' },
    sessionSecret(),
  );
  cookies.set(SESSION_COOKIE, session, SESSION_COOKIE_OPTIONS);
  return redirect(`/${adminPath}`);
};
