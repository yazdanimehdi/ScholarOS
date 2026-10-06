import test from 'node:test';
import assert from 'node:assert/strict';
import { cvSections, formatDateRange, resolveCvConfig, sectionTitle } from './cv';
import type { CvConfig, CvData } from './types';

const structured: CvConfig = { cv: { name: 'Structured', sections: {} } };
const fromStructured = () => structured;

test('resolveCvConfig: an enabled upload wins, with snake_case keys normalized', () => {
  const content = 'cv:\n  name: Uploaded\n  sections:\n    work_experience:\n      - company: X\n        start_date: 2020-01\n';
  const cv = resolveCvConfig({ enabled: true, content }, fromStructured).cv;
  assert.equal(cv.name, 'Uploaded');
  assert.deepEqual(Object.keys(cv.sections), ['workExperience']);
  assert.equal((cv.sections.workExperience as { startDate: string }[])[0].startDate, '2020-01');
});

test('resolveCvConfig: falls back to the structured CV', () => {
  assert.equal(resolveCvConfig(null, fromStructured), structured);
  assert.equal(resolveCvConfig({ enabled: false, content: 'cv: {name: X}' }, fromStructured), structured);
  assert.equal(resolveCvConfig({ enabled: true, content: '   ' }, fromStructured), structured);
  assert.equal(resolveCvConfig({ enabled: true, content: 'name: no cv key' }, fromStructured), structured);
  assert.equal(resolveCvConfig({ enabled: true, content: 'cv: [unclosed' }, fromStructured), structured);
});

test('formatDateRange and sectionTitle keep the classic formatting', () => {
  assert.equal(formatDateRange('2020-01', 'present'), '2020-01 – Present');
  assert.equal(formatDateRange('2015-09', '2019-12'), '2015-09 – 2019-12');
  assert.equal(formatDateRange(undefined, '2019'), '');
  assert.equal(sectionTitle('selectedPublications'), 'Selected Publications');
  assert.equal(sectionTitle('education'), 'Education');
});

test('cvSections: keeps YAML order and drops empty or non-list sections', () => {
  const cv = { name: 'x', sections: { b: [1], a: [], c: undefined, d: ['x'] } } as unknown as CvData;
  assert.deepEqual(
    cvSections(cv).map(([k]) => k),
    ['b', 'd'],
  );
});
