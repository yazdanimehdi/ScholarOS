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
