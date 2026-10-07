import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL, cacheTagHeader, isValidTag, tagsForPath, tagsForPaths } from './cache-tags';

test('tagsForPath: config, entries, feeds, data files, images, unknown', () => {
  assert.deepEqual(tagsForPath('config/site.yml'), ['cfg:site']);
  assert.deepEqual(tagsForPath('config/cv-upload.yml'), ['cfg:cv-upload']);
  assert.deepEqual(tagsForPath('src/content/posts/hello.md'), ['col:posts', 'doc:posts/hello']);
  assert.deepEqual(tagsForPath('src/content/posts/legacy.mdx'), ['col:posts', 'doc:posts/legacy']);
  assert.deepEqual(tagsForPath('src/data/feeds.json'), ['col:feeds']);
  assert.deepEqual(tagsForPath('src/data/cv.json'), ['data:cv']);
  assert.deepEqual(tagsForPath('https://abc.public.blob.vercel-storage.com/fig-123456.png'), []);
  assert.deepEqual(tagsForPath('src/assets/images/x.png'), []);
  assert.deepEqual(tagsForPath('README.md'), [ALL]);
});

test('tagsForPaths: distinct', () => {
  assert.deepEqual(tagsForPaths(['src/content/posts/a.md', 'src/content/posts/b.md']), [
    'col:posts',
    'doc:posts/a',
    'doc:posts/b',
  ]);
});

test('cacheTagHeader: adds all; 128+ tags or an invalid tag → all', () => {
  assert.equal(cacheTagHeader(['cfg:site', 'col:posts', 'cfg:site']), 'cfg:site,col:posts,all');
  assert.equal(cacheTagHeader([]), 'all');
  const many = Array.from({ length: 127 }, (_, i) => `doc:posts/p${i}`);
  assert.equal(cacheTagHeader(many).split(',').length, 128);
  assert.equal(cacheTagHeader([...many, 'doc:posts/one-more']), 'all');
  assert.equal(cacheTagHeader(['a,b']), 'all');
  assert.equal(cacheTagHeader(['x'.repeat(257)]), 'all');
});

test('isValidTag', () => {
  assert.equal(isValidTag('doc:posts/a'), true);
  assert.equal(isValidTag('a,b'), false);
  assert.equal(isValidTag(''), false);
  assert.equal(isValidTag('x'.repeat(257)), false);
});
