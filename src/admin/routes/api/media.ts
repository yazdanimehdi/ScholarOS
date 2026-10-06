import { HttpError, commitChanges, json, readBody, route } from '../../../lib/admin/http';
import { MAX_UPLOAD, MediaError, prepareUpload } from '../../../lib/admin/media';
import { SITE_MEDIA, assertMediaPath } from '../../../lib/admin/paths';
import { adminSettings } from '../../../lib/admin/settings';

export const prerender = false;

/** `content`: collection images (processed by image()); `site`: plain-URL images for config files and post bodies. */
function folderOf(value: unknown): { dir: string; url: string } {
  if (value === 'content') return { dir: adminSettings().mediaFolder, url: adminSettings().publicFolder };
  if (value === 'site') return SITE_MEDIA;
  throw new HttpError(400, "`folder` must be 'content' or 'site'");
}

const IMAGE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

export const GET = route(async ({ url }, store) => {
  const folder = folderOf(url.searchParams.get('folder') ?? 'content');
  const files = (await store.list(folder.dir)).filter((f) => IMAGE.test(f.path));
  return json(
    files.map((f) => ({ path: f.path, version: f.version, url: folder.url + f.path.slice(folder.dir.length) })),
  );
});

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
  const { filename, base64 } = prepareUpload(file.name, new Uint8Array(await file.arrayBuffer()));
  const path = `${folder.dir}/${filename}`;
  const url = `${folder.url}/${filename}`;
  // The name carries a content hash: the same image is already there, nothing to commit.
  const existing = (await store.list(folder.dir)).find((f) => f.path === path);
  if (existing) return json({ path, url, version: existing.version, commit: null });
  const result = await commitChanges(store, [{ path, content: base64, encoding: 'base64' }], `Upload ${path}`, {
    [path]: null,
  });
  return json({ path, url, version: result.versions[path], commit: { id: result.id, url: result.url } });
});

export const DELETE = route(async (ctx, store) => {
  const { path, version } = await readBody<{ path?: unknown; version?: unknown }>(ctx);
  if (typeof version !== 'string' || !version) throw new HttpError(400, '`version` is required to delete');
  const file = assertMediaPath(path);
  return json(await commitChanges(store, [{ path: file, content: null }], `Delete ${file}`, { [file]: version }));
});
