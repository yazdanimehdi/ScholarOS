import type { APIRoute } from 'astro';
import { getStore } from '../../../lib/admin/get-store';
import { GitHubStore } from '../../../lib/admin/github-store';
import { authorOf, json } from '../../../lib/admin/http';

export const prerender = false;

/** The signed-in user and what the GitHub token can do (drives the admin's permission banner). */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Not signed in' }, 401);
  let capabilities: { contents: boolean; actions: boolean; error?: string } = { contents: true, actions: true };
  try {
    const store = getStore(authorOf(locals.user));
    if (store instanceof GitHubStore) capabilities = await store.capabilities();
  } catch (e) {
    capabilities = { contents: false, actions: false, error: e instanceof Error ? e.message : String(e) };
  }
  return json({ user: locals.user, capabilities });
};
