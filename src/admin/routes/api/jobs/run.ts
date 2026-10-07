import { json, postgresOnly, route } from '../../../../lib/admin/http';
import { dailySteps, runJobs } from '../../../../lib/admin/jobs';

export const prerender = false;

/** The dashboard's "Run now": the daily jobs, as the signed-in user. */
export const POST = route(async (_ctx, store) => {
  const pg = postgresOnly(store);
  return json(await runJobs(pg, dailySteps(pg)));
});
