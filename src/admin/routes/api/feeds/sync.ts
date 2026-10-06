import { readConfig } from '../../../../lib/admin/content';
import { HttpError, commitChanges, json, route } from '../../../../lib/admin/http';
import { FEEDS_JSON } from '../../../../lib/admin/paths';
import { syncFeeds, type FeedsConfig } from '../../../../lib/feeds';

export const prerender = false;

/** "Check now": fetch every feed, commit src/data/feeds.json when it changed. */
export const POST = route(async (_ctx, store) => {
  const [config, current] = await Promise.all([readConfig(store, 'feeds'), store.read(FEEDS_JSON)]);
  let existing = [];
  try {
    existing = current ? JSON.parse(current.content) : [];
  } catch {
    // A corrupt file counts as empty: the sync below rewrites it with valid JSON.
  }
  let result;
  try {
    result = await syncFeeds(config.data as FeedsConfig, existing);
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : String(e));
  }
  const content = JSON.stringify(result.items, null, 2) + '\n';
  const summary = { count: result.items.length, failed: result.failed };
  if (current?.content === content) return json({ changed: false, ...summary });
  const commit = await commitChanges(store, [{ path: FEEDS_JSON, content }], 'Sync feeds', {
    [FEEDS_JSON]: current?.version ?? null,
  });
  return json({ changed: true, ...summary, ...commit });
});
