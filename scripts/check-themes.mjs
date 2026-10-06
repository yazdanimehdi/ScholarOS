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
