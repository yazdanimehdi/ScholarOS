import { createMarkdownProcessor, type MarkdownHeading, type MarkdownProcessor } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import { rehypeExternalLinks } from './rehype-external-links';
import { rehypeMathJaxPassthrough } from './rehype-mathjax-passthrough';

/** astro.config.mjs `markdown`: content files at build time and Postgres-mode documents at request time render alike. */
export const markdownOptions = {
  remarkPlugins: [remarkMath],
  rehypePlugins: [rehypeExternalLinks, rehypeMathJaxPassthrough],
  shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } as const },
};

let configProcessor: Promise<MarkdownProcessor> | undefined;
let documentProcessor: Promise<MarkdownProcessor> | undefined;

/** Markdown kept in YAML config (bios, research bodies) → HTML, with the same plugins as content files. */
export async function renderMarkdown(md: string | undefined): Promise<string> {
  if (!md?.trim()) return '';
  configProcessor ??= createMarkdownProcessor({
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeExternalLinks, rehypeMathJaxPassthrough],
  });
  const { code } = await (await configProcessor).render(md);
  return code;
}

/** A whole entry body (Postgres mode) → HTML and headings, like astro:content's render(). */
export async function renderMarkdownDocument(md: string): Promise<{ html: string; headings: MarkdownHeading[] }> {
  documentProcessor ??= createMarkdownProcessor(markdownOptions);
  const { code, metadata } = await (await documentProcessor).render(md);
  return { html: code, headings: metadata.headings };
}
