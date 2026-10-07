import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { adminCollections, configSchemas, cvSchema, feedsConfigSchema } from './schemas';

const config = (file: string) => yaml.load(fs.readFileSync(`config/${file}.yml`, 'utf8'));

test('posts: featured is optional and defaults to false', () => {
  const base = { title: 'T', date: '2024-01-01' };
  assert.equal(adminCollections.posts.parse(base).featured, false);
  assert.equal(adminCollections.posts.parse({ ...base, featured: true }).featured, true);
});

test('admin collection schemas take image paths as plain strings', () => {
  const person = adminCollections.people.parse({ name: 'A', role: 'phd', photo: '/src/assets/images/a.png' });
  assert.equal(person.photo, '/src/assets/images/a.png');
  assert.equal(
    adminCollections.publications.safeParse({ title: 'T', authors: [], venue: 'V', year: 2024 }).success,
    false,
  );
});

test('every config file in the repo passes its admin schema', () => {
  for (const [file, schema] of Object.entries(configSchemas)) {
    const result = schema.safeParse(config(file));
    assert.ok(result.success, `${file}: ${JSON.stringify(result.error?.issues)}`);
  }
});

test('cv entries: RenderCV shapes and the visible flag pass, unknown shapes fail', () => {
  const ok = (entry: unknown) => cvSchema.safeParse({ cv: { name: 'N', sections: { s: [entry] } } }).success;
  assert.ok(ok({ institution: 'U', area: 'CS', visible: false }));
  assert.ok(ok({ company: 'C', position: 'P' }));
  assert.ok(ok({ position: 'P' }));
  assert.ok(ok({ title: 'Paper', authors: ['A'] }));
  assert.ok(ok({ label: 'Languages', details: 'Python' }));
  assert.ok(ok({ name: 'Award', date: '2024' }));
  assert.ok(ok({ bullet: 'Did a thing' }));
  assert.ok(ok('A plain text entry'));
  assert.ok(!ok({ foo: 1 }));
  assert.ok(!ok({ institution: 'U', area: 'CS', visible: 'no' }));
  assert.ok(!cvSchema.safeParse({ cv: { sections: {} } }).success, 'name is required');
});

test('feeds config: hidden is a list of ids', () => {
  assert.ok(feedsConfigSchema.safeParse({ feeds: [], hidden: ['feed-1'] }).success);
  assert.ok(!feedsConfigSchema.safeParse({ hidden: 'feed-1' }).success);
});

test('Sveltia config exposes the new fields (featured, visible, hidden)', () => {
  type Field = { name: string; fields?: Field[]; field?: Field };
  type Coll = { name: string; fields?: Field[]; files?: { name: string; fields: Field[] }[] };
  const cms = yaml.load(fs.readFileSync('config/cms.yml', 'utf8')) as { collections: Coll[] };
  const names = (fields: Field[] = []) => fields.map((f) => f.name);
  const posts = cms.collections.find((c) => c.name === 'posts')!;
  assert.ok(names(posts.fields).includes('featured'));
  const files = cms.collections.find((c) => c.name === 'settings')!.files!;
  assert.ok(names(files.find((f) => f.name === 'feeds')!.fields).includes('hidden'));
  const sections = files.find((f) => f.name === 'cv')!.fields[0].fields!.find((f) => f.name === 'sections')!.fields!;
  for (const s of ['education', 'experience', 'publications', 'awards', 'skills']) {
    assert.ok(names(sections.find((f) => f.name === s)!.fields).includes('visible'), `cv ${s} has visible`);
  }
  const personCv = cms.collections.find((c) => c.name === 'person-cvs')!.fields!.find((f) => f.name === 'cv')!;
  const personSections = personCv.fields!.find((f) => f.name === 'sections')!.fields!;
  assert.ok(personSections.length > 0);
  for (const s of personSections.filter((f) => f.fields)) {
    assert.equal(names(s.fields).at(-1), 'visible', `person-cvs ${s.name} ends with visible`);
  }
});

test('cv: pdf.pageSize is LETTER or A4', () => {
  const cv = { cv: { name: 'N' } };
  assert.ok(cvSchema.safeParse({ ...cv, pdf: { pageSize: 'A4' } }).success);
  assert.ok(cvSchema.safeParse(cv).success);
  assert.equal(cvSchema.safeParse({ ...cv, pdf: { pageSize: 'A5' } }).success, false);
});
