import fs from 'node:fs';
import path from 'node:path';
import type { AstroIntegration } from 'astro';
import { loadAdminSettings } from '../lib/admin/settings';

const API_DIR = 'src/admin/routes/api';

/** `auth/login.ts`, `collections/[name]/[slug].ts`, … relative to API_DIR. */
function apiRouteFiles(): string[] {
  return fs
    .readdirSync(API_DIR, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
}

/**
 * On Vercel (VERCEL set): injects the custom admin's on-demand pages and API routes, with the settings the
 * functions need baked in. Everywhere else: injects the Sveltia admin, so static builds have no functions.
 */
export default function admin(): AstroIntegration {
  return {
    name: 'scholaros-admin',
    hooks: {
      'astro:config:setup': ({ command, injectRoute, logger, updateConfig }) => {
        if (!process.env.VERCEL) {
          injectRoute({ pattern: '/[...cms]', entrypoint: './src/admin/sveltia/[...cms].astro' });
          injectRoute({ pattern: '/[...cmsConfig]', entrypoint: './src/admin/sveltia/[...cmsConfig].ts' });
          return;
        }
        const settings = loadAdminSettings();
        if (!process.env.SESSION_SECRET) logger.warn('SESSION_SECRET is not set: the admin will refuse every request.');
        updateConfig({ vite: { define: { __SCHOLAROS_ADMIN__: JSON.stringify(settings) } } });
        injectRoute({
          pattern: `/${settings.adminPath}/[...path]`,
          entrypoint: './src/admin/routes/[...path].astro',
          prerender: false,
        });
        for (const file of apiRouteFiles()) {
          if (file === 'auth/dev.ts' && command !== 'dev') continue;
          injectRoute({
            pattern: `/api/admin/${file.replace(/\.ts$/, '')}`,
            entrypoint: `./${API_DIR}/${file}`,
            prerender: false,
          });
        }
      },
    },
  };
}
