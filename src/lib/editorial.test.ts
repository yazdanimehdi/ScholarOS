import test from 'node:test';
import assert from 'node:assert/strict';
import {
  elsewhereLabel,
  homeBlocks,
  isOwner,
  jsonLd,
  featuredFirst,
  mergeWriting,
  normalizeAreas,
  paperLink,
  shortTitle,
  socialLinks,
  toRoman,
  topicFilters,
  topicOf,
} from './editorial';

test('paperLink: url, then doi, then arXiv', () => {
  assert.equal(paperLink({ url: 'https://a.org/p', doi: '10.1/x', arxiv: '2401.1' }), 'https://a.org/p');
  assert.equal(paperLink({ doi: '10.1/x', arxiv: '2401.1' }), 'https://doi.org/10.1/x');
  assert.equal(paperLink({ arxiv: '2401.1' }), 'https://arxiv.org/abs/2401.1');
  assert.equal(paperLink({}), undefined);
});

test('paperLink: tolerates pasted URLs and prefixes', () => {
  assert.equal(paperLink({ doi: 'https://doi.org/10.1/x' }), 'https://doi.org/10.1/x');
  assert.equal(paperLink({ doi: 'http://dx.doi.org/10.1/x' }), 'https://doi.org/10.1/x');
  assert.equal(paperLink({ arxiv: 'arXiv:2410.12459' }), 'https://arxiv.org/abs/2410.12459');
  assert.equal(paperLink({ arxiv: 'https://arxiv.org/abs/2410.12459' }), 'https://arxiv.org/abs/2410.12459');
});

test('isOwner: ignores a leading Prof./Dr. and surrounding spaces', () => {
  assert.ok(isOwner('Jane Smith', 'Prof. Jane Smith'));
  assert.ok(isOwner(' Dr Jane Smith ', 'Jane Smith'));
  assert.ok(!isOwner('Jane Smithson', 'Prof. Jane Smith'));
});

test('shortTitle: text before the first colon, else the whole title', () => {
  assert.equal(shortTitle('HELM: Hierarchical Encoding for mRNA'), 'HELM');
  assert.equal(shortTitle('No Colon Here'), 'No Colon Here');
  assert.equal(shortTitle(': Leading colon'), ': Leading colon');
});

test('toRoman: lower-case numerals', () => {
  assert.deepEqual([1, 2, 3, 4, 9, 14, 40].map(toRoman), ['i', 'ii', 'iii', 'iv', 'ix', 'xiv', 'xl']);
});

test('normalizeAreas: fills id, label, numeral and publications', () => {
  const [a] = normalizeAreas([{ title: 'AI Safety & Robustness', description: 'd' }]);
  assert.equal(a.id, 'ai-safety-robustness');
  assert.equal(a.label, 'AI Safety & Robustness');
  assert.equal(a.numeral, 'i.');
  assert.deepEqual(a.publications, []);
});

test('normalizeAreas: keeps explicit ids, de-duplicates, and avoids page anchors', () => {
  const areas = normalizeAreas([
    { id: 'nlp', label: 'NLP', title: 'Natural Language Processing', description: '' },
    { title: 'NLP', description: '' },
    { title: 'Software', description: '' },
    { id: '  ', title: '', description: '' },
  ]);
  assert.deepEqual(
    areas.map((a) => a.id),
    ['nlp', 'nlp-2', 'software-2', 'area-4'],
  );
  assert.deepEqual(
    areas.map((a) => a.numeral),
    ['i.', 'ii.', 'iii.', 'iv.'],
  );
  assert.equal(areas[0].label, 'NLP');
});

test('normalizeAreas: explicit ids are slugified; "all"/"other" are reserved', () => {
  const areas = normalizeAreas([
    { id: 'Machine Learning', title: 'x', description: '' },
    { id: 'all', title: 'All', description: '' },
    { id: 'other', title: 'Other', description: '' },
    { id: '!!!', title: 'Fallback Title', description: '' },
  ]);
  assert.deepEqual(
    areas.map((a) => a.id),
    ['machine-learning', 'all-2', 'other-2', 'fallback-title'],
  );
});

test('normalizeAreas: no areas → empty list', () => {
  assert.deepEqual(normalizeAreas(undefined), []);
});

test('topicOf: unknown or missing topics fall into "other"', () => {
  const ids = new Set(['nlp']);
  assert.equal(topicOf('nlp', ids), 'nlp');
  assert.equal(topicOf('robotics', ids), 'other');
  assert.equal(topicOf(undefined, ids), 'other');
  assert.equal(topicOf(' Machine Learning ', new Set(['machine-learning'])), 'machine-learning');
});

test('topicFilters: All first, empty areas hidden, Other only when used', () => {
  const areas = [
    { id: 'nlp', label: 'NLP' },
    { id: 'vision', label: 'Vision' },
  ];
  assert.deepEqual(topicFilters(['nlp', 'nlp', 'other'], areas), [
    { id: 'all', label: 'All', count: 3 },
    { id: 'nlp', label: 'NLP', count: 2 },
    { id: 'other', label: 'Other', count: 1 },
  ]);
  assert.deepEqual(
    topicFilters(['vision'], areas).map((f) => f.id),
    ['all', 'vision'],
  );
});

test('mergeWriting: newest first, unparseable dates last', () => {
  const item = (title: string, date: string) => ({ kind: 'site' as const, title, href: '#', date: new Date(date) });
  const sorted = mergeWriting([item('old', '2023-01-01'), item('bad', 'not a date'), item('new', '2025-05-01')]);
  assert.deepEqual(
    sorted.map((i) => i.title),
    ['new', 'old', 'bad'],
  );
});

test('mergeWriting: equal dates tie-break on href', () => {
  const item = (href: string) => ({ kind: 'site' as const, title: href, href, date: new Date('2024-01-01') });
  const sorted = mergeWriting([item('/b'), item('/c'), item('/a')]);
  assert.deepEqual(
    sorted.map((i) => i.href),
    ['/a', '/b', '/c'],
  );
});

test('elsewhereLabel: the single shared feed source, else "Elsewhere"', () => {
  assert.equal(elsewhereLabel(['Medium', ' Medium ']), 'Medium');
  assert.equal(elsewhereLabel(['Medium', 'Substack']), 'Elsewhere');
  assert.equal(elsewhereLabel([]), 'Elsewhere');
});

test('socialLinks: known profiles in a fixed order, blanks and email skipped', () => {
  assert.deepEqual(
    socialLinks({
      github: 'https://github.com/x',
      scholar: 'https://scholar.google.com/x',
      twitter: '',
      email: 'a@b.c',
    }),
    [
      { label: 'Google Scholar', href: 'https://scholar.google.com/x' },
      { label: 'GitHub', href: 'https://github.com/x' },
    ],
  );
  assert.deepEqual(socialLinks(undefined), []);
});

test('homeBlocks: hero, affiliations, research, then papers/updates in configured order', () => {
  assert.deepEqual(
    homeBlocks(['hero', 'about', 'news', 'publications', 'blog'], { affiliations: true, research: true }),
    ['hero', 'affiliations', 'research', 'updates', 'publications'],
  );
  assert.deepEqual(homeBlocks(['publications', 'blog'], { affiliations: false, research: true }), [
    'research',
    'publications',
    'updates',
  ]);
  assert.deepEqual(homeBlocks(['about'], { affiliations: false, research: false }), ['hero']);
});

test('jsonLd: escapes "<" so content cannot close the script tag', () => {
  assert.equal(jsonLd({ t: '</script>' }), '{"t":"\\u003c/script>"}');
});

test('featuredFirst: featured site posts lead, each group keeps its order', () => {
  const item = (href: string, featured?: boolean) => ({
    kind: 'site' as const,
    title: href,
    href,
    date: new Date(0),
    featured,
  });
  const out = featuredFirst([item('/a'), item('/b', true), item('/c'), item('/d', true)]);
  assert.deepEqual(
    out.map((i) => i.href),
    ['/b', '/d', '/a', '/c'],
  );
});
