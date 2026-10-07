import test from 'node:test';
import assert from 'node:assert/strict';
import type { Sql } from '../db';
import { migrate } from '../db-migrate';
import { pgliteSql } from '../pglite-sql';
import { PostgresStore, type PostgresDeps } from './postgres-store';
import { ConflictError, UpstreamError } from './store';

const AUTHOR = { name: 'Jane', email: 'jane@users.noreply.github.com' };
const P = 'src/content/posts/a.md';

async function setup(deps: Partial<PostgresDeps> = {}, wrap: (sql: Sql) => Sql = (s) => s) {
  const sql = pgliteSql();
  await migrate(sql);
  const purged: string[][] = [];
  const store = new PostgresStore(wrap(sql), AUTHOR, {
    purge: async (tags) => {
      purged.push(tags);
    },
    ...deps,
  });
  return { sql, store, purged };
}

/** Throws on the nth query whose text contains `needle`, inside or outside transactions. */
function failingOn(needle: string, nth: number) {
  let n = 0;
  const wrap = (inner: Sql): Sql => {
    const s = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join('?').includes(needle) && ++n === nth) throw new Error('boom');
      return inner(strings, ...values);
    }) as Sql;
    s.begin = (fn) => inner.begin((tx) => fn(wrap(tx)));
    s.unsafe = (q) => inner.unsafe(q);
    return s;
  };
  return wrap;
}

test('create → read → update → list → lastModified', async () => {
  const { store } = await setup();
  const created = await store.commit([{ path: P, content: 'one' }], 'Create', {});
  assert.deepEqual(created.versions, { [P]: '1' });
  assert.deepEqual(await store.read(P), { path: P, content: 'one', version: '1' });
  const updated = await store.commit([{ path: P, content: 'two' }], 'Update', { [P]: '1' });
  assert.deepEqual(updated.versions, { [P]: '2' });
  assert.ok(Number(updated.id) > Number(created.id));
  assert.deepEqual(await store.list('src/content/posts'), [{ path: P, version: '2' }]);
  assert.deepEqual(await store.list('src/content/post'), []);
  assert.match((await store.lastModified(P)) ?? '', /^\d{4}-\d\d-\d\dT/);
  assert.equal(await store.read('missing.md'), null);
});

test('a stale version is a 409 and writes nothing, not even the other files of the commit', async () => {
  const { store, sql } = await setup();
  await store.commit([{ path: P, content: 'one' }], 'Create', {});
  await assert.rejects(
    store.commit(
      [
        { path: 'config/site.yml', content: 'title: B' },
        { path: P, content: 'two' },
      ],
      'Update',
      { [P]: '7' },
    ),
    (e) => e instanceof ConflictError && e.path === P,
  );
  assert.equal((await store.read(P))?.content, 'one');
  assert.equal(await store.read('config/site.yml'), null);
  assert.equal((await sql`select * from revisions`).length, 1);
});

test('creating a file that exists conflicts; deleting a missing file conflicts', async () => {
  const { store } = await setup();
  await store.commit([{ path: P, content: 'one' }], 'Create', {});
  await assert.rejects(store.commit([{ path: P, content: 'x' }], 'Create', { [P]: null }), ConflictError);
  await assert.rejects(store.commit([{ path: 'nope.md', content: null }], 'Delete', {}), ConflictError);
});

test('delete records a null revision; history lists newest first with the deleted marker', async () => {
  const { store } = await setup();
  await store.commit([{ path: P, content: 'one' }], 'Create', {});
  const deleted = await store.commit([{ path: P, content: null }], 'Delete', { [P]: '1' });
  assert.deepEqual(deleted.versions, { [P]: null });
  assert.equal(await store.read(P), null);
  const history = await store.history(P);
  assert.deepEqual(
    history.map((h) => [h.version, h.deleted, h.author]),
    [
      [2, true, 'Jane'],
      [1, false, 'Jane'],
    ],
  );
  assert.deepEqual(await store.revision(history[1].id), { path: P, content: 'one' });
  assert.equal(await store.revision('not-a-number'), null);
});

test('keeps the newest 50 revisions per changed path', async () => {
  const { store } = await setup();
  let version: string | null = null;
  for (let i = 1; i <= 55; i++) {
    version = (await store.commit([{ path: P, content: `v${i}` }], 'Save', { [P]: version })).versions[P];
  }
  const history = await store.history(P);
  assert.equal(history.length, 50);
  assert.equal(history.at(-1)?.version, 6);
  assert.equal(history[0].version, 55);
});

test('restore = commit an old revision on top of the current version', async () => {
  const { store } = await setup();
  await store.commit([{ path: P, content: 'one' }], 'Create', {});
  await store.commit([{ path: P, content: 'two' }], 'Update', { [P]: '1' });
  const old = (await store.history(P)).find((h) => h.version === 1)!;
  const rev = (await store.revision(old.id))!;
  const restored = await store.commit([{ path: rev.path, content: rev.content }], 'Restore', { [P]: '2' });
  assert.deepEqual(restored.versions, { [P]: '3' });
  assert.equal((await store.read(P))?.content, 'one');
});

test('a 50-file commit is atomic: a failure mid-way leaves no rows', async () => {
  const { store, sql } = await setup({}, failingOn('insert into documents', 30));
  const changes = Array.from({ length: 50 }, (_, i) => ({ path: `src/content/posts/p${i}.md`, content: `#${i}` }));
  await assert.rejects(store.commit(changes, 'Bulk', {}), /boom/);
  assert.equal((await sql`select * from documents`).length, 0);
  assert.equal((await sql`select * from revisions`).length, 0);
});

test('base64 changes are stored as text', async () => {
  const { store } = await setup();
  await store.commit([{ path: P, content: Buffer.from('héllo').toString('base64'), encoding: 'base64' }], 'C', {});
  assert.equal((await store.read(P))?.content, 'héllo');
});

test('a commit purges the changed paths’ tags; a failed purge is a warning, the save stands', async () => {
  const { store, purged } = await setup();
  const ok = await store.commit([{ path: P, content: 'one' }], 'Create', {});
  assert.deepEqual(purged, [['col:posts', 'doc:posts/a']]);
  assert.equal(ok.warning, undefined);

  const failing = await setup({
    purge: async () => {
      throw new Error('purge down');
    },
  });
  const original = console.error;
  console.error = () => {};
  try {
    const result = await failing.store.commit([{ path: 'config/site.yml', content: 'title: A' }], 'C', {});
    assert.equal(result.warning, 'cache-purge-failed');
    assert.deepEqual(result.tags, ['cfg:site']);
    assert.equal((await failing.store.read('config/site.yml'))?.content, 'title: A');
    await assert.rejects(failing.store.purgeTags(['cfg:site']), (e) => e instanceof UpstreamError && e.status === 502);
  } finally {
    console.error = original;
  }
});

test('an unreachable database is a 503', async () => {
  const down = (async () => {
    throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  }) as unknown as Sql;
  const store = new PostgresStore(down, AUTHOR, { purge: async () => {} });
  await assert.rejects(store.read(P), (e) => e instanceof UpstreamError && e.status === 503);
});
