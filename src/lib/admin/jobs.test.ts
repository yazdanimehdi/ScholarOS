import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../db-migrate';
import { pgliteSql } from '../pglite-sql';
import { setSqlForTests, type Sql } from '../db';
import { setStoreForTests } from './get-store';
import { MemoryStore } from './memory-store';
import { PostgresStore } from './postgres-store';
import { JOBS_JSON } from './paths';
import { releaseScheduled, releaseSince, runJobs, type Steps } from './jobs';
import { GET as cron } from '../../admin/routes/api/cron/daily';
import { POST as runNow } from '../../admin/routes/api/jobs/run';

let sql: Sql;
let purged: string[][];
const store = () =>
  new PostgresStore(
    sql,
    { name: 'Bot', email: 'b@x' },
    {
      purge: async (tags) => {
        purged.push(tags);
      },
      put: async () => ({ url: '' }),
      del: async () => {},
    },
  );
const post = (date: string, extra = '') => `---\ntitle: T\ndate: ${date}\n${extra}---\n`;
const jobs = async () => JSON.parse((await store().read(JOBS_JSON))!.content);
const env = (vars: Record<string, string | undefined>) => {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars))
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  return () => {
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  };
};

beforeEach(async () => {
  sql = pgliteSql();
  await migrate(sql);
  purged = [];
  setSqlForTests(sql);
  setStoreForTests(() => store());
});
after(() => {
  setSqlForTests(null);
  setStoreForTests(null);
});

test('runJobs: a failing step is recorded and the others still run; jobs.json holds every result', async () => {
  const ran: string[] = [];
  const steps: Steps = {
    feeds: async () => {
      ran.push('feeds');
      throw new Error('feed down');
    },
    scheduled: async () => {
      ran.push('scheduled');
      return { detail: 'nothing due' };
    },
    backup: async () => {
      ran.push('backup');
      return { detail: '2 file(s) changed', url: 'https://github.com/o/r/commit/c' };
    },
  };
  const original = console.error;
  console.error = () => {};
  try {
    await runJobs(store(), steps, new Date('2026-10-07T03:00:00Z'));
  } finally {
    console.error = original;
  }
  assert.deepEqual(ran, ['feeds', 'scheduled', 'backup']);
  const at = '2026-10-07T03:00:00.000Z';
  assert.deepEqual(await jobs(), {
    feeds: { ok: false, at, detail: 'feed down' },
    scheduled: { ok: true, at, detail: 'nothing due' },
    backup: { ok: true, at, detail: '2 file(s) changed', url: 'https://github.com/o/r/commit/c' },
  });
});

test('releaseScheduled: purges listings and the pages of posts that became due, nothing else', async () => {
  await sql`insert into documents (path, content) values
    ('src/content/posts/due.md', ${post('2026-10-07')}),
    ('src/content/posts/old.md', ${post('2026-10-01')}),
    ('src/content/posts/future.md', ${post('2026-10-09')}),
    ('src/content/posts/draft.md', ${post('2026-10-07', 'draft: true\n')})`;
  const due = await releaseScheduled(store(), new Date('2026-10-06T03:00:00Z'), new Date('2026-10-07T03:00:00Z'));
  assert.deepEqual(due, ['due']);
  assert.deepEqual(purged, [['col:posts', 'doc:posts/due']]);
  purged = [];
  assert.deepEqual(
    await releaseScheduled(store(), new Date('2026-10-07T03:00:00Z'), new Date('2026-10-08T03:00:00Z')),
    [],
  );
  assert.deepEqual(purged, [], 'no due post, no purge');
});

test('releaseSince: from the last successful run; a week back after a failure; a day back the first time', () => {
  const now = new Date('2026-10-07T03:00:00Z');
  assert.equal(
    releaseSince({ ok: true, at: '2026-10-06T03:00:00.000Z' }, now).toISOString(),
    '2026-10-06T03:00:00.000Z',
  );
  assert.equal(
    releaseSince({ ok: false, at: '2026-10-06T03:00:00.000Z' }, now).toISOString(),
    '2026-09-30T03:00:00.000Z',
  );
  assert.equal(releaseSince(undefined, now).toISOString(), '2026-10-06T03:00:00.000Z');
});

test('cron: 401 without or with a wrong secret; outside Postgres mode it skips', async () => {
  const restore = env({ CRON_SECRET: undefined, VERCEL: undefined, DATABASE_URL: undefined });
  const req = (auth?: string) =>
    cron({
      request: new Request('https://site.test/api/admin/cron/daily', { headers: auth ? { authorization: auth } : {} }),
    } as never);
  try {
    assert.equal((await req('Bearer anything')).status, 401);
    process.env.CRON_SECRET = 's3cret';
    assert.equal((await req()).status, 401);
    assert.equal((await req('Bearer wrong!')).status, 401);
    process.env.VERCEL = '1';
    assert.deepEqual(await (await req('Bearer s3cret')).json(), { skipped: 'not in Postgres mode' });
  } finally {
    restore();
  }
});

test('cron in Postgres mode: runs every step, releases due posts, records jobs.json', async () => {
  const restore = env({ CRON_SECRET: 's3cret', VERCEL: '1', DATABASE_URL: 'postgres://test', GITHUB_TOKEN: undefined });
  const yesterday = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  await sql`insert into documents (path, content) values
    ('config/feeds.yml', ${"mediumUrl: ''\nfeeds: []\n"}),
    ('src/content/posts/now.md', ${post(yesterday)})`;
  try {
    const res = await cron({
      request: new Request('https://site.test/x', { headers: { authorization: 'Bearer s3cret' } }),
    } as never);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, [(v as { ok: boolean }).ok, (v as { detail: string }).detail]]),
      ),
      {
        feeds: [true, 'no feeds configured'],
        scheduled: [true, 'released now'],
        backup: [true, 'skipped: no GITHUB_TOKEN'],
      },
    );
    assert.deepEqual(await jobs(), body);
    assert.ok(purged.some((tags) => tags.includes('doc:posts/now')));
  } finally {
    restore();
  }
});

test('Run now: Postgres only; runs the same jobs as the signed-in user', async () => {
  const restore = env({ GITHUB_TOKEN: undefined });
  const call = () =>
    runNow({
      request: new Request('https://site.test/api/admin/jobs/run', { method: 'POST' }),
      url: new URL('https://site.test/api/admin/jobs/run'),
      params: {},
      locals: { user: { login: 'jane', name: 'Jane', avatar: '' } },
    } as never);
  try {
    await sql`insert into documents (path, content) values ('config/feeds.yml', ${'feeds: []\n'})`;
    const res = await call();
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(await res.json()), ['feeds', 'scheduled', 'backup']);
    setStoreForTests(() => new MemoryStore());
    assert.equal((await call()).status, 404);
  } finally {
    restore();
  }
});

const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
// The jobs.json commit purges its own tag; only the post purges matter here.
const postPurges = () => purged.filter((tags) => tags.includes('col:posts'));
async function cronWith(record: object, posts: Record<string, string>) {
  const restore = env({ CRON_SECRET: 's3cret', VERCEL: '1', DATABASE_URL: 'postgres://test', GITHUB_TOKEN: undefined });
  try {
    await sql`insert into documents (path, content) values
      ('config/feeds.yml', ${'feeds: []\n'}), ('src/data/jobs.json', ${JSON.stringify(record)})`;
    for (const [slug, date] of Object.entries(posts))
      await sql`insert into documents (path, content) values (${`src/content/posts/${slug}.md`}, ${post(date)})`;
    const res = await cron({
      request: new Request('https://site.test/x', { headers: { authorization: 'Bearer s3cret' } }),
    } as never);
    assert.equal(res.status, 200);
  } finally {
    restore();
  }
}

test('cron after a failed scheduled run: looks a week back, so a post due 3 days ago is released', async () => {
  await cronWith({ scheduled: { ok: false, at: ago(72) } }, { missed: ago(71) });
  assert.deepEqual(postPurges(), [['col:posts', 'doc:posts/missed']]);
});

test('cron after a successful run: only posts due since that run are released', async () => {
  await cronWith({ scheduled: { ok: true, at: ago(48) } }, { fresh: ago(30), old: ago(72) });
  assert.deepEqual(postPurges(), [['col:posts', 'doc:posts/fresh']]);
});
