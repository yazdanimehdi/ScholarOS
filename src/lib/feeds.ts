import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import type { FeedItem } from './types';

export interface FeedSource {
  name: string;
  url: string;
  author?: string | null;
  tags?: string[];
}

export interface FeedsConfig {
  mediumUrl?: string;
  feeds?: FeedSource[] | null;
  maxItemsPerFeed?: number;
  hidden?: string[];
}

export type FetchText = (url: string) => Promise<string>;

export interface SyncResult {
  items: FeedItem[];
  ok: number;
  failed: { source: string; error: string }[];
}

const fetchText: FetchText = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ScholarOS feed sync' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

/** Kept byte-for-byte from the original script: item ids (and `hidden` lists) depend on it. */
function idSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function shortHash(str: string): string {
  return createHash('sha256').update(str).digest('hex').slice(0, 8);
}

function normalizeLink(link: string): string {
  return link.replace(/\/+$/, '');
}

function formatDate(dateStr: string | undefined): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  return (isNaN(d.getTime()) ? new Date() : d).toISOString().split('T')[0];
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(str: string, maxLen = 300): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

function toItems(source: FeedSource, items: Parser.Item[], maxItems: number): FeedItem[] {
  return items
    .slice(0, maxItems)
    .filter((item) => item.title && item.link)
    .map((item) => {
      const link = normalizeLink(item.link!);
      const result: FeedItem = {
        id: `feed-${idSlug(source.name)}-${shortHash(link)}`,
        title: item.title!.trim(),
        link,
        date: formatDate(item.pubDate || item.isoDate),
        source: source.name,
      };
      const excerpt = truncate(stripHtml(item.contentSnippet || item.content || item.summary || ''));
      if (excerpt) result.excerpt = excerpt;
      if (source.author) result.author = source.author;
      if (source.tags?.length) result.tags = source.tags;
      return result;
    });
}

function deduplicateByLink(items: FeedItem[]): FeedItem[] {
  const seen = new Map<string, FeedItem>();
  for (const item of items) {
    const key = normalizeLink(item.link);
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

/** Fresh items update existing ones with the same link; existing items not in the feed are kept. */
function mergeWithExisting(fresh: FeedItem[], existing: FeedItem[]): FeedItem[] {
  const existingByLink = new Map(existing.map((item) => [normalizeLink(item.link), item]));
  const merged = new Map<string, FeedItem>();
  for (const item of fresh) {
    const key = normalizeLink(item.link);
    merged.set(key, { ...existingByLink.get(key), ...item });
  }
  for (const item of existing) {
    const key = normalizeLink(item.link);
    if (!merged.has(key)) merged.set(key, item);
  }
  return [...merged.values()];
}

/** Configured feeds plus the Medium feed when `mediumUrl` is set. */
export function feedSources(config: FeedsConfig): FeedSource[] {
  const sources = [...(config.feeds ?? [])];
  if (config.mediumUrl) sources.push({ name: 'Medium', url: config.mediumUrl, author: null, tags: ['medium'] });
  return sources;
}

/** Fetches every feed and returns the merged item list, newest first. Throws when nothing could be fetched. */
export async function syncFeeds(
  config: FeedsConfig,
  existing: FeedItem[],
  fetch: FetchText = fetchText,
): Promise<SyncResult> {
  const sources = feedSources(config);
  if (sources.length === 0) throw new Error('No feeds configured in config/feeds.yml');
  const parser = new Parser();
  const fresh: FeedItem[] = [];
  const failed: SyncResult['failed'] = [];
  for (const source of sources) {
    try {
      const feed = await parser.parseString(await fetch(source.url));
      fresh.push(...toItems(source, feed.items ?? [], config.maxItemsPerFeed || 20));
    } catch (err) {
      failed.push({ source: source.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (failed.length === sources.length) {
    throw new Error(`All ${sources.length} feed(s) failed: ${failed.map((f) => `${f.source}: ${f.error}`).join('; ')}`);
  }
  const items = mergeWithExisting(deduplicateByLink(fresh), existing).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return { items, ok: sources.length - failed.length, failed };
}
