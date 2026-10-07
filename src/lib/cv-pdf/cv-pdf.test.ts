import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { parseMarkdown } from '../admin/serialize';
import type { CvData } from '../types';
import { buildCvDocument, type CvPublication } from './definition';
import { pageCount, renderCvPdf } from './render';

const demoCv = () => (yaml.load(fs.readFileSync('config/cv.yml', 'utf8')) as { cv: CvData }).cv;
const DIR = 'src/content/publications';
const demoPubs = (): CvPublication[] =>
  fs.readdirSync(DIR).map((f) => ({
    id: f.replace(/\.mdx?$/, ''),
    data: parseMarkdown(fs.readFileSync(`${DIR}/${f}`, 'utf8')).data as CvPublication['data'],
  }));
const ids = (def: ReturnType<typeof buildCvDocument>) =>
  (def.content as { id?: string }[]).map((c) => c.id).filter(Boolean);
const pub = (id: string, year: number, authors = ['A. Author']): CvPublication => ({
  id,
  data: { title: `Paper ${id}`, authors, venue: 'Venue', year },
});

test('buildCvDocument: the demo CV — header, sections in cv.yml order, Letter by default', () => {
  const def = buildCvDocument(demoCv(), demoPubs(), { author: 'Prof. Jane Smith' });
  assert.deepEqual(ids(def), [
    'section-education',
    'section-experience',
    'section-publications',
    'section-awards',
    'section-skills',
  ]);
  assert.equal(def.pageSize, 'LETTER');
  assert.deepEqual((def.content as object[])[0], { text: 'Prof. Jane Smith', style: 'name' });
  assert.match(JSON.stringify((def.content as object[])[1]), /jane\.smith@example\.com/);
});

test('buildCvDocument: entries marked visible: false are omitted', () => {
  const cv = {
    name: 'N',
    sections: {
      experience: [
        { company: 'Shown Co', position: 'A' },
        { company: 'Hidden Co', position: 'B', visible: false },
      ],
    },
  } as unknown as CvData;
  const json = JSON.stringify(buildCvDocument(cv, [], { author: 'N' }));
  assert.match(json, /Shown Co/);
  assert.doesNotMatch(json, /Hidden Co/);
});

test('buildCvDocument: publications from the collection, newest first, owner in bold, venue year not repeated', () => {
  const cv = {
    name: 'N',
    sections: { publications: [{ title: 'Ignored YAML pub', authors: ['X'] }] },
  } as unknown as CvData;
  const def = buildCvDocument(
    cv,
    [
      pub('old', 2020, ['Jane Smith', 'Bo Li']),
      { id: 'new', data: { title: 'New', authors: ['Bo Li'], venue: 'ACL 2024', year: 2024 } },
    ],
    { author: 'Prof. Jane Smith' },
  );
  const json = JSON.stringify(def);
  assert.doesNotMatch(json, /Ignored YAML pub/);
  assert.ok(json.indexOf('"New"') < json.indexOf('Paper old'), 'newest first');
  assert.match(json, /\{"text":"Jane Smith","bold":true\}/);
  assert.match(json, /\{"text":"Bo Li","bold":false\}/);
  assert.match(json, /"ACL 2024"/);
  assert.doesNotMatch(json, /ACL 2024 · 2024/);
});

test('buildCvDocument: without a publications key the section goes after experience, else last', () => {
  const sections = {
    education: [{ institution: 'U', area: 'CS' }],
    experience: [{ company: 'C', position: 'P' }],
    awards: [{ name: 'Prize' }],
  };
  assert.deepEqual(
    ids(buildCvDocument({ name: 'N', sections } as unknown as CvData, [pub('p', 2024)], { author: '' })),
    ['section-education', 'section-experience', 'section-publications', 'section-awards'],
  );
  const noExperience = { education: sections.education, awards: sections.awards };
  assert.deepEqual(
    ids(buildCvDocument({ name: 'N', sections: noExperience } as unknown as CvData, [pub('p', 2024)], { author: '' })),
    ['section-education', 'section-awards', 'section-publications'],
  );
});

test('buildCvDocument: an empty collection keeps the YAML publications section as written', () => {
  const cv = { name: 'N', sections: { publications: [{ title: 'Own paper', authors: ['N'] }] } } as unknown as CvData;
  const def = buildCvDocument(cv, [], { author: 'N' });
  assert.deepEqual(ids(def), ['section-publications']);
  assert.match(JSON.stringify(def), /Own paper/);
});

test('buildCvDocument: page size from options', () => {
  assert.equal(buildCvDocument(demoCv(), [], { author: '' }, { pageSize: 'A4' }).pageSize, 'A4');
});

test('renderCvPdf: a PDF under 1 MB; the demo CV fits on 2 pages; A4 is A4', async () => {
  const pdf = await renderCvPdf(buildCvDocument(demoCv(), demoPubs(), { author: 'Prof. Jane Smith' }));
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), '%PDF-');
  assert.ok(pdf.length < 1024 * 1024, `${pdf.length} bytes`);
  assert.ok(pageCount(pdf) >= 1 && pageCount(pdf) <= 2, `${pageCount(pdf)} pages`);
  const a4 = await renderCvPdf(buildCvDocument(demoCv(), [], { author: '' }, { pageSize: 'A4' }));
  assert.match(Buffer.from(a4).toString('latin1'), /MediaBox \[0 0 595\.28 841\.89\]/);
});

test('renderCvPdf: an empty CV and characters outside the fonts still render', async () => {
  const pdf = await renderCvPdf(
    buildCvDocument({ name: 'مهدی Yazdani 张伟', sections: {} } as unknown as CvData, [], { author: '' }),
  );
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), '%PDF-');
  assert.equal(pageCount(pdf), 1);
});
