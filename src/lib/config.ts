import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { SiteConfig, HomepageSectionId, HomepageSectionEntry, ThemeName } from './types';

let _siteConfig: SiteConfig | null = null;

/** '' or missing → 'classic' (the CMS writes '' for untouched fields); any other unknown value is a config error. */
export function normalizeTheme(value: unknown, source: string): ThemeName {
  if (value === undefined || value === null || value === '') return 'classic';
  if (value === 'classic' || value === 'editorial') return value;
  throw new Error(`${source}: theme must be 'classic' or 'editorial', got '${String(value)}'`);
}

export function getSiteConfig(): SiteConfig {
  if (_siteConfig) return _siteConfig;

  const configPath = path.resolve(process.cwd(), 'config/site.yml');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = yaml.load(raw) as SiteConfig;
  const envTheme = process.env.SCHOLAROS_THEME;
  config.theme = envTheme
    ? normalizeTheme(envTheme, 'SCHOLAROS_THEME')
    : normalizeTheme(config.theme, 'config/site.yml');
  _siteConfig = config;
  return _siteConfig;
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
  const configPath = path.resolve(process.cwd(), `config/${filename}`);
  const raw = fs.readFileSync(configPath, 'utf-8');
  return yaml.load(raw) as T;
}
