import test from 'node:test';
import assert from 'node:assert/strict';
import {
  becameDue,
  formatNewsDate,
  isPublished,
  postStatus,
  readingTime,
  withoutCrossPosted,
  withoutHidden,
} from './utils';

// West of UTC: date-only frontmatter (UTC midnight) must not slip to the previous day.
process.env.TZ = 'America/Los_Angeles';

test('formatNewsDate: formats at the requested precision', () => {
  const d = new Date('2025-10-03');
  assert.equal(formatNewsDate(d, 'day'), 'Oct 3, 2025');
  assert.equal(formatNewsDate(d, 'month'), 'Oct 2025');
  assert.equal(formatNewsDate(d, 'year'), '2025');
  assert.equal(formatNewsDate(d), 'Oct 2025');
});

test('formatNewsDate: date-only values keep their day west of UTC', () => {
  assert.equal(formatNewsDate(new Date('2024-01-01'), 'day'), 'Jan 1, 2024');
  assert.equal(formatNewsDate(new Date('2024-01-01'), 'year'), '2024');
});

test('readingTime: ceil(words / 230), at least 1 minute', () => {
  assert.equal(readingTime(''), 1);
  assert.equal(readingTime('word '.repeat(230)), 1);
  assert.equal(readingTime('word '.repeat(231)), 2);
  assert.equal(readingTime('  spaced\n\nout\twords  '), 1);
});

test('withoutHidden drops listed feed ids only', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(withoutHidden(items, ['b', 'zzz']), [{ id: 'a' }, { id: 'c' }]);
  assert.deepEqual(withoutHidden(items, []), items);
});

test('isPublished: drafts never; dated posts from their instant on (date-only = UTC midnight)', () => {
  const now = new Date('2026-10-07T03:00:00Z');
  assert.equal(isPublished({ data: { draft: true, date: new Date('2020-01-01') } }, now), false);
  assert.equal(isPublished({ data: { date: new Date('2026-10-08') } }, now), false);
  assert.equal(isPublished({ data: { date: new Date('2026-10-06') } }, now), true);
  assert.equal(isPublished({ data: { date: new Date('2026-10-07T03:00:00Z') } }, now), true, 'boundary is public');
  assert.equal(
    isPublished({ data: { date: '2026-10-07' } }, now),
    true,
    'strings work (admin and scripts read raw YAML)',
  );
  assert.equal(isPublished({ data: { date: 'not a date' } }, now), false);
});

test('isPublished: datetime values (Sveltia) are compared to the minute', () => {
  const now = new Date('2026-10-07T09:00:00Z');
  assert.equal(isPublished({ data: { date: '2026-10-07T08:59:00Z' } }, now), true);
  assert.equal(isPublished({ data: { date: '2026-10-07T09:01:00Z' } }, now), false);
});

test('becameDue: public at `now` but not yet at `since`', () => {
  const since = new Date('2026-10-06T03:00:00Z');
  const now = new Date('2026-10-07T03:00:00Z');
  assert.equal(becameDue({ data: { date: '2026-10-07' } }, since, now), true);
  assert.equal(becameDue({ data: { date: '2026-10-05' } }, since, now), false, 'already public before');
  assert.equal(becameDue({ data: { date: '2026-10-08' } }, since, now), false, 'still in the future');
  assert.equal(becameDue({ data: { date: '2026-10-07', draft: true } }, since, now), false);
});

test('postStatus: Draft, Scheduled · date, Published', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  assert.equal(postStatus({ draft: true, date: '2030-01-01' }, now), 'Draft');
  assert.equal(postStatus({ date: '2026-10-08' }, now), 'Scheduled · 2026-10-08');
  assert.equal(postStatus({ date: '2026-10-07' }, now), 'Published');
  assert.equal(postStatus({}, now), 'Published');
});

test('withoutCrossPosted: hides feed copies of cross-posted site posts by link (query ignored) or normalized title', () => {
  const item = (link: string, title: string) => ({ id: link, data: { link, title } });
  const posts = [
    { data: { title: 'Fast  Proofs: A Tour!', medium: { url: 'https://medium.com/@jane/fast-proofs-a-tour-1a2b' } } },
    { data: { title: 'Only on the site' } },
  ];
  const kept = withoutCrossPosted(
    [
      item('https://medium.com/@jane/fast-proofs-a-tour-1a2b?source=rss-abc------2', 'Fast proofs: a tour'),
      item('https://medium.com/@jane/renamed-9z', 'fast proofs a tour'),
      item('https://medium.com/@jane/other-3c', 'A different essay'),
      item('https://medium.com/@jane/only-4d', 'Only on the site'),
    ],
    posts,
  );
  assert.deepEqual(
    kept.map((i) => i.data.title),
    ['A different essay', 'Only on the site'],
    'link match, title match; a same-titled post without a Medium URL hides nothing',
  );
});
