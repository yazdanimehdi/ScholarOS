import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadYamlConfig, normalizeKeys } from './config';
import type { CvConfig, CvData, CvGenericEntry, CvMetadata } from './types';

type CvUpload = { enabled?: boolean; content?: string } | null | undefined;

/** A raw RenderCV upload wins when enabled and it parses to a `cv:` document; otherwise the structured CV. */
export function resolveCvConfig(upload: CvUpload, loadStructured: () => CvConfig): CvConfig {
  try {
    if (upload?.enabled && upload.content?.trim()) {
      const parsed = normalizeKeys(yaml.load(upload.content) as CvConfig);
      if (parsed?.cv) return parsed;
    }
  } catch {
    // Invalid upload YAML falls back to the structured CV, as it always has.
  }
  return loadStructured();
}

export function loadCv(): CvConfig {
  let upload: CvUpload = null;
  try {
    upload = loadYamlConfig<CvUpload>('cv-upload.yml');
  } catch {}
  return resolveCvConfig(upload, () => loadYamlConfig<CvConfig>('cv.yml'));
}

/** PDF metadata written by scripts/render-cv.py; null until a PDF has been generated. */
export function loadCvMeta(): CvMetadata | null {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/data/cv.json'), 'utf-8')) as CvMetadata;
  } catch {
    return null;
  }
}

export function formatDateRange(start?: string, end?: string): string {
  if (!start) return '';
  const e = end === 'present' ? 'Present' : (end ?? '');
  return `${start} – ${e}`;
}

export function sectionTitle(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/** All non-empty list sections, in YAML order. */
export function cvSections(cv: CvData): [string, unknown[]][] {
  return Object.entries(cv.sections ?? {}).filter(
    ([, entries]) => Array.isArray(entries) && entries.length > 0,
  ) as [string, unknown[]][];
}

/** True when some section already lists publications (title + authors), so the collection fallback is skipped. */
export function hasYamlPublications(sections: [string, unknown[]][]): boolean {
  return sections.some(([, entries]) => isPublicationEntry(entries[0]));
}

export function isEducationEntry(e: unknown): e is CvGenericEntry {
  return typeof e === 'object' && e !== null && 'institution' in e;
}

export function isOneLineEntry(e: unknown): e is { label: string; details: string } {
  return typeof e === 'object' && e !== null && 'label' in e && 'details' in e;
}

export function isExperienceEntry(e: unknown): e is CvGenericEntry {
  return typeof e === 'object' && e !== null && ('company' in e || 'position' in e);
}

export function isPublicationEntry(e: unknown): e is CvGenericEntry {
  return typeof e === 'object' && e !== null && 'title' in e && 'authors' in e;
}

export function isNormalEntry(e: unknown): e is CvGenericEntry {
  return typeof e === 'object' && e !== null && ('name' in e || 'startDate' in e || 'highlights' in e);
}

export interface CvEntryView {
  title: string;
  org?: string;
  when?: string;
  points: string[];
}

const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const joined = (parts: unknown[], sep: string) => parts.map(str).filter(Boolean).join(sep);

function view(title: string, org: string, when: string, points: string[]): CvEntryView {
  return { title, ...(org ? { org } : {}), ...(when ? { when } : {}), points };
}

/** Any RenderCV entry in the editorial "title / org / dates / highlights" shape; null when unrecognized. */
export function cvEntryView(entry: unknown): CvEntryView | null {
  if (typeof entry === 'string') return { title: entry, points: [] };
  if (typeof entry !== 'object' || entry === null) return null;
  const e = entry as CvGenericEntry;
  const points = Array.isArray(e.highlights) ? e.highlights.filter((h): h is string => typeof h === 'string') : [];
  const range = e.startDate ? formatDateRange(e.startDate, e.endDate) : str(e.date);

  if (isEducationEntry(entry)) return view(joined([e.degree, e.area], ' in '), joined([e.institution, e.location], ', '), range, points);
  if (isOneLineEntry(entry)) return view(str(e.label), str(e.details), '', []);
  if (isExperienceEntry(entry)) return view(str(e.position), joined([e.company, e.location], ', '), range, points);
  if (isPublicationEntry(entry)) {
    const authors = (Array.isArray(e.authors) ? e.authors : []).map((a) => str(a).replace(/\*+/g, ''));
    return view(str(e.title), joined([authors.join(', '), e.journal], ' · '), str(e.date), points);
  }
  if (isNormalEntry(entry)) return view(str(e.name), str(e.location), range, points);
  return null;
}
