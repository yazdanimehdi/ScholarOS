import { entryChange, readEntry } from '../../../../../lib/admin/content';
import { HttpError, commitChanges, json, readBody, route } from '../../../../../lib/admin/http';
import { assertCollection, assertSlug, collectionPath, type CollectionName } from '../../../../../lib/admin/paths';
import type { ContentStore } from '../../../../../lib/admin/store';

export const prerender = false;

/** MDX entries are read-only here: writing the .md sibling would give the build two entries with one id. */
async function refuseMdx(store: ContentStore, name: CollectionName, slug: string) {
  if (await store.read(collectionPath(name, slug, 'mdx'))) {
    throw new HttpError(409, `${name}/${slug} is MDX and can only be edited in the repository`);
  }
}

export const GET = route(async ({ params }, store) => {
  const entry = await readEntry(store, assertCollection(params.name), assertSlug(params.slug));
  if (!entry) throw new HttpError(404, 'Not found');
  return json(entry);
});

export const PUT = route(async (ctx, store) => {
  const name = assertCollection(ctx.params.name);
  const slug = assertSlug(ctx.params.slug);
  await refuseMdx(store, name, slug);
  const { data, body, version = null, message } = await readBody<{
    data?: unknown;
    body?: unknown;
    version?: string | null;
    message?: unknown;
  }>(ctx);
  const change = entryChange(name, slug, data, body);
  const summary =
    typeof message === 'string' && message.trim() ? message.trim().slice(0, 200) : `${version ? 'Update' : 'Create'} ${name}/${slug}`;
  return json(await commitChanges(store, [change], summary, { [change.path]: version }));
});

export const DELETE = route(async (ctx, store) => {
  const name = assertCollection(ctx.params.name);
  const slug = assertSlug(ctx.params.slug);
  await refuseMdx(store, name, slug);
  const { version } = await readBody<{ version?: string }>(ctx);
  if (!version) throw new HttpError(400, '`version` is required to delete');
  const path = collectionPath(name, slug);
  return json(await commitChanges(store, [{ path, content: null }], `Delete ${name}/${slug}`, { [path]: version }));
});
