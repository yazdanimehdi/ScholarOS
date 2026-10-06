import type { APIRoute } from 'astro';
import { OAUTH_STATE_COOKIE, oauthEnv } from '../../../../lib/admin/session';

export const prerender = false;

export const GET: APIRoute = ({ cookies, redirect, url }) => {
  const { clientId } = oauthEnv();
  const state = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/admin/auth',
    maxAge: 600,
  });
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${url.origin}/api/admin/auth/callback`,
    scope: 'read:user',
    state,
  });
  return redirect(`https://github.com/login/oauth/authorize?${query}`);
};
