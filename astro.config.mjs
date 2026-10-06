import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import remarkMath from 'remark-math';
import { rehypeExternalLinks } from './src/lib/rehype-external-links';
import { rehypeMathJaxPassthrough } from './src/lib/rehype-mathjax-passthrough';
import admin from './src/integrations/admin';

export default defineConfig({
  site: 'https://example.com',
  // Vercel only: the custom admin's routes run as functions. Every public page stays prerendered.
  adapter: process.env.VERCEL ? vercel() : undefined,
  integrations: [vue({ appEntrypoint: '/src/pages/_app.ts' }), mdx(), sitemap(), admin()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeExternalLinks, rehypeMathJaxPassthrough],
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      modulePreload: {
        polyfill: true,
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Merge the tiny Vue export helper (~0.77 KiB) into the Vue
            // runtime chunk to eliminate one hop in critical request chains
            if (id.includes('plugin-vue') && id.includes('export-helper')) {
              return 'runtime-dom.esm-bundler';
            }
            if (id.includes('vue') && id.includes('runtime-dom')) {
              return 'runtime-dom.esm-bundler';
            }
          },
        },
      },
    },
  },
});
