import { listEntries, readEntry } from '../../../../lib/admin/content';
import { ImportError, importRenderCv } from '../../../../lib/admin/cv-import';
import { json, readBody, route } from '../../../../lib/admin/http';

export const prerender = false;

/** RenderCV YAML → a preview for the CV screen. Nothing is committed until Publish. */
export const POST = route(async (ctx, store) => {
  const { yaml } = await readBody<{ yaml?: unknown }>(ctx);
  if (typeof yaml !== 'string' || !yaml.trim()) throw new ImportError('Paste a RenderCV YAML document or choose a file');
  const result = importRenderCv(yaml, await listEntries(store, 'publications'));
  const publications = await Promise.all(
    result.publications.map(async (p) => ({
      ...p,
      // Matched entries keep their body; Publish rewrites the whole file.
      body: p.version ? ((await readEntry(store, 'publications', p.slug))?.body ?? '') : '',
    })),
  );
  return json({ ...result, publications });
});
