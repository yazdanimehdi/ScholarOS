import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNewsDate, readingTime } from './utils';

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
