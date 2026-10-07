import { getSql } from '../db';
import { feedSources, syncFeeds, type FeedsConfig } from '../feeds';
import type { FeedItem } from '../types';
import { becameDue } from '../utils';
import { BACKUP_BRANCH, backupToGit } from './backup';
import { listEntries, readConfig } from './content';
import { GitHubStore, githubConfig } from './github-store';
import { HttpError, commitChanges } from './http';
import { FEEDS_JSON, JOBS_JSON } from './paths';
import type { PostgresStore } from './postgres-store';
import type { CommitResult, ContentStore } from './store';

export const JOBS = ['feeds', 'scheduled', 'backup'] as const;
export type JobName = (typeof JOBS)[number];
export interface StepResult {
  ok: boolean;
  at: string;
  detail?: string;
  url?: string;
}
export type JobsRecord = Partial<Record<JobName, StepResult>>;
export type Steps = Record<JobName, (previous: JobsRecord, now: Date) => Promise<Pick<StepResult, 'detail' | 'url'>>>;

const DAY = 24 * 60 * 60 * 1000;
const BACKUP_AUTHOR = { name: 'ScholarOS backup', email: 'scholaros-backup@users.noreply.github.com' };

export function parseJobs(text: string | undefined): JobsRecord {
  try {
    return text ? (JSON.parse(text) as JobsRecord) : {};
  } catch {
    return {};
  }
}

/** Runs every step in order; a failing step is recorded and the next one still runs. Results go to jobs.json. */
export async function runJobs(store: ContentStore, steps: Steps, now = new Date()): Promise<JobsRecord> {
  const file = await store.read(JOBS_JSON);
  const previous = parseJobs(file?.content);
  const at = now.toISOString();
  const results: JobsRecord = {};
  for (const name of JOBS) {
    try {
      results[name] = { ok: true, at, ...(await steps[name](previous, now)) };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[jobs] ${name}`, e);
      results[name] = { ok: false, at, detail: e instanceof Error ? e.message : String(e) };
    }
  }
  // ponytail: the cron and "Run now" racing makes the second write conflict (409); the next run records again.
  await store.commit([{ path: JOBS_JSON, content: `${JSON.stringify(results, null, 2)}\n` }], 'Record daily jobs', {
    [JOBS_JSON]: file?.version ?? null,
  });
  return results;
}

/** "Check now" and the daily job: fetch every feed, commit src/data/feeds.json when it changed. */
export async function syncFeedsFile(store: ContentStore): Promise<{
  changed: boolean;
  count: number;
  failed: { source: string; error: string }[];
  commit?: CommitResult;
}> {
  const [config, current] = await Promise.all([readConfig(store, 'feeds'), store.read(FEEDS_JSON)]);
  let existing: FeedItem[] = [];
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
  if (current?.content === content) return { changed: false, ...summary };
  const commit = await commitChanges(store, [{ path: FEEDS_JSON, content }], 'Sync feeds', {
    [FEEDS_JSON]: current?.version ?? null,
  });
  return { changed: true, ...summary, commit };
}

/** The release window starts at the last successful run; after a failed one, a week back (purging twice is harmless). */
export function releaseSince(previous: StepResult | undefined, now: Date): Date {
  if (previous?.ok) return new Date(previous.at);
  return new Date(now.getTime() - (previous ? 7 : 1) * DAY);
}

/** Posts whose date passed in (since, now]: purge the listings (home, blog, tags, RSS, sitemap) and their own pages. */
export async function releaseScheduled(store: PostgresStore, since: Date, now: Date): Promise<string[]> {
  const due = (await listEntries(store, 'posts'))
    .filter((p) => becameDue({ data: p.data as { draft?: boolean; date: string } }, since, now))
    .map((p) => p.slug);
  if (due.length) await store.purgeTags(['col:posts', ...due.map((slug) => `doc:posts/${slug}`)]);
  return due;
}

/** The daily cron's steps (Postgres mode). */
export function dailySteps(store: PostgresStore): Steps {
  return {
    feeds: async () => {
      const config = await readConfig(store, 'feeds');
      if (feedSources(config.data as FeedsConfig).length === 0) return { detail: 'no feeds configured' };
      const r = await syncFeedsFile(store);
      const failed = r.failed.map((f) => `${f.source}: ${f.error}`).join('; ');
      return {
        detail: `${r.changed ? 'updated' : 'no new items'} · ${r.count} items${failed ? ` · failed: ${failed}` : ''}`,
      };
    },
    scheduled: async (previous, now) => {
      const due = await releaseScheduled(store, releaseSince(previous.scheduled, now), now);
      return { detail: due.length ? `released ${due.join(', ')}` : 'nothing due' };
    },
    backup: async (_previous, now) => {
      if (!process.env.GITHUB_TOKEN) return { detail: 'skipped: no GITHUB_TOKEN' };
      const gh = new GitHubStore({ ...githubConfig(process.env), branch: BACKUP_BRANCH }, BACKUP_AUTHOR);
      const result = await backupToGit(getSql(), gh, now);
      return { detail: `${result.changed ?? 0} file(s) changed`, ...(result.commit ? { url: result.commit } : {}) };
    },
  };
}
