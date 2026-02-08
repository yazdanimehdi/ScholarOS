#!/usr/bin/env tsx
/**
 * Generate SEO keywords from site content.
 *
 * Analyzes publications, projects, people, posts, announcements,
 * and research areas to extract weighted keywords, then updates
 * the keywords field in config/site.yml.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE_CONFIG_PATH = path.join(ROOT, 'config', 'site.yml');
const RESEARCH_CONFIG_PATH = path.join(ROOT, 'config', 'research.yml');

const CONTENT_DIRS = [
  'src/content/publications',
  'src/content/projects',
  'src/content/people',
  'src/content/posts',
  'src/content/announcements',
];

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'are',
  'were',
  'been',
  'be',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'must',
  'not',
  'no',
  'nor',
  'so',
  'yet',
  'both',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'than',
  'too',
  'very',
  'just',
  'about',
  'above',
  'after',
  'again',
  'all',
  'also',
  'am',
  'any',
  'because',
  'before',
  'between',
  'during',
  'here',
  'how',
  'if',
  'into',
  'its',
  'it',
  'me',
  'my',
  'off',
  'once',
  'only',
  'our',
  'out',
  'over',
  'own',
  'same',
  'she',
  'he',
  'her',
  'his',
  'him',
  'that',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'under',
  'until',
  'up',
  'we',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'you',
  'your',
  'new',
  'one',
  'two',
  'using',
  'based',
  'via',
  'etc',
  'use',
  'used',
  'show',
  'shows',
  'work',
  'works',
  'approach',
  'method',
  'results',
  'paper',
  'study',
  'present',
  'propose',
  'proposed',
  'novel',
  'first',
  'well',
  'also',
  'however',
  'thus',
  'therefore',
]);

interface TermWeight {
  term: string;
  weight: number;
}

function parseFrontmatter(filePath: string): Record<string, unknown> {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.startsWith('---')) return {};
  const parts = content.split('---');
  if (parts.length < 3) return {};
  try {
    return (yaml.load(parts[1]) as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

function getMarkdownFiles(dir: string): string[] {
  const fullDir = path.join(ROOT, dir);
  if (!fs.existsSync(fullDir)) return [];
  return fs
    .readdirSync(fullDir)
    .filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
    .map((f) => path.join(fullDir, f));
}

function extractTerms(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function extractBigrams(text: string): string[] {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (!STOP_WORDS.has(words[i]) || !STOP_WORDS.has(words[i + 1])) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
        bigrams.push(bigram);
      }
    }
  }
  return bigrams;
}

function addWeighted(counts: Map<string, number>, terms: string[], weight: number): void {
  for (const term of terms) {
    counts.set(term, (counts.get(term) || 0) + weight);
  }
}

function main() {
  const counts = new Map<string, number>();

  // 1. Research areas (weight 5)
  if (fs.existsSync(RESEARCH_CONFIG_PATH)) {
    const research = yaml.load(fs.readFileSync(RESEARCH_CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
    const areas = (research?.areas as Array<Record<string, unknown>>) || [];
    for (const area of areas) {
      if (area.title) {
        addWeighted(counts, extractTerms(area.title as string), 5);
        addWeighted(counts, extractBigrams(area.title as string), 5);
      }
      const tags = (area.tags as string[]) || [];
      for (const tag of tags) {
        addWeighted(counts, [tag.toLowerCase()], 5);
      }
    }
  }

  // 2. Site description (weight 2)
  if (fs.existsSync(SITE_CONFIG_PATH)) {
    const site = yaml.load(fs.readFileSync(SITE_CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
    if (site?.description) {
      addWeighted(counts, extractTerms(site.description as string), 2);
    }
  }

  // 3. Content files
  for (const dir of CONTENT_DIRS) {
    const files = getMarkdownFiles(dir);
    for (const file of files) {
      const fm = parseFrontmatter(file);
      const dirName = path.basename(dir);

      switch (dirName) {
        case 'publications': {
          // Title, venue: weight 3
          if (fm.title) addWeighted(counts, extractTerms(fm.title as string), 3);
          if (fm.venue) addWeighted(counts, extractTerms(fm.venue as string), 2);
          // Abstract: weight 1
          if (fm.abstract) addWeighted(counts, extractTerms(fm.abstract as string), 1);
          break;
        }
        case 'projects': {
          // Tags: weight 3
          const tags = (fm.tags as string[]) || [];
          for (const tag of tags) {
            addWeighted(counts, [tag.toLowerCase()], 3);
          }
          if (fm.title) addWeighted(counts, extractTerms(fm.title as string), 3);
          // Description/excerpt: weight 1
          if (fm.excerpt) addWeighted(counts, extractTerms(fm.excerpt as string), 1);
          break;
        }
        case 'people': {
          // Research interests: weight 2
          const interests = (fm.researchInterests as string[]) || [];
          for (const interest of interests) {
            addWeighted(counts, [interest.toLowerCase()], 2);
            addWeighted(counts, extractTerms(interest), 2);
          }
          break;
        }
        case 'posts': {
          // Tags: weight 2
          const postTags = (fm.tags as string[]) || [];
          for (const tag of postTags) {
            addWeighted(counts, [tag.toLowerCase()], 2);
          }
          if (fm.title) addWeighted(counts, extractTerms(fm.title as string), 1);
          break;
        }
        case 'announcements': {
          if (fm.title) addWeighted(counts, extractTerms(fm.title as string), 1);
          break;
        }
      }
    }
  }

  // Rank and pick top 30
  const sorted = [...counts.entries()].filter(([term]) => term.length > 2).sort((a, b) => b[1] - a[1]);

  const topKeywords = sorted.slice(0, 30).map(([term]) => term);

  console.log(`Extracted ${counts.size} unique terms`);
  console.log(`Top ${topKeywords.length} keywords:`);
  for (const [i, kw] of topKeywords.entries()) {
    const score = counts.get(kw) || 0;
    console.log(`  ${i + 1}. ${kw} (score: ${score})`);
  }

  // Update config/site.yml keywords line using regex replacement
  if (!fs.existsSync(SITE_CONFIG_PATH)) {
    console.error('ERROR: config/site.yml not found');
    process.exit(1);
  }

  const siteContent = fs.readFileSync(SITE_CONFIG_PATH, 'utf-8');
  const keywordsValue = topKeywords.join(', ');

  // Replace the keywords line, preserving surrounding content
  const updated = siteContent.replace(/^(\s*keywords:\s*)"[^"]*"/m, `$1"${keywordsValue}"`);

  if (updated === siteContent) {
    // Try without quotes (empty or unquoted value)
    const updated2 = siteContent.replace(/^(\s*keywords:\s*).*$/m, `$1"${keywordsValue}"`);
    fs.writeFileSync(SITE_CONFIG_PATH, updated2);
  } else {
    fs.writeFileSync(SITE_CONFIG_PATH, updated);
  }

  console.log(`\nUpdated config/site.yml with ${topKeywords.length} keywords`);
}

main();
