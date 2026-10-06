import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { parseMarkdown, serializeMarkdown, updateYaml } from './serialize';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const comments = (src: string) =>
  src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('#'));

test('front matter: schema order first, unknown keys after, raw values kept', () => {
  const text = serializeMarkdown({ zeta: 1, date: '2024-06-01', title: 'Hello', draft: false }, 'Body\n', [
    'title',
    'date',
    'draft',
  ]);
  assert.equal(text, '---\ntitle: Hello\ndate: 2024-06-01\ndraft: false\nzeta: 1\n---\n\nBody\n');
});

test('front matter: no front matter, empty body, undefined values', () => {
  assert.deepEqual(parseMarkdown('Just text'), { data: {}, body: 'Just text' });
  assert.deepEqual(parseMarkdown('---\n---\n\nBody\n'), { data: {}, body: 'Body\n' });
  assert.deepEqual(parseMarkdown(serializeMarkdown({}, 'B', [])), { data: {}, body: 'B\n' });
  assert.equal(serializeMarkdown({ title: 'T', gone: undefined }, '', ['title']), '---\ntitle: T\n---\n');
});

test("front matter: parse → serialize keeps every content file's data and body", () => {
  const dir = 'src/content';
  for (const collection of fs.readdirSync(dir)) {
    for (const file of fs.readdirSync(path.join(dir, collection)).filter((f) => f.endsWith('.md'))) {
      const { data, body } = parseMarkdown(read(path.join(dir, collection, file)));
      const again = parseMarkdown(serializeMarkdown(data, body, []));
      assert.deepEqual(again.data, data, `${collection}/${file} data`);
      assert.equal(again.body.trim(), body.trim(), `${collection}/${file} body`);
    }
  }
});

test('updateYaml: an unchanged document comes back byte-identical', () => {
  for (const file of ['cv', 'research', 'feeds', 'cv-upload']) {
    const src = read(`config/${file}.yml`);
    assert.equal(updateYaml(src, parse(src)), src, file);
  }
  // site.yml: the yaml library re-indents one comment that follows a nested map; content and comments survive.
  const site = read('config/site.yml');
  const out = updateYaml(site, parse(site));
  assert.deepEqual(parse(out), parse(site));
  assert.deepEqual(comments(out), comments(site));
});

test('updateYaml: edits touch only the changed lines and keep comments and quoting', () => {
  const src = read('config/cv.yml');
  const data = parse(src);
  data.cv.name = 'Dr. Changed';
  delete data.cv.phone;
  data.cv.sections.education.pop();
  data.cv.sections.awards.push({ label: 'New Award', details: '2025' });
  const out = updateYaml(src, data);
  assert.deepEqual(parse(out), data);
  assert.deepEqual(comments(out), comments(src));
  assert.ok(out.includes("  name: 'Dr. Changed'"), 'existing single-quote style kept');
  assert.ok(!out.includes('phone:'));
  const unchanged = src
    .split('\n')
    .filter((l) => !/name:|phone:|Another University|Mathematics|B\.S\.|2004-09|2008-05/.test(l));
  for (const line of unchanged) assert.ok(out.includes(line), `kept: ${line}`);
});

test('updateYaml: empty source and new keys', () => {
  assert.equal(updateYaml('', { enabled: false, content: '' }), 'enabled: false\ncontent: ""\n');
  const feeds = updateYaml(read('config/feeds.yml'), { ...parse(read('config/feeds.yml')), hidden: ['feed-1'] });
  assert.ok(feeds.endsWith('hidden:\n  - feed-1\n'));
});
