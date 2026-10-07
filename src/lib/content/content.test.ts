import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migrate } from '../db-migrate';
import { pgliteSql } from '../pglite-sql';
import { setSqlForTests, type Sql } from '../db';
import { newContext, runWithContext, type RequestContext } from './context';
import { parseDocuments } from './documents';
import { entryHeadings, getEntries, getEntry, renderEntryHtml, staticProps } from './index';

let sql: Sql;
const saved = { VERCEL: process.env.VERCEL, DATABASE_URL: process.env.DATABASE_URL };
/** Silences the "invalid, skipped" logs of the broken fixture while `fn` (and its awaits) run. */
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

before(async () => {
  process.env.VERCEL = '1';
  process.env.DATABASE_URL = 'postgres://test';
  sql = pgliteSql();
  await migrate(sql);
  const post = (title: string, extra = '') => `---\ntitle: ${title}\ndate: 2024-06-01\n${extra}---\n\n## Hello\n\nBody\n`;
  await sql`insert into documents (path, content) values
    ('src/content/posts/a.md', ${post('A')}),
    ('src/content/posts/draft.md', ${post('Draft', 'draft: true\n')}),
    ('src/content/posts/broken.md', ${'---\ndate: nope\n---\n'}),
    ('src/content/posts/old.mdx', ${post('Old')})`;
  setSqlForTests(sql);
});
after(() => {
  setSqlForTests(null);
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
});

const inRequest = async <T>(fn: (ctx: RequestContext) => Promise<T>, files = new Map<string, string>()) => {
  const ctx = newContext(files);
  return runWithContext(ctx, () => fn(ctx));
};

test('parseDocuments: demo content parses to getCollection-shaped entries', () => {
  const dir = 'src/content/people';
  const docs = fs.readdirSync(dir).map((f) => ({ path: `${dir}/${f}`, content: fs.readFileSync(`${dir}/${f}`, 'utf8') }));
  const entries = parseDocuments('people', docs);
  assert.equal(entries.length, docs.length);
  const jane = entries.find((e) => e.id === 'jane-smith')!;
  assert.deepEqual(Object.keys(jane).sort(), ['body', 'collection', 'data', 'filePath', 'id']);
  assert.equal(jane.collection, 'people');
  assert.equal(jane.filePath, 'src/content/people/jane-smith.md');
  assert.equal(typeof jane.data.name, 'string');
  assert.equal(jane.data.active, true); // schema default applied
});

test('parseDocuments: invalid documents are logged and skipped', () => {
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const out = parseDocuments('posts', [{ path: 'src/content/posts/x.md', content: '---\ntitle: 1\n---\n' }]);
    assert.deepEqual(out, []);
    assert.match(String((logged[0] as unknown[])[0]), /src\/content\/posts\/x\.md/);
  } finally {
    console.error = original;
  }
});

test('getEntries: valid documents from the database, tagged col:<name>, dates coerced', async () => {
  const { ids, tags } = await inRequest(async (ctx) => {
    const posts = await quiet(() => getEntries('posts'));
    return { ids: posts.map((p) => p.id), tags: [...ctx.tags], date: posts[0].data.date };
  });
  assert.deepEqual(ids, ['a', 'draft', 'old']);
  assert.deepEqual(tags, ['col:posts']);
});

test('getEntry: one document, tagged doc:<name>/<id>; unknown → undefined', async () => {
  const { a, missing, tags } = await inRequest(async (ctx) => ({
    a: await getEntry('posts', 'a'),
    missing: await getEntry('posts', 'zzz'),
    tags: [...ctx.tags],
  }));
  assert.equal(a?.data.title, 'A');
  assert.ok(a?.data.date instanceof Date);
  assert.equal(missing, undefined);
  assert.deepEqual(tags, ['doc:posts/a', 'doc:posts/zzz']);
});

test('feeds come from the request snapshot of src/data/feeds.json', async () => {
  const feeds = JSON.stringify([{ id: 'm1', title: 'T', link: 'https://medium.com/x', date: '2024-01-01', source: 'Medium' }]);
  const { items, tags } = await inRequest(
    async (ctx) => ({ items: await getEntries('feeds'), tags: [...ctx.tags] }),
    new Map([['src/data/feeds.json', feeds]]),
  );
  assert.deepEqual(items.map((i) => i.id), ['m1']);
  assert.ok(tags.includes('col:feeds'));
});

test('staticProps: unknown id → null, known → its props', async () => {
  const paths = async () => [
    { params: { id: 'a' }, props: { n: 1 } },
    { params: { id: 'b' }, props: { n: 2 } },
  ];
  assert.deepEqual(await staticProps({ props: {}, params: { id: 'b' } }, paths), { n: 2 });
  assert.equal(await staticProps({ props: {}, params: { id: 'draft' } }, paths), null);
});

test('a failed query marks the request for a 503', async () => {
  setSqlForTests((async () => {
    throw new Error('down');
  }) as unknown as Sql);
  try {
    const ctx = newContext(new Map());
    await assert.rejects(runWithContext(ctx, () => getEntries('projects')), /down/);
    assert.equal(ctx.dbFailed, true);
  } finally {
    setSqlForTests(sql);
  }
});

test('entry bodies: Markdown with headings; MDX gets the notice', async () => {
  await inRequest(async () => {
    const [a] = await quiet(() => getEntries('posts'));
    const { html } = await renderEntryHtml(a);
    assert.match(html, /<h2 id="hello">Hello<\/h2>/);
    assert.deepEqual((await entryHeadings(a)).map((h) => h.slug), ['hello']);
    const mdx = (await quiet(() => getEntries('posts'))).find((p) => p.id === 'old')!;
    assert.match((await renderEntryHtml(mdx)).html, /only supported in static\/git mode/);
  });
});
