import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from './lib/db-migrate';
import { pgliteSql } from './lib/pglite-sql';
import { setSqlForTests, type Sql } from './lib/db';
import { getSiteConfig } from './lib/config';
import { requestContext } from './lib/content/context';
import { onRequest } from './middleware';

let sql: Sql;
const saved = { VERCEL: process.env.VERCEL, DATABASE_URL: process.env.DATABASE_URL };

before(async () => {
  process.env.VERCEL = '1';
  process.env.DATABASE_URL = 'postgres://test';
  sql = pgliteSql();
  await migrate(sql);
  await sql`insert into documents (path, content) values ('config/site.yml', 'title: A')`;
  setSqlForTests(sql);
});
after(() => {
  setSqlForTests(null);
  for (const [k, v] of Object.entries(saved))
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
});

function ctx(path: string, method = 'GET') {
  const url = new URL(path, 'https://site.test');
  return {
    url,
    isPrerendered: false,
    locals: {},
    request: new Request(url, { method }),
    cookies: { get: () => undefined },
  };
}
const run = (path: string, next: () => Promise<Response>) =>
  onRequest(ctx(path) as never, next as never) as Promise<Response>;

/** A body that reads config only when the runtime pulls it, like a child component during streaming. */
const streamingTitle = () =>
  new Response(
    new ReadableStream({
      pull(c) {
        c.enqueue(new TextEncoder().encode(getSiteConfig().title));
        c.close();
      },
    }),
  );

test('a read while the body streams is inside the context and tagged', async () => {
  const res = await run('/blog', async () => streamingTitle());
  assert.equal(await res.text(), 'A');
  assert.equal(res.headers.get('vercel-cdn-cache-control'), 'public, max-age=31536000');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.equal(res.headers.get('vercel-cache-tag'), 'cfg:site,all');
});

test('a warm function sees the next site.yml', async () => {
  await sql`update documents set content = 'title: B' where path = 'config/site.yml'`;
  assert.equal(await (await run('/', async () => streamingTitle())).text(), 'B');
});

test('404 and 500 are never cached', async () => {
  const res = await run('/nope', async () => new Response('missing', { status: 404 }));
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('vercel-cache-tag'), null);
});

test('a failed query during render → 503 with Retry-After, not a cached error page', async () => {
  const res = await run('/blog', async () => {
    requestContext().dbFailed = true;
    return new Response('error', { status: 500 });
  });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '30');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('a bodyless 404 keeps a null body so Astro reroutes it to 404.astro', async () => {
  const res = await run('/blog/nope', async () => new Response(null, { status: 404 }));
  assert.equal(res.status, 404);
  assert.equal(res.body, null);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('a failed page query rejects next() → 503', async () => {
  const res = await run('/blog', async () => {
    requestContext().dbFailed = true;
    throw new Error('db');
  });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '30');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('a failed query in a child component errors the body stream → 503', async () => {
  const res = await run(
    '/blog',
    async () =>
      new Response(
        new ReadableStream({
          pull(c) {
            requestContext().dbFailed = true;
            c.error(new Error('db'));
          },
        }),
      ),
  );
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '30');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('a render error that is not a database failure propagates to Astro', async () => {
  await assert.rejects(
    run('/blog', async () => {
      throw new Error('bug');
    }),
    /bug/,
  );
});

test('database unreachable before render → 503', async () => {
  setSqlForTests((async () => {
    throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' });
  }) as unknown as Sql);
  const original = console.error;
  console.error = () => {};
  try {
    const res = await run('/', async () => new Response('never'));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '30');
  } finally {
    console.error = original;
    setSqlForTests(sql);
  }
});

test('config read outside a request fails loudly in postgres mode', () => {
  assert.throws(() => getSiteConfig(), /outside a request/);
});
