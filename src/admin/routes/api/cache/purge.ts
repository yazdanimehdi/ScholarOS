import { isValidTag } from '../../../../lib/cache-tags';
import { HttpError, json, postgresOnly, readBody, route } from '../../../../lib/admin/http';

export const prerender = false;

/** "Retry refresh" after a save whose cache purge failed. */
export const POST = route(async (ctx, store) => {
  const pg = postgresOnly(store);
  const { tags } = await readBody<{ tags?: unknown }>(ctx);
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.length > 128 ||
    !tags.every((t) => typeof t === 'string' && isValidTag(t))
  ) {
    throw new HttpError(400, '`tags` must be 1–128 cache tags');
  }
  await pg.purgeTags(tags);
  return json({ ok: true });
});
