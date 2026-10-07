import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { cvEntryView, cvSections, sectionTitle, type CvEntryView } from '../cv';
import { isOwner } from '../editorial';
import type { CvData } from '../types';

export type PageSize = 'LETTER' | 'A4';

export interface CvPublication {
  id: string;
  data: { title: string; authors: string[]; venue: string; year: number };
}

const MUTED = '#5c5c5c';

const contactLine = (cv: CvData) =>
  [cv.email, cv.phone, cv.location, cv.website, ...(cv.socialNetworks ?? []).map((s) => `${s.network}: ${s.username}`)]
    .filter(Boolean)
    .join('  ·  ');

function entry(e: CvEntryView): Content {
  return {
    stack: [
      {
        columns: [
          { text: e.title, style: 'entryTitle', width: '*' },
          { text: e.when ?? '', width: 'auto', alignment: 'right', color: MUTED },
        ],
        columnGap: 8,
      },
      ...(e.org ? [{ text: e.org, color: MUTED }] : []),
      ...(e.points.length ? [{ ul: e.points, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
    ],
    margin: [0, 0, 0, 6],
    unbreakable: true,
  };
}

function publication(p: CvPublication, owner: string): Content {
  const authors = p.data.authors.map((a) => a.replace(/\*+/g, '').trim());
  const venue = p.data.venue.includes(String(p.data.year)) ? p.data.venue : `${p.data.venue} · ${p.data.year}`;
  return {
    stack: [
      { text: p.data.title, style: 'entryTitle' },
      { text: authors.flatMap((a, i) => [...(i ? [', '] : []), { text: a, bold: isOwner(a, owner) }]), color: MUTED },
      { text: venue, font: 'Serif', italics: true, color: MUTED },
    ],
    margin: [0, 0, 0, 6],
    unbreakable: true,
  };
}

const row = (key: string, label: string, body: Content[]): Content => ({
  id: `section-${key}`,
  columns: [
    { width: '25%', text: label.toUpperCase(), style: 'label' },
    { width: '*', stack: body },
  ],
  columnGap: 12,
  margin: [0, 12, 0, 0],
});

/**
 * The CV as a pdfmake document, mirroring the editorial CV page: header, then one "label | entries" row per visible
 * section in cv.yml order. Publications come from the collection, where the `publications` key is (else after
 * experience, else last); with an empty collection the YAML section renders as written.
 */
export function buildCvDocument(
  cv: CvData,
  publications: CvPublication[],
  site: { author: string },
  options: { pageSize?: PageSize } = {},
): TDocumentDefinitions {
  const written = cvSections(cv);
  const pubs = [...publications].sort((a, b) => a.id.localeCompare(b.id)).sort((a, b) => b.data.year - a.data.year);
  const pubRow = row(
    'publications',
    'Publications',
    pubs.map((p) => publication(p, site.author)),
  );
  const rows = written.flatMap(([key, entries]) => {
    if (key === 'publications' && pubs.length) return [pubRow];
    const body = entries.map(cvEntryView).filter((e): e is CvEntryView => e !== null);
    return body.length ? [row(key, sectionTitle(key), body.map(entry))] : [];
  });
  if (pubs.length && !written.some(([key]) => key === 'publications')) {
    const experience = rows.findIndex((r) => (r as { id?: string }).id === 'section-experience');
    rows.splice(experience === -1 ? rows.length : experience + 1, 0, pubRow);
  }
  return {
    pageSize: options.pageSize ?? 'LETTER',
    pageMargins: [54, 54, 54, 54],
    info: { title: `${cv.name} — Curriculum Vitae`, author: cv.name },
    defaultStyle: { font: 'Sans', fontSize: 9.5, lineHeight: 1.2, color: '#1a1a1a' },
    styles: {
      name: { font: 'Serif', fontSize: 22, bold: true },
      label: { font: 'SansMedium', fontSize: 8, color: MUTED, characterSpacing: 0.8 },
      entryTitle: { font: 'Serif', fontSize: 10.5, bold: true },
    },
    content: [{ text: cv.name, style: 'name' }, { text: contactLine(cv), color: MUTED, margin: [0, 4, 0, 6] }, ...rows],
  };
}
