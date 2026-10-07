import type { APIRoute } from 'astro';
import { getSiteConfig } from '../config';
import { getEntries } from './index';

const ENTRY_ROUTES = [
  ['posts', '/blog'],
  ['announcements', '/news'],
  ['people', '/people'],
  ['projects', '/projects'],
  ['positions', '/positions'],
] as const;

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Postgres mode only (injected by src/integrations/admin.ts): @astrojs/sitemap only sees prerendered pages. */
export const GET: APIRoute = async ({ site }) => {
  const config = getSiteConfig();
  const base = (config.siteUrl || site?.toString() || '').replace(/\/$/, '');
  const paths = new Set<string>(['/']);
  for (const item of config.nav ?? []) if (item.href.startsWith('/')) paths.add(item.href);
  for (const [name, prefix] of ENTRY_ROUTES) {
    for (const entry of await getEntries(name)) {
      if ((entry.data as { draft?: boolean }).draft) continue;
      paths.add(`${prefix}/${entry.id}/`);
    }
  }
  const urls = [...paths].map((p) => `<url><loc>${escapeXml(base + p)}</loc></url>`).join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
