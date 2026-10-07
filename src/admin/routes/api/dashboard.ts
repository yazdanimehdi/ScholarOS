import { listEntries, readConfig } from '../../../lib/admin/content';
import { json, route } from '../../../lib/admin/http';
import { BACKUP_JSON, FEEDS_JSON, collectionDir, configPath } from '../../../lib/admin/paths';
import { getMode } from '../../../lib/mode';

export const prerender = false;

const parseJson = (text: string | undefined) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

export const GET = route(async (_ctx, store) => {
  const [posts, publications, feeds, feedsJson, cvUpdated, lastSync, backup] = await Promise.all([
    listEntries(store, 'posts'),
    store.list(collectionDir('publications')),
    readConfig(store, 'feeds'),
    store.read(FEEDS_JSON),
    store.lastModified(configPath('cv')),
    store.lastModified(FEEDS_JSON),
    store.read(BACKUP_JSON),
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
    mode: getMode(),
    backup: parseJson(backup?.content),
  });
});
