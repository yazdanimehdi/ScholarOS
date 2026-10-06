/* eslint-disable @typescript-eslint/no-explicit-any -- form models are user data of any shape */

export type Option = { value: string; label: string };
export type OptionSource = 'publications' | 'topics';
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'color'
  | 'list'
  | 'authors'
  | 'image'
  | 'markdown'
  | 'pubs'
  | 'bibtex'
  | 'objects'
  | 'readonly';

export interface FieldDef {
  /** Dotted path into the model, e.g. "socials.github". */
  key: string;
  label: string;
  type: FieldType;
  options?: (string | Option)[];
  /** Filled in at runtime by resolveOptions(). */
  optionsFrom?: OptionSource;
  /** image: 'content' → media_folder (image() fields); 'site' → public/images (plain URLs). */
  folder?: 'content' | 'site';
  /** objects: the fields of each item. */
  fields?: FieldDef[];
  /** objects: reorder only, no add/remove. */
  fixed?: boolean;
  /** checkbox: what an absent key means. */
  default?: unknown;
  hint?: string;
}

export function getIn(obj: unknown, key: string): any {
  return key.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Sets a dotted path, creating objects on the way; '' and undefined delete the key (absent = empty everywhere). */
export function setIn(obj: Record<string, any>, key: string, value: unknown): void {
  const parts = key.split('.');
  const last = parts.pop()!;
  let target = obj;
  for (const part of parts) target = target[part] ??= {};
  if (value === undefined || value === '') delete target[last];
  else target[last] = value;
}

export const replaceAt = <T>(list: T[] | undefined, index: number, value: T): T[] =>
  (list ?? []).map((item, i) => (i === index ? value : item));

export const optionOf = (o: string | Option): Option => (typeof o === 'string' ? { value: o, label: o } : o);

export function resolveOptions(fields: FieldDef[], sources: Partial<Record<OptionSource, Option[]>>): FieldDef[] {
  return fields.map((f) => ({
    ...f,
    ...(f.optionsFrom ? { options: sources[f.optionsFrom] ?? [] } : {}),
    ...(f.fields ? { fields: resolveOptions(f.fields, sources) } : {}),
  }));
}

export interface CollectionConfig {
  label: string;
  singular: string;
  titleKey: string;
  dateKey?: string;
  /** Keys offered as list filters. */
  filters?: string[];
  /** Front matter of a new entry: every required field, so the first save validates. */
  blank: Record<string, unknown>;
  fields: FieldDef[];
}

const today = () => new Date().toISOString().slice(0, 10);
export const text = (key: string, label: string): FieldDef => ({ key, label, type: 'text' });
export const date = (key: string, label: string): FieldDef => ({ key, label, type: 'date' });
export const select = (key: string, label: string, options: string[]): FieldDef => ({ key, label, type: 'select', options });
export const SOCIALS = ['github', 'scholar', 'twitter', 'linkedin', 'orcid', 'mastodon', 'bluesky', 'website'];

export const COLLECTIONS: Record<string, CollectionConfig> = {
  publications: {
    label: 'Publications',
    singular: 'publication',
    titleKey: 'title',
    dateKey: 'year',
    filters: ['year', 'topic'],
    blank: { title: '', authors: [], venue: '', year: new Date().getFullYear(), type: 'conference' },
    fields: [
      text('title', 'Title'),
      { key: 'authors', label: 'Authors (in order)', type: 'authors' },
      text('venue', 'Venue'),
      text('venueShort', 'Venue (short)'),
      { key: 'year', label: 'Year', type: 'number' },
      select('type', 'Type', ['journal', 'conference', 'preprint', 'workshop', 'thesis', 'book-chapter']),
      { key: 'topic', label: 'Topic', type: 'select', optionsFrom: 'topics' },
      text('note', 'Note'),
      text('doi', 'DOI'),
      text('arxiv', 'arXiv id'),
      text('url', 'URL'),
      text('pdf', 'PDF URL'),
      text('code', 'Code URL'),
      { key: 'featured', label: 'Featured', type: 'checkbox' },
      { key: 'abstract', label: 'Abstract', type: 'textarea' },
      { key: 'image', label: 'Image', type: 'image', folder: 'content' },
      { key: 'bibtex', label: 'BibTeX (leave empty to generate)', type: 'bibtex' },
    ],
  },
  announcements: {
    label: 'News',
    singular: 'news item',
    titleKey: 'title',
    dateKey: 'date',
    blank: { title: '', date: today(), category: 'general' },
    fields: [
      text('title', 'Title'),
      date('date', 'Date'),
      select('category', 'Category', ['paper', 'grant', 'award', 'talk', 'media', 'general']),
      select('datePrecision', 'Show date as', ['day', 'month', 'year']),
      { key: 'pinned', label: 'Pinned', type: 'checkbox' },
      { key: 'featured', label: 'Featured', type: 'checkbox' },
      { key: 'image', label: 'Image', type: 'image', folder: 'content' },
      text('emoji', 'Emoji'),
      { key: 'excerpt', label: 'Excerpt', type: 'textarea' },
      { key: 'people', label: 'People (ids)', type: 'list' },
    ],
  },
  people: {
    label: 'People',
    singular: 'person',
    titleKey: 'name',
    blank: { name: '', role: 'phd' },
    fields: [
      text('name', 'Name'),
      select('role', 'Role', ['pi', 'postdoc', 'phd', 'masters', 'undergrad', 'research-assistant', 'visiting', 'alumni']),
      text('title', 'Title'),
      { key: 'photo', label: 'Photo', type: 'image', folder: 'content' },
      text('email', 'Email'),
      ...SOCIALS.map((s) => text(`socials.${s}`, `${s[0].toUpperCase()}${s.slice(1)} URL`)),
      { key: 'researchInterests', label: 'Research interests', type: 'list' },
      date('startDate', 'Start date'),
      date('endDate', 'End date'),
      { key: 'sortOrder', label: 'Sort order', type: 'number' },
      { key: 'active', label: 'Active', type: 'checkbox', default: true },
    ],
  },
  projects: {
    label: 'Projects',
    singular: 'project',
    titleKey: 'title',
    dateKey: 'startDate',
    blank: { title: '', type: 'software', status: 'active' },
    fields: [
      text('title', 'Title'),
      select('type', 'Type', ['software', 'dataset', 'benchmark', 'hardware', 'other']),
      select('status', 'Status', ['active', 'completed', 'upcoming']),
      { key: 'image', label: 'Image', type: 'image', folder: 'content' },
      text('url', 'URL'),
      text('repoUrl', 'Repository URL'),
      text('paperUrl', 'Paper URL'),
      { key: 'team', label: 'Team (people ids)', type: 'list' },
      { key: 'tags', label: 'Tags', type: 'list' },
      date('startDate', 'Start date'),
      date('endDate', 'End date'),
      { key: 'excerpt', label: 'Excerpt', type: 'textarea' },
    ],
  },
  talks: {
    label: 'Talks',
    singular: 'talk',
    titleKey: 'title',
    dateKey: 'sortDate',
    blank: { title: '', event: '', date: '', type: 'Invited Talk' },
    fields: [
      text('title', 'Title'),
      text('event', 'Event'),
      { key: 'date', label: 'Date (as shown)', type: 'text', hint: 'Free text, e.g. "March 2025".' },
      date('sortDate', 'Date (for sorting)'),
      text('location', 'Location'),
      select('type', 'Type', ['Conference Talk', 'Invited Talk', 'Seminar', 'Tutorial', 'Workshop', 'Keynote', 'Panel']),
      text('slidesUrl', 'Slides URL'),
      text('videoUrl', 'Video URL'),
    ],
  },
  positions: {
    label: 'Positions',
    singular: 'position',
    titleKey: 'title',
    dateKey: 'deadline',
    blank: { title: '', type: 'phd', status: 'open' },
    fields: [
      text('title', 'Title'),
      select('type', 'Type', ['phd', 'postdoc', 'masters', 'undergrad', 'research-assistant', 'visiting', 'other']),
      select('status', 'Status', ['open', 'closed']),
      date('deadline', 'Deadline'),
      { key: 'excerpt', label: 'Excerpt', type: 'textarea' },
      { key: 'tags', label: 'Tags', type: 'list' },
      text('contact', 'Contact'),
      { key: 'sortOrder', label: 'Sort order', type: 'number' },
    ],
  },
};
