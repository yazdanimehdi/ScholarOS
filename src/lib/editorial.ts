import { slugify } from './utils';
import type { HomepageSectionId, SocialLinks } from './types';

/** "Prof. Jane Smith" → "Jane Smith". Used to find the site owner in author lists. */
export function stripHonorific(name: string): string {
  return name
    .trim()
    .replace(/^(prof|dr)\.?\s+/i, '')
    .trim();
}

export function isOwner(author: string, siteAuthor: string): boolean {
  return stripHonorific(author) === stripHonorific(siteAuthor);
}

/** "https://doi.org/10.1/x" → "10.1/x". */
export function bareDoi(doi: string): string {
  return doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
}

/** "arXiv:2410.12459" or "https://arxiv.org/abs/2410.12459" → "2410.12459". */
export function bareArxiv(id: string): string {
  return id
    .trim()
    .replace(/^arxiv:/i, '')
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//i, '');
}

/** Paper link priority: url → doi → arXiv. */
export function paperLink(p: { url?: string; doi?: string; arxiv?: string }): string | undefined {
  if (p.url) return p.url;
  if (p.doi) return `https://doi.org/${bareDoi(p.doi)}`;
  if (p.arxiv) return `https://arxiv.org/abs/${bareArxiv(p.arxiv)}`;
  return undefined;
}

/** "HELM: Hierarchical Encoding…" → "HELM"; titles without a usable colon prefix stay whole. */
export function shortTitle(title: string): string {
  return title.split(':')[0].trim() || title.trim();
}

// ── Research areas ────────────────────────────────────────────────

export interface ResearchAreaInput {
  id?: string;
  label?: string;
  title: string;
  description: string;
  body?: string;
  result?: string;
  figure?: string;
  caption?: string;
  publications?: string[];
  tags?: string[];
}

export interface ResearchConfig {
  headline?: string;
  description?: string;
  areas?: ResearchAreaInput[];
}

export interface ResearchArea extends ResearchAreaInput {
  id: string;
  label: string;
  numeral: string;
  publications: string[];
}

const ROMAN: [number, string][] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

export function toRoman(n: number): string {
  let out = '';
  for (const [value, numeral] of ROMAN) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

/** Ids already used by the Research page itself; areas never take them. */
const RESERVED_IDS = ['software', 'main-content', 'all', 'other'];

/** Fills in id (slug of title, unique on the page), label and numeral ("i.", "ii.", …). */
export function normalizeAreas(areas: ResearchAreaInput[] = []): ResearchArea[] {
  const seen = new Set(RESERVED_IDS);
  return areas.map((area, i) => {
    const base = slugify(area.id ?? '') || slugify(area.title) || `area-${i + 1}`;
    let id = base;
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
    seen.add(id);
    return {
      ...area,
      id,
      label: area.label?.trim() || area.title,
      numeral: `${toRoman(i + 1)}.`,
      publications: area.publications ?? [],
    };
  });
}

/** Publication topic → research-area id, or 'other' when it matches none. */
export function topicOf(topic: string | undefined, areaIds: ReadonlySet<string>): string {
  const id = slugify(topic ?? '');
  return id && areaIds.has(id) ? id : 'other';
}

export interface TopicFilter {
  id: string;
  label: string;
  count: number;
}

/** "All", then every area that has papers, then "Other" if any paper matched no area. */
export function topicFilters(topics: string[], areas: { id: string; label: string }[]): TopicFilter[] {
  const count = (id: string) => topics.filter((t) => t === id).length;
  return [
    { id: 'all', label: 'All', count: topics.length },
    ...areas.map((a) => ({ id: a.id, label: a.label, count: count(a.id) })).filter((f) => f.count > 0),
    ...(count('other') > 0 ? [{ id: 'other', label: 'Other', count: count('other') }] : []),
  ];
}

// ── Writing (site posts + external feeds) ─────────────────────────

export interface WritingItem {
  kind: 'site' | 'external';
  title: string;
  href: string;
  date: Date;
  excerpt?: string;
  /** External only: feed source name, e.g. "Medium". */
  source?: string;
  /** Site only: reading time. */
  minutes?: number;
  /** Site only: first tag. */
  tag?: string;
}

const time = (d: Date) => (Number.isFinite(d.getTime()) ? d.getTime() : -Infinity);

/** Newest first (ties by href); items with unparseable dates go last. */
export function mergeWriting(items: WritingItem[]): WritingItem[] {
  return [...items].sort((a, b) => time(b.date) - time(a.date) || a.href.localeCompare(b.href));
}

/** Label for the third Writing tab: the one shared feed source ("Medium"), else "Elsewhere". */
export function elsewhereLabel(sources: string[]): string {
  const unique = [...new Set(sources.map((s) => s.trim()).filter(Boolean))];
  return unique.length === 1 ? unique[0] : 'Elsewhere';
}

// ── Home page ─────────────────────────────────────────────────────

const SOCIAL_LABELS: [keyof SocialLinks, string][] = [
  ['scholar', 'Google Scholar'],
  ['github', 'GitHub'],
  ['linkedin', 'LinkedIn'],
  ['orcid', 'ORCID'],
  ['twitter', 'X'],
  ['bluesky', 'Bluesky'],
  ['mastodon', 'Mastodon'],
  ['website', 'Website'],
];

/** Profile links in a fixed order; email is rendered separately as a mailto link. */
export function socialLinks(socials: SocialLinks = {}): { label: string; href: string }[] {
  return SOCIAL_LABELS.flatMap(([key, label]) => {
    const href = socials[key]?.trim();
    return href ? [{ label, href }] : [];
  });
}

export type HomeBlock = 'hero' | 'affiliations' | 'research' | 'publications' | 'updates';

/**
 * Editorial home block order from homepageSections. The hero shows when `hero` or `about` is on
 * (about = the bio inside it); affiliations and research follow it when configured; news + blog
 * share one "updates" row placed where the first of them is.
 */
export function homeBlocks(
  sections: HomepageSectionId[],
  has: { affiliations: boolean; research: boolean },
): HomeBlock[] {
  const blocks: HomeBlock[] = [];
  if (sections.includes('hero') || sections.includes('about')) blocks.push('hero');
  if (has.affiliations) blocks.push('affiliations');
  if (has.research) blocks.push('research');
  for (const id of sections) {
    if (id === 'publications') blocks.push('publications');
    if ((id === 'news' || id === 'blog') && !blocks.includes('updates')) blocks.push('updates');
  }
  return blocks;
}

/** JSON for <script type="application/ld+json">, with "<" escaped so content can't close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
