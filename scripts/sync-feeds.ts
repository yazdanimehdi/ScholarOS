#!/usr/bin/env tsx
/**
 * Sync RSS/Atom feeds from configured sources.
 *
 * Reads feed URLs from config/feeds.yml, fetches each feed,
 * and writes src/data/feeds.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import Parser from 'rss-parser';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'feeds.yml');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'feeds.json');

interface FeedSource {
  name: string;
  url: string;
  author: string | null;
  tags?: string[];
}

interface FeedsConfig {
  mediumUrl?: string;
  feeds: FeedSource[];
  syncInterval: string;
  maxItemsPerFeed: number;
}

interface FeedItem {
  id: string;
  title: string;
  link: string;
  date: string;
  source: string;
  excerpt?: string;
  author?: string;
  tags?: string[];
}

function loadConfig(): FeedsConfig {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return yaml.load(raw) as FeedsConfig;
}

function loadExisting(): FeedItem[] {
  if (!fs.existsSync(OUTPUT_PATH)) return [];
  const raw = fs.readFileSync(OUTPUT_PATH, 'utf-8');
  return JSON.parse(raw) as FeedItem[];
}

function slugify(str: string): string {
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

function generateId(source: string, link: string): string {
  return `feed-${slugify(source)}-${shortHash(normalizeLink(link))}`;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
  return d.toISOString().split('T')[0];
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

function truncate(str: string, maxLen: number = 300): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

async function fetchFeed(source: FeedSource, maxItems: number): Promise<FeedItem[]> {
  const parser = new Parser();
  const feed = await parser.parseURL(source.url);
  const items = (feed.items || []).slice(0, maxItems);

  return items
    .filter((item) => item.title && item.link)
    .map((item) => {
      const link = normalizeLink(item.link!);
      const result: FeedItem = {
        id: generateId(source.name, link),
        title: item.title!.trim(),
        link,
        date: formatDate(item.pubDate || item.isoDate),
        source: source.name,
      };

      const rawExcerpt = item.contentSnippet || item.content || item.summary || '';
      const excerpt = truncate(stripHtml(rawExcerpt));
      if (excerpt) result.excerpt = excerpt;

      if (source.author) result.author = source.author;
      if (source.tags && source.tags.length > 0) result.tags = source.tags;

      return result;
    });
}

function deduplicateByLink(items: FeedItem[]): FeedItem[] {
  const seen = new Map<string, FeedItem>();
  for (const item of items) {
    const normalized = normalizeLink(item.link);
    if (!seen.has(normalized)) {
      seen.set(normalized, item);
    }
  }
  return Array.from(seen.values());
}

function mergeWithExisting(newItems: FeedItem[], existing: FeedItem[]): FeedItem[] {
  const existingByLink = new Map(existing.map((item) => [normalizeLink(item.link), item]));

  const merged = new Map<string, FeedItem>();

  // Add new items, updating existing entries
  for (const item of newItems) {
    const key = normalizeLink(item.link);
    const existingItem = existingByLink.get(key);
    if (existingItem) {
      // Update with new data but keep any existing fields not in new
      merged.set(key, { ...existingItem, ...item });
    } else {
      merged.set(key, item);
    }
  }

  // Keep existing items not in new set
  for (const item of existing) {
    const key = normalizeLink(item.link);
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values());
}

function sortByDateDesc(items: FeedItem[]): FeedItem[] {
  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function main() {
  const config = loadConfig();
  const sources = [...(config.feeds || [])];
  const maxItems = config.maxItemsPerFeed || 20;

  // Auto-inject Medium feed if mediumUrl is configured
  if (config.mediumUrl) {
    sources.push({
      name: 'Medium',
      url: config.mediumUrl,
      author: null,
      tags: ['medium'],
    });
  }

  if (sources.length === 0) {
    console.log('No feeds configured in config/feeds.yml');
    process.exit(1);
  }

  const existing = loadExisting();
  let allItems: FeedItem[] = [];
  let feedSuccess = 0;
  let feedFail = 0;

  for (const source of sources) {
    console.log(`\nFetching: ${source.name} (${source.url})`);
    try {
      const items = await fetchFeed(source, maxItems);
      allItems.push(...items);
      feedSuccess++;
      console.log(`  OK: ${items.length} items`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR: ${message}`);
      feedFail++;
    }
  }

  // If ALL feeds failed, exit without writing (preserve existing data)
  if (feedSuccess === 0) {
    console.error(`\nERROR: All ${feedFail} feed(s) failed. Preserving existing data.`);
    process.exit(1);
  }

  // Deduplicate by link
  allItems = deduplicateByLink(allItems);

  // Merge with existing
  const merged = mergeWithExisting(allItems, existing);

  // Sort by date
  const sorted = sortByDateDesc(merged);

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2) + '\n');

  const added = sorted.length - existing.length;
  console.log(`\nSummary:`);
  console.log(`  Feeds fetched: ${feedSuccess}/${sources.length}`);
  console.log(`  Total items: ${sorted.length}`);
  console.log(`  Net change: ${added >= 0 ? '+' : ''}${added}`);
  if (feedFail > 0) {
    console.log(`  Warnings: ${feedFail} feed(s) failed`);
  }
}

main();
