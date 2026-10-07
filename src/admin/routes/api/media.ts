import { posix } from 'node:path';
import { listEntries } from '../../../lib/admin/content';
import { HttpError, json, readBody, route } from '../../../lib/admin/http';
import { MAX_UPLOAD, MediaError, prepareUpload } from '../../../lib/admin/media';
import { COLLECTIONS, collectionDir } from '../../../lib/admin/paths';
import type { ContentStore, MediaFolder } from '../../../lib/admin/store';
import { adminSettings } from '../../../lib/admin/settings';

export const prerender = false;

function folderOf(value: unknown): MediaFolder {
  if (value === 'content' || value === 'site') return value;
  throw new HttpError(400, "`folder` must be 'content' or 'site'");
}

export const GET = route(async ({ url }, store) =>
  json(await store.listMedia(folderOf(url.searchParams.get('folder') ?? 'content'))),
);

export const POST = route(async ({ request }, store) => {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_UPLOAD + 64 * 1024) {
    throw new MediaError('Files must be 4 MB or smaller', 413);
  }
  const form = await request.formData().catch(() => {
    throw new HttpError(400, 'Expected a multipart form upload');
  });
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'No file in the upload');
  const folder = folderOf(form.get('folder') ?? 'content');
  const { filename, base64, contentType } = prepareUpload(file.name, new Uint8Array(await file.arrayBuffer()));
  return json(await store.putMedia(folder, filename, base64, contentType));
});

const isUrl = (s: string) => /^https:\/\//.test(s);

/**
 * An image referenced from front matter must stay: in git mode image() fails the build when the file is gone; in
 * Postgres mode the page would show a broken image. Repo images match by public URL or entry-relative path.
 */
async function refuseInUse(store: ContentStore, file: string) {
  const { mediaFolder, publicFolder } = adminSettings();
  if (!isUrl(file) && !file.startsWith(`${mediaFolder}/`)) return;
  const url = isUrl(file) ? file : publicFolder + file.slice(mediaFolder.length);
  const users = (
    await Promise.all(
      COLLECTIONS.map(async (name) => {
        const relative = posix.relative(collectionDir(name), file);
        return (await listEntries(store, name))
          .filter((e) => {
            const text = JSON.stringify(e.data);
            return text.includes(url) || (!isUrl(file) && text.includes(relative));
          })
          .map((e) => `${name}/${e.slug}`);
      }),
    )
  ).flat();
  if (users.length) throw new HttpError(409, `In use by ${users.join(', ')}`);
}

export const DELETE = route(async (ctx, store) => {
  const { path, version } = await readBody<{ path?: unknown; version?: unknown }>(ctx);
  if (typeof version !== 'string' || !version) throw new HttpError(400, '`version` is required to delete');
  if (typeof path !== 'string') throw new HttpError(400, '`path` is required');
  await refuseInUse(store, path);
  return json(await store.deleteMedia(path, version));
});
