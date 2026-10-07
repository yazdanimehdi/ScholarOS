import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { committed, session, toasts } from './api';

// Toasts expire on a timer; fake timers keep them from holding the test process open.
before(() => mock.timers.enable({ apis: ['setTimeout'] }));
beforeEach(() => {
  toasts.splice(0);
});

test('git mode: commit toast with the commit link', () => {
  session.mode = 'git';
  committed({ url: 'https://github.com/o/r/commit/c' });
  assert.equal(toasts[0].text, 'Committed · live in about a minute');
  assert.equal(toasts[0].href, 'https://github.com/o/r/commit/c');
});

test('postgres mode: "Published"; a failed purge offers Retry refresh', () => {
  session.mode = 'postgres';
  committed({});
  assert.equal(toasts[0].text, 'Published');
  committed({ warning: 'cache-purge-failed', tags: ['cfg:site'] });
  assert.match(toasts[1].text, /could not be refreshed/);
  assert.equal(toasts[1].action?.label, 'Retry refresh');
});
