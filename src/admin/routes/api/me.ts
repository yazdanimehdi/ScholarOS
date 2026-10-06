import type { APIRoute } from 'astro';
import { getStore } from '../../../lib/admin/get-store';
import { GitHubStore } from '../../../lib/admin/github-store';
import { authorOf, json } from '../../../lib/admin/http';
import { UpstreamError } from '../../../lib/admin/store';

export const prerender = false;

/** The signed-in user and what the GitHub token can do (drives the admin's permission banner). */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Not signed in' }, 401);
  let capabilities: { contents: boolean; actions: boolean; error?: string } = { contents: true, actions: true };
  try {
    const store = getStore(authorOf(locals.user));
    if (store instanceof GitHubStore) capabilities = await store.capabilities();
  } catch (e) {
    // UpstreamError messages are written for the user; anything else stays in the logs.
    const upstream = e instanceof UpstreamError;
    // eslint-disable-next-line no-console
    if (!upstream) console.error(e);
    capabilities = {
      contents: false,
      actions: false,
      error: upstream ? e.message : 'Could not check the GitHub token',
    };
  }
  return json({ user: locals.user, capabilities });
};
