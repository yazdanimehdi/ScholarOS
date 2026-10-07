import { timingSafeEqual } from 'node:crypto';
import type { APIRoute } from 'astro';
import { BACKUP_BRANCH, backupToGit, recordBackup, type BackupResult } from '../../../../lib/admin/backup';
import { getStore } from '../../../../lib/admin/get-store';
import { GitHubStore, githubConfig } from '../../../../lib/admin/github-store';
import { json } from '../../../../lib/admin/http';
import { getSql } from '../../../../lib/db';
import { getMode } from '../../../../lib/mode';

export const prerender = false;

const BOT = { name: 'ScholarOS backup', email: 'scholaros-backup@users.noreply.github.com' };

/** Never open: no CRON_SECRET means every call is refused. */
function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const got = Buffer.from(header);
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Vercel Cron (vercel.json), daily at 03:00 UTC: snapshot the database onto the content-backup branch. */
export const GET: APIRoute = async ({ request }) => {
  if (!authorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (getMode() !== 'postgres') return json({ skipped: 'not in Postgres mode' });
  let result: BackupResult;
  if (!process.env.GITHUB_TOKEN) {
    result = { at: new Date().toISOString(), ok: true, skipped: 'no token' };
  } else {
    try {
      const gh = new GitHubStore({ ...githubConfig(process.env), branch: BACKUP_BRANCH }, BOT);
      result = await backupToGit(getSql(), gh);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[cron/backup]', e);
      result = { at: new Date().toISOString(), ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  await recordBackup(getStore(BOT), result);
  return json(result, result.ok ? 200 : 502);
};
