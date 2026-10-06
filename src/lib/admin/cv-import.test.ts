import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml';
import { cvSchema } from '../schemas';
import { ImportError, importRenderCv } from './cv-import';

const FIXTURE = fs.readFileSync('tests/fixtures/rendercv.yaml', 'utf8');
const FIXTURE_PUBS = (parse(FIXTURE).cv.sections.selected_publications as unknown[]).length;
type Sections = Record<string, Record<string, unknown>[]>;

test('maps the fixture into cv.yml shape and moves publications into the collection', () => {
  const { cv, publications, summary } = importRenderCv(FIXTURE, []);
  const sections = (cv as { cv: { sections: Sections } }).cv.sections;
  assert.ok(cvSchema.safeParse(cv).success);
  assert.ok(!('selectedPublications' in sections));
  assert.ok('researchExperience' in sections, 'snake_case keys become camelCase');
  assert.equal(sections.education[0].startDate, '2021-01');
  assert.equal(publications.length, FIXTURE_PUBS);
  assert.deepEqual({ n: summary.newPublications, u: summary.updatedPublications }, { n: FIXTURE_PUBS, u: 0 });
  assert.ok(summary.sections.some((s) => s.key === 'education' && s.count === 3));
  for (const p of publications) {
    assert.equal(p.version, null);
    assert.match(p.slug, /^[a-z0-9-]{1,80}$/);
    assert.ok(
      (p.data.authors as string[]).every((a) => !a.includes('*')),
      'bold markers stripped',
    );
    assert.equal(typeof p.data.year, 'number');
    assert.ok(['journal', 'conference', 'preprint', 'workshop'].includes(p.data.type as string));
  }
  assert.equal(new Set(publications.map((p) => p.slug)).size, publications.length, 'slugs are unique');
});

test('re-import updates matching entries in place and keeps curated fields', () => {
  const fresh = importRenderCv(FIXTURE, []).publications;
  const [a, b] = fresh;
  const existing = [
    {
      slug: 'curated',
      version: 'v1',
      data: {
        ...a.data,
        doi: `https://doi.org/${a.data.doi}`,
        title: 'Old title',
        topic: 'nlp',
        type: 'journal',
        abstract: 'Kept',
      },
    },
    {
      slug: 'by-title',
      version: 'v2',
      data: { title: `${String(b.data.title).toUpperCase()}!`, authors: [], venue: 'x', year: 2000, type: 'preprint' },
    },
  ];
  const { publications, summary } = importRenderCv(FIXTURE, existing);
  const curated = publications.find((p) => p.slug === 'curated')!;
  assert.equal(curated.version, 'v1');
  assert.equal(curated.data.title, a.data.title, 'the CV owns title/authors/venue/year/doi/url');
  assert.deepEqual([curated.data.topic, curated.data.type, curated.data.abstract], ['nlp', 'journal', 'Kept']);
  assert.equal(publications.find((p) => p.slug === 'by-title')?.version, 'v2');
  assert.deepEqual(
    [summary.updatedPublications, summary.newPublications, publications.length],
    [2, FIXTURE_PUBS - 2, FIXTURE_PUBS],
  );
});

test('MDX publications are left alone', () => {
  const [a] = importRenderCv(FIXTURE, []).publications;
  const result = importRenderCv(FIXTURE, [{ slug: 'mdx-one', version: 'v', readonly: true, data: a.data }]);
  assert.equal(result.summary.skipped, 1);
  assert.ok(!result.publications.some((p) => p.slug === 'mdx-one'));
});

test('invalid YAML and non-RenderCV documents are import errors', () => {
  assert.throws(() => importRenderCv('cv: [unclosed', []), ImportError);
  assert.throws(() => importRenderCv('name: no cv key', []), ImportError);
  assert.throws(() => importRenderCv('cv:\n  name: X\n  sections:\n    odd:\n      - foo: 1\n', []), ImportError);
});
