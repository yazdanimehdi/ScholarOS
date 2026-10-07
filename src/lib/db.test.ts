import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnreachable } from './db';
import { migrate } from './db-migrate';
import { pgliteSql } from './pglite-sql';

test('migrate creates the tables once; a second run applies nothing', async () => {
  const sql = pgliteSql();
  assert.deepEqual(await migrate(sql), ['001_init.sql']);
  assert.deepEqual(await migrate(sql), []);
  await sql`insert into documents (path, content) values ('config/site.yml', 'title: A')`;
  const [row] = await sql<{ version: number; updated_by: string | null }>`select version, updated_by from documents`;
  assert.equal(row.version, 1);
  assert.equal(row.updated_by, null);
  const tables = await sql<{ name: string }>`select table_name as name from information_schema.tables where table_schema = 'public' order by 1`;
  assert.deepEqual(tables.map((t) => t.name), ['documents', 'media', 'revisions', 'schema_migrations']);
});

test('begin rolls everything back when the callback throws', async () => {
  const sql = pgliteSql();
  await migrate(sql);
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx`insert into documents (path, content) values ('a', 'x')`;
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.equal((await sql`select * from documents`).length, 0);
});

test('isUnreachable: connection errors yes, query errors no', () => {
  assert.equal(isUnreachable(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), true);
  assert.equal(isUnreachable(Object.assign(new Error('x'), { code: 'CONNECT_TIMEOUT' })), true);
  assert.equal(isUnreachable(Object.assign(new Error('x'), { code: '42P01' })), false);
  assert.equal(isUnreachable('nope'), false);
});

test('pgliteSql: array params and nested begin behave like postgres.js', async () => {
  const sql = pgliteSql();
  await migrate(sql);
  await sql`insert into documents (path, content) values ('a', '1'), ('b', '2'), ('c', '3')`;
  const rows = await sql<{ path: string }>`select path from documents where path = any(${['a', 'c']}::text[]) order by 1`;
  assert.deepEqual(rows.map((r) => r.path), ['a', 'c']);
  await sql.begin((tx) => tx.begin((t2) => t2`delete from documents where path = ${'a'}`));
  assert.equal((await sql`select * from documents`).length, 2);
});
