import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setStoreForTests } from './get-store';
import { MemoryStore } from './memory-store';
import { GET as listCollection } from '../../admin/routes/api/collections/[name]';
import { DELETE as deleteEntry, GET as getEntry, PUT as putEntry } from '../../admin/routes/api/collections/[name]/[slug]';
import { GET as getConfig, PUT as putConfig } from '../../admin/routes/api/config/[file]';
import { GET as dashboard } from '../../admin/routes/api/dashboard';

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  setStoreForTests(() => store);
});

const user = { login: 'jane', name: 'Jane', avatar: '' };
type Options = { method?: string; params?: Record<string, string>; body?: unknown; query?: string; signedIn?: boolean };

/** Calls an Astro route handler the way the adapter would, with the middleware's `locals.user`. */
function call(handler: (ctx: never) => Response | Promise<Response>, opts: Options = {}): Promise<Response> {
  const url = new URL(`https://site.test/api/admin/test${opts.query ?? ''}`);
  const body = opts.body === undefined ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body);
  const request = new Request(url, { method: opts.method ?? 'GET', body });
  const locals = opts.signedIn === false ? {} : { user };
  return Promise.resolve(handler({ request, url, params: opts.params ?? {}, locals } as never));
}

const comments = (s: string) => s.split('\n').filter((l) => l.trim().startsWith('#'));

test('collections: create → read → list; stale versions and duplicate creates conflict', async () => {
  const params = { name: 'posts', slug: 'route-test' };
  const data = { title: 'Hello', date: '2024-06-01', draft: true };
  const created = await call(putEntry, { method: 'PUT', params, body: { data, body: 'Costs $5 and $10.', version: null } });
  assert.equal(created.status, 200);
  const { versions } = await created.json();
  assert.equal(
    (await store.read('src/content/posts/route-test.md'))!.content,
    '---\ntitle: Hello\ndate: 2024-06-01\ndraft: true\n---\n\nCosts $5 and $10.\n',
  );
  const read = await (await call(getEntry, { params })).json();
  assert.deepEqual([read.data, read.body, read.version, read.readonly], [data, 'Costs $5 and $10.\n', versions['src/content/posts/route-test.md'], false]);

  const stale = await call(putEntry, { method: 'PUT', params, body: { data, body: '', version: 'stale' } });
  assert.equal(stale.status, 409);
  const duplicate = await call(putEntry, { method: 'PUT', params, body: { data, body: '', version: null } });
  assert.equal(duplicate.status, 409);

  const listed = await (await call(listCollection, { params: { name: 'posts' } })).json();
  assert.ok(listed.some((e: { slug: string; data: { title: string } }) => e.slug === 'route-test' && e.data.title === 'Hello'));
});

test('collections: field errors, bad names, missing entries, no session', async () => {
  const bad = await call(putEntry, { method: 'PUT', params: { name: 'posts', slug: 'x' }, body: { data: { date: 'not a date' }, body: '' } });
  assert.equal(bad.status, 400);
  const { details } = await bad.json();
  assert.ok(details.title && details.date, JSON.stringify(details));
  assert.equal((await call(putEntry, { method: 'PUT', params: { name: 'posts', slug: 'Bad Slug' }, body: { data: {} } })).status, 400);
  assert.equal((await call(getEntry, { params: { name: 'secrets', slug: 'x' } })).status, 400);
  assert.equal((await call(getEntry, { params: { name: 'posts', slug: 'does-not-exist' } })).status, 404);
  assert.equal((await call(getEntry, { params: { name: 'posts', slug: 'x' }, signedIn: false })).status, 401);
});

test('collections: deleting needs the current version', async () => {
  const params = { name: 'talks', slug: 'route-delete' };
  const data = { title: 'T', event: 'E', date: '2024', type: 'Seminar' };
  const created = await (await call(putEntry, { method: 'PUT', params, body: { data, body: '' } })).json();
  assert.equal((await call(deleteEntry, { method: 'DELETE', params, body: {} })).status, 400);
  const version = created.versions['src/content/talks/route-delete.md'];
  assert.equal((await call(deleteEntry, { method: 'DELETE', params, body: { version } })).status, 200);
  assert.equal(await store.read('src/content/talks/route-delete.md'), null);
});

test('config: save keeps comments; stale → 409; invalid → 400; unknown file → 400', async () => {
  const before = (await store.read('config/cv.yml'))!.content;
  const { data, version } = await (await call(getConfig, { params: { file: 'cv' } })).json();
  const renamed = { ...data, cv: { ...data.cv, name: 'Renamed Person' } };
  assert.equal((await call(putConfig, { method: 'PUT', params: { file: 'cv' }, body: { data: renamed, version } })).status, 200);
  const after = (await store.read('config/cv.yml'))!.content;
  assert.deepEqual(comments(after), comments(before));
  assert.match(after, /name: .?Renamed Person/);
  assert.equal((await call(putConfig, { method: 'PUT', params: { file: 'cv' }, body: { data, version } })).status, 409);
  const fresh = (await store.read('config/cv.yml'))!.version;
  assert.equal((await call(putConfig, { method: 'PUT', params: { file: 'cv' }, body: { data: { cv: {} }, version: fresh } })).status, 400);
  assert.equal((await call(getConfig, { params: { file: 'cms' } })).status, 400);
});

test('dashboard: posts, feed items, feeds config and counts in one response', async () => {
  const d = await (await call(dashboard)).json();
  assert.ok(Array.isArray(d.posts));
  assert.ok(Array.isArray(d.feedItems));
  assert.equal(typeof d.publications, 'number');
  assert.ok('version' in d.feeds && 'data' in d.feeds);
});

test('collections: an .mdx entry refuses PUT and DELETE and never commits', async () => {
  const params = { name: 'posts', slug: 'route-mdx' };
  await store.commit([{ path: 'src/content/posts/route-mdx.mdx', content: '---\ntitle: M\n---\n\nHi\n' }], 'seed', { 'src/content/posts/route-mdx.mdx': null });
  const commits = store.log.length;
  const data = { title: 'M', date: '2024-06-01' };
  assert.equal((await call(putEntry, { method: 'PUT', params, body: { data, body: '', version: null } })).status, 409);
  assert.equal((await call(deleteEntry, { method: 'DELETE', params, body: { version: 'x' } })).status, 409);
  assert.equal(store.log.length, commits);
});
