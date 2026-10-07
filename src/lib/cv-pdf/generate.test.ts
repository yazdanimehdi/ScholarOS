import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migrate } from '../db-migrate';
import { pgliteSql } from '../pglite-sql';
import type { Sql } from '../db';
import { setStoreForTests } from '../admin/get-store';
import { MemoryStore } from '../admin/memory-store';
import { PostgresStore, type PostgresDeps } from '../admin/postgres-store';
import { CV_JSON } from '../admin/paths';
import { GET as getConfig, PUT as putConfig } from '../../admin/routes/api/config/[file]';
import { PUT as putEntry } from '../../admin/routes/api/collections/[name]/[slug]';
import { GET as pdfStatus, POST as generatePdf } from '../../admin/routes/api/cv/pdf';
import { generateCvPdf } from './generate';

const user = { login: 'jane', name: 'Jane', avatar: '' };
const BLOB = 'https://b.public.blob.vercel-storage.com/';
const SEED = [
  'config/cv.yml',
  'config/cv-upload.yml',
  'config/site.yml',
  ...fs.readdirSync('src/content/publications').map((f) => `src/content/publications/${f}`),
];
let sql: Sql;
let store: PostgresStore;
let blobs: Map<string, Buffer>;
let deleted: string[];
let purged: string[][];
let putFails: boolean;

const deps = (): PostgresDeps => ({
  purge: async (tags) => {
    purged.push(tags);
  },
  put: async (pathname, body) => {
    if (putFails) throw new Error('quota exceeded');
    blobs.set(pathname, body);
    return { url: `${BLOB}${pathname}` };
  },
  del: async (url) => {
    deleted.push(url);
  },
});

beforeEach(async () => {
  sql = pgliteSql();
  await migrate(sql);
  for (const path of SEED)
    await sql`insert into documents (path, content) values (${path}, ${fs.readFileSync(path, 'utf8')})`;
  [blobs, deleted, purged, putFails] = [new Map(), [], [], false];
  store = new PostgresStore(sql, { name: 'Jane', email: 'j@x' }, deps());
  setStoreForTests((author) => new PostgresStore(sql, author, deps()));
});

function call(
  handler: (ctx: never) => Response | Promise<Response>,
  opts: { method?: string; params?: Record<string, string>; body?: unknown } = {},
): Promise<Response> {
  const url = new URL('https://site.test/api/admin/test');
  const request = new Request(url, {
    method: opts.method ?? 'GET',
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return Promise.resolve(handler({ request, url, params: opts.params ?? {}, locals: { user } } as never));
}

const meta = async () => JSON.parse((await store.read(CV_JSON))!.content);
const quiet = async <T>(fn: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};
const saveCv = async () => {
  const { data, version } = await (await call(getConfig, { params: { file: 'cv' } })).json();
  return call(putConfig, { method: 'PUT', params: { file: 'cv' }, body: { data, version } });
};

test('generateCvPdf: uploads cv/cv-<hash>.pdf, records it in src/data/cv.json, refreshes the CV page', async () => {
  const result = await generateCvPdf(store, new Date('2026-10-07T00:00:00Z'));
  const [name] = [...blobs.keys()];
  assert.match(name, /^cv\/cv-[0-9a-f]{8}\.pdf$/);
  assert.equal(blobs.get(name)!.subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(await meta(), {
    lastGenerated: '2026-10-07T00:00:00.000Z',
    pdfPath: `${BLOB}${name}`,
    pdfSize: blobs.get(name)!.length,
  });
  assert.deepEqual(result, await meta());
  assert.ok(purged.some((tags) => tags.includes('data:cv')));
});

test('generateCvPdf: the previous Blob PDF is deleted; a non-Blob previous path is left alone', async () => {
  await sql`insert into documents (path, content) values (${CV_JSON}, ${'{"lastGenerated":null,"pdfPath":"/cv.pdf","pdfSize":0}'})`;
  const first = await generateCvPdf(store, new Date('2026-10-07T00:00:00Z'));
  assert.deepEqual(deleted, []);
  const second = await generateCvPdf(store, new Date('2026-10-08T00:00:00Z'));
  assert.notEqual(second.pdfPath, first.pdfPath);
  assert.deepEqual(deleted, [first.pdfPath]);
});

test('generateCvPdf: a previous URL the media library does not know is logged, not fatal', async () => {
  await sql`insert into documents (path, content) values
    (${CV_JSON}, ${'{"lastGenerated":null,"pdfPath":"https://elsewhere.example/cv.pdf","pdfSize":0}'})`;
  const result = await quiet(() => generateCvPdf(store));
  assert.match(result.pdfPath, /^https:\/\/b\.public/);
  assert.deepEqual(deleted, []);
});

test('saving cv.yml regenerates the PDF; when that fails the save stands with a pdf-failed warning', async () => {
  const ok = await saveCv();
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).warning, undefined);
  assert.match((await meta()).pdfPath, /cv-[0-9a-f]{8}\.pdf$/);

  putFails = true;
  const failed = await quiet(saveCv);
  assert.equal(failed.status, 200);
  const body = await failed.json();
  assert.equal(body.warning, 'pdf-failed');
  assert.match(body.detail, /quota exceeded/);
  assert.equal((await store.read('config/cv.yml'))!.version, body.versions['config/cv.yml']);
});

test('saving a publication regenerates the PDF; saving a post does not', async () => {
  const post = { data: { title: 'P', date: '2024-01-01' }, body: '', version: null };
  assert.equal((await call(putEntry, { method: 'PUT', params: { name: 'posts', slug: 'p' }, body: post })).status, 200);
  assert.equal(await store.read(CV_JSON), null);
  const pub = {
    data: { title: 'New', authors: ['Jane Smith'], venue: 'V', year: 2026, type: 'conference' },
    body: '',
    version: null,
  };
  assert.equal(
    (await call(putEntry, { method: 'PUT', params: { name: 'publications', slug: 'new-pub' }, body: pub })).status,
    200,
  );
  assert.ok(await store.read(CV_JSON));
});

test('cv/pdf: POST generates in Postgres mode; GET reports the last PDF', async () => {
  const res = await call(generatePdf, { method: 'POST' });
  assert.equal(res.status, 200);
  const { pdf } = await res.json();
  assert.deepEqual(await (await call(pdfStatus)).json(), { run: null, pdf });
});

test('git stores never render a PDF', async () => {
  const mem = new MemoryStore();
  setStoreForTests(() => mem);
  assert.equal((await saveCv()).status, 200);
  assert.deepEqual(
    mem.log.map((c) => c.paths),
    [['config/cv.yml']],
  );
});
