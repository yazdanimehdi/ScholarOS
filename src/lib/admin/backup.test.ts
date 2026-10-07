import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../db-migrate';
import { pgliteSql } from '../pglite-sql';
import { setSqlForTests, type Sql } from '../db';
import { backupToGit } from './backup';
import { setStoreForTests } from './get-store';
import { PostgresStore } from './postgres-store';
import { gitBlobSha, type Change } from './store';
import { GET as cron } from '../../admin/routes/api/cron/backup';

let sql: Sql;
before(async () => {
  sql = pgliteSql();
  await migrate(sql);
  await sql`insert into documents (path, content) values
    ('config/site.yml', 'title: A'), ('src/content/posts/new.md', 'changed'), ('src/content/posts/same.md', 'same')`;
});

function fakeGh(tree: Map<string, string> | null) {
  const commits: { changes: Change[]; base: Record<string, string | null> }[] = [];
  let branches = 0;
  return {
    commits,
    get branches() {
      return branches;
    },
    gh: {
      tree: async () => tree,
      createBranch: async () => {
        branches++;
        tree = new Map();
      },
      commit: async (changes: Change[], _m: string, base: Record<string, string | null>) => {
        commits.push({ changes, base });
        return { id: 'c1', url: 'https://github.com/o/r/commit/c1', versions: {} };
      },
    },
  };
}

test('backup writes changed documents, deletes removed ones, keeps code and images', async () => {
  const tree = new Map([
    ['config/site.yml', gitBlobSha('title: A')], // unchanged
    ['src/content/posts/same.md', gitBlobSha('same')], // unchanged
    ['src/content/posts/new.md', 'oldsha'], // changed
    ['src/content/posts/gone.md', 'gonesha'], // deleted in the database
    ['src/assets/images/a.png', 'imgsha'], // images are never deleted
    ['package.json', 'pkgsha'], // code is never touched
  ]);
  const { gh, commits } = fakeGh(tree);
  const result = await backupToGit(sql, gh, new Date('2026-10-06T03:00:00Z'));
  assert.deepEqual(result, {
    at: '2026-10-06T03:00:00.000Z',
    ok: true,
    changed: 2,
    commit: 'https://github.com/o/r/commit/c1',
  });
  assert.deepEqual(commits[0].changes, [
    { path: 'src/content/posts/new.md', content: 'changed' },
    { path: 'src/content/posts/gone.md', content: null },
  ]);
  assert.deepEqual(commits[0].base, { 'src/content/posts/new.md': 'oldsha', 'src/content/posts/gone.md': 'gonesha' });
});

test('no changes → no commit', async () => {
  const docs = await sql<{ path: string; content: string }>`select path, content from documents`;
  const { gh, commits } = fakeGh(new Map(docs.map((d) => [d.path, gitBlobSha(d.content)])));
  assert.deepEqual(await backupToGit(sql, gh, new Date('2026-10-06T03:00:00Z')), {
    at: '2026-10-06T03:00:00.000Z',
    ok: true,
    changed: 0,
  });
  assert.equal(commits.length, 0);
});

test('a missing branch is created from the default branch first', async () => {
  const fake = fakeGh(null);
  await backupToGit(sql, fake.gh);
  assert.equal(fake.branches, 1);
  assert.equal(fake.commits[0].changes.length, 3);
});

test('cron: 401 without or with a wrong secret; git mode skips', async () => {
  const saved = {
    CRON_SECRET: process.env.CRON_SECRET,
    VERCEL: process.env.VERCEL,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  const req = (auth?: string) =>
    cron({
      request: new Request('https://site.test/api/admin/cron/backup', { headers: auth ? { authorization: auth } : {} }),
    } as never);
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await req('Bearer anything')).status, 401);
    process.env.CRON_SECRET = 's3cret';
    assert.equal((await req()).status, 401);
    assert.equal((await req('Bearer wrong!')).status, 401);
    process.env.VERCEL = '1';
    delete process.env.DATABASE_URL;
    assert.deepEqual(await (await req('Bearer s3cret')).json(), { skipped: 'not in Postgres mode' });
  } finally {
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});

test('cron without GITHUB_TOKEN records { skipped: "no token" } as src/data/backup.json', async () => {
  const saved = {
    CRON_SECRET: process.env.CRON_SECRET,
    VERCEL: process.env.VERCEL,
    DATABASE_URL: process.env.DATABASE_URL,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  };
  Object.assign(process.env, { CRON_SECRET: 's3cret', VERCEL: '1', DATABASE_URL: 'postgres://test' });
  delete process.env.GITHUB_TOKEN;
  setSqlForTests(sql);
  setStoreForTests(
    (a) => new PostgresStore(sql, a, { purge: async () => {}, put: async () => ({ url: '' }), del: async () => {} }),
  );
  try {
    const res = await cron({
      request: new Request('https://site.test/x', { headers: { authorization: 'Bearer s3cret' } }),
    } as never);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).skipped, 'no token');
    const [row] = await sql<{ content: string }>`select content from documents where path = 'src/data/backup.json'`;
    assert.equal(JSON.parse(row.content).skipped, 'no token');
  } finally {
    setSqlForTests(null);
    setStoreForTests(null);
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});

after(() => setSqlForTests(null));
