// Builds the site with both themes and checks the designed pages.
//   node scripts/check-themes.mjs            build dist-classic/ + dist-editorial/, then check
//   node scripts/check-themes.mjs --no-build check existing builds only
// If dist-baseline/ exists (a classic build from before the theme refactor), every classic page
// must match it after normalizing asset hashes, scoped-style ids, styles and whitespace.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const THEMES = ['classic', 'editorial'];
const PAGES = [
  'index.html',
  'research/index.html',
  'publications/index.html',
  'cv/index.html',
  'blog/index.html',
];

if (!process.argv.includes('--no-build')) {
  for (const theme of THEMES) {
    execSync(`pnpm astro build --outDir dist-${theme}`, {
      stdio: 'inherit',
      env: { ...process.env, SCHOLAROS_THEME: theme },
    });
  }
}

const read = (theme, page) => fs.readFileSync(path.join(`dist-${theme}`, page), 'utf8');
const ed = (page) => read('editorial', page);

function firstPost(theme) {
  const dir = path.join(`dist-${theme}`, 'blog');
  const id = fs.readdirSync(dir).find((d) => d !== 'tag' && fs.existsSync(path.join(dir, d, 'index.html')));
  assert.ok(id, `no blog post page in dist-${theme}/blog`);
  return `blog/${id}/index.html`;
}

for (const theme of THEMES) {
  for (const page of [...PAGES, firstPost(theme)]) {
    assert.match(read(theme, page), new RegExp(`<html[^>]*data-theme="${theme}"`), `${theme} ${page}: theme marker`);
  }
}

// --- editorial page checks (one block per page) ---

{
  const html = ed('contact/index.html');
  assert.match(html, /<header class="ed-header">/, 'editorial /contact: editorial header on an undesigned page');
  assert.match(html, /<a href="\/contact" aria-current="page">\s*Contact\s*<\/a>/, 'editorial /contact: active nav item');
  assert.match(html, /<footer class="ed-footer">/, 'editorial /contact: light footer');
  assert.doesNotMatch(html, /ThemeToggle/, 'editorial: no theme toggle');
  assert.doesNotMatch(read('classic', 'contact/index.html'), /class="ed-header"/, 'classic /contact: classic header');
}

{
  const html = ed('index.html');
  assert.match(html, /<h1 class="ed-hero-name">Prof\. Jane Smith<\/h1>/, 'editorial /: hero name');
  assert.match(html, /<div class="ed-bio"><p>I lead the Smith Research Lab at the <strong>/, 'editorial /: bio rendered from Markdown');
  assert.match(html, /"@type":"Person"/, 'editorial /: Person JSON-LD');
  assert.match(html, /class="ed-band-item">University of Technology</, 'editorial /: affiliations band');
  assert.match(html, /href="\/research#nlp"/, 'editorial /: research card links to its area');
  assert.match(html, /Adaptive Fine-Tuning Strategies for Large Language Models in Low-Resource Domains · Fairness-Aware/, 'editorial /: card lists related papers by short title');
  assert.match(html, /All 5 publications/, 'editorial /: publication count');
  assert.match(html, /href="\/publications#smith2024adaptive"/, 'editorial /: Cite link');
  assert.match(html, /<strong>Jane Smith<\/strong>/, 'editorial /: owner bold in author lists');
  assert.match(html, /class="ed-news-date num">2024</, 'editorial /: year-precision news date');
  assert.match(html, /<footer class="ed-contact">/, 'editorial /: contact footer');
  assert.doesNotMatch(html, /astro-island/, 'editorial /: no framework islands');
}

{
  const html = ed('research/index.html');
  for (const id of ['nlp', 'multimodal', 'safety']) {
    assert.match(html, new RegExp(`<section id="${id}" class="ed-area"`), `editorial /research: section #${id}`);
  }
  assert.match(html, /<nav class="ed-toc" aria-label="On this page">/, 'editorial /research: on-this-page nav');
  assert.match(html, /<strong>parameter-efficient fine-tuning<\/strong>/, 'editorial /research: Markdown body');
  assert.match(html, /<b>Result\.<\/b>/, 'editorial /research: result aside');
  assert.match(html, /<b>Fig\. 1\.<\/b>/, 'editorial /research: numbered figure caption');
  assert.match(html, /href="\/publications#garcia2024safe"/, 'editorial /research: related paper rows');
  assert.match(html, /<section id="software" class="ed-software"/, 'editorial /research: software grid');
  assert.match(html, /Python · Transformers/, 'editorial /research: software tech line from tags');
}

{
  const html = ed('publications/index.html');
  assert.equal((html.match(/data-topic="/g) ?? []).length, 5, 'editorial /publications: one filterable row per paper');
  assert.match(html, /<li id="smith2024adaptive"/, 'editorial /publications: row anchors for Cite links');
  assert.match(html, /data-topic="other"/, 'editorial /publications: unmatched topic → Other');
  assert.match(html, /data-filter="nlp"[^>]*>\s*NLP <span class="ed-tab-count num">1<\/span>/, 'editorial /publications: topic filter with count');
  assert.match(html, /data-filter="other"/, 'editorial /publications: Other filter');
  assert.match(html, /<details class="ed-bib">\s*<summary class="ul">Cite<\/summary>\s*<pre>@inproceedings\{smith2024adaptive,/, 'editorial /publications: BibTeX expander');
  assert.match(html, /@article\{smith2023fairness,/, 'editorial /publications: bibtex field used as-is');
  assert.match(html, /"@type":"ScholarlyArticle"/, 'editorial /publications: ScholarlyArticle JSON-LD');
  assert.match(html, /https:\/\/arxiv\.org\/abs\/2024\.00003/, 'editorial /publications: arXiv prefix stripped in sameAs');
  assert.match(html, /data-first-only/, 'editorial /publications: first-author toggle');
}

// --- classic regression ---
const BASELINE = 'dist-baseline';

/**
 * Stylesheets are dropped because editorial.css is bundled into classic pages too (scoped, inert);
 * whitespace runs collapse because moving markup between components changes indentation only.
 */
function normalize(html) {
  return html
    .replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/\/_astro\/([\w.-]+?)\.[\w-]{8,}\.(\w+)/g, '/_astro/$1.$2')
    .replace(/ data-astro-cid-\w+(="[^"]*")?/g, '')
    .replace(/ data-theme="classic"/g, '')
    .replace(/ uid="[^"]*"/g, '')
    .replace(/\s+/g, ' ');
}

if (fs.existsSync(BASELINE)) {
  const pages = fs.readdirSync(BASELINE, { recursive: true }).filter((f) => String(f).endsWith('.html'));
  for (const rel of pages) {
    const current = path.join('dist-classic', rel);
    assert.ok(fs.existsSync(current), `classic build is missing ${rel}`);
    assert.equal(
      normalize(fs.readFileSync(current, 'utf8')),
      normalize(fs.readFileSync(path.join(BASELINE, rel), 'utf8')),
      `classic ${rel} differs from ${BASELINE}/`,
    );
  }
  console.log(`check-themes: ${pages.length} classic pages match ${BASELINE}/`);
} else {
  console.log(`check-themes: no ${BASELINE}/, skipping the classic regression check`);
}

console.log('check-themes: OK');
