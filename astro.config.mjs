import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { rehypeExternalLinks } from './src/lib/rehype-external-links';

export default defineConfig({
  site: 'https://example.com',
  integrations: [
    vue({ appEntrypoint: '/src/pages/_app.ts' }),
    mdx(),
    sitemap(),
  ],
  markdown: {
    rehypePlugins: [rehypeExternalLinks],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
