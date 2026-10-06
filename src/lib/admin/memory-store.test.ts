import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from './memory-store';
import { ConflictError, gitBlobSha } from './store';

function tree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-store-'));
  const write = (p: string, content: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), content);
  };
  write('config/feeds.yml', 'maxItemsPerFeed: 20\n');
  write('src/content/posts/old.md', '---\ntitle: Old\n---\n');
  write('src/assets/images/people/jane.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return root;
}

test('gitBlobSha matches git', () => {
  assert.equal(gitBlobSha('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.equal(gitBlobSha(Buffer.from('hello\n').toString('base64'), 'base64'), gitBlobSha('hello\n'));
});

test('reads fall through to disk; list is recursive', async () => {
  const root = tree();
  const store = new MemoryStore(root);
  const file = await store.read('config/feeds.yml');
  assert.equal(file?.content, 'maxItemsPerFeed: 20\n');
  assert.equal(file?.version, gitBlobSha('maxItemsPerFeed: 20\n'));
  assert.equal(await store.read('missing.md'), null);
  assert.deepEqual(
    (await store.list('src/assets/images')).map((f) => f.path),
    ['src/assets/images/people/jane.png'],
  );
  assert.deepEqual(await store.list('nope'), []);
});

test('commit: create, update and delete in one commit; disk untouched', async () => {
  const root = tree();
  const store = new MemoryStore(root);
  const feeds = (await store.read('config/feeds.yml'))!;
  const old = (await store.read('src/content/posts/old.md'))!;
  const result = await store.commit(
    [
      { path: 'config/feeds.yml', content: 'hidden: []\n' },
      { path: 'src/content/posts/new.md', content: '---\ntitle: New\n---\n' },
      { path: 'src/content/posts/old.md', content: null },
    ],
    'Edit',
    { 'config/feeds.yml': feeds.version, 'src/content/posts/new.md': null, 'src/content/posts/old.md': old.version },
  );
  assert.equal(result.id, 'memory-1');
  assert.deepEqual(result.versions, {
    'config/feeds.yml': gitBlobSha('hidden: []\n'),
    'src/content/posts/new.md': gitBlobSha('---\ntitle: New\n---\n'),
    'src/content/posts/old.md': null,
  });
  assert.deepEqual(store.log, [
    {
      id: 'memory-1',
      message: 'Edit',
      paths: ['config/feeds.yml', 'src/content/posts/new.md', 'src/content/posts/old.md'],
    },
  ]);
  assert.equal((await store.read('config/feeds.yml'))?.version, gitBlobSha('hidden: []\n'));
  assert.deepEqual(
    (await store.list('src/content/posts')).map((f) => f.path),
    ['src/content/posts/new.md'],
  );
  assert.ok(await store.lastModified('config/feeds.yml'));
  assert.equal(fs.readFileSync(path.join(root, 'config/feeds.yml'), 'utf8'), 'maxItemsPerFeed: 20\n');
});

test('commit: one stale version fails the whole commit', async () => {
  const store = new MemoryStore(tree());
  await assert.rejects(
    store.commit(
      [
        { path: 'src/content/posts/x.md', content: 'x' },
        { path: 'config/feeds.yml', content: 'y' },
      ],
      'Edit',
      { 'src/content/posts/x.md': null, 'config/feeds.yml': 'stale' },
    ),
    (e) => e instanceof ConflictError && e.path === 'config/feeds.yml',
  );
  assert.equal(await store.read('src/content/posts/x.md'), null);
  await assert.rejects(store.commit([{ path: 'src/content/posts/old.md', content: 'z' }], 'Edit', {}), ConflictError);
  assert.equal(store.log.length, 0);
});
