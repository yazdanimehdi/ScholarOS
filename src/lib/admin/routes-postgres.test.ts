import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../db-migrate';
import { pgliteSql } from '../pglite-sql';
import type { Sql } from '../db';
import { setStoreForTests } from './get-store';
import { MemoryStore } from './memory-store';
import { PostgresStore } from './postgres-store';
import { PUT as putEntry } from '../../admin/routes/api/collections/[name]/[slug]';
import { GET as listCollection } from '../../admin/routes/api/collections/[name]';
import { GET as history } from '../../admin/routes/api/history';
import { GET as revision } from '../../admin/routes/api/history/[id]';
import { POST as restore } from '../../admin/routes/api/history/[id]/restore';
import { POST as purge } from '../../admin/routes/api/cache/purge';
import { GET as dashboard } from '../../admin/routes/api/dashboard';

const user = { login: 'jane', name: 'Jane', avatar: '' };
let sql: Sql;
let purged: string[][];
let purgeFails: boolean;

beforeEach(async () => {
  sql = pgliteSql();
  await migrate(sql);
  purged = [];
  purgeFails = false;
  setStoreForTests(
    (author) =>
      new PostgresStore(sql, author, {
        purge: async (tags) => {
          if (purgeFails) throw new Error('down');
          purged.push(tags);
        },
        put: async () => ({ url: 'https://x.public.blob.vercel-storage.com/a.png' }),
        del: async () => {},
      }),
  );
});

function call(
  handler: (ctx: never) => Response | Promise<Response>,
  opts: { method?: string; params?: Record<string, string>; body?: unknown; query?: string } = {},
): Promise<Response> {
  const url = new URL(`https://site.test/api/admin/test${opts.query ?? ''}`);
  const request = new Request(url, {
    method: opts.method ?? 'GET',
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return Promise.resolve(handler({ request, url, params: opts.params ?? {}, locals: { user } } as never));
}

const save = (title: string, version: string | null) =>
  call(putEntry, {
    method: 'PUT',
    params: { name: 'posts', slug: 'hist' },
    body: { data: { title, date: '2024-06-01' }, body: 'Hi', version },
  });

test('history: list newest first, read a revision, restore onto the current version', async () => {
  const v1 = (await (await save('One', null)).json()).versions['src/content/posts/hist.md'];
  await save('Two', v1);
  const res = await call(history, { query: '?path=src/content/posts/hist.md' });
  const revs = (await res.json()) as { id: string; version: number; author: string }[];
  assert.deepEqual(
    revs.map((r) => [r.version, r.author]),
    [
      [2, 'Jane'],
      [1, 'Jane'],
    ],
  );
  const old = await (await call(revision, { params: { id: revs[1].id } })).json();
  assert.match(old.content, /title: One/);

  const stale = await call(restore, { method: 'POST', params: { id: revs[1].id }, body: { version: '1' } });
  assert.equal(stale.status, 409);
  const ok = await call(restore, { method: 'POST', params: { id: revs[1].id }, body: { version: '2' } });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).versions, { 'src/content/posts/hist.md': '3' });
});

test('history: a deletion can’t be restored; unknown ids 404; paths outside the allowlist 400', async () => {
  const v1 = (await (await save('One', null)).json()).versions['src/content/posts/hist.md'];
  const store = new PostgresStore(
    sql,
    { name: 'Jane', email: 'j@x' },
    { purge: async () => {}, put: async () => ({ url: '' }), del: async () => {} },
  );
  await store.commit([{ path: 'src/content/posts/hist.md', content: null }], 'Delete', {
    'src/content/posts/hist.md': v1,
  });
  const [deleted] = (await (await call(history, { query: '?path=src/content/posts/hist.md' })).json()) as {
    id: string;
  }[];
  assert.equal(
    (await call(restore, { method: 'POST', params: { id: deleted.id }, body: { version: null } })).status,
    400,
  );
  assert.equal((await call(revision, { params: { id: '999999' } })).status, 404);
  assert.equal((await call(history, { query: '?path=../../etc/passwd' })).status, 400);
});

test('history and purge are Postgres-only: 404 on the git stores', async () => {
  setStoreForTests(() => new MemoryStore());
  assert.equal((await call(history, { query: '?path=config/site.yml' })).status, 404);
  assert.equal((await call(purge, { method: 'POST', body: { tags: ['cfg:site'] } })).status, 404);
});

test('cache purge: validates tags, purges, 502 when it fails again', async () => {
  assert.equal((await call(purge, { method: 'POST', body: { tags: [] } })).status, 400);
  assert.equal((await call(purge, { method: 'POST', body: { tags: ['a,b'] } })).status, 400);
  assert.equal((await call(purge, { method: 'POST', body: { tags: 'cfg:site' } })).status, 400);
  assert.equal((await call(purge, { method: 'POST', body: { tags: ['cfg:site'] } })).status, 200);
  assert.deepEqual(purged.at(-1), ['cfg:site']);
  purgeFails = true;
  assert.equal((await call(purge, { method: 'POST', body: { tags: ['cfg:site'] } })).status, 502);
});

test('a save whose purge fails answers 200 with the warning and the tags to retry', async () => {
  purgeFails = true;
  const original = console.error;
  console.error = () => {};
  try {
    const res = await save('One', null);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.warning, 'cache-purge-failed');
    assert.deepEqual(body.tags, ['col:posts', 'doc:posts/hist']);
  } finally {
    console.error = original;
  }
});

test('dashboard reports the mode and the last backup', async () => {
  const store = new PostgresStore(sql, undefined, {
    purge: async () => {},
    put: async () => ({ url: '' }),
    del: async () => {},
  });
  await store.commit(
    [{ path: 'src/data/backup.json', content: '{"at":"2026-10-06T03:00:00.000Z","ok":true,"changed":2}' }],
    'r',
    {},
  );
  const body = await (await call(dashboard)).json();
  assert.equal(body.mode, 'static'); // tests run without VERCEL
  assert.deepEqual(body.backup, { at: '2026-10-06T03:00:00.000Z', ok: true, changed: 2 });
});

test('an unreachable database answers 503 JSON', async () => {
  const down = (async () => {
    throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' });
  }) as unknown as Sql;
  setStoreForTests((author) => new PostgresStore(down, author));
  const res = await call(listCollection, { params: { name: 'posts' } });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /unreachable/);
});
