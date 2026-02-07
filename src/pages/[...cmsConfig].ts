// Generates config.yml alongside the CMS admin page at the configured path
import type { APIRoute, GetStaticPaths } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { getSiteConfig } from '../lib/config';

export const getStaticPaths: GetStaticPaths = () => {
  const config = getSiteConfig();
  const adminPath = config.adminPath || 'admin';
  return [{ params: { cmsConfig: `${adminPath}/config.yml` } }];
};

export const GET: APIRoute = () => {
  const configPath = path.resolve(process.cwd(), 'config/cms.yml');
  const body = fs.readFileSync(configPath, 'utf-8');
  return new Response(body, {
    headers: { 'Content-Type': 'text/yaml' },
  });
};
