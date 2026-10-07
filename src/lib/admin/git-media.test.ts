import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from './memory-store';
import { PathError } from './paths';
import { adminSettings } from './settings';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

test('repo media: upload once, list with URLs, delete with the version', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-media-'));
  const store = new MemoryStore(root);
  const { mediaFolder, publicFolder } = adminSettings();
  const first = await store.putMedia('content', 'fig-abc123.png', PNG, 'image/png');
  assert.equal(first.path, `${mediaFolder}/fig-abc123.png`);
  assert.equal(first.url, `${publicFolder}/fig-abc123.png`);
  assert.ok(first.commit);
  const again = await store.putMedia('content', 'fig-abc123.png', PNG, 'image/png');
  assert.equal(again.commit, null);
  assert.deepEqual(
    (await store.listMedia('content')).map((f) => f.url),
    [`${publicFolder}/fig-abc123.png`],
  );
  const site = await store.putMedia('site', 'hero-abc123.png', PNG, 'image/png');
  assert.equal(site.url, '/images/hero-abc123.png');
  await store.deleteMedia(first.path, first.version);
  assert.deepEqual(await store.listMedia('content'), []);
  await assert.rejects(store.deleteMedia('config/site.yml', 'x'), PathError);
});
