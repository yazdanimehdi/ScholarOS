import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../db-migrate';
import { pgliteSql } from '../pglite-sql';
import { setSqlForTests, type Sql } from '../db';
import { backupToGit } from './backup';
import { gitBlobSha, type Change } from './store';

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

test('the legacy src/data/backup.json document is neither written to the branch nor deleted from it', async () => {
  await sql`insert into documents (path, content) values ('src/data/backup.json', '{"at":"2026-10-05"}')`;
  try {
    const docs = await sql<{ path: string; content: string }>`select path, content from documents`;
    const tree = new Map(docs.map((d) => [d.path, gitBlobSha(d.content)]));
    tree.set('src/data/backup.json', 'oldsha');
    const { gh, commits } = fakeGh(tree);
    assert.equal((await backupToGit(sql, gh, new Date('2026-10-06T03:00:00Z'))).changed, 0);
    assert.equal(commits.length, 0);
  } finally {
    await sql`delete from documents where path = 'src/data/backup.json'`;
  }
});

after(() => setSqlForTests(null));
