import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { loadAdminSettings } from '../lib/admin/settings';
import { modeFromEnv } from '../lib/mode';

const API_DIR = 'src/admin/routes/api';

/** `auth/login.ts`, `collections/[name]/[slug].ts`, … relative to API_DIR. */
function apiRouteFiles(root: string): string[] {
  return fs
    .readdirSync(path.join(root, API_DIR), { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
}

/**
 * On Vercel: injects the custom admin's on-demand pages and API routes (settings and mode baked in); in Postgres
 * mode every public route renders on demand too. Static builds get the Sveltia admin and no functions.
 */
export default function admin(): AstroIntegration {
  return {
    name: 'scholaros-admin',
    hooks: {
      'astro:config:setup': ({ command, config, injectRoute, logger, updateConfig }) => {
        const root = fileURLToPath(config.root);
        const entry = (file: string) => path.join(root, file);
        const mode = modeFromEnv(process.env);
        if (mode === 'static') {
          injectRoute({ pattern: '/[...cms]', entrypoint: entry('src/admin/sveltia/[...cms].astro') });
          injectRoute({ pattern: '/[...cmsConfig]', entrypoint: entry('src/admin/sveltia/[...cmsConfig].ts') });
          return;
        }
        const settings = loadAdminSettings(root);
        if (!process.env.SESSION_SECRET) logger.warn('SESSION_SECRET is not set: the admin will refuse every request.');
        updateConfig({
          vite: {
            define: { __SCHOLAROS_ADMIN__: JSON.stringify(settings), __SCHOLAROS_MODE__: JSON.stringify(mode) },
          },
        });
        injectRoute({
          pattern: `/${settings.adminPath}/[...path]`,
          entrypoint: entry('src/admin/routes/[...path].astro'),
          prerender: false,
        });
        for (const file of apiRouteFiles(root)) {
          if (file === 'auth/dev.ts' && command !== 'dev') continue;
          injectRoute({
            pattern: `/api/admin/${file.replace(/\.ts$/, '')}`,
            entrypoint: entry(`${API_DIR}/${file}`),
            prerender: false,
          });
        }
        if (mode === 'postgres') {
          injectRoute({
            pattern: '/sitemap-index.xml',
            entrypoint: entry('src/lib/content/sitemap.ts'),
            prerender: false,
          });
        }
      },
      'astro:route:setup': ({ route }) => {
        // Postgres mode: every page renders per request from the database and is cached on Vercel's CDN.
        if (modeFromEnv(process.env) === 'postgres') route.prerender = false;
      },
    },
  };
}
