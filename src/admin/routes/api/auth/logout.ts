import type { APIRoute } from 'astro';
import { SESSION_COOKIE } from '../../../../lib/admin/session';

export const prerender = false;

export const POST: APIRoute = ({ cookies }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
