import { timingSafeEqual } from 'node:crypto';
import type { APIRoute } from 'astro';
import { getStore } from '../../../../lib/admin/get-store';
import { json, postgresOnly } from '../../../../lib/admin/http';
import { dailySteps, runJobs } from '../../../../lib/admin/jobs';
import { getMode } from '../../../../lib/mode';

export const prerender = false;

const BOT = { name: 'ScholarOS jobs', email: 'scholaros-jobs@users.noreply.github.com' };

/** Never open: no CRON_SECRET means every call is refused. */
function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const got = Buffer.from(header);
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Vercel Cron (vercel.json), daily at 03:00 UTC: sync feeds, release scheduled posts, back up to git. */
export const GET: APIRoute = async ({ request }) => {
  if (!authorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (getMode() !== 'postgres') return json({ skipped: 'not in Postgres mode' });
  const store = postgresOnly(getStore(BOT));
  const results = await runJobs(store, dailySteps(store));
  return json(results, Object.values(results).every((r) => r.ok) ? 200 : 502);
};
