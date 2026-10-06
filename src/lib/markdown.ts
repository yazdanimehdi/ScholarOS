import { createMarkdownProcessor, type MarkdownProcessor } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import { rehypeExternalLinks } from './rehype-external-links';
import { rehypeMathJaxPassthrough } from './rehype-mathjax-passthrough';

let processor: Promise<MarkdownProcessor> | undefined;

/** Markdown kept in YAML config (bios, research bodies) → HTML, with the same plugins as content files. */
export async function renderMarkdown(md: string | undefined): Promise<string> {
  if (!md?.trim()) return '';
  processor ??= createMarkdownProcessor({
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeExternalLinks, rehypeMathJaxPassthrough],
  });
  const { code } = await (await processor).render(md);
  return code;
}
