import type { APIRoute } from 'astro';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, sealSession, sessionSecret } from '../../../../lib/admin/session';
import { adminSettings } from '../../../../lib/admin/settings';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  if (!import.meta.env.DEV || process.env.ADMIN_STORE !== 'memory') return new Response('Not found', { status: 404 });
  const login = url.searchParams.get('login') ?? 'dev';
  cookies.set(SESSION_COOKIE, await sealSession({ login, name: 'Dev User', avatar: '' }, sessionSecret()), SESSION_COOKIE_OPTIONS);
  return redirect(`/${adminSettings().adminPath}`);
};
