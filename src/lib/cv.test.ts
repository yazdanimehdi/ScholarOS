import test from 'node:test';
import assert from 'node:assert/strict';
import { cvEntryView, cvSections, formatDateRange, resolveCvConfig, sectionTitle } from './cv';
import type { CvConfig, CvData } from './types';

const structured: CvConfig = { cv: { name: 'Structured', sections: {} } };
const fromStructured = () => structured;

test('resolveCvConfig: an enabled upload wins, with snake_case keys normalized', () => {
  const content =
    'cv:\n  name: Uploaded\n  sections:\n    work_experience:\n      - company: X\n        start_date: 2020-01\n';
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

test('cvEntryView: each RenderCV entry shape', () => {
  assert.deepEqual(cvEntryView('Program committee, ACL'), { title: 'Program committee, ACL', points: [] });
  assert.deepEqual(
    cvEntryView({
      institution: 'U of E',
      area: 'CS',
      degree: 'Ph.D.',
      location: 'City',
      startDate: '2010-09',
      endDate: '2015-05',
      highlights: ['Thesis: X'],
    }),
    { title: 'Ph.D. in CS', org: 'U of E, City', when: '2010-09 – 2015-05', points: ['Thesis: X'] },
  );
  assert.deepEqual(cvEntryView({ label: 'Languages', details: 'Python, Rust' }), {
    title: 'Languages',
    org: 'Python, Rust',
    points: [],
  });
  assert.deepEqual(
    cvEntryView({ company: 'U of T', position: 'Professor', startDate: '2020-01', endDate: 'present' }),
    {
      title: 'Professor',
      org: 'U of T',
      when: '2020-01 – Present',
      points: [],
    },
  );
  assert.deepEqual(
    cvEntryView({ title: 'Paper', authors: ['**Jane Smith**', 'Alex Chen'], journal: 'ACL', date: 2024 }),
    {
      title: 'Paper',
      org: 'Jane Smith, Alex Chen · ACL',
      when: '2024',
      points: [],
    },
  );
  assert.deepEqual(cvEntryView({ name: 'Best Paper', date: '2023', highlights: ['x', 3] }), {
    title: 'Best Paper',
    when: '2023',
    points: ['x'],
  });
  assert.equal(cvEntryView({ foo: 1 }), null);
  assert.equal(cvEntryView(42), null);
});
