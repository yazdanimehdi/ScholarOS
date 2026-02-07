import type { APIRoute } from 'astro';
import { getSiteConfig } from '../lib/config';

export const GET: APIRoute = () => {
  const config = getSiteConfig();
  const siteUrl = config.siteUrl.replace(/\/$/, '');

  const body = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap-index.xml
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
