#!/usr/bin/env tsx
/**
 * Sync RSS/Atom feeds: reads config/feeds.yml, writes src/data/feeds.json.
 * The logic lives in src/lib/feeds.ts (shared with the admin's "Check now").
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { syncFeeds, type FeedsConfig } from '../src/lib/feeds';
import type { FeedItem } from '../src/lib/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'feeds.yml');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'feeds.json');

const config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) as FeedsConfig;
const existing: FeedItem[] = fs.existsSync(OUTPUT_PATH) ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8')) : [];

try {
  const { items, ok, failed } = await syncFeeds(config, existing);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(items, null, 2) + '\n');
  const net = items.length - existing.length;
  console.log(`Feeds fetched: ${ok}/${ok + failed.length}`);
  console.log(`Total items: ${items.length}`);
  console.log(`Net change: ${net >= 0 ? '+' : ''}${net}`);
  for (const f of failed) console.warn(`WARNING: ${f.source}: ${f.error}`);
} catch (err) {
  // Nothing fetched: keep the existing data.
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
