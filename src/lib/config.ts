import yaml from 'js-yaml';
import { memo, readSiteFile } from './content/context';
import { getMode } from './mode';
import type { SiteConfig, HomepageSectionId, HomepageSectionEntry, ThemeName } from './types';

let _siteConfig: SiteConfig | null = null;

/** '' or missing → 'classic' (the CMS writes '' for untouched fields); any other unknown value is a config error. */
export function normalizeTheme(value: unknown, source: string): ThemeName {
  if (value === undefined || value === null || value === '') return 'classic';
  if (value === 'classic' || value === 'editorial') return value;
  throw new Error(`${source}: theme must be 'classic' or 'editorial', got '${String(value)}'`);
}

function readConfigFile(filename: string): string {
  const raw = readSiteFile(`config/${filename}`);
  if (raw === null) throw new Error(`config/${filename} not found`);
  return raw;
}

function parseSiteConfig(): SiteConfig {
  const config = yaml.load(readConfigFile('site.yml')) as SiteConfig;
  const envTheme = process.env.SCHOLAROS_THEME;
  config.theme = envTheme
    ? normalizeTheme(envTheme, 'SCHOLAROS_THEME')
    : normalizeTheme(config.theme, 'config/site.yml');
  return config;
}

export function getSiteConfig(): SiteConfig {
  // Postgres mode: site.yml can change between two requests to one warm function, so cache per request.
  if (getMode() === 'postgres') return memo('config:site', parseSiteConfig);
  return (_siteConfig ??= parseSiteConfig());
}

export function getTheme(): ThemeName {
  return getSiteConfig().theme ?? 'classic';
}

export function isLabMode(): boolean {
  return getSiteConfig().siteMode === 'lab';
}

export function isPersonalMode(): boolean {
  return getSiteConfig().siteMode === 'personal';
}

export function getSiteName(): string {
  const config = getSiteConfig();
  return config.siteMode === 'personal' ? config.author : config.labName;
}

const DEFAULT_HOMEPAGE_SECTIONS: HomepageSectionEntry[] = [
  { id: 'hero', enabled: true },
  { id: 'about', enabled: true },
  { id: 'news', enabled: true },
  { id: 'publications', enabled: true },
  { id: 'blog', enabled: true },
];

export function getHomepageSections(): HomepageSectionId[] {
  const config = getSiteConfig();
  if (config.homepageSections?.length) {
    return config.homepageSections.filter((s) => s.enabled).map((s) => s.id);
  }
  // Backward compat: respect about.enabled when homepageSections absent
  return DEFAULT_HOMEPAGE_SECTIONS.filter((s) => (s.id === 'about' ? config.about?.enabled !== false : s.enabled)).map(
    (s) => s.id,
  );
}

export function getGridColumnCount(): number {
  const sections = getHomepageSections();
  return ['news', 'publications', 'blog'].filter((id) => sections.includes(id as HomepageSectionId)).length;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Recursively convert all object keys from snake_case to camelCase. */
export function normalizeKeys<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeKeys(item)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [snakeToCamel(k), normalizeKeys(v)]),
    ) as T;
  }
  return obj;
}

export function loadYamlConfig<T>(filename: string): T {
  return yaml.load(readConfigFile(filename)) as T;
}

/** Feed item ids hidden from the site (`hidden:` in config/feeds.yml). */
export function hiddenFeedIds(): string[] {
  try {
    return loadYamlConfig<{ hidden?: string[] } | null>('feeds.yml')?.hidden ?? [];
  } catch {
    return [];
  }
}
