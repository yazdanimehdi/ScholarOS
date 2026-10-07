import { parseMarkdown } from './admin/serialize';
import { becameDue } from './utils';

// 26 h, not 24: GitHub's schedule jitter can leave a gap between two daily windows; a duplicate redeploy is harmless.
const WINDOW = 26 * 60 * 60 * 1000;

/** Ids of posts that became public in the 26 h before `now` (the daily release check). Unparseable files are skipped. */
export function duePosts(files: { path: string; content: string }[], now = new Date()): string[] {
  const since = new Date(now.getTime() - WINDOW);
  return files.flatMap(({ path, content }) => {
    try {
      const { data } = parseMarkdown(content);
      return becameDue({ data: data as { draft?: boolean; date: string } }, since, now)
        ? [path.slice(path.lastIndexOf('/') + 1).replace(/\.mdx?$/, '')]
        : [];
    } catch {
      return [];
    }
  });
}
