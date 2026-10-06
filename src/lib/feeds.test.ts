import test from 'node:test';
import assert from 'node:assert/strict';
import { syncFeeds } from './feeds';
import type { FeedItem } from './types';

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items}</channel></rss>`;
const BLOG = rss(
  `<item><title>First</title><link>https://ex.com/a/</link><pubDate>Tue, 01 Oct 2024 10:00:00 GMT</pubDate>` +
    `<description>&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;</description></item>` +
    `<item><title>Second</title><link>https://ex.com/b</link><pubDate>Mon, 02 Sep 2024 10:00:00 GMT</pubDate></item>`,
);
const fetcher = (pages: Record<string, string>) => async (url: string) => {
  if (!(url in pages)) throw new Error(`HTTP 404 for ${url}`);
  return pages[url];
};

test('syncFeeds: parses items, normalizes links, keeps ids stable', async () => {
  const config = { feeds: [{ name: "Jane Smith's Blog", url: 'https://ex.com/feed', author: 'jane', tags: ['blog'] }] };
  const { items, ok, failed } = await syncFeeds(config, [], fetcher({ 'https://ex.com/feed': BLOG }));
  assert.equal(ok, 1);
  assert.deepEqual(failed, []);
  assert.deepEqual(
    items.map((i) => [i.title, i.link, i.date]),
    [
      ['First', 'https://ex.com/a', '2024-10-01'],
      ['Second', 'https://ex.com/b', '2024-09-02'],
    ],
  );
  assert.match(items[0].id, /^feed-jane-smith-s-blog-[0-9a-f]{8}$/);
  assert.equal(items[0].excerpt, 'Hello & welcome');
  assert.equal(items[0].author, 'jane');
  assert.deepEqual(items[0].tags, ['blog']);
});

test('syncFeeds: merges with existing items and injects the Medium feed', async () => {
  const existing: FeedItem[] = [
    { id: 'old', title: 'Old', link: 'https://ex.com/old', date: '2023-01-01', source: 'X' },
  ];
  const config = { mediumUrl: 'https://medium.com/feed/@me', feeds: [] };
  const { items } = await syncFeeds(config, existing, fetcher({ 'https://medium.com/feed/@me': BLOG }));
  assert.deepEqual(
    items.map((i) => i.title),
    ['First', 'Second', 'Old'],
  );
  assert.equal(items[0].source, 'Medium');
});

test('syncFeeds: one failing feed is reported, all failing throws, none configured throws', async () => {
  const config = {
    feeds: [
      { name: 'Good', url: 'https://ex.com/feed' },
      { name: 'Bad', url: 'https://bad.example/feed' },
    ],
  };
  const result = await syncFeeds(config, [], fetcher({ 'https://ex.com/feed': BLOG }));
  assert.equal(result.ok, 1);
  assert.equal(result.failed[0].source, 'Bad');
  await assert.rejects(syncFeeds(config, [], fetcher({})), /All 2 feed\(s\) failed/);
  await assert.rejects(syncFeeds({ feeds: [] }, [], fetcher({})), /No feeds configured/);
});
