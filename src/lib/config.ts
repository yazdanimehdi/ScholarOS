import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { SiteConfig } from './types';

let _siteConfig: SiteConfig | null = null;

export function getSiteConfig(): SiteConfig {
  if (_siteConfig) return _siteConfig;

  const configPath = path.resolve(process.cwd(), 'config/site.yml');
  const raw = fs.readFileSync(configPath, 'utf-8');
  _siteConfig = yaml.load(raw) as SiteConfig;
  return _siteConfig;
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

export function loadYamlConfig<T>(filename: string): T {
  const configPath = path.resolve(process.cwd(), `config/${filename}`);
  const raw = fs.readFileSync(configPath, 'utf-8');
  return yaml.load(raw) as T;
}
