import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportTarget, mediaFiles, resolveReference, rewriteReferences, seedFiles } from './db-seed';
import { isDocumentPath } from './admin/paths';

const folders = { publicFolder: '/src/assets/images', mediaFolder: 'src/assets/images' };

function repo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-'));
  for (const [p, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), content);
  }
  return root;
}

test('seedFiles copies config, entries, MDX and data files, and reports what it can’t copy', () => {
  const root = repo({
    'config/site.yml': 'title: A',
    'src/content/posts/hello.md': '---\ntitle: H\n---\n',
    'src/content/posts/legacy.mdx': '---\ntitle: L\n---\n',
    'src/content/posts/Bad_Name.md': '---\ntitle: B\n---\n',
    'src/content/posts/2024/nested.md': '---\ntitle: N\n---\n',
    'src/data/feeds.json': '[]',
    'src/data/cv.json': '{}',
  });
  const { documents, skipped } = seedFiles(root);
  assert.deepEqual(documents.sort(), [
    'config/site.yml',
    'src/content/posts/hello.md',
    'src/content/posts/legacy.mdx',
    'src/data/cv.json',
    'src/data/feeds.json',
  ]);
  assert.deepEqual(skipped.sort(), ['src/content/posts/2024/nested.md', 'src/content/posts/Bad_Name.md']);
});

test('mediaFiles: images from media_folder and public/images only', () => {
  const root = repo({ 'src/assets/images/a.png': 'x', 'src/assets/images/notes.txt': 'x', 'public/images/b.svg': 'x' });
  assert.deepEqual(mediaFiles(root, 'src/assets/images').sort(), ['public/images/b.svg', 'src/assets/images/a.png']);
});

test('resolveReference: public URLs, public_folder URLs, relative paths; external ignored', () => {
  assert.equal(resolveReference('/images/x.svg', 'config/site.yml', folders.publicFolder, folders.mediaFolder), 'public/images/x.svg');
  assert.equal(resolveReference('/src/assets/images/y.png', 'src/content/posts/a.md', folders.publicFolder, folders.mediaFolder), 'src/assets/images/y.png');
  assert.equal(
    resolveReference('../../assets/images/people/p.svg', 'src/content/people/jane.md', folders.publicFolder, folders.mediaFolder),
    'src/assets/images/people/p.svg',
  );
  assert.equal(resolveReference('https://cdn.example/x.png', 'config/site.yml', folders.publicFolder, folders.mediaFolder), null);
  assert.equal(resolveReference('plain text', 'config/site.yml', folders.publicFolder, folders.mediaFolder), null);
});

test('relative front-matter paths are rewritten; so are YAML values and Markdown images', () => {
  const urls = new Map([
    ['src/assets/images/people/p.svg', 'https://b.public.blob.vercel-storage.com/p-111111.svg'],
    ['public/images/hero.svg', 'https://b.public.blob.vercel-storage.com/hero-222222.svg'],
    ['src/assets/images/fig.png', 'https://b.public.blob.vercel-storage.com/fig-333333.png'],
  ]);
  const person = "---\nname: Jane\nphoto: '../../assets/images/people/p.svg'\n---\n\nBio\n";
  assert.match(rewriteReferences('src/content/people/jane.md', person, urls, folders), /photo: 'https:\/\/b\.public\.blob\.vercel-storage\.com\/p-111111\.svg'/);
  const site = "hero:\n  image: '/images/hero.svg' # figure\nother: '/images/missing.svg'\n";
  const out = rewriteReferences('config/site.yml', site, urls, folders);
  assert.match(out, /image: 'https:\/\/b\.public\.blob\.vercel-storage\.com\/hero-222222\.svg' # figure/);
  assert.match(out, /other: '\/images\/missing\.svg'/);
  const post = '---\ntitle: T\n---\n\n![Fig](/src/assets/images/fig.png)\n\n<img src="/images/hero.svg" alt="">\n[link](https://x.y)\n';
  const rewritten = rewriteReferences('src/content/posts/t.md', post, urls, folders);
  assert.match(rewritten, /!\[Fig\]\(https:\/\/b\.public\.blob\.vercel-storage\.com\/fig-333333\.png\)/);
  assert.match(rewritten, /<img src="https:\/\/b\.public\.blob\.vercel-storage\.com\/hero-222222\.svg"/);
  assert.match(rewritten, /\[link\]\(https:\/\/x\.y\)/);
});

test('exportTarget: only document paths, never outside the folder', () => {
  const dir = '/tmp/site';
  assert.equal(exportTarget(dir, 'config/site.yml'), path.resolve(dir, 'config/site.yml'));
  assert.equal(exportTarget(dir, '../escape.yml'), null);
  assert.equal(exportTarget(dir, 'config/../../etc/passwd'), null);
  assert.equal(exportTarget(dir, 'scripts/evil.ts'), null);
});

test('isDocumentPath: allowlist minus images, plus MDX and data files', () => {
  assert.equal(isDocumentPath('config/site.yml'), true);
  assert.equal(isDocumentPath('src/content/posts/a.mdx'), true);
  assert.equal(isDocumentPath('src/data/cv-people.json'), true);
  assert.equal(isDocumentPath('src/assets/images/a.png'), false);
  assert.equal(isDocumentPath('package.json'), false);
});

test('rewriteReferences replaces whole reference tokens only', () => {
  const blob = 'https://b.public.blob.vercel-storage.com';
  // (a) the reference also sits inside an external URL; (b) the shorter relative reference is a suffix of a longer, un-uploaded one
  const urls = new Map([
    ['public/images/hero.svg', `${blob}/hero-222222.svg`],
    ['src/content/assets/a.png', `${blob}/a-444444.png`],
  ]);
  const doc = "---\nhero: '/images/hero.svg'\next: https://other.example/images/hero.svg\nshort: '../assets/a.png'\nlong: '../../assets/a.png'\n---\n";
  const out = rewriteReferences('src/content/people/j.md', doc, urls, folders);
  assert.match(out, new RegExp(`hero: '${blob}/hero-222222\\.svg'`)); // (c) both rewritten sites still rewritten
  assert.match(out, new RegExp(`short: '${blob}/a-444444\\.png'`));
  assert.match(out, /ext: https:\/\/other\.example\/images\/hero\.svg\n/);
  assert.match(out, /long: '\.\.\/\.\.\/assets\/a\.png'/);
});
