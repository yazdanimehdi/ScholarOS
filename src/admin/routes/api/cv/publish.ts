import { ZodError } from 'astro/zod';
import { configChange, entryChange, readConfig } from '../../../../lib/admin/content';
import { HttpError, commitChanges, fieldErrors, json, readBody, route } from '../../../../lib/admin/http';
import { assertSlug, collectionPath, configPath } from '../../../../lib/admin/paths';
import { ConflictError, type Change } from '../../../../lib/admin/store';

export const prerender = false;

interface PublicationIn {
  slug?: unknown;
  data?: unknown;
  body?: unknown;
  version?: string | null;
}

/** The CV screen's Publish: cv.yml + imported publications (+ turning a raw upload off) in one commit. */
export const POST = route(async (ctx, store) => {
  const {
    cv,
    cvVersion = null,
    publications = [],
    uploadVersion,
  } = await readBody<{ cv?: unknown; cvVersion?: string | null; publications?: PublicationIn[]; uploadVersion?: string | null }>(ctx);
  if (!Array.isArray(publications)) throw new HttpError(400, '`publications` must be a list');

  const current = await readConfig(store, 'cv');
  if (current.version !== cvVersion) throw new ConflictError(configPath('cv'));
  const changes: Change[] = [configChange('cv', current.source, cv)];
  const base: Record<string, string | null> = { [configPath('cv')]: cvVersion };

  for (const p of publications) {
    const slug = assertSlug(p.slug);
    try {
      changes.push(entryChange('publications', slug, p.data, p.body));
    } catch (e) {
      if (e instanceof ZodError) throw new HttpError(400, `Publication "${slug}" is invalid`, fieldErrors(e));
      throw e;
    }
    base[collectionPath('publications', slug)] = p.version ?? null;
  }

  if (uploadVersion !== undefined) {
    const upload = await readConfig(store, 'cv-upload');
    changes.push(configChange('cv-upload', upload.source, { ...upload.data, enabled: false }));
    base[configPath('cv-upload')] = uploadVersion;
  }

  const message = publications.length ? `Update CV and ${publications.length} publication(s)` : 'Update CV';
  return json(await commitChanges(store, changes, message, base));
});
