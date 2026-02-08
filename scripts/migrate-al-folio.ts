#!/usr/bin/env tsx
/**
 * Migrate an al-folio Jekyll site to ScholarOS format.
 *
 * Usage: pnpm migrate:al-folio <github-url>
 *
 * Clones the given al-folio repository, extracts all content, config,
 * images, publications, news, projects, posts, and CV data, then writes
 * them into the ScholarOS directory structure — replacing all existing
 * example/placeholder content.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';

const ROOT = path.resolve(import.meta.dirname, '..');

// ─── Helpers ──────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\{%.*?%\}/g, '')
    .replace(/\{\{.*?\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  if (!content.startsWith('---')) return { data: {}, body: content };
  const end = content.indexOf('---', 3);
  if (end === -1) return { data: {}, body: content };
  const fm = content.slice(3, end).trim();
  const body = content.slice(end + 3).trim();
  try {
    return { data: (yaml.load(fm) as Record<string, unknown>) || {}, body };
  } catch {
    return { data: {}, body };
  }
}

function readFileOpt(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rmMdFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
  for (const f of files) fs.unlinkSync(path.join(dir, f));
  return files.length;
}

function yamlDump(obj: unknown): string {
  return yaml.dump(obj, { lineWidth: 120, noRefs: true, quotingType: '"', forceQuotes: false });
}

function escapeYamlString(s: string): string {
  if (/[\n\r:#{}[\],&*?|>!'"%@`]/.test(s) || s.startsWith(' ') || s.endsWith(' ')) {
    return JSON.stringify(s);
  }
  return s;
}

// ─── BibTeX Parser ────────────────────────────────────────────────────

interface BibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
  raw: string;
}

function parseBibTeX(content: string): BibEntry[] {
  const entries: BibEntry[] = [];
  // Match @type{key, ... }  handling nested braces
  const entryRegex = /@(\w+)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(content)) !== null) {
    const type = match[1].toLowerCase();
    if (type === 'string' || type === 'preamble' || type === 'comment') continue;

    const startBrace = match.index + match[0].length - 1;
    let depth = 1;
    let i = startBrace + 1;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      i++;
    }

    const inner = content.slice(startBrace + 1, i - 1).trim();
    const raw = content.slice(match.index, i);

    // Extract key (everything before first comma)
    const commaIdx = inner.indexOf(',');
    if (commaIdx === -1) continue;
    const key = inner.slice(0, commaIdx).trim();
    const fieldsStr = inner.slice(commaIdx + 1);

    // Parse fields: field = {value} or field = "value" or field = number
    const fields: Record<string, string> = {};
    const fieldRegex = /(\w+)\s*=\s*/g;
    let fm: RegExpExecArray | null;

    while ((fm = fieldRegex.exec(fieldsStr)) !== null) {
      const fieldName = fm[1].toLowerCase();
      let valueStart = fm.index + fm[0].length;

      // Skip whitespace
      while (valueStart < fieldsStr.length && /\s/.test(fieldsStr[valueStart])) valueStart++;

      let value = '';
      if (fieldsStr[valueStart] === '{') {
        // Brace-delimited value
        let d = 1;
        let j = valueStart + 1;
        while (j < fieldsStr.length && d > 0) {
          if (fieldsStr[j] === '{') d++;
          else if (fieldsStr[j] === '}') d--;
          j++;
        }
        value = fieldsStr.slice(valueStart + 1, j - 1);
      } else if (fieldsStr[valueStart] === '"') {
        // Quote-delimited value
        let j = valueStart + 1;
        while (j < fieldsStr.length && fieldsStr[j] !== '"') {
          if (fieldsStr[j] === '\\') j++; // skip escaped char
          j++;
        }
        value = fieldsStr.slice(valueStart + 1, j);
      } else {
        // Bare value (number or macro)
        let j = valueStart;
        while (j < fieldsStr.length && fieldsStr[j] !== ',' && fieldsStr[j] !== '}') j++;
        value = fieldsStr.slice(valueStart, j).trim();
      }

      fields[fieldName] = value.replace(/\s+/g, ' ').trim();
      // Advance the regex past the value
      fieldRegex.lastIndex = valueStart + value.length + 2;
    }

    entries.push({ type, key, fields, raw });
  }

  return entries;
}

function parseBibAuthors(authorStr: string): string[] {
  if (!authorStr) return [];
  return authorStr.split(/\s+and\s+/i).map((a) => {
    a = a.replace(/[{}]/g, '').trim();
    if (a.includes(',')) {
      const [last, ...first] = a.split(',').map((s) => s.trim());
      return [...first, last].join(' ');
    }
    return a;
  });
}

function mapPubType(bibType: string): string {
  switch (bibType) {
    case 'article':
      return 'journal';
    case 'inproceedings':
    case 'conference':
      return 'conference';
    case 'misc':
    case 'unpublished':
      return 'preprint';
    case 'phdthesis':
    case 'mastersthesis':
      return 'thesis';
    case 'incollection':
    case 'inbook':
      return 'book-chapter';
    default:
      return 'conference';
  }
}

function cleanBibtexForStorage(raw: string): string {
  // Remove al-folio custom fields from the stored bibtex
  const customFields = [
    'preview',
    'selected',
    'bibtex_show',
    'abbr',
    'altmetric',
    'dimensions',
    'google_scholar_id',
    'html',
    'pdf',
    'supp',
    'blog',
    'code',
    'poster',
    'slides',
    'website',
    'award',
  ];
  let cleaned = raw;
  for (const field of customFields) {
    // Remove field = {value}, or field = "value", including trailing comma
    cleaned = cleaned.replace(new RegExp(`\\s*${field}\\s*=\\s*(?:\\{[^}]*\\}|"[^"]*"|[^,}]+),?`, 'gi'), '');
  }
  // Clean up any double commas or trailing commas before closing brace
  cleaned = cleaned.replace(/,\s*,/g, ',').replace(/,\s*\}/g, '\n}');
  return cleaned.trim();
}

// ─── Category Inference ───────────────────────────────────────────────

function inferCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(paper|accepted|publication|published|journal|conference)\b/.test(lower)) return 'paper';
  if (/\b(award|prize|won|winner|honored)\b/.test(lower)) return 'award';
  if (/\b(grant|fund|nsf|nih|darpa)\b/.test(lower)) return 'grant';
  if (/\b(talk|present|invited|keynote|seminar)\b/.test(lower)) return 'talk';
  if (/\b(intern|join|hired|welcome|new member|position)\b/.test(lower)) return 'media';
  return 'general';
}

function extractTitle(text: string): string {
  const clean = stripHtml(text).replace(/\n/g, ' ').trim();
  // Take first sentence or first 80 chars
  const sentenceEnd = clean.search(/[.!?]\s/);
  if (sentenceEnd > 0 && sentenceEnd <= 80) return clean.slice(0, sentenceEnd + 1);
  if (clean.length <= 80) return clean;
  return clean.slice(0, 80).replace(/\s+\S*$/, '') + '...';
}

// ─── Parse functions ──────────────────────────────────────────────────

interface AlFolioConfig {
  first_name?: string;
  last_name?: string;
  description?: string;
  url?: string;
  lang?: string;
  keywords?: string;
  email?: string;
  github_username?: string;
  linkedin_username?: string;
  scholar_userid?: string;
  x_username?: string;
  mastodon_username?: string;
  medium_username?: string;
  google_analytics?: string;
  enable_darkmode?: boolean;
  orcid_id?: string;
  external_sources?: Array<{ name: string; rss_url: string }>;
  [key: string]: unknown;
}

interface NavItem {
  label: string;
  href: string;
}

function parseAlFolioConfig(cloneDir: string): AlFolioConfig {
  const raw = readFileOpt(path.join(cloneDir, '_config.yml'));
  if (!raw) {
    console.warn('  Warning: _config.yml not found');
    return {};
  }
  return (yaml.load(raw) as AlFolioConfig) || {};
}

function parseAboutPage(cloneDir: string): { data: Record<string, unknown>; body: string } {
  // Try _pages/about.md first, then about.md
  for (const p of ['_pages/about.md', 'about.md', '_pages/about.html']) {
    const raw = readFileOpt(path.join(cloneDir, p));
    if (raw) return parseFrontmatter(raw);
  }
  return { data: {}, body: '' };
}

function parseRepositories(cloneDir: string): { github_users: string[]; github_repos: string[] } {
  const raw = readFileOpt(path.join(cloneDir, '_data/repositories.yml'));
  if (!raw) return { github_users: [], github_repos: [] };
  const data = yaml.load(raw) as Record<string, unknown>;
  const users = (data?.github_users as string[]) || [];
  const repos = ((data?.github_repos as string[]) || []).map((r) => {
    // repos may be "user/repo" format — extract just repo name
    return r.includes('/') ? r.split('/')[1] : r;
  });
  return { github_users: users, github_repos: repos };
}

function parseResume(cloneDir: string): Record<string, unknown> | null {
  const raw = readFileOpt(path.join(cloneDir, 'assets/json/resume.json'));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn('  Warning: Could not parse resume.json');
    return null;
  }
}

interface NewsItem {
  slug: string;
  date: string;
  title: string;
  body: string;
  category: string;
  excerpt: string;
}

function parseNews(cloneDir: string): NewsItem[] {
  const dir = path.join(cloneDir, '_news');
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') || f.endsWith('.html'));
  const items: NewsItem[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
    const { data, body } = parseFrontmatter(raw);

    const dateStr = data.date ? new Date(data.date as string).toISOString().split('T')[0] : '2024-01-01';

    const cleanBody = stripHtml(body).trim();
    const title = extractTitle(cleanBody || file.replace(/\.md$|\.html$/, ''));
    const category = inferCategory(cleanBody);
    const excerpt = cleanBody.split(/[.!?]\s/)[0]?.trim() || cleanBody.slice(0, 150);

    // Convert HTML body to markdown-ish text
    const mdBody = body
      .replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/g, '[$2]($1)')
      .replace(/<b>(.*?)<\/b>/g, '**$1**')
      .replace(/<i>(.*?)<\/i>/g, '*$1*')
      .replace(/<em>(.*?)<\/em>/g, '*$1*')
      .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\{%.*?%\}/g, '')
      .replace(/\{\{.*?\}\}/g, '')
      .trim();

    const slug = slugify(file.replace(/\.md$|\.html$/, '').replace(/^\d{4}-\d{2}-\d{2}-?/, '')) || slugify(title);

    items.push({ slug, date: dateStr, title, body: mdBody, category, excerpt });
  }

  return items;
}

interface ProjectItem {
  slug: string;
  data: Record<string, unknown>;
  body: string;
}

function parseProjects(cloneDir: string): ProjectItem[] {
  const dir = path.join(cloneDir, '_projects');
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
      const { data, body } = parseFrontmatter(raw);
      const slug = slugify(file.replace(/\.md$/, '').replace(/^\d+_?/, ''));
      return { slug, data, body };
    });
}

interface PostItem {
  slug: string;
  data: Record<string, unknown>;
  body: string;
}

function parsePosts(cloneDir: string): PostItem[] {
  const dir = path.join(cloneDir, '_posts');
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') || f.endsWith('.html'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
      const { data, body } = parseFrontmatter(raw);
      const slug = slugify(file.replace(/\.md$|\.html$/, '').replace(/^\d{4}-\d{2}-\d{2}-?/, ''));
      return { slug, data, body };
    });
}

function parseNavPages(cloneDir: string): NavItem[] {
  const dir = path.join(cloneDir, '_pages');
  if (!fs.existsSync(dir)) return [];

  const pages: { label: string; href: string; order: number }[] = [];

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md') || f.endsWith('.html'))) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
    const { data } = parseFrontmatter(raw);
    if (!data.nav) continue;

    const title = (data.title as string) || file.replace(/\.\w+$/, '');
    const permalink = data.permalink as string | undefined;
    const order = (data.nav_order as number) || 99;

    // Map al-folio permalinks to ScholarOS routes
    let href = permalink || `/${slugify(title)}`;
    const routeMap: Record<string, string> = {
      '/': '/',
      '/publications/': '/publications',
      '/projects/': '/projects',
      '/blog/': '/blog',
      '/news/': '/news',
      '/cv/': '/cv',
      '/repositories/': '/repositories',
      '/teaching/': '/blog',
      '/al-folio/': '/',
    };
    href = routeMap[href] || href.replace(/\/$/, '');

    pages.push({ label: title, href, order });
  }

  pages.sort((a, b) => a.order - b.order);
  return pages.map(({ label, href }) => ({ label, href }));
}

// ─── Image copying ────────────────────────────────────────────────────

function copyImages(
  cloneDir: string,
  profileImage: string | undefined,
  pubPreviews: Map<string, string>,
): { profileDest: string | null; pubCount: number } {
  let profileDest: string | null = null;
  let pubCount = 0;

  // Copy profile photo
  if (profileImage) {
    const srcPaths = [
      path.join(cloneDir, 'assets/img', profileImage),
      path.join(cloneDir, 'assets/img/prof_pic.jpg'),
      path.join(cloneDir, 'assets/img/prof_pic.png'),
    ];

    for (const src of srcPaths) {
      if (fs.existsSync(src)) {
        const ext = path.extname(src);
        const assetDir = path.join(ROOT, 'src/assets/images/people');
        ensureDir(assetDir);
        fs.copyFileSync(src, path.join(assetDir, `profile${ext}`));
        // Also copy to public/ so the about section <img> can load it
        const publicDir = path.join(ROOT, 'public/images/people');
        ensureDir(publicDir);
        fs.copyFileSync(src, path.join(publicDir, `profile${ext}`));
        profileDest = `../../assets/images/people/profile${ext}`;
        console.log(`  Copied profile photo: ${path.basename(src)}`);
        break;
      }
    }
  }

  // If no profile found from about page, try common names
  if (!profileDest) {
    const commonNames = ['prof_pic.jpg', 'prof_pic.png', 'prof_pic.jpeg', 'avatar.jpg', 'avatar.png'];
    for (const name of commonNames) {
      const src = path.join(cloneDir, 'assets/img', name);
      if (fs.existsSync(src)) {
        const ext = path.extname(src);
        const assetDir = path.join(ROOT, 'src/assets/images/people');
        ensureDir(assetDir);
        fs.copyFileSync(src, path.join(assetDir, `profile${ext}`));
        const publicDir = path.join(ROOT, 'public/images/people');
        ensureDir(publicDir);
        fs.copyFileSync(src, path.join(publicDir, `profile${ext}`));
        profileDest = `../../assets/images/people/profile${ext}`;
        console.log(`  Copied profile photo: ${name}`);
        break;
      }
    }
  }

  // Copy publication preview images
  const pubImgDir = path.join(ROOT, 'src/assets/images/publications');
  ensureDir(pubImgDir);

  for (const [, filename] of pubPreviews) {
    const srcPaths = [
      path.join(cloneDir, 'assets/img/publication_preview', filename),
      path.join(cloneDir, 'assets/img', filename),
    ];
    for (const src of srcPaths) {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(pubImgDir, filename));
        pubCount++;
        break;
      }
    }
  }

  // Copy favicon if present in al-folio project
  const faviconNames = ['favicon.ico', 'favicon.svg', 'favicon.png'];
  for (const name of faviconNames) {
    const src = path.join(cloneDir, 'assets/img', name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(ROOT, 'public', name));
      console.log(`  Copied favicon: ${name}`);
      // If non-SVG, remove old favicon.svg and update BaseHead link tag
      if (name !== 'favicon.svg') {
        const oldSvg = path.join(ROOT, 'public', 'favicon.svg');
        if (fs.existsSync(oldSvg)) fs.unlinkSync(oldSvg);
        const ext = path.extname(name).slice(1); // ico, png
        const mimeType = ext === 'ico' ? 'image/x-icon' : `image/${ext}`;
        const baseHeadPath = path.join(ROOT, 'src/components/astro/BaseHead.astro');
        const baseHead = fs.readFileSync(baseHeadPath, 'utf-8');
        fs.writeFileSync(
          baseHeadPath,
          baseHead.replace(
            /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/,
            `<link rel="icon" type="${mimeType}" href="/${name}" />`,
          ),
        );
      }
      break;
    }
  }

  return { profileDest, pubCount };
}

// ─── Content cleanup ──────────────────────────────────────────────────

function cleanExistingContent(): number {
  let total = 0;
  const dirs = ['people', 'publications', 'announcements', 'projects', 'posts', 'positions', 'talks'];
  for (const dir of dirs) {
    const fullDir = path.join(ROOT, 'src/content', dir);
    total += rmMdFiles(fullDir);
  }
  // Clear feeds.json so stale example data doesn't appear
  const feedsJson = path.join(ROOT, 'src/data/feeds.json');
  if (fs.existsSync(feedsJson)) {
    fs.writeFileSync(feedsJson, '[]\n');
    console.log('  Cleared src/data/feeds.json');
  }
  // Clear feeds.yml of example entries
  const feedsYmlPath = path.join(ROOT, 'config', 'feeds.yml');
  if (fs.existsSync(feedsYmlPath)) {
    fs.writeFileSync(feedsYmlPath, yamlDump({ mediumUrl: '', feeds: [], syncInterval: 'daily', maxItemsPerFeed: 20 }));
    console.log('  Cleared config/feeds.yml');
  }
  return total;
}

// ─── Writers ──────────────────────────────────────────────────────────

function writeSiteConfig(
  config: AlFolioConfig,
  about: { data: Record<string, unknown>; body: string },
  repos: { github_users: string[]; github_repos: string[] },
  navItems: NavItem[],
  profileImagePath: string | null,
  personSlug: string,
): void {
  const fullName = [config.first_name, config.last_name].filter(Boolean).join(' ') || 'Academic';

  // Build nav — filter out People (personal site doesn't need it)
  const nav =
    navItems.length > 0
      ? navItems.filter((n) => n.href !== '/people').map(({ label, href }) => ({ label, href }))
      : [
          { label: 'Publications', href: '/publications' },
          { label: 'Blog', href: '/blog' },
          { label: 'CV', href: '/cv' },
          { label: 'Contact', href: '/contact' },
        ];

  // Build socials
  const socials: Record<string, string> = {};
  if (config.email) socials.email = config.email;
  if (config.github_username) socials.github = `https://github.com/${config.github_username}`;
  if (config.scholar_userid) socials.scholar = `https://scholar.google.com/citations?user=${config.scholar_userid}`;
  if (config.linkedin_username) socials.linkedin = `https://www.linkedin.com/in/${config.linkedin_username}`;
  if (config.x_username) socials.twitter = `https://x.com/${config.x_username}`;
  if (config.mastodon_username) {
    // mastodon_username might be @user@instance or just username
    const masto = config.mastodon_username;
    if (masto.startsWith('http')) {
      socials.mastodon = masto;
    } else if (masto.includes('@')) {
      const parts = masto.replace(/^@/, '').split('@');
      if (parts.length === 2) socials.mastodon = `https://${parts[1]}/@${parts[0]}`;
    }
  }
  if (config.orcid_id) socials.orcid = `https://orcid.org/${config.orcid_id}`;

  // Extract about text from body (first paragraph)
  const aboutBody = about.body
    .replace(/\{%.*?%\}/gs, '')
    .replace(/\{\{.*?\}\}/gs, '')
    .replace(/<[^>]*>/g, '')
    .trim();
  const aboutText = aboutBody.split(/\n\n/)[0]?.trim() || config.description || '';

  const aboutImage = profileImagePath ? `/images/people/profile${path.extname(profileImagePath)}` : '/images/about.jpg';

  // Build github config
  const githubConfig: Record<string, unknown> = {
    username: repos.github_users[0] || config.github_username || '',
    stats: true,
    trophies: true,
    pinnedRepos: repos.github_repos,
  };

  const siteYml: Record<string, unknown> = {
    siteMode: 'personal',
    lang: config.lang || 'en',
    direction: 'ltr',
    defaultTheme: config.enable_darkmode ? 'system' : 'light',
    topBar: { enabled: false, text: '', links: [] },
    hero: {
      type: 'pattern',
      light: { bgColor: '#ffffff', bgImage: '' },
      dark: { bgColor: '#0d1117', bgImage: '' },
      video: { src: '', poster: '' },
      pattern: { name: 'hexagons' },
      animation: { preset: 'wave-lines', customScript: '' },
    },
    fonts: {
      families: { sans: 'Roboto', serif: 'Roboto Slab', mono: 'Roboto Mono' },
      sizes: { base: '1.2rem', sm: '0.95rem', lg: '1.3rem', h1: '2.3rem', h2: '1.7rem', h3: '1.5rem' },
    },
    colors: {
      light: { primary: '#2c5282', secondary: '#06b6d4' },
      dark: { primary: '#22d3ee', secondary: '#2c5282' },
    },
    background: {
      light: { color: '#ffffff', image: '' },
      dark: { color: '#0d1117', image: '' },
    },
    imageShape: 'rectangular',
    about: {
      enabled: true,
      title: `About ${fullName}`,
      text: aboutText,
      image: aboutImage,
    },
    homepageSections: [
      { id: 'hero', enabled: true },
      { id: 'about', enabled: true },
      { id: 'news', enabled: true },
      { id: 'publications', enabled: true },
      { id: 'blog', enabled: true },
    ],
    title: fullName,
    description: config.description || `${fullName}'s academic website`,
    author: fullName,
    labName: '',
    university: '',
    department: '',
    siteUrl: config.url || 'https://example.com',
    nav,
    github: githubConfig,
    socials,
    analytics: {
      googleAnalytics: config.google_analytics || '',
      googleTagManager: '',
      cronitor: '',
      openpanel: '',
      pirsch: '',
      microsoftClarity: '',
    },
    web3forms: { accessKey: '' },
    newsletter: {
      enabled: false,
      accessKey: '',
      heading: 'Stay Updated',
      text: 'Subscribe to get notified about new publications and news.',
    },
    seo: {
      keywords: (config.keywords as string) || '',
      googleSiteVerification: '',
      bingSiteVerification: '',
    },
    adminPath: 'admin',
    adminUsers: [personSlug],
    cookieConsent: false,
    footer: {
      text: 'Built with <a href="https://scholaros.com">ScholarOS</a>',
      links: [
        { label: 'Privacy', href: '/privacy' },
        { label: 'Sitemap', href: '/sitemap-index.xml' },
      ],
    },
    alfolioRepo: '',
  };

  const outPath = path.join(ROOT, 'config', 'site.yml');
  fs.writeFileSync(outPath, `# Site Configuration\n# Migrated from al-folio\n\n${yamlDump(siteYml)}`);
  console.log('  Wrote config/site.yml');
}

function writeScholarConfig(config: AlFolioConfig, fullName: string): void {
  const scholarYml: Record<string, unknown> = {
    authors: [
      {
        name: fullName,
        scholar_id: config.scholar_userid || 'XXXXXXXXXX',
      },
    ],
    syncInterval: 'weekly',
    maxResults: 100,
  };

  const outPath = path.join(ROOT, 'config', 'scholar.yml');
  fs.writeFileSync(outPath, yamlDump(scholarYml));
  console.log('  Wrote config/scholar.yml');
}

function writeFeedsConfig(config: AlFolioConfig, personSlug: string): void {
  const feeds: Array<{ name: string; url: string; author: string | null; tags: string[] }> = [];

  // Parse external_sources from al-folio _config.yml
  const extSources = config.external_sources || [];
  for (const src of extSources) {
    if (!src.rss_url) continue;
    const isMedium = src.rss_url.includes('medium.com');
    feeds.push({
      name: src.name || (isMedium ? 'Medium' : 'External Blog'),
      url: src.rss_url,
      author: personSlug,
      tags: isMedium ? ['medium'] : ['blog'],
    });
  }

  // Determine mediumUrl
  let mediumUrl = '';
  if (config.medium_username) {
    mediumUrl = `https://medium.com/feed/@${config.medium_username}`;
    // Add Medium feed if not already present from external_sources
    if (!feeds.some((f) => f.url.includes('medium.com'))) {
      feeds.push({
        name: 'Medium',
        url: mediumUrl,
        author: personSlug,
        tags: ['medium'],
      });
    }
  } else {
    // Check if any external source is medium
    const mediumFeed = feeds.find((f) => f.url.includes('medium.com'));
    if (mediumFeed) mediumUrl = mediumFeed.url;
  }

  const feedsYml: Record<string, unknown> = {
    mediumUrl,
    feeds,
    syncInterval: 'daily',
    maxItemsPerFeed: 20,
  };

  const outPath = path.join(ROOT, 'config', 'feeds.yml');
  fs.writeFileSync(outPath, yamlDump(feedsYml));
  console.log('  Wrote config/feeds.yml');
}

function writeCvConfig(resume: Record<string, unknown> | null, config: AlFolioConfig, fullName: string): void {
  const basics = (resume?.basics as Record<string, unknown>) || {};
  const location = basics.location as Record<string, string> | undefined;

  const cvSections: Record<string, unknown[]> = {
    education: [],
    experience: [],
    publications: [],
    awards: [],
    skills: [],
  };

  // Education
  const education = (resume?.education as Record<string, unknown>[]) || [];
  for (const edu of education) {
    const startDate = (edu.startDate as string) || '';
    const endDate = (edu.endDate as string) || 'present';
    const highlights: string[] = [];
    if (edu.courses) {
      for (const c of edu.courses as string[]) highlights.push(c);
    }
    cvSections.education.push({
      institution: (edu.institution as string) || '',
      area: (edu.area as string) || (edu.studyType as string) || '',
      degree: (edu.studyType as string) || '',
      location: '',
      startDate: startDate.slice(0, 7) || startDate,
      endDate: endDate === '' ? 'present' : endDate.slice(0, 7) || endDate,
      highlights,
    });
  }

  // Work experience
  const work = (resume?.work as Record<string, unknown>[]) || [];
  for (const w of work) {
    const startDate = (w.startDate as string) || '';
    const endDate = (w.endDate as string) || 'present';
    const highlights = (w.summary as string) ? [w.summary as string] : (w.highlights as string[]) || [];
    cvSections.experience.push({
      company: (w.name as string) || (w.company as string) || '',
      position: (w.position as string) || '',
      location: (w.location as string) || '',
      startDate: startDate.slice(0, 7) || startDate,
      endDate: endDate === '' ? 'present' : endDate.slice(0, 7) || endDate,
      highlights,
    });
  }

  // Publications
  const pubs = (resume?.publications as Record<string, unknown>[]) || [];
  for (const pub of pubs) {
    cvSections.publications.push({
      title: (pub.name as string) || (pub.title as string) || '',
      authors: [(pub.author as string) || fullName],
      journal: (pub.publisher as string) || '',
      date: (pub.releaseDate as string) || '',
      url: (pub.url as string) || (pub.website as string) || '',
    });
  }

  // Awards
  const awards = (resume?.awards as Record<string, unknown>[]) || [];
  for (const award of awards) {
    const label = (award.title as string) || '';
    const awarder = (award.awarder as string) || '';
    const date = (award.date as string) || '';
    cvSections.awards.push({
      label: awarder ? `${label}, ${awarder}` : label,
      details: date,
    });
  }

  // Skills
  const skills = (resume?.skills as Record<string, unknown>[]) || [];
  for (const skill of skills) {
    const keywords = (skill.keywords as string[]) || [];
    cvSections.skills.push({
      label: (skill.name as string) || '',
      details: keywords.join(', '),
    });
  }

  // Social networks from resume
  const socialNetworks: Record<string, string>[] = [];
  const profiles = (basics.profiles as Record<string, string>[]) || [];
  for (const p of profiles) {
    const network = p.network || '';
    const username = p.username || p.url || '';
    if (network && username) {
      socialNetworks.push({ network, username });
    }
  }
  // Fallback from config
  if (socialNetworks.length === 0) {
    if (config.github_username) socialNetworks.push({ network: 'GitHub', username: config.github_username });
    if (config.linkedin_username) socialNetworks.push({ network: 'LinkedIn', username: config.linkedin_username });
  }

  const locationStr = location ? [location.city, location.region, location.countryCode].filter(Boolean).join(', ') : '';

  const cvYml: Record<string, unknown> = {
    cv: {
      name: (basics.name as string) || fullName,
      location: locationStr,
      email: (basics.email as string) || config.email || '',
      phone: (basics.phone as string) || '',
      website: (basics.url as string) || config.url || '',
      socialNetworks,
      sections: cvSections,
    },
    design: { theme: 'classic' },
  };

  const outPath = path.join(ROOT, 'config', 'cv.yml');
  fs.writeFileSync(outPath, `# CV Configuration\n# Migrated from al-folio resume.json\n\n${yamlDump(cvYml)}`);
  console.log('  Wrote config/cv.yml');
}

function writeResearchConfig(config: AlFolioConfig): void {
  // Generate research areas from keywords if available
  const keywords = (config.keywords as string) || '';
  const areas: Record<string, unknown>[] = [];

  if (keywords) {
    const kws = keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (kws.length > 0) {
      // Group into 2-3 areas
      const chunkSize = Math.ceil(kws.length / 3);
      for (let i = 0; i < kws.length; i += chunkSize) {
        const chunk = kws.slice(i, i + chunkSize);
        areas.push({
          title: chunk[0] || 'Research',
          description: '',
          tags: chunk,
        });
      }
    }
  }

  const researchYml: Record<string, unknown> = {
    description: config.description || '',
    areas,
  };

  const outPath = path.join(ROOT, 'config', 'research.yml');
  fs.writeFileSync(outPath, yamlDump(researchYml));
  console.log('  Wrote config/research.yml');
}

function writePerson(
  config: AlFolioConfig,
  about: { data: Record<string, unknown>; body: string },
  profileImagePath: string | null,
  personSlug: string,
): void {
  const fullName = [config.first_name, config.last_name].filter(Boolean).join(' ') || 'Academic';
  const subtitle = about.data.subtitle ? stripHtml(about.data.subtitle as string) : '';

  // Build socials object
  const socials: Record<string, string> = {};
  if (config.github_username) socials.github = `https://github.com/${config.github_username}`;
  if (config.scholar_userid) socials.scholar = `https://scholar.google.com/citations?user=${config.scholar_userid}`;
  if (config.linkedin_username) socials.linkedin = `https://www.linkedin.com/in/${config.linkedin_username}`;
  if (config.x_username) socials.twitter = `https://x.com/${config.x_username}`;
  if (config.orcid_id) socials.orcid = `https://orcid.org/${config.orcid_id}`;
  if (config.mastodon_username) {
    const masto = config.mastodon_username;
    if (masto.startsWith('http')) {
      socials.mastodon = masto;
    } else if (masto.includes('@')) {
      const parts = masto.replace(/^@/, '').split('@');
      if (parts.length === 2) socials.mastodon = `https://${parts[1]}/@${parts[0]}`;
    }
  }

  // Clean up the body: remove Liquid tags, HTML, profile blocks
  const body = about.body
    .replace(/\{%-?\s*if.*?endif\s*-?%\}/gs, '')
    .replace(/\{%.*?%\}/g, '')
    .replace(/\{\{.*?\}\}/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();

  // Build frontmatter manually for clean output
  let fmStr = '---\n';
  fmStr += `name: ${escapeYamlString(fullName)}\n`;
  fmStr += `role: "pi"\n`;
  fmStr += `title: ${escapeYamlString(subtitle || 'Researcher')}\n`;
  if (profileImagePath) fmStr += `photo: ${escapeYamlString(profileImagePath)}\n`;
  if (config.email) fmStr += `email: ${escapeYamlString(config.email)}\n`;
  if (Object.keys(socials).length > 0) {
    fmStr += 'socials:\n';
    for (const [k, v] of Object.entries(socials)) {
      fmStr += `  ${k}: ${escapeYamlString(v)}\n`;
    }
  }
  fmStr += 'sortOrder: 1\n';
  fmStr += 'active: true\n';
  fmStr += '---\n';

  const outDir = path.join(ROOT, 'src/content/people');
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, `${personSlug}.md`), `${fmStr}\n${body}\n`);
  console.log(`  Wrote src/content/people/${personSlug}.md`);
}

function writePublications(entries: BibEntry[], cloneDir: string): Map<string, string> {
  const outDir = path.join(ROOT, 'src/content/publications');
  ensureDir(outDir);

  const pubPreviews = new Map<string, string>();

  for (const entry of entries) {
    const { fields, type, key, raw } = entry;
    const title = (fields.title || 'Untitled').replace(/[{}]/g, '');
    const authors = parseBibAuthors(fields.author || '');
    const venue = fields.journal || fields.booktitle || '';
    const year = parseInt(fields.year || '0', 10);
    const doi = fields.doi || '';
    const url = fields.url || fields.href || '';
    const abstract = fields.abstract || '';
    const featured = fields.selected === 'true';
    const pubType = mapPubType(type);
    const preview = fields.preview || '';
    const bibtex = cleanBibtexForStorage(raw);

    const slug = slugify(key) || slugify(`${authors[0] || 'unknown'}${year}${title.split(' ')[0] || ''}`);

    // Track preview images
    let imageRef = '';
    if (preview) {
      pubPreviews.set(slug, preview);
      // Check if the image file actually exists before referencing it
      const previewPaths = [
        path.join(cloneDir, 'assets/img/publication_preview', preview),
        path.join(cloneDir, 'assets/img', preview),
      ];
      const exists = previewPaths.some((p) => fs.existsSync(p));
      if (exists) {
        imageRef = `../../assets/images/publications/${preview}`;
      }
    }

    // Build frontmatter manually
    let fm = '---\n';
    fm += `title: ${escapeYamlString(title)}\n`;
    fm += 'authors:\n';
    for (const a of authors) fm += `  - ${escapeYamlString(a)}\n`;
    fm += `venue: ${escapeYamlString(venue)}\n`;
    fm += `year: ${year}\n`;
    if (doi) fm += `doi: ${escapeYamlString(doi)}\n`;
    if (url) fm += `url: ${escapeYamlString(url)}\n`;
    fm += `type: ${escapeYamlString(pubType)}\n`;
    fm += `featured: ${featured}\n`;
    if (abstract) fm += `abstract: ${escapeYamlString(abstract)}\n`;
    if (bibtex) fm += `bibtex: ${escapeYamlString(bibtex)}\n`;
    if (imageRef) fm += `image: ${escapeYamlString(imageRef)}\n`;
    fm += '---\n';

    fs.writeFileSync(path.join(outDir, `${slug}.md`), fm);
  }

  console.log(`  Wrote ${entries.length} publications to src/content/publications/`);
  return pubPreviews;
}

function writeAnnouncements(items: NewsItem[]): void {
  const outDir = path.join(ROOT, 'src/content/announcements');
  ensureDir(outDir);

  for (const item of items) {
    let fm = '---\n';
    fm += `title: ${escapeYamlString(item.title)}\n`;
    fm += `date: ${item.date}\n`;
    fm += `category: ${escapeYamlString(item.category)}\n`;
    fm += 'pinned: false\n';
    fm += 'featured: false\n';
    if (item.excerpt) fm += `excerpt: ${escapeYamlString(item.excerpt)}\n`;
    fm += '---\n';

    fs.writeFileSync(path.join(outDir, `${item.slug}.md`), `${fm}\n${item.body}\n`);
  }

  console.log(`  Wrote ${items.length} announcements to src/content/announcements/`);
}

function writeProjectFiles(items: ProjectItem[], personSlug: string): void {
  if (items.length === 0) return;

  const outDir = path.join(ROOT, 'src/content/projects');
  ensureDir(outDir);

  for (const item of items) {
    const title = (item.data.title as string) || item.slug;
    const desc = (item.data.description as string) || '';

    // Clean body from Liquid tags
    const body = item.body
      .replace(/\{%-?\s*if.*?endif\s*-?%\}/gs, '')
      .replace(/\{%-?\s*include.*?%\}/g, '')
      .replace(/\{%.*?%\}/g, '')
      .replace(/\{\{.*?\}\}/g, '')
      .trim();

    const excerpt = desc || body.split('\n\n')[0]?.slice(0, 200) || '';
    const repoUrl = (item.data.github as string) || (item.data.repo_url as string) || '';
    const url = (item.data.url as string) || (item.data.website as string) || '';

    let fm = '---\n';
    fm += `title: ${escapeYamlString(title)}\n`;
    fm += `type: "other"\n`;
    fm += `status: "completed"\n`;
    if (url) fm += `url: ${escapeYamlString(url)}\n`;
    if (repoUrl) fm += `repoUrl: ${escapeYamlString(repoUrl)}\n`;
    fm += 'team:\n';
    fm += `  - ${escapeYamlString(personSlug)}\n`;
    if (excerpt) fm += `excerpt: ${escapeYamlString(excerpt)}\n`;
    fm += '---\n';

    fs.writeFileSync(path.join(outDir, `${item.slug}.md`), `${fm}\n${body}\n`);
  }

  console.log(`  Wrote ${items.length} projects to src/content/projects/`);
}

function writePostFiles(items: PostItem[], personSlug: string): void {
  if (items.length === 0) return;

  const outDir = path.join(ROOT, 'src/content/posts');
  ensureDir(outDir);

  for (const item of items) {
    const title = (item.data.title as string) || item.slug;
    const dateStr = item.data.date ? new Date(item.data.date as string).toISOString().split('T')[0] : '2024-01-01';
    const tags = (item.data.tags as string[]) || [];
    const desc = (item.data.description as string) || '';

    // Clean body from Liquid tags and HTML
    const body = item.body
      .replace(/\{%-?\s*if.*?endif\s*-?%\}/gs, '')
      .replace(/\{%-?\s*include.*?%\}/g, '')
      .replace(/\{%.*?%\}/g, '')
      .replace(/\{\{.*?\}\}/g, '')
      .trim();

    const excerpt = desc || body.split('\n\n')[0]?.slice(0, 200) || '';

    let fm = '---\n';
    fm += `title: ${escapeYamlString(title)}\n`;
    fm += `date: ${dateStr}\n`;
    fm += `author: ${escapeYamlString(personSlug)}\n`;
    if (excerpt) fm += `excerpt: ${escapeYamlString(excerpt)}\n`;
    if (tags.length > 0) {
      fm += 'tags:\n';
      for (const t of tags) fm += `  - ${escapeYamlString(t)}\n`;
    }
    fm += 'draft: false\n';
    fm += '---\n';

    fs.writeFileSync(path.join(outDir, `${item.slug}.md`), `${fm}\n${body}\n`);
  }

  console.log(`  Wrote ${items.length} posts to src/content/posts/`);
}

// ─── Site config helpers ──────────────────────────────────────────────

function readAlfolioRepoFromSiteConfig(): string {
  const siteConfigPath = path.join(ROOT, 'config', 'site.yml');
  const raw = readFileOpt(siteConfigPath);
  if (!raw) return '';
  const config = yaml.load(raw) as Record<string, unknown>;
  return ((config?.alfolioRepo as string) || '').trim();
}

function clearAlfolioRepoInSiteConfig(): void {
  const siteConfigPath = path.join(ROOT, 'config', 'site.yml');
  const raw = readFileOpt(siteConfigPath);
  if (!raw) return;
  const updated = raw.replace(/^(alfolioRepo:\s*)".+"/m, '$1""');
  fs.writeFileSync(siteConfigPath, updated);
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  // 1. Parse args — CLI arg takes priority, then config/site.yml alfolioRepo
  let repoUrl = process.argv[2] || '';
  if (!repoUrl) {
    repoUrl = readAlfolioRepoFromSiteConfig();
  }
  if (!repoUrl) {
    console.error('Usage: pnpm migrate:al-folio <github-url>');
    console.error('  Or set alfolioRepo in config/site.yml');
    process.exit(1);
  }

  console.log(`\nal-folio → ScholarOS Migration`);
  console.log(`Source: ${repoUrl}\n`);

  // 2. Clone repo to temp dir
  const cloneDir = path.join(tmpdir(), `al-folio-migrate-${Date.now()}`);
  console.log('Step 1: Cloning repository...');
  try {
    execFileSync('git', ['clone', '--depth', '1', repoUrl, cloneDir], {
      stdio: 'pipe',
      timeout: 60_000,
    });
    console.log(`  Cloned to ${cloneDir}`);
  } catch (err) {
    console.error(`  ERROR: Failed to clone ${repoUrl}`);
    console.error(`  ${(err as Error).message}`);
    process.exit(1);
  }

  try {
    // 3. Parse al-folio config
    console.log('\nStep 2: Parsing al-folio content...');
    const config = parseAlFolioConfig(cloneDir);
    const fullName = [config.first_name, config.last_name].filter(Boolean).join(' ') || 'Academic';
    const personSlug = slugify(fullName);
    console.log(`  Name: ${fullName}`);
    console.log(`  Slug: ${personSlug}`);

    // 4. Parse about page
    const about = parseAboutPage(cloneDir);
    const profileImage =
      (about.data.profile as Record<string, string>)?.image ||
      ((config as Record<string, unknown>).profile_image as string) ||
      undefined;
    console.log(`  Profile image: ${profileImage || '(not found)'}`);

    // 5. Parse BibTeX
    const bibRaw = readFileOpt(path.join(cloneDir, '_bibliography/papers.bib'));
    const bibEntries = bibRaw ? parseBibTeX(bibRaw) : [];
    console.log(`  Publications: ${bibEntries.length}`);

    // 6. Parse news
    const newsItems = parseNews(cloneDir);
    console.log(`  News items: ${newsItems.length}`);

    // 7. Parse projects
    const projects = parseProjects(cloneDir);
    console.log(`  Projects: ${projects.length}`);

    // 8. Parse posts
    const posts = parsePosts(cloneDir);
    console.log(`  Blog posts: ${posts.length}`);

    // 9. Parse repositories
    const repos = parseRepositories(cloneDir);
    console.log(`  GitHub repos: ${repos.github_repos.length}`);

    // 10. Parse resume
    const resume = parseResume(cloneDir);
    console.log(`  Resume: ${resume ? 'found' : 'not found'}`);

    // 11. Parse nav pages
    const navItems = parseNavPages(cloneDir);
    console.log(`  Nav pages: ${navItems.length}`);

    // 12. Clean existing content first
    console.log('\nStep 3: Cleaning existing example content...');
    const removedCount = cleanExistingContent();
    console.log(`  Removed ${removedCount} example files`);

    // 13. Write publications to get preview image map
    console.log('\nStep 4: Writing content files...');
    const pubPreviews = writePublications(bibEntries, cloneDir);

    // 14. Copy images
    console.log('\nStep 5: Copying images...');
    const { profileDest, pubCount } = copyImages(cloneDir, profileImage, pubPreviews);
    console.log(`  Publication preview images: ${pubCount}`);

    // 14b. Copy CNAME if present
    const cnameSrc = path.join(cloneDir, 'CNAME');
    if (fs.existsSync(cnameSrc)) {
      fs.copyFileSync(cnameSrc, path.join(ROOT, 'public', 'CNAME'));
      console.log('  Copied CNAME file');
    }

    // 15. Write all config and content
    console.log('\nStep 6: Writing config files...');
    writeSiteConfig(config, about, repos, navItems, profileDest, personSlug);
    writeScholarConfig(config, fullName);
    writeFeedsConfig(config, personSlug);
    writeCvConfig(resume, config, fullName);
    writeResearchConfig(config);

    // 15a. Update CMS repo
    const currentRepo = process.env.GITHUB_REPOSITORY;
    if (currentRepo) {
      const cmsPath = path.join(ROOT, 'config', 'cms.yml');
      const cmsContent = fs.readFileSync(cmsPath, 'utf-8');
      fs.writeFileSync(cmsPath, cmsContent.replace(/repo:\s*['"].*?['"]/, `repo: '${currentRepo}'`));
      console.log(`  Updated CMS repo: ${currentRepo}`);
    }

    // 15b. Sync RSS feeds to populate src/data/feeds.json with real data
    console.log('\n  Syncing RSS feeds...');
    try {
      execFileSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'scripts/sync-feeds.ts')], {
        cwd: ROOT,
        stdio: 'pipe',
        timeout: 30_000,
      });
      console.log('  Feeds synced successfully');
    } catch {
      console.warn('  Warning: Feed sync failed (will retry via GitHub Actions)');
    }

    console.log('\nStep 7: Writing remaining content...');
    writePerson(config, about, profileDest, personSlug);
    writeAnnouncements(newsItems);
    writeProjectFiles(projects, personSlug);
    writePostFiles(posts, personSlug);

    // 16. Summary
    console.log('\nMigration complete!\n');
    console.log('Summary:');
    console.log(`  Person:          ${fullName} (${personSlug})`);
    console.log(`  Publications:    ${bibEntries.length}`);
    console.log(`  Announcements:   ${newsItems.length}`);
    console.log(`  Projects:        ${projects.length}`);
    console.log(`  Blog posts:      ${posts.length}`);
    console.log(`  Pub images:      ${pubCount}`);
    console.log(`  Profile photo:   ${profileDest ? 'yes' : 'no'}`);
    console.log(`  Example files:   ${removedCount} removed`);
    // Clear alfolioRepo so the migration doesn't re-run
    clearAlfolioRepoInSiteConfig();

    console.log(`\nNext steps:`);
    console.log(`  1. Review the generated files`);
    console.log(`  2. Run: pnpm build`);
    console.log(`  3. Run: pnpm dev`);
  } finally {
    // 17. Cleanup temp dir
    console.log('\nCleaning up temp directory...');
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }
}

main();
