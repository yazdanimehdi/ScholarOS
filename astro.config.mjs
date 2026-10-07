import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { markdownOptions } from './src/lib/markdown';
import admin from './src/integrations/admin';
import { modeFromEnv } from './src/lib/mode';

const mode = modeFromEnv(process.env);

// Postgres mode renders the CV PDF in the function, which reads these from process.cwd() at runtime. Listed only in
// that mode, so a fork without the fonts directory still builds statically or in git mode.
const cvPdfFonts =
  mode === 'postgres'
    ? fs
        .readdirSync('src/lib/cv-pdf/fonts')
        .filter((f) => f.endsWith('.ttf'))
        .map((f) => `./src/lib/cv-pdf/fonts/${f}`)
    : [];

export default defineConfig({
  site: 'https://example.com',
  // Vercel only. Git mode: admin routes are functions, public pages prerendered. Postgres mode: every page is a
  // function, and Blob images are optimized by /_vercel/image.
  // Postgres maxDuration 60 s: the daily cron runs feeds then backup in one request; the PDF renders on save.
  adapter:
    mode === 'static'
      ? undefined
      : mode === 'postgres'
        ? vercel({ imageService: true, includeFiles: cvPdfFonts, maxDuration: 60 })
        : vercel(),
  ...(mode === 'postgres'
    ? { image: { remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }] } }
    : {}),
  // @astrojs/sitemap only sees prerendered pages; Postgres mode serves its own /sitemap-index.xml.
  integrations: [
    vue({ appEntrypoint: '/src/pages/_app.ts' }),
    mdx(),
    ...(mode === 'postgres' ? [] : [sitemap()]),
    admin(),
  ],
  markdown: markdownOptions,
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
