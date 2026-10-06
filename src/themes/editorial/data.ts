import { getCollection } from 'astro:content';
import { getHomepageSections, getSiteConfig, getSiteName, loadYamlConfig } from '../../lib/config';
import {
  homeBlocks,
  isOwner,
  mergeWriting,
  normalizeAreas,
  shortTitle,
  topicFilters,
  topicOf,
  type ResearchConfig,
  type WritingItem,
} from '../../lib/editorial';
import { renderMarkdown } from '../../lib/markdown';
import { readingTime } from '../../lib/utils';

export function loadResearchConfig(): ResearchConfig {
  try {
    return loadYamlConfig<ResearchConfig>('research.yml') ?? {};
  } catch {
    return {};
  }
}

/** Entries for `ids`, in order. Unknown ids are reported and skipped so a typo can't break the build. */
export function pick<T>(ids: string[], byId: Map<string, T>, where: string): T[] {
  return ids.flatMap((id) => {
    const hit = byId.get(id);
    // eslint-disable-next-line no-console
    if (!hit) console.warn(`[editorial] ${where}: unknown publication id "${id}"`);
    return hit ? [hit] : [];
  });
}

/** Site posts (non-draft) and feed items, newest first. External items never carry content. */
export async function writingItems(): Promise<WritingItem[]> {
  const posts = (await getCollection('posts')).filter((p) => !p.data.draft);
  const feeds = await getCollection('feeds');
  return mergeWriting([
    ...posts.map((p) => ({
      kind: 'site' as const,
      title: p.data.title,
      href: `/blog/${p.id}`,
      date: p.data.date,
      excerpt: p.data.excerpt,
      minutes: readingTime(p.body ?? ''),
      tag: p.data.tags?.[0],
    })),
    ...feeds.map((f) => ({
      kind: 'external' as const,
      title: f.data.title,
      href: f.data.link,
      date: new Date(f.data.date),
      excerpt: f.data.excerpt,
      source: f.data.source,
    })),
  ]);
}

export async function loadHome() {
  const config = getSiteConfig();
  const ed = config.editorial ?? {};
  const research = loadResearchConfig();
  const areas = normalizeAreas(research.areas);
  const pubs = await getCollection('publications');
  const byId = new Map(pubs.map((p) => [p.id, p]));
  const sections = getHomepageSections();
  const affiliations = (ed.affiliations ?? []).filter((a) => a?.trim());

  return {
    config,
    name: getSiteName(),
    blocks: homeBlocks(sections, { affiliations: affiliations.length > 0, research: areas.length > 0 }),
    showBio: sections.includes('about'),
    showNews: sections.includes('news'),
    showWriting: sections.includes('blog'),
    bioHtml: await renderMarkdown(ed.bio),
    affiliations,
    researchHeadline: research.headline,
    areas: areas.map((a) => ({
      ...a,
      papers: pick(a.publications, byId, `research.yml area "${a.id}"`).map((p) => shortTitle(p.data.title)),
    })),
    selected: [...pubs]
      .sort((a, b) => Number(b.data.featured) - Number(a.data.featured) || b.data.year - a.data.year)
      .slice(0, 4),
    pubCount: pubs.length,
    news: (await getCollection('announcements'))
      .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
      .slice(0, 5),
    writing: (await writingItems()).slice(0, 3),
  };
}

export type HomeData = Awaited<ReturnType<typeof loadHome>>;

export async function loadResearch() {
  const config = getSiteConfig();
  const research = loadResearchConfig();
  const pubs = await getCollection('publications');
  const byId = new Map(pubs.map((p) => [p.id, p]));
  const areas = await Promise.all(
    normalizeAreas(research.areas).map(async (a) => ({
      ...a,
      bodyHtml: await renderMarkdown(a.body || a.description),
      papers: pick(a.publications, byId, `research.yml area "${a.id}"`),
    })),
  );
  const software = (await getCollection('projects'))
    .filter((p) => p.data.type === 'software')
    .map((p) => ({
      name: p.data.title,
      href: p.data.repoUrl ?? p.data.url,
      description: p.data.excerpt,
      tech: (p.data.tags ?? []).join(' · '),
    }));
  return { config, headline: research.headline, description: research.description, areas, software };
}

export type ResearchData = Awaited<ReturnType<typeof loadResearch>>;

export async function loadPublications() {
  const config = getSiteConfig();
  const areas = normalizeAreas(loadResearchConfig().areas);
  const areaIds = new Set(areas.map((a) => a.id));
  const items = (await getCollection('publications'))
    .sort((a, b) => b.data.year - a.data.year || a.data.title.localeCompare(b.data.title))
    .map((pub) => ({
      pub,
      topic: topicOf(pub.data.topic, areaIds),
      first: isOwner(pub.data.authors[0] ?? '', config.author),
    }));
  const years = [...new Set(items.map((i) => i.pub.data.year))];
  return {
    config,
    groups: years.map((year) => ({ year, items: items.filter((i) => i.pub.data.year === year) })),
    filters: topicFilters(
      items.map((i) => i.topic),
      areas,
    ),
    total: items.length,
    firstCount: items.filter((i) => i.first).length,
  };
}

export type PublicationsData = Awaited<ReturnType<typeof loadPublications>>;
