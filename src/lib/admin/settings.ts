import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { extractGitHubUsername } from '../utils';

export interface AdminSettings {
  adminPath: string;
  adminUsers: string[];
  /** Repo folder for collection images (cms.yml `media_folder`), e.g. src/assets/images */
  mediaFolder: string;
  /** Prefix written into front matter for those images (cms.yml `public_folder`), e.g. /src/assets/images */
  publicFolder: string;
  siteName: string;
}

/** Replaced at build time by src/integrations/admin.ts (Vite define). */
declare const __SCHOLAROS_ADMIN__: AdminSettings | undefined;

const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '');

/** Reads config/site.yml and config/cms.yml. Used at build time and in dev/tests; Vercel functions get the baked copy. */
export function loadAdminSettings(root = process.cwd()): AdminSettings {
  const read = (file: string) =>
    (yaml.load(fs.readFileSync(path.join(root, 'config', file), 'utf8')) ?? {}) as Record<string, unknown>;
  const site = read('site.yml');
  const cms = read('cms.yml');
  const mediaFolder = trimSlashes(String(cms.media_folder ?? 'src/assets/images'));
  // The folder is the root of the upload allowlist: '', '/', '.' or '..' would widen it to the repo or beyond.
  if (mediaFolder.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    throw new Error('config/cms.yml media_folder must be a relative folder inside the repo');
  }
  return {
    adminPath: trimSlashes(String(site.adminPath || 'admin')),
    adminUsers: Array.isArray(site.adminUsers) ? site.adminUsers.map(String) : [],
    mediaFolder,
    publicFolder: `/${trimSlashes(String(cms.public_folder ?? mediaFolder))}`,
    siteName: String((site.siteMode === 'lab' ? site.labName : site.author) ?? ''),
  };
}

let loaded: AdminSettings | undefined;

export function adminSettings(): AdminSettings {
  return typeof __SCHOLAROS_ADMIN__ !== 'undefined' ? __SCHOLAROS_ADMIN__ : (loaded ??= loadAdminSettings());
}

/** The GitHub login an adminUsers entry names: entries may be usernames, @usernames or https://github.com/<user> URLs. */
export const adminLogin = (entry: string) => (extractGitHubUsername(entry) ?? entry).trim().replace(/^@/, '');

/** Logins are case-insensitive. */
export function isAdminUser(login: string, adminUsers: string[]): boolean {
  const wanted = login.trim().toLowerCase();
  if (!wanted) return false;
  return adminUsers.some((entry) => adminLogin(entry).toLowerCase() === wanted);
}
