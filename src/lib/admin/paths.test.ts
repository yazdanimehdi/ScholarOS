import test from 'node:test';
import assert from 'node:assert/strict';
import { PathError, assertAllowed, assertCollection, assertConfigFile, assertSlug, collectionPath } from './paths';
import { adminSettings } from './settings';

const media = adminSettings().mediaFolder;

test('slugs: lowercase ascii letters, digits and dashes, 1–80 chars', () => {
  for (const ok of ['a', 'my-post-2', 'x'.repeat(80)]) assert.equal(assertSlug(ok), ok);
  const bad = ['', 'x'.repeat(81), 'Upper', 'with space', '../etc', 'a/b', 'café', 'ünï', '.hidden', 'a.md', '/abs', null, 42];
  for (const b of bad) assert.throws(() => assertSlug(b), PathError, String(b));
});

test('collections and config files are allowlisted by name', () => {
  assert.equal(assertCollection('posts'), 'posts');
  assert.throws(() => assertCollection('feeds'), PathError);
  assert.throws(() => assertCollection('../posts'), PathError);
  assert.equal(assertConfigFile('cv-upload'), 'cv-upload');
  assert.throws(() => assertConfigFile('cms'), PathError);
  assert.equal(collectionPath('posts', 'hello'), 'src/content/posts/hello.md');
  assert.throws(() => collectionPath('posts', 'Hello'), PathError);
});

test('assertAllowed accepts exactly the admin-writable paths', () => {
  const ok = [
    'config/site.yml',
    'config/cv-upload.yml',
    'src/content/posts/hello.md',
    'src/content/announcements/grant-2025.md',
    'src/data/feeds.json',
    `${media}/fig-abc123.png`,
    `${media}/people/jane.jpg`,
    'public/images/fig.svg',
  ];
  for (const p of ok) assert.doesNotThrow(() => assertAllowed(p), p);
  const bad = [
    'config/scholar.yml',
    'config/cms.yml',
    'src/content/posts/hello.mdx',
    'src/content/secret/x.md',
    'src/content/posts/UPPER.md',
    'src/content/posts/../../package.json',
    '/etc/passwd',
    'package.json',
    '.github/workflows/deploy.yml',
    `${media}/../x.png`,
    `${media}/.env.png`,
    `${media}/notes.txt`,
    'public/images/x.html',
    'public/index.html',
  ];
  for (const p of bad) assert.throws(() => assertAllowed(p), PathError, p);
});
