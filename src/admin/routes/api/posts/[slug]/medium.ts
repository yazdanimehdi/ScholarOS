import { entryChange, readConfig, readEntry } from '../../../../../lib/admin/content';
import { HttpError, commitChanges, json, route } from '../../../../../lib/admin/http';
import { MediumError, crossPost, mediumPayload } from '../../../../../lib/admin/medium';
import { assertSlug } from '../../../../../lib/admin/paths';

export const prerender = false;

/** "Also publish to Medium" (token path) and its Retry: a Medium draft of a published post, linked in its front matter. */
export const POST = route(async (ctx, store) => {
  const slug = assertSlug(ctx.params.slug);
  const token = process.env.MEDIUM_TOKEN;
  if (!token) throw new HttpError(400, 'MEDIUM_TOKEN is not set: use "Import to Medium" instead');
  const entry = await readEntry(store, 'posts', slug);
  if (!entry) throw new HttpError(404, 'Not found');
  if (entry.readonly) throw new HttpError(409, `posts/${slug} is MDX and can only be edited in the repository`);
  if (entry.data.draft) throw new HttpError(400, 'Publish the post before sending it to Medium');
  const existing = (entry.data.medium as { url?: string } | undefined)?.url;
  if (existing) throw new HttpError(409, `Already on Medium: ${existing}`, { url: existing });

  const site = await readConfig(store, 'site');
  const postUrl = `${String(site.data.siteUrl || ctx.url.origin).replace(/\/$/, '')}/blog/${slug}/`;
  let medium: { id: string; url: string };
  try {
    medium = await crossPost(token, mediumPayload(entry.data as { title: string }, entry.body, postUrl));
  } catch (e) {
    throw new HttpError(
      502,
      e instanceof MediumError ? e.message : `Medium could not be reached: ${(e as Error).message}`,
    );
  }
  const change = entryChange('posts', slug, { ...entry.data, medium }, entry.body);
  try {
    const commit = await commitChanges(store, [change], `Link posts/${slug} to Medium`, {
      [change.path]: entry.version,
    });
    return json({ medium, ...commit });
  } catch (e) {
    throw new HttpError(
      502,
      `Sent to Medium (${medium.url}), but saving the link failed: ${(e as Error).message}. Paste the link into "Medium URL".`,
    );
  }
});
