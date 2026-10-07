import test from 'node:test';
import assert from 'node:assert/strict';
import { duePosts } from './due-posts';

const file = (name: string, front: string) => ({
  path: `src/content/posts/${name}`,
  content: `---\n${front}\n---\n\nBody\n`,
});

test('duePosts: due in the 26 h before now; older, future, draft and broken posts are not', () => {
  const now = new Date('2026-10-07T06:00:00Z');
  const files = [
    file('today.md', 'title: T\ndate: 2026-10-07'),
    file('long-ago.md', 'title: L\ndate: 2026-10-06'), // 10-06T00:00Z, before the window (10-06T04:00Z, now]
    file('jitter.md', 'title: J\ndate: 2026-10-06T05:00:00Z'), // 25 h ago: inside the 26 h window
    file('tomorrow.md', 'title: F\ndate: 2026-10-08'),
    file('draft.md', 'title: D\ndate: 2026-10-07\ndraft: true'),
    file('broken.md', 'title: [unclosed'),
    file('mdx-post.mdx', 'title: M\ndate: 2026-10-07'),
  ];
  assert.deepEqual(duePosts(files, now), ['today', 'jitter', 'mdx-post']);
});
