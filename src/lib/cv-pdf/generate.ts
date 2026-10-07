import { createHash } from 'node:crypto';
import { listEntries, readConfig } from '../admin/content';
import { CV_JSON } from '../admin/paths';
import type { PostgresStore } from '../admin/postgres-store';
import { resolveCvConfig } from '../cv';
import type { CvConfig, CvMetadata } from '../types';
import { buildCvDocument, type CvPublication } from './definition';
import { renderCvPdf } from './render';

/** Saves that change what the CV PDF shows. */
export const affectsCvPdf = (paths: string[]) =>
  paths.some((p) => p === 'config/cv.yml' || p === 'config/cv-upload.yml' || p.startsWith('src/content/publications/'));

export function readCvMeta(content: string | undefined): CvMetadata | null {
  try {
    const meta = content ? JSON.parse(content) : null;
    // A seeded file has pdfPath null until the first PDF exists.
    return typeof meta?.pdfPath === 'string' ? (meta as CvMetadata) : null;
  } catch {
    return null;
  }
}

/**
 * Postgres mode: renders the stored CV (the raw upload when enabled, as the CV page does), uploads it to Blob as
 * cv/cv-<hash>.pdf, records it in src/data/cv.json (which purges the CV page), then deletes the previous PDF.
 */
export async function generateCvPdf(store: PostgresStore, now = new Date()): Promise<CvMetadata> {
  const [cv, upload, site, pubs, current] = await Promise.all([
    readConfig(store, 'cv'),
    readConfig(store, 'cv-upload'),
    readConfig(store, 'site'),
    listEntries(store, 'publications'),
    store.read(CV_JSON),
  ]);
  const structured = cv.data as unknown as CvConfig;
  const config = resolveCvConfig(upload.data as { enabled?: boolean; content?: string }, () => structured);
  if (!config?.cv?.name) throw new Error('config/cv.yml has no cv.name');
  const definition = buildCvDocument(
    config.cv,
    pubs.map((p) => ({ id: p.slug, data: p.data as CvPublication['data'] })),
    { author: String(site.data.author ?? '') },
    { pageSize: structured.pdf?.pageSize },
  );
  definition.info = { ...definition.info, creationDate: now };
  const bytes = await renderCvPdf(definition);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  const { url } = await store.putMedia(
    'site',
    `cv/cv-${hash}.pdf`,
    Buffer.from(bytes).toString('base64'),
    'application/pdf',
  );
  const meta: CvMetadata = { lastGenerated: now.toISOString(), pdfPath: url, pdfSize: bytes.length };
  const saved = await store.commit(
    [{ path: CV_JSON, content: `${JSON.stringify(meta, null, 2)}\n` }],
    'Generate CV PDF',
    {
      [CV_JSON]: current?.version ?? null,
    },
  );
  const previous = readCvMeta(current?.content)?.pdfPath;
  // A page still cached with the old link (purge failed) must keep working, so the old PDF stays until the next run.
  if (!saved.warning && previous && previous !== url && previous.startsWith('https://')) {
    // Best effort: a stray PDF in Blob costs a few kB; failing the save over it would cost more.
    await store.deleteMedia(previous, '1').catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[cv-pdf] could not delete the previous PDF', previous, e);
    });
  }
  return meta;
}
