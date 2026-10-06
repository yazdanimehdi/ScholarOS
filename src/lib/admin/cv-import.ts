import { parse } from 'yaml';
import { bibtexKey } from '../bibtex';
import { normalizeKeys } from '../config';
import { isPublicationEntry } from '../cv';
import { bareDoi } from '../editorial';
import { cvSchema } from '../schemas';

/** The upload isn't a usable RenderCV document; the API answers 422. */
export class ImportError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ExistingPublication {
  slug: string;
  data: Record<string, unknown>;
  version: string;
  readonly?: boolean;
}

export interface ImportedPublication {
  slug: string;
  data: Record<string, unknown>;
  /** The existing entry's version, or null for a new entry. */
  version: string | null;
}

export interface CvImport {
  cv: Record<string, unknown>;
  publications: ImportedPublication[];
  summary: {
    sections: { key: string; count: number }[];
    newPublications: number;
    updatedPublications: number;
    skipped: number;
  };
}

/** Fields the CV is authoritative for; everything else on an existing entry (topic, abstract, type, …) is kept. */
const CV_OWNED = ['title', 'authors', 'venue', 'year', 'doi', 'url'];
const titleKey = (title: unknown) => String(title ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const doiKey = (doi: unknown) => (doi ? bareDoi(String(doi)).toLowerCase() : '');

// ponytail: keyword heuristic for `type`; the owner fixes it in the Publications screen and re-imports keep the fix.
function guessType(venue: string): string {
  if (/arxiv|biorxiv|medrxiv|preprint/i.test(venue)) return 'preprint';
  if (/journal|transactions|letters|briefings|molecules|review/i.test(venue)) return 'journal';
  if (/^[^,]*workshop/i.test(venue)) return 'workshop';
  return 'conference';
}

function toPublication(entry: Record<string, unknown>): Record<string, unknown> {
  const venue = String(entry.journal ?? '').trim() || 'Unpublished';
  return {
    title: String(entry.title ?? '').trim(),
    authors: (Array.isArray(entry.authors) ? entry.authors : [])
      .map((a) => String(a).replace(/\*+/g, '').trim())
      .filter(Boolean),
    venue,
    year: Number(String(entry.date ?? '').slice(0, 4)) || new Date().getFullYear(),
    type: guessType(venue),
    ...(entry.doi ? { doi: String(entry.doi) } : {}),
    ...(entry.url ? { url: String(entry.url) } : {}),
  };
}

/** RenderCV YAML → the cv.yml document (publication sections removed) + publications for the collection. */
export function importRenderCv(text: string, existing: ExistingPublication[]): CvImport {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (e) {
    throw new ImportError(`Not valid YAML: ${(e as Error).message}`);
  }
  const root = normalizeKeys(doc) as { cv?: { name?: unknown; sections?: Record<string, unknown> } } | null;
  if (!root?.cv || typeof root.cv.name !== 'string') {
    throw new ImportError('Expected a RenderCV document: a top-level `cv:` with a `name`.');
  }

  const sections: Record<string, unknown> = { ...(root.cv.sections ?? {}) };
  const found: Record<string, unknown>[] = [];
  for (const [key, list] of Object.entries(sections)) {
    if (Array.isArray(list) && list.length > 0 && list.every(isPublicationEntry)) {
      found.push(...(list as Record<string, unknown>[]));
      delete sections[key];
    }
  }
  const cv = { ...root, cv: { ...root.cv, sections } };
  const checked = cvSchema.safeParse(cv);
  if (!checked.success) {
    throw new ImportError(
      'Some CV entries have a shape RenderCV does not define',
      checked.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }

  const byDoi = new Map(existing.filter((e) => e.data.doi).map((e) => [doiKey(e.data.doi), e]));
  const byTitle = new Map(existing.map((e) => [titleKey(e.data.title), e]));
  const slugs = new Set(existing.map((e) => e.slug));
  const publications: ImportedPublication[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const entry of found) {
    const mapped = toPublication(entry);
    const match = (mapped.doi && byDoi.get(doiKey(mapped.doi))) || byTitle.get(titleKey(mapped.title));
    if (match?.readonly) {
      skipped++;
    } else if (match) {
      const owned = Object.fromEntries(CV_OWNED.filter((k) => k in mapped).map((k) => [k, mapped[k]]));
      publications.push({ slug: match.slug, data: { ...match.data, ...owned }, version: match.version });
      updated++;
    } else {
      const base = bibtexKey(mapped as { title: string; authors: string[]; year: number }).slice(0, 76) || 'publication';
      let slug = base;
      for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
      slugs.add(slug);
      publications.push({ slug, data: mapped, version: null });
      created++;
    }
  }

  return {
    cv,
    publications,
    summary: {
      sections: Object.entries(sections).map(([key, list]) => ({ key, count: Array.isArray(list) ? list.length : 0 })),
      newPublications: created,
      updatedPublications: updated,
      skipped,
    },
  };
}
