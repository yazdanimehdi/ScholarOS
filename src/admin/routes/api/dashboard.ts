import { listEntries, readConfig } from '../../../lib/admin/content';
import { json, route } from '../../../lib/admin/http';
import { FEEDS_JSON, collectionDir, configPath } from '../../../lib/admin/paths';

export const prerender = false;

export const GET = route(async (_ctx, store) => {
  const [posts, publications, feeds, feedsJson, cvUpdated, lastSync] = await Promise.all([
    listEntries(store, 'posts'),
    store.list(collectionDir('publications')),
    readConfig(store, 'feeds'),
    store.read(FEEDS_JSON),
    store.lastModified(configPath('cv')),
    store.lastModified(FEEDS_JSON),
  ]);
  let feedItems: unknown = [];
  let feedsError: string | undefined;
  try {
    feedItems = feedsJson ? JSON.parse(feedsJson.content) : [];
  } catch {
    feedsError = `${FEEDS_JSON} is not valid JSON`;
  }
  return json({
    posts,
    feedItems,
    ...(feedsError ? { feedsError } : {}),
    feeds: { data: feeds.data, version: feeds.version },
    publications: publications.filter((f) => /\.mdx?$/.test(f.path)).length,
    cvUpdated,
    lastSync,
  });
});
