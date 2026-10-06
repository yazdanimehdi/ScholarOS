import { bareDoi } from './editorial';

export interface BibSource {
  title: string;
  authors: string[];
  venue: string;
  year: number;
  type: string;
  doi?: string;
  bibtex?: string;
}

/** ASCII lower-case letters and digits only: "García" → "garcia". */
function keyPart(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function lastName(author: string): string {
  const name = author.trim();
  if (name.includes(',')) return name.split(',')[0]; // "Smith, Jane"
  const parts = name.split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

/** First author's last name + year + first title word, e.g. smith2024adaptive. */
export function bibtexKey(p: Pick<BibSource, 'title' | 'authors' | 'year'>): string {
  const author = keyPart(lastName(p.authors[0] ?? '')) || 'anon';
  const word = p.title.split(/\s+/).map(keyPart).find(Boolean) ?? '';
  return `${author}${p.year}${word}`;
}

/** The publication's own `bibtex` when present, otherwise a generated entry. */
export function bibtexFor(p: BibSource): string {
  if (p.bibtex?.trim()) return p.bibtex.trim();
  const inProceedings = p.type === 'conference' || p.type === 'workshop';
  const fields: [string, string][] = [
    ['title', p.title],
    ['author', p.authors.join(' and ')],
    [inProceedings ? 'booktitle' : 'journal', p.venue],
    ['year', String(p.year)],
  ];
  if (p.doi) fields.push(['doi', bareDoi(p.doi)]);
  const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n');
  return `@${inProceedings ? 'inproceedings' : 'article'}{${bibtexKey(p)},\n${body}\n}`;
}
