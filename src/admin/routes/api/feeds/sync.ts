import { json, route } from '../../../../lib/admin/http';
import { syncFeedsFile } from '../../../../lib/admin/jobs';

export const prerender = false;

/** "Check now": fetch every feed, commit src/data/feeds.json when it changed. */
export const POST = route(async (_ctx, store) => {
  const { commit, ...summary } = await syncFeedsFile(store);
  return json({ ...summary, ...commit });
});
