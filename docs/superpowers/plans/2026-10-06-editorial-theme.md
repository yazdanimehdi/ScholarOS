# Editorial Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, config-selectable "editorial" theme to ScholarOS that renders `/`, `/research`, `/publications`, `/cv`, `/blog`, `/blog/[id]` from the approved mockups, while `classic` (the default) keeps producing the same HTML as today.

**Architecture:** `getSiteConfig()` resolves `theme` (env `SCHOLAROS_THEME` overrides `config/site.yml`) and `<html data-theme>` carries it. Each designed route keeps loading data and renders either `src/themes/classic/<Page>.astro` (the old markup, moved verbatim) or `src/themes/editorial/<Page>.astro`. `PageLayout` wraps every undesigned page in the editorial shell, and `editorial.css` (scoped to `html[data-theme='editorial']`) re-points the classic Tailwind color variables so those pages match. Pure logic (bibtex, links, areas, writing merge, CV entry shapes, dates) lives in `src/lib/*.ts` with `node:test` tests; `scripts/check-themes.mjs` builds both themes, asserts page landmarks, and diffs classic HTML against a pre-refactor baseline.

**Tech Stack:** Astro 5.17 (static), Tailwind 4 (classic only), TypeScript, `@astrojs/markdown-remark` 6.3.10 (already in the tree via Astro), `tsx --test` + `node:assert`, Playwright MCP tools and `pnpm dlx lighthouse` for final verification.

**Spec:** `docs/superpowers/specs/2026-10-06-editorial-theme-design.md`. Design references: `personal-site-handoff/design/{Main,Research,Publications,Resume,Blog,Post}.dc.html`, tokens in `personal-site-handoff/HANDOFF.md` §4. The design folder is untracked reference material; don't commit it.

**Baseline commit:** `9667398` (HEAD of `feat/editorial-theme` when this plan was written). The classic page moves in Task 5 read the original files from this commit with `git show 9667398:<path>`, so they still work after the routes have been rewritten.

## Global Constraints

- `theme: 'classic'` or a missing `theme` key produces the same HTML as before. `node scripts/check-themes.mjs` compares every classic page with `dist-baseline/` (built in Task 1) and must pass at the end of every task from Task 4 onward.
- `theme` values are `'classic' | 'editorial'`, default `'classic'`. `SCHOLAROS_THEME` overrides `config/site.yml`.
- Static build only: no adapter, no SSR. It must keep working on GitHub Pages, Netlify and Vercel.
- Editorial is light-only. Never render the theme toggle and never add the `dark` class.
- Editorial designed pages use no framework islands. Each page gets at most one small `<script>`, re-bound on `astro:page-load` because `ClientRouter` is in use.
- Tokens, copied verbatim from the spec: ink `#15192B`, body-2 `#3D4357`, muted `#4A5068`, caption `#6A7085`, rule `#E4E7EE`, tint `#F3F5FA`, hover `#F6F8FC`, accent from `colors.light.primary` (editorial default `#1F3C88`), accent-hover `#142A63` (or accent darkened), selection `#DCE3F5`, footer `#15192B`.
- Editorial default fonts are Source Serif 4 / IBM Plex Sans / IBM Plex Mono, loaded through `FontStyles.astro`. `fonts.families` overrides them.
- Content width 1080px, article width 680px, 32px side padding (16px on phones), radius 4–6px. No pills, gradients or emoji.
- Visible accent `:focus-visible` outline on every interactive element. `prefers-reduced-motion` disables transitions.
- Text contrast ≥ 4.5:1. Measured: caption on white 4.92, on `#F3F5FA` 4.51, on `#F6F8FC` 4.63; footer `#9AA0B4` on `#15192B` 6.69.
- Every content-model addition is optional and backward compatible.
- Tests use `node:test` + `node:assert/strict` only, run with `pnpm test` (`tsx --test`). No test framework.
- Only one new dependency: `@astrojs/markdown-remark@6.3.10`, the exact version Astro already installs.
- Node 22 (`.nvmrc`), pnpm.
- Existing state: `pnpm check` reports 14 errors and `prettier --check .` fails on 21 files, all of them predating this work. The final task (Task 12) fixes both, because the spec requires `pnpm check` and `pnpm lint` to pass.
- Commit messages end with the trailer line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never `git add -A`: `HANDOFF.md` and `personal-site-handoff/` stay untracked.

## Review Focus

1. **Date-only frontmatter west of UTC.** `date: 2024-01-01` parses as UTC midnight, so formatting in local time shows "Dec 31, 2023" in the Americas. Every date shown should be the authored date. Pinned by the `TZ=America/Los_Angeles` test in Task 2 (`formatNewsDate` formats in UTC).
2. **Filters versus CSS `display`.** Rows styled `display:flex` ignore the `hidden` attribute, and some filter combinations match nothing. Hidden rows must disappear, empty year groups must disappear, and an all-empty result must say so. Pinned by the `[hidden]` rule and the browser check in Task 9, and by the Blog check in Task 11.
3. **Hand-authored ids.** Watch for duplicate area titles, an area named "Software" (which collides with the `#software` anchor), and unknown ids in `areas[].publications` or `relatedPublication`. Anchors must stay unique, and typos must warn without breaking the build. Pinned by the `normalizeAreas` tests in Task 3 and the `pick()` warning in Task 7.
4. **Messy publication identifiers.** A DOI may be pasted as a URL, an arXiv id may have an `arXiv:` prefix, a paper may have no link at all, and first authors may be non-ASCII or written "Last, First". Links and BibTeX keys must stay valid, and a paper with no link renders as plain text. Pinned by the `paperLink`/`bibtexKey` tests in Task 2 and by `PaperRow`'s no-link branch.
5. **Empty strings from the CMS.** Sveltia writes `''` for untouched fields, for example `theme: ''`, `datePrecision: ''` and blank affiliations. These must behave as "unset", not crash the build or render empty bands. Pinned by the `normalizeTheme` tests in Task 1, the `datePrecision` preprocess in Task 6, and the affiliation filter in Task 7.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/config.ts` (modify) | `normalizeTheme()`, env override in `getSiteConfig()`, `getTheme()` |
| `src/lib/types.ts` (modify) | `ThemeName`, `EditorialConfig`, `SiteConfig.theme/editorial` |
| `src/lib/utils.ts` (modify) | `readingTime()`, `formatNewsDate()`, `DatePrecision` |
| `src/lib/bibtex.ts` (create) | `bibtexKey()`, `bibtexFor()` |
| `src/lib/editorial.ts` (create) | Pure editorial view helpers: links, owner, short titles, areas, topics, writing, socials, home block order, JSON-LD |
| `src/lib/colors.ts` (modify) | `editorialAccentCss()` |
| `src/lib/cv.ts` (create) | CV loading/normalization moved out of `cv.astro`, plus `cvEntryView()` |
| `src/lib/markdown.ts` (create) | `renderMarkdown()` for Markdown stored in YAML config |
| `src/lib/*.test.ts` (create) | Unit tests |
| `src/components/astro/DarkModeScript.astro` (create) | Classic dark-mode bootstrap script, moved verbatim from `BaseLayout` |
| `src/layouts/BaseLayout.astro`, `PageLayout.astro` (modify) | `data-theme`, accent CSS, theme-aware shell |
| `src/components/astro/FontStyles.astro` (modify) | Editorial font defaults and axes |
| `src/themes/classic/{PageShell,Home,Research,Publications,Cv,Blog,Post}.astro` (create) | Classic markup, moved verbatim |
| `src/themes/editorial/editorial.css` | Tokens, utilities, component styles, `.ed-prose` |
| `src/themes/editorial/{Layout,Eyebrow,PaperRow,NewsList,PostRow}.astro` | Shared editorial components |
| `src/themes/editorial/{Home,Research,Publications,Cv,Blog,Post}.astro` | Editorial pages |
| `src/themes/editorial/data.ts` | Editorial data loaders (call `getCollection`, then the pure helpers) |
| `src/pages/{index,research,publications,cv}.astro`, `src/pages/blog/{index,[id]}.astro` (modify) | Load data, pick a theme component |
| `src/content.config.ts`, `config/*.yml`, `src/content/**`, `public/images/*.svg` (modify/create) | Content model and demo content |
| `scripts/check-themes.mjs` (create) | Builds both themes, asserts landmarks, classic regression diff |
| `.github/workflows/lint.yml` (modify) | Unit tests + both-theme build in CI |

---

### Task 1: Theme switch, test runner, classic baseline

**Files:**
- Modify: `.gitignore`, `.prettierignore`, `eslint.config.mjs`, `package.json`
- Modify: `src/lib/types.ts`, `src/lib/config.ts`, `src/layouts/BaseLayout.astro`
- Create: `src/components/astro/DarkModeScript.astro`
- Test: `src/lib/config.test.ts`

**Interfaces:**
- Produces: `type ThemeName = 'classic' | 'editorial'` (`src/lib/types.ts`), `SiteConfig.theme?: ThemeName`, `normalizeTheme(value: unknown, source: string): ThemeName`, `getTheme(): ThemeName` (`src/lib/config.ts`), `<html data-theme="classic|editorial">`, `pnpm test`, and the `dist-baseline/` directory (local, gitignored).

- [ ] **Step 1: Ignore theme build output before any build runs.** Tailwind skips gitignored folders when it scans for classes, so this has to happen before the baseline build.

Append to `.gitignore`:

```gitignore

# theme check builds (scripts/check-themes.mjs)
dist-*/
```

Append to `.prettierignore`:

```
dist-*/
```

In `eslint.config.mjs`, change the global ignores line to:

```js
  { ignores: ['dist/', 'dist-*/', 'node_modules/', '.astro/', 'src/content/', 'src/data/'] },
```

- [ ] **Step 2: Build the classic baseline from the untouched code**

Run:

```bash
git status --short   # expect only ?? HANDOFF.md, ?? personal-site-handoff/, and the three ignore files
pnpm build && rm -rf dist-baseline && mv dist dist-baseline
ls dist-baseline/index.html dist-baseline/cv/index.html
```

Expected: both files are listed. Keep `dist-baseline/` until Task 12; it is the regression oracle.

- [ ] **Step 3: Add the test script.** In `package.json` `"scripts"`, after `"check"`, add:

```json
    "test": "tsx --test src/lib/*.test.ts"
```

- [ ] **Step 4: Write the failing test** `src/lib/config.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTheme } from './config';

test('normalizeTheme: missing or empty means classic', () => {
  for (const value of [undefined, null, '']) assert.equal(normalizeTheme(value, 'config/site.yml'), 'classic');
});

test('normalizeTheme: accepts both theme names', () => {
  assert.equal(normalizeTheme('classic', 'config/site.yml'), 'classic');
  assert.equal(normalizeTheme('editorial', 'config/site.yml'), 'editorial');
});

test('normalizeTheme: rejects unknown names and says where they came from', () => {
  assert.throws(
    () => normalizeTheme('Editorial', 'SCHOLAROS_THEME'),
    /SCHOLAROS_THEME: theme must be 'classic' or 'editorial', got 'Editorial'/,
  );
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL, `normalizeTheme` is not exported from `./config`.

- [ ] **Step 6: Implement.** In `src/lib/types.ts`, add above `export interface SiteConfig`:

```ts
export type ThemeName = 'classic' | 'editorial';
```

and add to `SiteConfig` (after `siteMode`):

```ts
  theme?: ThemeName;
```

In `src/lib/config.ts`, change the type import to:

```ts
import type { SiteConfig, HomepageSectionId, HomepageSectionEntry, ThemeName } from './types';
```

and replace `getSiteConfig()` with:

```ts
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
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS, 3 tests.

- [ ] **Step 8: Mark the theme on `<html>` and keep dark mode out of editorial.** Create `src/components/astro/DarkModeScript.astro` holding the script from `BaseLayout.astro` lines 30–52, unchanged:

```astro
<script is:inline>
  // Apply theme from localStorage or configured default
  function applyTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (saved === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // No saved preference — use configured default
      const d = document.documentElement.getAttribute('data-default-theme') || 'system';
      if (d === 'dark' || (d === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }
  // Apply on initial load
  applyTheme();
  // Re-apply after ViewTransitions page swap
  document.addEventListener('astro:after-swap', applyTheme);
</script>
```

In `src/layouts/BaseLayout.astro`:
- add `import DarkModeScript from '../components/astro/DarkModeScript.astro';`
- change `import { getSiteConfig } from '../lib/config';` to `import { getSiteConfig, getTheme } from '../lib/config';`
- after `const colorCSS = …` add `const theme = getTheme();`
- change the `<html …>` line to `<html lang={lang} dir={dir} class="scroll-smooth" data-default-theme={defaultTheme} data-theme={theme}>`
- replace the whole `<script is:inline> … </script>` block (old lines 30–52) with `{theme === 'classic' && <DarkModeScript />}`

- [ ] **Step 9: Verify both themes build and carry the marker**

Run:

```bash
SCHOLAROS_THEME=classic pnpm astro build --outDir dist-classic && grep -o 'data-theme="classic"' dist-classic/index.html
SCHOLAROS_THEME=editorial pnpm astro build --outDir dist-editorial && grep -o 'data-theme="editorial"' dist-editorial/index.html
grep -c 'applyTheme' dist-classic/index.html dist-editorial/index.html
SCHOLAROS_THEME=Editorial pnpm astro build --outDir dist-typo; echo "exit $?"
```

Expected: the two markers print; `applyTheme` count is 2 in classic and 0 in editorial; the typo build fails with `SCHOLAROS_THEME: theme must be 'classic' or 'editorial', got 'Editorial'` and exits non-zero.

- [ ] **Step 10: Commit**

```bash
git add .gitignore .prettierignore eslint.config.mjs package.json src/lib/types.ts src/lib/config.ts src/lib/config.test.ts src/layouts/BaseLayout.astro src/components/astro/DarkModeScript.astro
git commit -m "feat: theme switch (site.yml theme, SCHOLAROS_THEME) and html data-theme" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Dates, reading time, BibTeX and publication helpers

**Files:**
- Modify: `src/lib/utils.ts`
- Create: `src/lib/bibtex.ts`, `src/lib/editorial.ts`
- Test: `src/lib/utils.test.ts`, `src/lib/bibtex.test.ts`, `src/lib/editorial.test.ts`

**Interfaces:**
- Produces (`src/lib/utils.ts`): `type DatePrecision = 'day' | 'month' | 'year'`; `readingTime(body: string): number`; `formatNewsDate(date: Date, precision?: DatePrecision): string`.
- Produces (`src/lib/bibtex.ts`): `interface BibSource { title: string; authors: string[]; venue: string; year: number; type: string; doi?: string; bibtex?: string }`; `bibtexKey(p: Pick<BibSource,'title'|'authors'|'year'>): string`; `bibtexFor(p: BibSource): string`.
- Produces (`src/lib/editorial.ts`): `stripHonorific(name)`, `isOwner(author, siteAuthor): boolean`, `bareDoi(doi)`, `bareArxiv(id)`, `paperLink({url?, doi?, arxiv?}): string | undefined`, `shortTitle(title): string`.

- [ ] **Step 1: Write the failing tests.** Create `src/lib/utils.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNewsDate, readingTime } from './utils';

// West of UTC: date-only frontmatter (UTC midnight) must not slip to the previous day.
process.env.TZ = 'America/Los_Angeles';

test('formatNewsDate: formats at the requested precision', () => {
  const d = new Date('2025-10-03');
  assert.equal(formatNewsDate(d, 'day'), 'Oct 3, 2025');
  assert.equal(formatNewsDate(d, 'month'), 'Oct 2025');
  assert.equal(formatNewsDate(d, 'year'), '2025');
  assert.equal(formatNewsDate(d), 'Oct 2025');
});

test('formatNewsDate: date-only values keep their day west of UTC', () => {
  assert.equal(formatNewsDate(new Date('2024-01-01'), 'day'), 'Jan 1, 2024');
  assert.equal(formatNewsDate(new Date('2024-01-01'), 'year'), '2024');
});

test('readingTime: ceil(words / 230), at least 1 minute', () => {
  assert.equal(readingTime(''), 1);
  assert.equal(readingTime('word '.repeat(230)), 1);
  assert.equal(readingTime('word '.repeat(231)), 2);
  assert.equal(readingTime('  spaced\n\nout\twords  '), 1);
});
```

Create `src/lib/bibtex.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { bibtexFor, bibtexKey } from './bibtex';

const base = {
  title: 'Adaptive Fine-Tuning for Low-Resource Domains',
  authors: ['Jane Smith', 'Alex Chen'],
  venue: 'EMNLP 2024',
  year: 2024,
};

test('bibtexFor: an explicit bibtex field wins (trimmed)', () => {
  assert.equal(bibtexFor({ ...base, type: 'conference', bibtex: '  @misc{x}\n' }), '@misc{x}');
});

test('bibtexFor: conference and workshop become @inproceedings with booktitle', () => {
  const expected = [
    '@inproceedings{smith2024adaptive,',
    '  title = {Adaptive Fine-Tuning for Low-Resource Domains},',
    '  author = {Jane Smith and Alex Chen},',
    '  booktitle = {EMNLP 2024},',
    '  year = {2024}',
    '}',
  ].join('\n');
  assert.equal(bibtexFor({ ...base, type: 'conference' }), expected);
  assert.match(bibtexFor({ ...base, type: 'workshop' }), /^@inproceedings\{/);
});

test('bibtexFor: other types become @article with journal and a bare doi', () => {
  const bib = bibtexFor({ ...base, type: 'journal', venue: 'TACL', doi: 'https://doi.org/10.1162/tacl_a_00612' });
  assert.match(bib, /^@article\{smith2024adaptive,/);
  assert.match(bib, / {2}journal = \{TACL\},/);
  assert.match(bib, / {2}doi = \{10\.1162\/tacl_a_00612\}\n\}$/);
});

test('bibtexKey: diacritics, "Last, First" names and missing authors', () => {
  assert.equal(bibtexKey({ title: 'Über Graphs', authors: ['María García'], year: 2023 }), 'garcia2023uber');
  assert.equal(bibtexKey({ title: 'A Survey', authors: ['Smith, Jane'], year: 2022 }), 'smith2022a');
  assert.equal(bibtexKey({ title: '— Untitled', authors: [], year: 2021 }), 'anon2021untitled');
});
```

Create `src/lib/editorial.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwner, paperLink, shortTitle } from './editorial';

test('paperLink: url, then doi, then arXiv', () => {
  assert.equal(paperLink({ url: 'https://a.org/p', doi: '10.1/x', arxiv: '2401.1' }), 'https://a.org/p');
  assert.equal(paperLink({ doi: '10.1/x', arxiv: '2401.1' }), 'https://doi.org/10.1/x');
  assert.equal(paperLink({ arxiv: '2401.1' }), 'https://arxiv.org/abs/2401.1');
  assert.equal(paperLink({}), undefined);
});

test('paperLink: tolerates pasted URLs and prefixes', () => {
  assert.equal(paperLink({ doi: 'https://doi.org/10.1/x' }), 'https://doi.org/10.1/x');
  assert.equal(paperLink({ doi: 'http://dx.doi.org/10.1/x' }), 'https://doi.org/10.1/x');
  assert.equal(paperLink({ arxiv: 'arXiv:2410.12459' }), 'https://arxiv.org/abs/2410.12459');
  assert.equal(paperLink({ arxiv: 'https://arxiv.org/abs/2410.12459' }), 'https://arxiv.org/abs/2410.12459');
});

test('isOwner: ignores a leading Prof./Dr. and surrounding spaces', () => {
  assert.ok(isOwner('Jane Smith', 'Prof. Jane Smith'));
  assert.ok(isOwner(' Dr Jane Smith ', 'Jane Smith'));
  assert.ok(!isOwner('Jane Smithson', 'Prof. Jane Smith'));
});

test('shortTitle: text before the first colon, else the whole title', () => {
  assert.equal(shortTitle('HELM: Hierarchical Encoding for mRNA'), 'HELM');
  assert.equal(shortTitle('No Colon Here'), 'No Colon Here');
  assert.equal(shortTitle(': Leading colon'), ': Leading colon');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL. `formatNewsDate`/`readingTime` are not exported, and `./bibtex` and `./editorial` don't exist.

- [ ] **Step 3: Implement.** Append to `src/lib/utils.ts`:

```ts
/** Minutes to read `body` at 230 words per minute; never less than 1. */
export function readingTime(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 230));
}

export type DatePrecision = 'day' | 'month' | 'year';

/** "Oct 3, 2025" / "Oct 2025" / "2025". UTC, because date-only frontmatter parses as UTC midnight. */
export function formatNewsDate(date: Date, precision: DatePrecision = 'month'): string {
  const parts: Intl.DateTimeFormatOptions =
    precision === 'year'
      ? { year: 'numeric' }
      : precision === 'day'
        ? { year: 'numeric', month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'short' };
  return date.toLocaleDateString('en-US', { ...parts, timeZone: 'UTC' });
}
```

Create `src/lib/editorial.ts`:

```ts
/** "Prof. Jane Smith" → "Jane Smith". Used to find the site owner in author lists. */
export function stripHonorific(name: string): string {
  return name
    .trim()
    .replace(/^(prof|dr)\.?\s+/i, '')
    .trim();
}

export function isOwner(author: string, siteAuthor: string): boolean {
  return stripHonorific(author) === stripHonorific(siteAuthor);
}

/** "https://doi.org/10.1/x" → "10.1/x". */
export function bareDoi(doi: string): string {
  return doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
}

/** "arXiv:2410.12459" or "https://arxiv.org/abs/2410.12459" → "2410.12459". */
export function bareArxiv(id: string): string {
  return id
    .trim()
    .replace(/^arxiv:/i, '')
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//i, '');
}

/** Paper link priority: url → doi → arXiv. */
export function paperLink(p: { url?: string; doi?: string; arxiv?: string }): string | undefined {
  if (p.url) return p.url;
  if (p.doi) return `https://doi.org/${bareDoi(p.doi)}`;
  if (p.arxiv) return `https://arxiv.org/abs/${bareArxiv(p.arxiv)}`;
  return undefined;
}

/** "HELM: Hierarchical Encoding…" → "HELM"; titles without a usable colon prefix stay whole. */
export function shortTitle(title: string): string {
  return title.split(':')[0].trim() || title.trim();
}
```

Create `src/lib/bibtex.ts`:

```ts
import { bareDoi } from './editorial';

export interface BibSource {
  title: string;
  authors: string[];
  venue: string;
  year: number;
  type: string;
  doi?: string;
  bibtex?: string;
}

/** ASCII lower-case letters and digits only: "García" → "garcia". */
function keyPart(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function lastName(author: string): string {
  const name = author.trim();
  if (name.includes(',')) return name.split(',')[0]; // "Smith, Jane"
  const parts = name.split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

/** First author's last name + year + first title word, e.g. smith2024adaptive. */
export function bibtexKey(p: Pick<BibSource, 'title' | 'authors' | 'year'>): string {
  const author = keyPart(lastName(p.authors[0] ?? '')) || 'anon';
  const word = p.title.split(/\s+/).map(keyPart).find(Boolean) ?? '';
  return `${author}${p.year}${word}`;
}

/** The publication's own `bibtex` when present, otherwise a generated entry. */
export function bibtexFor(p: BibSource): string {
  if (p.bibtex?.trim()) return p.bibtex.trim();
  const inProceedings = p.type === 'conference' || p.type === 'workshop';
  const fields: [string, string][] = [
    ['title', p.title],
    ['author', p.authors.join(' and ')],
    [inProceedings ? 'booktitle' : 'journal', p.venue],
    ['year', String(p.year)],
  ];
  if (p.doi) fields.push(['doi', bareDoi(p.doi)]);
  const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n');
  return `@${inProceedings ? 'inproceedings' : 'article'}{${bibtexKey(p)},\n${body}\n}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts src/lib/utils.test.ts src/lib/bibtex.ts src/lib/bibtex.test.ts src/lib/editorial.ts src/lib/editorial.test.ts
git commit -m "feat: date, reading-time, BibTeX and paper-link helpers" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Research, writing, home-layout and accent helpers

**Files:**
- Modify: `src/lib/editorial.ts`, `src/lib/colors.ts`
- Test: `src/lib/editorial.test.ts`, `src/lib/colors.test.ts`

**Interfaces:**
- Consumes: `slugify(text)` from `src/lib/utils.ts`; `SocialLinks`, `HomepageSectionId`, `SiteConfig` from `src/lib/types.ts`.
- Produces (`src/lib/editorial.ts`):
  - `interface ResearchAreaInput { id?; label?; title: string; description: string; body?; result?; figure?; caption?; publications?: string[]; tags?: string[] }`
  - `interface ResearchConfig { headline?: string; description?: string; areas?: ResearchAreaInput[] }`
  - `interface ResearchArea extends ResearchAreaInput { id: string; label: string; numeral: string; publications: string[] }`
  - `toRoman(n): string`, `normalizeAreas(areas?): ResearchArea[]`, `topicOf(topic, areaIds: ReadonlySet<string>): string`
  - `interface TopicFilter { id: string; label: string; count: number }`, `topicFilters(topics: string[], areas: {id; label}[]): TopicFilter[]`
  - `interface WritingItem { kind: 'site' | 'external'; title: string; href: string; date: Date; excerpt?: string; source?: string; minutes?: number; tag?: string }`, `mergeWriting(items): WritingItem[]`, `elsewhereLabel(sources): string`
  - `socialLinks(socials?): { label: string; href: string }[]`
  - `type HomeBlock = 'hero' | 'affiliations' | 'research' | 'publications' | 'updates'`, `homeBlocks(sections, has: { affiliations: boolean; research: boolean }): HomeBlock[]`
  - `jsonLd(data: unknown): string`
- Produces (`src/lib/colors.ts`): `editorialAccentCss(config: SiteConfig): string`.

- [ ] **Step 1: Write the failing tests.** Append to `src/lib/editorial.test.ts` (and extend its import line to `import { elsewhereLabel, homeBlocks, isOwner, jsonLd, mergeWriting, normalizeAreas, paperLink, shortTitle, socialLinks, toRoman, topicFilters, topicOf } from './editorial';`):

```ts
test('toRoman: lower-case numerals', () => {
  assert.deepEqual([1, 2, 3, 4, 9, 14, 40].map(toRoman), ['i', 'ii', 'iii', 'iv', 'ix', 'xiv', 'xl']);
});

test('normalizeAreas: fills id, label, numeral and publications', () => {
  const [a] = normalizeAreas([{ title: 'AI Safety & Robustness', description: 'd' }]);
  assert.equal(a.id, 'ai-safety-robustness');
  assert.equal(a.label, 'AI Safety & Robustness');
  assert.equal(a.numeral, 'i.');
  assert.deepEqual(a.publications, []);
});

test('normalizeAreas: keeps explicit ids, de-duplicates, and avoids page anchors', () => {
  const areas = normalizeAreas([
    { id: 'nlp', label: 'NLP', title: 'Natural Language Processing', description: '' },
    { title: 'NLP', description: '' },
    { title: 'Software', description: '' },
    { id: '  ', title: '', description: '' },
  ]);
  assert.deepEqual(
    areas.map((a) => a.id),
    ['nlp', 'nlp-2', 'software-2', 'area-4'],
  );
  assert.deepEqual(
    areas.map((a) => a.numeral),
    ['i.', 'ii.', 'iii.', 'iv.'],
  );
  assert.equal(areas[0].label, 'NLP');
});

test('normalizeAreas: no areas → empty list', () => {
  assert.deepEqual(normalizeAreas(undefined), []);
});

test('topicOf: unknown or missing topics fall into "other"', () => {
  const ids = new Set(['nlp']);
  assert.equal(topicOf('nlp', ids), 'nlp');
  assert.equal(topicOf('robotics', ids), 'other');
  assert.equal(topicOf(undefined, ids), 'other');
});

test('topicFilters: All first, empty areas hidden, Other only when used', () => {
  const areas = [
    { id: 'nlp', label: 'NLP' },
    { id: 'vision', label: 'Vision' },
  ];
  assert.deepEqual(topicFilters(['nlp', 'nlp', 'other'], areas), [
    { id: 'all', label: 'All', count: 3 },
    { id: 'nlp', label: 'NLP', count: 2 },
    { id: 'other', label: 'Other', count: 1 },
  ]);
  assert.deepEqual(
    topicFilters(['vision'], areas).map((f) => f.id),
    ['all', 'vision'],
  );
});

test('mergeWriting: newest first, unparseable dates last', () => {
  const item = (title: string, date: string) => ({ kind: 'site' as const, title, href: '#', date: new Date(date) });
  const sorted = mergeWriting([item('old', '2023-01-01'), item('bad', 'not a date'), item('new', '2025-05-01')]);
  assert.deepEqual(
    sorted.map((i) => i.title),
    ['new', 'old', 'bad'],
  );
});

test('elsewhereLabel: the single shared feed source, else "Elsewhere"', () => {
  assert.equal(elsewhereLabel(['Medium', ' Medium ']), 'Medium');
  assert.equal(elsewhereLabel(['Medium', 'Substack']), 'Elsewhere');
  assert.equal(elsewhereLabel([]), 'Elsewhere');
});

test('socialLinks: known profiles in a fixed order, blanks and email skipped', () => {
  assert.deepEqual(
    socialLinks({ github: 'https://github.com/x', scholar: 'https://scholar.google.com/x', twitter: '', email: 'a@b.c' }),
    [
      { label: 'Google Scholar', href: 'https://scholar.google.com/x' },
      { label: 'GitHub', href: 'https://github.com/x' },
    ],
  );
  assert.deepEqual(socialLinks(undefined), []);
});

test('homeBlocks: hero, affiliations, research, then papers/updates in configured order', () => {
  assert.deepEqual(homeBlocks(['hero', 'about', 'news', 'publications', 'blog'], { affiliations: true, research: true }), [
    'hero',
    'affiliations',
    'research',
    'updates',
    'publications',
  ]);
  assert.deepEqual(homeBlocks(['publications', 'blog'], { affiliations: false, research: true }), [
    'research',
    'publications',
    'updates',
  ]);
  assert.deepEqual(homeBlocks(['about'], { affiliations: false, research: false }), ['hero']);
});

test('jsonLd: escapes "<" so content cannot close the script tag', () => {
  assert.equal(jsonLd({ t: '</script>' }), '{"t":"\\u003c/script>"}');
});
```

Create `src/lib/colors.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialAccentCss } from './colors';
import type { SiteConfig } from './types';

const site = (primary?: string) => ({ colors: { light: { primary } } }) as unknown as SiteConfig;

test('editorialAccentCss: nothing when no primary color is set', () => {
  assert.equal(editorialAccentCss(site()), '');
  assert.equal(editorialAccentCss(site('  ')), '');
});

test('editorialAccentCss: accent plus darkened hover from colors.light.primary', () => {
  const css = editorialAccentCss(site('#2c5282'));
  assert.match(css, /html:root\[data-theme='editorial'\] \{/);
  assert.match(css, /--ed-accent: #2c5282;/);
  assert.match(css, /--ed-accent-hover: color-mix\(in oklch, #2c5282, black 25%\);/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL, the new exports don't exist.

- [ ] **Step 3: Implement.** At the top of `src/lib/editorial.ts` add:

```ts
import { slugify } from './utils';
import type { HomepageSectionId, SocialLinks } from './types';
```

Append to `src/lib/editorial.ts`:

```ts
// ── Research areas ────────────────────────────────────────────────

export interface ResearchAreaInput {
  id?: string;
  label?: string;
  title: string;
  description: string;
  body?: string;
  result?: string;
  figure?: string;
  caption?: string;
  publications?: string[];
  tags?: string[];
}

export interface ResearchConfig {
  headline?: string;
  description?: string;
  areas?: ResearchAreaInput[];
}

export interface ResearchArea extends ResearchAreaInput {
  id: string;
  label: string;
  numeral: string;
  publications: string[];
}

const ROMAN: [number, string][] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

export function toRoman(n: number): string {
  let out = '';
  for (const [value, numeral] of ROMAN) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

/** Ids already used by the Research page itself; areas never take them. */
const RESERVED_IDS = ['software', 'main-content'];

/** Fills in id (slug of title, unique on the page), label and numeral ("i.", "ii.", …). */
export function normalizeAreas(areas: ResearchAreaInput[] = []): ResearchArea[] {
  const seen = new Set(RESERVED_IDS);
  return areas.map((area, i) => {
    const base = area.id?.trim() || slugify(area.title) || `area-${i + 1}`;
    let id = base;
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
    seen.add(id);
    return {
      ...area,
      id,
      label: area.label?.trim() || area.title,
      numeral: `${toRoman(i + 1)}.`,
      publications: area.publications ?? [],
    };
  });
}

/** Publication topic → research-area id, or 'other' when it matches none. */
export function topicOf(topic: string | undefined, areaIds: ReadonlySet<string>): string {
  return topic && areaIds.has(topic) ? topic : 'other';
}

export interface TopicFilter {
  id: string;
  label: string;
  count: number;
}

/** "All", then every area that has papers, then "Other" if any paper matched no area. */
export function topicFilters(topics: string[], areas: { id: string; label: string }[]): TopicFilter[] {
  const count = (id: string) => topics.filter((t) => t === id).length;
  return [
    { id: 'all', label: 'All', count: topics.length },
    ...areas.map((a) => ({ id: a.id, label: a.label, count: count(a.id) })).filter((f) => f.count > 0),
    ...(count('other') > 0 ? [{ id: 'other', label: 'Other', count: count('other') }] : []),
  ];
}

// ── Writing (site posts + external feeds) ─────────────────────────

export interface WritingItem {
  kind: 'site' | 'external';
  title: string;
  href: string;
  date: Date;
  excerpt?: string;
  /** External only: feed source name, e.g. "Medium". */
  source?: string;
  /** Site only: reading time. */
  minutes?: number;
  /** Site only: first tag. */
  tag?: string;
}

const time = (d: Date) => (Number.isFinite(d.getTime()) ? d.getTime() : -Infinity);

/** Newest first; items with unparseable dates go last. */
export function mergeWriting(items: WritingItem[]): WritingItem[] {
  return [...items].sort((a, b) => time(b.date) - time(a.date));
}

/** Label for the third Writing tab: the one shared feed source ("Medium"), else "Elsewhere". */
export function elsewhereLabel(sources: string[]): string {
  const unique = [...new Set(sources.map((s) => s.trim()).filter(Boolean))];
  return unique.length === 1 ? unique[0] : 'Elsewhere';
}

// ── Home page ─────────────────────────────────────────────────────

const SOCIAL_LABELS: [keyof SocialLinks, string][] = [
  ['scholar', 'Google Scholar'],
  ['github', 'GitHub'],
  ['linkedin', 'LinkedIn'],
  ['orcid', 'ORCID'],
  ['twitter', 'X'],
  ['bluesky', 'Bluesky'],
  ['mastodon', 'Mastodon'],
  ['website', 'Website'],
];

/** Profile links in a fixed order; email is rendered separately as a mailto link. */
export function socialLinks(socials: SocialLinks = {}): { label: string; href: string }[] {
  return SOCIAL_LABELS.flatMap(([key, label]) => {
    const href = socials[key]?.trim();
    return href ? [{ label, href }] : [];
  });
}

export type HomeBlock = 'hero' | 'affiliations' | 'research' | 'publications' | 'updates';

/**
 * Editorial home block order from homepageSections. The hero shows when `hero` or `about` is on
 * (about = the bio inside it); affiliations and research follow it when configured; news + blog
 * share one "updates" row placed where the first of them is.
 */
export function homeBlocks(
  sections: HomepageSectionId[],
  has: { affiliations: boolean; research: boolean },
): HomeBlock[] {
  const blocks: HomeBlock[] = [];
  if (sections.includes('hero') || sections.includes('about')) blocks.push('hero');
  if (has.affiliations) blocks.push('affiliations');
  if (has.research) blocks.push('research');
  for (const id of sections) {
    if (id === 'publications') blocks.push('publications');
    if ((id === 'news' || id === 'blog') && !blocks.includes('updates')) blocks.push('updates');
  }
  return blocks;
}

/** JSON for <script type="application/ld+json">, with "<" escaped so content can't close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
```

Append to `src/lib/colors.ts`:

```ts
/**
 * Editorial accent from colors.light.primary. When unset, editorial.css supplies #1F3C88 / #142A63.
 * `html:root[…]` outranks the `:root[…]` defaults in editorial.css regardless of stylesheet order.
 */
export function editorialAccentCss(config: SiteConfig): string {
  const accent = config.colors?.light?.primary?.trim();
  if (!accent) return '';
  return `\nhtml:root[data-theme='editorial'] {\n  --ed-accent: ${accent};\n  --ed-accent-hover: color-mix(in oklch, ${accent}, black 25%);\n}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editorial.ts src/lib/editorial.test.ts src/lib/colors.ts src/lib/colors.test.ts
git commit -m "feat: editorial helpers for research areas, topics, writing, home layout and accent" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `scripts/check-themes.mjs`

**Files:**
- Create: `scripts/check-themes.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `data-theme` on `<html>` (Task 1), `dist-baseline/` (Task 1).
- Produces: `pnpm check:themes` (builds `dist-classic/` + `dist-editorial/`, then asserts), `node scripts/check-themes.mjs --no-build` (asserts against existing builds). Later tasks insert one assertion block per editorial page directly **above** the `// --- classic regression ---` line, using the `ed(page)` helper.

- [ ] **Step 1: Write the check script** `scripts/check-themes.mjs`:

```js
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
```

In `package.json` `"scripts"`, add after `"test"`:

```json
    "check:themes": "node scripts/check-themes.mjs"
```

- [ ] **Step 2: Prove the regression check catches a change.** Temporarily edit `src/components/astro/Footer.astro`, changing `Powered by` to `Powered  by!`, then:

Run: `pnpm check:themes`
Expected: FAIL with `classic …index.html differs from dist-baseline/`. Revert the Footer edit with `git checkout src/components/astro/Footer.astro`.

- [ ] **Step 3: Run it for real**

Run: `pnpm check:themes`
Expected: `check-themes: N classic pages match dist-baseline/` and `check-themes: OK`.

If a page differs only by something deterministic the normalizer misses (for example a new hashed-asset name format), extend `normalize()` with one targeted `.replace` and say why in its comment. Never loosen it to hide a markup difference.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-themes.mjs package.json
git commit -m "test: check-themes script (both-theme build, landmarks, classic regression)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Move classic markup into `src/themes/classic/` and CV logic into `src/lib/cv.ts`

**Files:**
- Create: `src/lib/cv.ts`, `src/lib/cv.test.ts`
- Create: `src/themes/classic/{Home,Research,Publications,Cv,Blog,Post}.astro`
- Modify (rewrite): `src/pages/index.astro`, `src/pages/research.astro`, `src/pages/publications.astro`, `src/pages/cv.astro`, `src/pages/blog/index.astro`, `src/pages/blog/[id].astro`

**Interfaces:**
- Consumes: `loadYamlConfig`, `normalizeKeys` (`src/lib/config.ts`); `CvConfig`, `CvData`, `CvGenericEntry`, `CvMetadata` (`src/lib/types.ts`).
- Produces (`src/lib/cv.ts`): `resolveCvConfig(upload: {enabled?, content?} | null | undefined, loadStructured: () => CvConfig): CvConfig`; `loadCv(): CvConfig`; `loadCvMeta(): CvMetadata | null`; `formatDateRange(start?, end?): string`; `sectionTitle(key): string`; `cvSections(cv: CvData): [string, unknown[]][]`; `hasYamlPublications(sections): boolean`; guards `isEducationEntry`, `isOneLineEntry`, `isExperienceEntry`, `isPublicationEntry`, `isNormalEntry`.
- Produces: classic page components whose props are named exactly like the variables the old templates used (listed in each component's `Props`).

- [ ] **Step 1: Write the failing CV test** `src/lib/cv.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { cvSections, formatDateRange, resolveCvConfig, sectionTitle } from './cv';
import type { CvConfig, CvData } from './types';

const structured: CvConfig = { cv: { name: 'Structured', sections: {} } };
const fromStructured = () => structured;

test('resolveCvConfig: an enabled upload wins, with snake_case keys normalized', () => {
  const content = 'cv:\n  name: Uploaded\n  sections:\n    work_experience:\n      - company: X\n        start_date: 2020-01\n';
  const cv = resolveCvConfig({ enabled: true, content }, fromStructured).cv;
  assert.equal(cv.name, 'Uploaded');
  assert.deepEqual(Object.keys(cv.sections), ['workExperience']);
  assert.equal((cv.sections.workExperience as { startDate: string }[])[0].startDate, '2020-01');
});

test('resolveCvConfig: falls back to the structured CV', () => {
  assert.equal(resolveCvConfig(null, fromStructured), structured);
  assert.equal(resolveCvConfig({ enabled: false, content: 'cv: {name: X}' }, fromStructured), structured);
  assert.equal(resolveCvConfig({ enabled: true, content: '   ' }, fromStructured), structured);
  assert.equal(resolveCvConfig({ enabled: true, content: 'name: no cv key' }, fromStructured), structured);
  assert.equal(resolveCvConfig({ enabled: true, content: 'cv: [unclosed' }, fromStructured), structured);
});

test('formatDateRange and sectionTitle keep the classic formatting', () => {
  assert.equal(formatDateRange('2020-01', 'present'), '2020-01 – Present');
  assert.equal(formatDateRange('2015-09', '2019-12'), '2015-09 – 2019-12');
  assert.equal(formatDateRange(undefined, '2019'), '');
  assert.equal(sectionTitle('selectedPublications'), 'Selected Publications');
  assert.equal(sectionTitle('education'), 'Education');
});

test('cvSections: keeps YAML order and drops empty or non-list sections', () => {
  const cv = { name: 'x', sections: { b: [1], a: [], c: undefined, d: ['x'] } } as unknown as CvData;
  assert.deepEqual(
    cvSections(cv).map(([k]) => k),
    ['b', 'd'],
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL, `./cv` not found.

- [ ] **Step 3: Implement `src/lib/cv.ts`.** This is the logic from `src/pages/cv.astro` lines 13–31, 38–46, 51–62 and 64–93, moved here. The dead `usingUpload` variable is dropped, and the no-op `start.length === 7 ? start : start` is simplified to `start`.

```ts
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadYamlConfig, normalizeKeys } from './config';
import type { CvConfig, CvData, CvGenericEntry, CvMetadata } from './types';

type CvUpload = { enabled?: boolean; content?: string } | null | undefined;

/** A raw RenderCV upload wins when enabled and it parses to a `cv:` document; otherwise the structured CV. */
export function resolveCvConfig(upload: CvUpload, loadStructured: () => CvConfig): CvConfig {
  try {
    if (upload?.enabled && upload.content?.trim()) {
      const parsed = normalizeKeys(yaml.load(upload.content) as CvConfig);
      if (parsed?.cv) return parsed;
    }
  } catch {
    // Invalid upload YAML falls back to the structured CV, as it always has.
  }
  return loadStructured();
}

export function loadCv(): CvConfig {
  let upload: CvUpload = null;
  try {
    upload = loadYamlConfig<CvUpload>('cv-upload.yml');
  } catch {}
  return resolveCvConfig(upload, () => loadYamlConfig<CvConfig>('cv.yml'));
}

/** PDF metadata written by scripts/render-cv.py; null until a PDF has been generated. */
export function loadCvMeta(): CvMetadata | null {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/data/cv.json'), 'utf-8')) as CvMetadata;
  } catch {
    return null;
  }
}

export function formatDateRange(start?: string, end?: string): string {
  if (!start) return '';
  const e = end === 'present' ? 'Present' : (end ?? '');
  return `${start} – ${e}`;
}

export function sectionTitle(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/** All non-empty list sections, in YAML order. */
export function cvSections(cv: CvData): [string, unknown[]][] {
  return Object.entries(cv.sections ?? {}).filter(
    ([, entries]) => Array.isArray(entries) && entries.length > 0,
  ) as [string, unknown[]][];
}

/** True when some section already lists publications (title + authors), so the collection fallback is skipped. */
export function hasYamlPublications(sections: [string, unknown[]][]): boolean {
  return sections.some(([, entries]) => isPublicationEntry(entries[0]));
}

export function isEducationEntry(e: unknown): e is CvGenericEntry {
  return typeof e === 'object' && e !== null && 'institution' in e;
}

export function isOneLineEntry(e: unknown): e is { label: string; details: string } {
  return typeof e === 'object' && e !== null && 'label' in e && 'details' in e;
}

export function isExperienceEntry(e: unknown): e is CvGenericEntry {
  return typeof e === 'object' && e !== null && ('company' in e || 'position' in e);
}

export function isPublicationEntry(e: unknown): e is CvGenericEntry {
  return typeof e === 'object' && e !== null && 'title' in e && 'authors' in e;
}

export function isNormalEntry(e: unknown): e is CvGenericEntry {
  return typeof e === 'object' && e !== null && ('name' in e || 'startDate' in e || 'highlights' in e);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Move the home page.** Create the component header, then append the original template unchanged:

```bash
mkdir -p src/themes/classic
cat > src/themes/classic/Home.astro <<'EOF'
---
import PageLayout from '../../layouts/PageLayout.astro';
import HeroSection from '../../components/astro/HeroSection.astro';
import AboutSection from '../../components/astro/AboutSection.astro';
import SectionHeading from '../../components/astro/SectionHeading.astro';
import AnnouncementCard from '../../components/astro/AnnouncementCard.astro';
import PostCard from '../../components/astro/PostCard.astro';
import FeedItem from '../../components/astro/FeedItem.astro';
import SEO from '../../components/astro/SEO.astro';
import type { CollectionEntry } from 'astro:content';
import type { HomepageSectionId, SiteConfig } from '../../lib/types';

interface Props {
  config: SiteConfig;
  personal: boolean;
  siteName: string;
  sections: HomepageSectionId[];
  enabledGridSections: HomepageSectionId[];
  firstGridId: HomepageSectionId | null;
  bottomGridClass: string;
  announcementData: (CollectionEntry<'announcements'> & { imageUrl?: string })[];
  publications: (CollectionEntry<'publications'> & { imageUrl?: string })[];
  posts: CollectionEntry<'posts'>[];
  feeds: CollectionEntry<'feeds'>[];
}

const {
  config,
  personal,
  siteName,
  sections,
  enabledGridSections,
  firstGridId,
  bottomGridClass,
  announcementData,
  publications,
  posts,
  feeds,
} = Astro.props;
---

EOF
git show 9667398:src/pages/index.astro | sed -n '84,244p' >> src/themes/classic/Home.astro
```

Rewrite the route. The data loading is the original lines 11–82, unchanged:

```bash
{
  printf '%s\n' '---' "import ClassicHome from '../themes/classic/Home.astro';"
  git show 9667398:src/pages/index.astro | sed -n '11,82p'
  cat <<'EOF'

<ClassicHome
  {config}
  {personal}
  {siteName}
  {sections}
  {enabledGridSections}
  {firstGridId}
  {bottomGridClass}
  {announcementData}
  {publications}
  {posts}
  {feeds}
/>
EOF
} > src/pages/index.astro
```

- [ ] **Step 6: Move the research page**

```bash
cat > src/themes/classic/Research.astro <<'EOF'
---
import PageLayout from '../../layouts/PageLayout.astro';
import ProjectCard from '../../components/astro/ProjectCard.astro';
import PublicationEntry from '../../components/astro/PublicationEntry.astro';
import type { CollectionEntry } from 'astro:content';

interface Props {
  personal: boolean;
  projects: CollectionEntry<'projects'>[];
  publications: CollectionEntry<'publications'>[];
  researchAreas: { title: string; description: string; tags?: string[] }[];
  researchDescription: string;
}

const { personal, projects, publications, researchAreas, researchDescription } = Astro.props;
---

EOF
git show 9667398:src/pages/research.astro | sed -n '29,127p' >> src/themes/classic/Research.astro
{
  printf '%s\n' '---' "import ClassicResearch from '../themes/classic/Research.astro';"
  git show 9667398:src/pages/research.astro | sed -n '5,27p'
  cat <<'EOF'

<ClassicResearch {personal} {projects} {publications} {researchAreas} {researchDescription} />
EOF
} > src/pages/research.astro
```

- [ ] **Step 7: Move the publications page**

```bash
cat > src/themes/classic/Publications.astro <<'EOF'
---
import PageLayout from '../../layouts/PageLayout.astro';
import PublicationFilter from '../../components/vue/PublicationFilter.vue';
import type { SiteConfig } from '../../lib/types';

interface Props {
  config: SiteConfig;
  personal: boolean;
  pubData: {
    id: string;
    title: string;
    authors: string[];
    venue: string;
    year: number;
    doi?: string;
    url?: string;
    bibtex?: string;
    type: string;
    featured: boolean;
    abstract?: string;
    image?: string;
  }[];
}

const { config, personal, pubData } = Astro.props;
---

EOF
git show 9667398:src/pages/publications.astro | sed -n '38,52p' >> src/themes/classic/Publications.astro
{
  printf '%s\n' '---' "import ClassicPublications from '../themes/classic/Publications.astro';"
  git show 9667398:src/pages/publications.astro | sed -n '4,36p'
  cat <<'EOF'

<ClassicPublications {config} {personal} {pubData} />
EOF
} > src/pages/publications.astro
```

- [ ] **Step 8: Move the CV page**

```bash
cat > src/themes/classic/Cv.astro <<'EOF'
---
import PageLayout from '../../layouts/PageLayout.astro';
import PublicationEntry from '../../components/astro/PublicationEntry.astro';
import type { CollectionEntry } from 'astro:content';
import {
  formatDateRange,
  isEducationEntry,
  isExperienceEntry,
  isNormalEntry,
  isOneLineEntry,
  isPublicationEntry,
  sectionTitle,
} from '../../lib/cv';
import type { CvData, CvGenericEntry, CvMetadata, SiteConfig } from '../../lib/types';

interface Props {
  config: SiteConfig;
  cv: CvData;
  cvMeta: CvMetadata | null;
  hasPdf: boolean;
  pdfHref: string;
  allSections: [string, unknown[]][];
  hasYamlPublications: boolean;
  publications: CollectionEntry<'publications'>[];
}

const { config, cv, cvMeta, hasPdf, pdfHref, allSections, hasYamlPublications, publications } = Astro.props;
---

EOF
git show 9667398:src/pages/cv.astro | sed -n '96,391p' >> src/themes/classic/Cv.astro
```

Write `src/pages/cv.astro`:

```astro
---
import ClassicCv from '../themes/classic/Cv.astro';
import { getCollection } from 'astro:content';
import { getSiteConfig } from '../lib/config';
import { cvSections, hasYamlPublications, loadCv, loadCvMeta } from '../lib/cv';

const config = getSiteConfig();
const cv = loadCv().cv;
const allSections = cvSections(cv);
const publications = (await getCollection('publications')).sort((a, b) => b.data.year - a.data.year);
const cvMeta = loadCvMeta();
const hasPdf = cvMeta?.pdfPath != null;
const pdfHref = cvMeta?.pdfPath ?? '#';
---

<ClassicCv
  {config}
  {cv}
  {cvMeta}
  {hasPdf}
  {pdfHref}
  {allSections}
  hasYamlPublications={hasYamlPublications(allSections)}
  {publications}
/>
```

- [ ] **Step 9: Move the blog index**

```bash
cat > src/themes/classic/Blog.astro <<'EOF'
---
import PageLayout from '../../layouts/PageLayout.astro';
import PostCard from '../../components/astro/PostCard.astro';
import FeedItem from '../../components/astro/FeedItem.astro';
import type { CollectionEntry } from 'astro:content';

interface Props {
  personal: boolean;
  posts: CollectionEntry<'posts'>[];
  feeds: CollectionEntry<'feeds'>[];
  timeline: { type: 'post' | 'feed'; date: Date; data: CollectionEntry<'posts'> | CollectionEntry<'feeds'> }[];
}

const { personal, posts, feeds, timeline } = Astro.props;
---

EOF
git show 9667398:src/pages/blog/index.astro | sed -n '31,97p' >> src/themes/classic/Blog.astro
{
  printf '%s\n' '---' "import ClassicBlog from '../../themes/classic/Blog.astro';"
  git show 9667398:src/pages/blog/index.astro | sed -n '5,29p'
  cat <<'EOF'

<ClassicBlog {personal} {posts} {feeds} {timeline} />
EOF
} > src/pages/blog/index.astro
```

- [ ] **Step 10: Move the blog post page.** Create `src/themes/classic/Post.astro`:

```astro
---
import MarkdownLayout from '../../layouts/MarkdownLayout.astro';
import SEO from '../../components/astro/SEO.astro';
import { render, type CollectionEntry } from 'astro:content';

interface Props {
  post: CollectionEntry<'posts'>;
  ogImage?: string;
}

const { post, ogImage } = Astro.props;
const { Content, headings } = await render(post);
---

```

then append the template: `git show 9667398:'src/pages/blog/[id].astro' | sed -n '27,46p' >> src/themes/classic/Post.astro`.

Write `src/pages/blog/[id].astro`:

```astro
---
import ClassicPost from '../../themes/classic/Post.astro';
import { getCollection } from 'astro:content';
import { getImage } from 'astro:assets';

export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts
    .filter((p) => !p.data.draft)
    .map((post) => ({
      params: { id: post.id },
      props: { post },
    }));
}

const { post } = Astro.props;

let ogImage: string | undefined;
if (post.data.coverImage) {
  const resolved = await getImage({ src: post.data.coverImage, width: 1200 });
  ogImage = resolved.src;
}
---

<ClassicPost {post} {ogImage} />
```

- [ ] **Step 11: Verify nothing changed for classic**

Run: `pnpm test && pnpm check:themes && pnpm -s astro check 2>&1 | tail -4`
Expected: tests PASS; `check-themes: … classic pages match dist-baseline/`; astro check still `14 errors`, all in the pre-existing files (Footer, Nav, ProseEnhancements, contact). No error may point at `src/themes/classic/*` or `src/lib/cv.ts`.

- [ ] **Step 12: Commit**

```bash
git add src/lib/cv.ts src/lib/cv.test.ts src/themes/classic src/pages/index.astro src/pages/research.astro src/pages/publications.astro src/pages/cv.astro src/pages/blog/index.astro 'src/pages/blog/[id].astro'
git commit -m "refactor: move classic page markup to src/themes/classic and CV logic to src/lib/cv.ts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Content model, Markdown renderer, CMS fields, demo content

**Files:**
- Modify: `package.json` (dependency), `src/content.config.ts`, `src/lib/types.ts`
- Create: `src/lib/markdown.ts`, `src/lib/markdown.test.ts`
- Modify: `config/site.yml`, `config/research.yml`, `config/cms.yml`
- Modify: `src/content/publications/*.md` (5), `src/content/posts/research-update-summer-2024.md`, `src/content/announcements/nsf-grant-awarded.md`
- Create: `public/images/hero-figure.svg`, `public/images/research-figure.svg`

**Interfaces:**
- Produces (`src/lib/types.ts`): `interface EditorialConfig { eyebrow?; tagline?; bio?; figure?: { image: string; alt?: string; caption?: string }; affiliations?: string[]; contact?: { heading?: string; text?: string } }`, `SiteConfig.editorial?: EditorialConfig`.
- Produces (collections): `publications.data.{venueShort?, topic?, note?, arxiv?, code?}`, `posts.data.{subtitle?, relatedPublication?}`, `announcements.data.datePrecision: 'day'|'month'|'year'` (default `'month'`).
- Produces (`src/lib/markdown.ts`): `renderMarkdown(md: string | undefined): Promise<string>`.

- [ ] **Step 1: Add the Markdown dependency.** Pin the exact version Astro already resolves.

Run: `pnpm add @astrojs/markdown-remark@6.3.10`
Expected: `package.json` `dependencies` gains `"@astrojs/markdown-remark": "6.3.10"` and the lockfile gains no new packages beyond the top-level link.

- [ ] **Step 2: Write the failing test** `src/lib/markdown.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown';

test('renderMarkdown: renders Markdown paragraphs to HTML', async () => {
  const html = await renderMarkdown('I study **NLP**.\n\nSecond paragraph.');
  assert.match(html, /<p>I study <strong>NLP<\/strong>\.<\/p>/);
  assert.match(html, /<p>Second paragraph\.<\/p>/);
});

test('renderMarkdown: empty input renders nothing', async () => {
  assert.equal(await renderMarkdown(undefined), '');
  assert.equal(await renderMarkdown('  \n'), '');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL, `./markdown` not found.

- [ ] **Step 4: Implement `src/lib/markdown.ts`:**

```ts
import { createMarkdownProcessor, type MarkdownProcessor } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import { rehypeExternalLinks } from './rehype-external-links';
import { rehypeMathJaxPassthrough } from './rehype-mathjax-passthrough';

let processor: Promise<MarkdownProcessor> | undefined;

/** Markdown kept in YAML config (bios, research bodies) → HTML, with the same plugins as content files. */
export async function renderMarkdown(md: string | undefined): Promise<string> {
  if (!md?.trim()) return '';
  processor ??= createMarkdownProcessor({
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeExternalLinks, rehypeMathJaxPassthrough],
  });
  const { code } = await (await processor).render(md);
  return code;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Extend the schemas.** In `src/content.config.ts`:

`announcements` schema, add after `people`:

```ts
      // The CMS writes '' for an untouched select; treat it as unset.
      datePrecision: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['day', 'month', 'year']).default('month')),
```

`posts` schema, add after `draft`:

```ts
      subtitle: emptyToUndefined,
      relatedPublication: emptyToUndefined,
```

`publications` schema, add after `image`:

```ts
      venueShort: emptyToUndefined,
      topic: emptyToUndefined,
      note: emptyToUndefined,
      arxiv: emptyToUndefined,
      code: optionalUrl,
```

In `src/lib/types.ts`, add above `export interface SiteConfig`:

```ts
export interface EditorialFigure {
  image: string;
  alt?: string;
  caption?: string;
}

export interface EditorialConfig {
  eyebrow?: string;
  tagline?: string;
  /** Markdown */
  bio?: string;
  figure?: EditorialFigure;
  affiliations?: string[];
  contact?: { heading?: string; text?: string };
}
```

and add to `SiteConfig` after `theme?: ThemeName;`:

```ts
  editorial?: EditorialConfig;
```

- [ ] **Step 7: Demo figures.** Create `public/images/hero-figure.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 320" width="360" height="320">
  <g fill="none" stroke="#A9B4D0" stroke-width="1.2">
    <path d="M60 70 130 50 200 85 270 60M60 70 90 145M130 50 150 130M200 85 150 130M200 85 235 155M270 60 305 135M90 145 150 130M235 155 305 135M90 145 70 225M235 155 260 235M305 135 260 235M70 225 160 215 260 235M70 225 120 280M160 215 120 280M260 235 210 285M120 280 210 285"/>
  </g>
  <path d="M150 130 235 155 160 215Z" fill="none" stroke="#1F3C88" stroke-width="2"/>
  <circle cx="182" cy="167" r="68" fill="none" stroke="#1F3C88" stroke-dasharray="3 5" opacity=".55"/>
  <g fill="#fff" stroke="#7D8AAE" stroke-width="1.4">
    <circle cx="60" cy="70" r="5"/><circle cx="130" cy="50" r="5"/><circle cx="200" cy="85" r="5"/>
    <circle cx="270" cy="60" r="5"/><circle cx="90" cy="145" r="5"/><circle cx="305" cy="135" r="5"/>
    <circle cx="70" cy="225" r="5"/><circle cx="260" cy="235" r="5"/><circle cx="120" cy="280" r="5"/>
    <circle cx="210" cy="285" r="5"/>
  </g>
  <g fill="#1F3C88"><circle cx="150" cy="130" r="7"/><circle cx="235" cy="155" r="7"/><circle cx="160" cy="215" r="7"/></g>
</svg>
```

Create `public/images/research-figure.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
  <g fill="#FFFFFF" stroke="#A9B4D0" stroke-width="1.2">
    <rect x="40" y="30" width="180" height="34" rx="4"/>
    <rect x="40" y="86" width="180" height="34" rx="4"/>
    <rect x="40" y="142" width="180" height="34" rx="4"/>
  </g>
  <g fill="#FFFFFF" stroke="#1F3C88" stroke-width="2">
    <rect x="262" y="37" width="80" height="20" rx="4"/>
    <rect x="262" y="93" width="80" height="20" rx="4"/>
    <rect x="262" y="149" width="80" height="20" rx="4"/>
  </g>
  <path d="M220 47h42M220 103h42M220 159h42" stroke="#1F3C88" stroke-width="1.2" stroke-dasharray="3 4"/>
  <g font-family="IBM Plex Sans, system-ui, sans-serif" font-size="12" fill="#4A5068">
    <text x="40" y="214">pretrained layers (frozen)</text>
    <text x="262" y="214">adapters (trained)</text>
  </g>
</svg>
```

- [ ] **Step 8: Demo config.** In `config/site.yml`:

Add after `defaultTheme: 'light'` (and its comment line):

```yaml

# Visual theme: "classic" (default) or "editorial" (restrained researcher layout).
# Build-time override: SCHOLAROS_THEME=editorial pnpm build
theme: 'classic'

# Editorial theme content (ignored by the classic theme). Name, email and links come from
# author/socials below. Without `figure` the home hero is a single column.
editorial:
  eyebrow: 'Associate Professor · Computer Science'
  tagline: 'Language technology that works for every language, and that people can trust.'
  bio: 'I lead the Smith Research Lab at the **University of Technology**, where we study natural language processing, multimodal learning and AI safety. Before that I was an assistant professor at **Previous University**.'
  figure:
    image: '/images/hero-figure.svg'
    alt: 'Line drawing of a graph in which three highlighted nodes form a small cluster'
    caption: 'Attention concentrates on a few tokens of a long input, the idea behind adaptive fine-tuning.'
  affiliations:
    - 'University of Technology'
    - 'Previous University'
    - 'University of Example'
  contact:
    heading: 'Interested in collaborating?'
    text: 'I am open to research collaborations, talks and conversations about language technology and AI safety.'
```

In the `fonts:` block, replace the three `families:` lines (`families:`, `sans: 'Roboto'…`, `serif: 'Roboto Slab'…`, `mono: 'Roboto Mono'…`) with this comment. The values equal the classic defaults, so classic output is unchanged, and leaving them unset lets editorial use its own defaults:

```yaml
  # families:                 # optional; theme defaults when unset
  #   sans: 'Roboto'          # classic default; editorial default 'IBM Plex Sans'
  #   serif: 'Roboto Slab'    # classic default; editorial default 'Source Serif 4'
  #   mono: 'Roboto Mono'     # classic default; editorial default 'IBM Plex Mono'
```

Replace `config/research.yml` with the following. `description` stays `''`, because the classic Research page prints it and classic output must not change:

```yaml
# Editorial theme: heading of the home research section and the Research page
headline: 'Language technology that is capable, fair and safe.'
description: ''

areas:
  - id: 'nlp'
    label: 'NLP'
    title: 'Natural Language Processing'
    description: 'Developing models that understand and generate human language, with a focus on multilingual and low-resource settings.'
    body: |
      Most of the world's languages have little labelled data. We study how large language models can be adapted to these settings with **parameter-efficient fine-tuning**, so that a model trained mostly on English transfers to a new language or domain from a few thousand examples.

      Our benchmarks measure what that transfer costs, language by language.
    result: 'Adaptive fine-tuning matches full fine-tuning on six low-resource benchmarks while updating under 2% of the parameters (EMNLP 2024).'
    figure: '/images/research-figure.svg'
    caption: 'Only the small adapters (accent) are trained; the pretrained layers stay frozen.'
    publications:
      - 'smith2024adaptive'
      - 'smith2023fairness'
    tags:
      - 'Language Models'
      - 'Multilingual NLP'
      - 'Text Generation'
  - id: 'multimodal'
    label: 'Multimodal'
    title: 'Computer Vision & Multimodal Learning'
    description: 'Building systems that combine visual and textual understanding for tasks like image captioning, visual QA, and cross-modal retrieval.'
    body: |
      Language rarely arrives alone. We build models that ground words in images and in the actions of embodied agents, and we survey which architectures and training strategies make that grounding reliable.
    publications:
      - 'chen2024multimodal'
      - 'chen2023visual'
    tags:
      - 'Vision-Language Models'
      - 'Image Understanding'
      - 'Multimodal Reasoning'
  - id: 'safety'
    label: 'Safety'
    title: 'AI Safety & Robustness'
    description: 'Ensuring AI systems are safe, fair, and reliable through formal verification, alignment techniques, and robust evaluation methodologies.'
    body: |
      We want models whose behaviour holds up outside the benchmark. That means **fairness** across languages and populations, and agents that respect constraints written in plain language.
    result: 'Natural-language safety constraints cut constraint violations during exploration by a third without slowing learning (ICML 2024).'
    publications:
      - 'garcia2024safe'
      - 'smith2023fairness'
    tags:
      - 'Alignment'
      - 'Fairness'
      - 'Robustness'
```

- [ ] **Step 9: Demo content.** Add these frontmatter lines (before the closing `---`):

`src/content/publications/smith2024adaptive.md`:

```yaml
venueShort: 'EMNLP'
topic: 'nlp'
note: 'Oral'
code: 'https://github.com/example-lab/nlp-toolkit'
```

`src/content/publications/smith2023fairness.md`:

```yaml
venueShort: 'TACL'
topic: 'safety'
```

`src/content/publications/chen2024multimodal.md`:

```yaml
venueShort: 'ACL'
topic: 'multimodal'
```

`src/content/publications/chen2023visual.md` (an unmatched topic, to exercise "Other"):

```yaml
venueShort: 'NeurIPS'
topic: 'robotics'
```

`src/content/publications/garcia2024safe.md`:

```yaml
venueShort: 'ICML'
topic: 'safety'
arxiv: 'arXiv:2024.00003'
code: 'https://github.com/example-lab/safe-rl'
```

`src/content/posts/research-update-summer-2024.md`:

```yaml
subtitle: 'Three papers, a toolkit release and two new lab members.'
relatedPublication: 'smith2024adaptive'
```

`src/content/announcements/nsf-grant-awarded.md`:

```yaml
datePrecision: 'year'
```

- [ ] **Step 10: CMS fields.** In `config/cms.yml`:

In the `site` settings file, insert directly after the `defaultTheme` select (after its `- { label: 'System', value: 'system' }` option line):

```yaml
          - label: 'Visual Theme'
            name: 'theme'
            widget: 'select'
            default: 'classic'
            options:
              - { label: 'Classic', value: 'classic' }
              - { label: 'Editorial', value: 'editorial' }
          - label: 'Editorial Theme Content'
            name: 'editorial'
            widget: 'object'
            required: false
            collapsed: true
            hint: 'Used only by the editorial theme. Name, email and links come from Author and Socials.'
            fields:
              - { label: 'Eyebrow', name: 'eyebrow', widget: 'string', required: false, hint: 'Small label above your name, e.g. "Associate Professor · Computer Science"' }
              - { label: 'Tagline', name: 'tagline', widget: 'string', required: false }
              - { label: 'Bio', name: 'bio', widget: 'markdown', required: false }
              - label: 'Hero Figure'
                name: 'figure'
                widget: 'object'
                required: false
                fields:
                  - { label: 'Image', name: 'image', widget: 'image', required: false, media_folder: '/public/images', public_folder: '/images' }
                  - { label: 'Alt Text', name: 'alt', widget: 'string', required: false }
                  - { label: 'Caption', name: 'caption', widget: 'string', required: false }
              - label: 'Affiliations'
                name: 'affiliations'
                widget: 'list'
                required: false
                field: { label: 'Affiliation', name: 'affiliation', widget: 'string' }
              - label: 'Contact Footer'
                name: 'contact'
                widget: 'object'
                required: false
                fields:
                  - { label: 'Heading', name: 'heading', widget: 'string', required: false }
                  - { label: 'Text', name: 'text', widget: 'text', required: false }
```

In the `announcements` collection, after the `Date` field:

```yaml
      - label: 'Date Precision'
        name: 'datePrecision'
        widget: 'select'
        default: 'month'
        required: false
        hint: 'How the date is shown in the editorial news list'
        options:
          - { label: 'Day (Oct 3, 2025)', value: 'day' }
          - { label: 'Month (Oct 2025)', value: 'month' }
          - { label: 'Year (2025)', value: 'year' }
```

In the `posts` collection, after the `Title` field:

```yaml
      - { label: 'Subtitle', name: 'subtitle', widget: 'string', required: false }
      - { label: 'Related Publication', name: 'relatedPublication', widget: 'relation', collection: 'publications', value_field: '{{slug}}', search_fields: ['title'], display_fields: ['title'], required: false }
```

In the `publications` collection, after the `PDF` field:

```yaml
      - { label: 'Short Venue', name: 'venueShort', widget: 'string', required: false, hint: 'e.g. NeurIPS (editorial venue tile)' }
      - { label: 'Topic', name: 'topic', widget: 'string', required: false, hint: 'Research area id from Research Areas, e.g. nlp. Unmatched topics are filed under Other.' }
      - { label: 'Note', name: 'note', widget: 'string', required: false, hint: 'e.g. Oral, Spotlight' }
      - { label: 'arXiv ID', name: 'arxiv', widget: 'string', required: false, hint: 'e.g. 2410.12459' }
      - { label: 'Code URL', name: 'code', widget: 'string', required: false }
```

In the `research` settings file, add as the first field:

```yaml
          - { label: 'Headline', name: 'headline', widget: 'string', required: false, hint: 'Editorial theme: heading of the home research section and the Research page' }
```

and replace the research-area `fields:` list with:

```yaml
            fields:
              - { label: 'ID', name: 'id', widget: 'string', required: false, hint: 'Page anchor and publication topic key, e.g. nlp. Defaults to the title, slugified.' }
              - { label: 'Short Label', name: 'label', widget: 'string', required: false, hint: 'Editorial theme: publication filter label' }
              - { label: 'Title', name: 'title', widget: 'string' }
              - { label: 'Description', name: 'description', widget: 'text' }
              - { label: 'Body', name: 'body', widget: 'markdown', required: false, hint: 'Editorial theme: long form on the Research page' }
              - { label: 'Result', name: 'result', widget: 'text', required: false }
              - { label: 'Figure', name: 'figure', widget: 'image', required: false, media_folder: '/public/images', public_folder: '/images' }
              - { label: 'Figure Caption', name: 'caption', widget: 'string', required: false }
              - { label: 'Related Publications', name: 'publications', widget: 'relation', collection: 'publications', value_field: '{{slug}}', search_fields: ['title'], display_fields: ['title'], multiple: true, required: false }
              - label: 'Tags'
                name: 'tags'
                widget: 'list'
                required: false
                field: { label: 'Tag', name: 'tag', widget: 'string' }
```

- [ ] **Step 11: Verify**

Run: `pnpm test && pnpm check:themes`
Expected: PASS; classic still matches `dist-baseline/`. The new fields are not rendered by classic, `fonts.families` equalled the defaults, and `description` is unchanged.

Run: `node -e "require('js-yaml').load(require('fs').readFileSync('config/cms.yml','utf8')); console.log('cms.yml ok')"`
Expected: `cms.yml ok`.

- [ ] **Step 12: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/markdown.ts src/lib/markdown.test.ts src/content.config.ts src/lib/types.ts config/site.yml config/research.yml config/cms.yml src/content/publications src/content/posts/research-update-summer-2024.md src/content/announcements/nsf-grant-awarded.md public/images
git commit -m "feat: editorial content model, Markdown renderer, CMS fields and demo content" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Editorial stylesheet and shell (all pages get the editorial frame)

**Files:**
- Create: `src/themes/editorial/editorial.css`, `src/themes/editorial/Layout.astro`, `src/themes/classic/PageShell.astro`
- Modify: `src/layouts/PageLayout.astro`, `src/layouts/BaseLayout.astro`, `src/components/astro/FontStyles.astro`
- Modify: `scripts/check-themes.mjs`

**Interfaces:**
- Consumes: `getTheme()`, `getSiteConfig()`, `getSiteName()`, `socialLinks()`, `editorialAccentCss()`, `SiteConfig.editorial`.
- Produces: `src/themes/editorial/Layout.astro` with `Props { title: string; description?: string; ogImage?: string; keywords?: string; contactFooter?: boolean }`. It renders the header (brand + `config.nav`, `aria-current` on the active item), `<main id="main-content">` with the slot, and a light or dark contact footer. Also produces CSS classes used by Tasks 8–11: `ed-wrap`, `ed-main`, `ed-main--narrow`, `ed-main--flush`, `ed-eyebrow`, `ed-label`, `ed-h1`, `ed-h2`, `ed-stack`, `ed-section-head`, `ed-more`, `ed-intro`, `ed-btn`, `ed-btn-outline`, `ul`, `row`, `arr`, `num`, `ed-sr-only` and every page-specific `ed-*` class listed in the stylesheet.

- [ ] **Step 1: Write the failing check.** In `scripts/check-themes.mjs`, insert above `// --- classic regression ---`:

```js
{
  const html = ed('contact/index.html');
  assert.match(html, /<header class="ed-header">/, 'editorial /contact: editorial header on an undesigned page');
  assert.match(html, /<a href="\/contact" aria-current="page">Contact<\/a>/, 'editorial /contact: active nav item');
  assert.match(html, /<footer class="ed-footer">/, 'editorial /contact: light footer');
  assert.doesNotMatch(html, /ThemeToggle/, 'editorial: no theme toggle');
  assert.doesNotMatch(read('classic', 'contact/index.html'), /class="ed-header"/, 'classic /contact: classic header');
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm check:themes`
Expected: FAIL, `editorial /contact: editorial header on an undesigned page`.

- [ ] **Step 3: Create `src/themes/editorial/editorial.css`:**

```css
/*
 * Editorial theme. Every rule is scoped to html[data-theme='editorial']: route files import both
 * themes, so Astro bundles this stylesheet into classic pages too, where it must stay inert.
 * Component classes are unlayered (they only appear in editorial markup); nothing here targets
 * bare elements that classic Tailwind utilities style on undesigned pages.
 */
:root[data-theme='editorial'] {
  --ed-ink: #15192b;
  --ed-body-2: #3d4357;
  --ed-muted: #4a5068;
  --ed-caption: #6a7085;
  --ed-rule: #e4e7ee;
  --ed-rule-soft: #eef0f4;
  --ed-tint: #f3f5fa;
  --ed-hover: #f6f8fc;
  --ed-accent: #1f3c88;
  --ed-accent-hover: #142a63;
  --ed-accent-border: #c7d0e6;
  --ed-selection: #dce3f5;
  --ed-footer: #15192b;
  --ed-footer-text: #c9cedc;
  --ed-footer-muted: #9aa0b4;
  --ed-footer-rule: #2c3248;
  --ed-pad: 32px;

  /* Classic Tailwind tokens → editorial palette, so undesigned pages match without redesigns. */
  --color-primary-50: var(--ed-hover);
  --color-primary-100: var(--ed-selection);
  --color-primary-200: color-mix(in oklch, var(--ed-accent), white 75%);
  --color-primary-300: color-mix(in oklch, var(--ed-accent), white 55%);
  --color-primary-400: color-mix(in oklch, var(--ed-accent), white 35%);
  --color-primary-500: color-mix(in oklch, var(--ed-accent), white 15%);
  --color-primary-600: var(--ed-accent);
  --color-primary-700: var(--ed-accent-hover);
  --color-primary-800: var(--ed-accent-hover);
  --color-primary-900: var(--ed-ink);
  --color-surface-50: var(--ed-hover);
  --color-surface-100: var(--ed-tint);
  --color-surface-200: var(--ed-rule);
  --color-surface-400: var(--ed-caption);
  --color-surface-500: var(--ed-caption);
  --color-surface-600: var(--ed-muted);
  --color-surface-700: var(--ed-body-2);
  --color-surface-800: var(--ed-ink);
  --color-surface-900: var(--ed-ink);

  & body {
    background: #fff;
    color: var(--ed-ink);
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.6;
  }
  & .prose {
    font-size: 17px;
  }
  & ::selection {
    background: var(--ed-selection);
  }
  & [hidden] {
    display: none !important;
  }
  & :focus-visible {
    outline: 2px solid var(--ed-accent);
    outline-offset: 2px;
  }
  & .ed-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  /* ── Design utilities ── */
  & .ul {
    background-image: linear-gradient(currentColor, currentColor);
    background-size: 0% 1px;
    background-repeat: no-repeat;
    background-position: 0 100%;
    transition: background-size 0.25s ease;
  }
  & .ul:hover,
  & .ul:focus-visible {
    background-size: 100% 1px;
  }
  & .row {
    transition: background-color 0.2s ease;
  }
  & .row:hover {
    background: var(--ed-hover);
  }
  & .arr {
    display: inline-block;
    transition: transform 0.2s ease;
  }
  & .row:hover .arr,
  & .ul:hover .arr {
    transform: translateX(4px);
  }
  & .num {
    font-variant-numeric: tabular-nums;
  }
  & .ed-eyebrow {
    margin: 0;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.6;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    color: var(--ed-accent);
  }
  & .ed-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--ed-caption);
  }

  /* ── Shell ── */
  & .ed-wrap {
    max-width: 1080px;
    margin-inline: auto;
    padding-inline: var(--ed-pad);
  }
  & .ed-grow {
    flex: 1 0 auto;
  }
  & .ed-header {
    border-bottom: 1px solid var(--ed-rule);
  }
  & .ed-nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px 24px;
    padding-block: 18px;
  }
  & .ed-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--ed-ink);
  }
  & .ed-brand-mark {
    width: 10px;
    height: 10px;
    background: var(--ed-accent);
    transform: rotate(45deg);
  }
  & .ed-brand-name {
    font-family: var(--font-serif);
    font-size: 19px;
    font-weight: 600;
  }
  & .ed-navlinks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 28px;
    font-size: 15px;
  }
  & .ed-navlinks a {
    padding: 8px 0;
    color: var(--ed-body-2);
    transition: color 0.15s ease;
  }
  & .ed-navlinks a:hover {
    color: var(--ed-ink);
  }
  & .ed-navlinks a[aria-current='page'] {
    padding-bottom: 6px;
    border-bottom: 2px solid var(--ed-accent);
    color: var(--ed-ink);
    font-weight: 500;
  }
  & .ed-page {
    padding-block: 64px 80px;
  }
  & .ed-main {
    display: flex;
    flex-direction: column;
    gap: 32px;
    padding-block: 80px 104px;
  }
  & .ed-main--narrow {
    max-width: 960px;
  }
  & .ed-main--flush {
    gap: 0;
  }
  & .ed-footer {
    border-top: 1px solid var(--ed-rule);
  }
  & .ed-footer-inner {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px;
    padding-block: 24px;
    font-size: 14px;
    color: var(--ed-caption);
  }

  /* ── Type and buttons ── */
  & .ed-h1 {
    margin: 0;
    font-family: var(--font-serif);
    font-size: clamp(36px, 7vw, 52px);
    line-height: 1.1;
    font-weight: 500;
    letter-spacing: -0.8px;
    color: var(--ed-ink);
  }
  & .ed-h2 {
    margin: 0;
    font-family: var(--font-serif);
    font-size: clamp(28px, 5vw, 36px);
    line-height: 1.2;
    font-weight: 500;
    color: var(--ed-ink);
  }
  & .ed-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  & .ed-section-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
  }
  & .ed-more {
    font-size: 15px;
    font-weight: 500;
  }
  & .ed-intro {
    margin: 0;
    max-width: 680px;
    font-size: 16px;
    line-height: 1.65;
    color: var(--ed-muted);
  }
  & .ed-btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 20px;
    border-radius: 4px;
    background: var(--ed-accent);
    color: #fff;
    font-size: 15px;
    font-weight: 500;
  }
  & .ed-btn:hover {
    background: var(--ed-accent-hover);
    color: #fff;
  }
  & .ed-btn-outline {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid var(--ed-ink);
    border-radius: 4px;
    color: var(--ed-ink);
    font-size: 15px;
    font-weight: 500;
  }
  & .ed-btn-outline:hover {
    background: var(--ed-hover);
    color: var(--ed-ink);
  }

  /* ── Home ── */
  & .ed-hero {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 64px;
    padding-block: 96px 88px;
  }
  & .ed-hero-text {
    flex: 1 1 520px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  & .ed-hero-name {
    margin: 0;
    font-family: var(--font-serif);
    font-size: clamp(40px, 9vw, 62px);
    line-height: 1.04;
    font-weight: 500;
    letter-spacing: -1.2px;
    color: var(--ed-ink);
  }
  & .ed-tagline {
    margin: 0;
    max-width: 560px;
    font-family: var(--font-serif);
    font-size: clamp(20px, 3.5vw, 24px);
    line-height: 1.45;
    font-style: italic;
    color: var(--ed-body-2);
  }
  & .ed-bio {
    max-width: 580px;
    font-size: 17px;
    line-height: 1.72;
    color: var(--ed-body-2);
  }
  & .ed-bio > * {
    margin: 0 0 12px;
  }
  & .ed-bio > :last-child {
    margin-bottom: 0;
  }
  & .ed-bio strong {
    color: var(--ed-ink);
    font-weight: 500;
  }
  & .ed-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 26px;
    padding-top: 6px;
  }
  & .ed-links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 22px;
    font-size: 14px;
  }
  & .ed-links a {
    color: var(--ed-body-2);
  }
  & .ed-links a:hover {
    color: var(--ed-ink);
  }
  & .ed-figure {
    flex: 1 1 360px;
    max-width: 440px;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  & .ed-figure-box {
    padding: 24px;
    background: var(--ed-tint);
    border: 1px solid var(--ed-rule);
    border-radius: 6px;
  }
  & .ed-figure-box img {
    display: block;
    width: 100%;
    height: auto;
  }
  & .ed-figcaption {
    font-size: 13px;
    line-height: 1.55;
    color: var(--ed-caption);
  }
  & .ed-figcaption b {
    color: var(--ed-body-2);
    font-weight: 600;
  }
  & .ed-band {
    background: var(--ed-tint);
    border-block: 1px solid var(--ed-rule);
  }
  & .ed-band-inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 14px 40px;
    padding-block: 24px;
  }
  & .ed-band-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    color: var(--ed-caption);
  }
  & .ed-band-item {
    font-size: 17px;
    font-weight: 600;
    color: var(--ed-muted);
  }
  & .ed-home-section {
    display: flex;
    flex-direction: column;
    gap: 40px;
    padding-block: 96px 48px;
  }
  & .ed-home-section--papers {
    gap: 28px;
    padding-block: 56px;
  }
  & .ed-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
    gap: 24px;
  }
  & .ed-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px 18px 22px;
    border-top: 2px solid var(--ed-ink);
    border-radius: 0 0 6px 6px;
    color: var(--ed-ink);
  }
  & .ed-card:hover {
    color: var(--ed-ink);
  }
  & .ed-card-num {
    font-family: var(--font-serif);
    font-size: 26px;
    font-weight: 500;
    color: var(--ed-accent);
  }
  & .ed-card h3 {
    margin: 0;
    font-family: var(--font-sans);
    font-size: 19px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--ed-ink);
  }
  & .ed-card p {
    margin: 0;
    font-size: 15px;
    line-height: 1.65;
    color: var(--ed-muted);
  }
  & .ed-card-papers {
    font-family: var(--font-serif);
    font-size: 14px;
    font-style: italic;
    color: var(--ed-caption);
  }
  & .ed-card-papers .arr {
    font-style: normal;
    color: var(--ed-accent);
  }
  & .ed-split {
    display: flex;
    flex-wrap: wrap;
    gap: 56px;
    padding-block: 40px 104px;
  }
  & .ed-split > div {
    flex: 1 1 420px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  & .ed-split-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  /* ── Paper rows ── */
  & .ed-papers {
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--ed-rule);
  }
  & .ed-paper {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 16px 32px;
    margin: 0 -16px;
    padding: 26px 16px;
    border-bottom: 1px solid var(--ed-rule);
    border-radius: 6px;
    scroll-margin-top: 24px;
  }
  & .ed-paper--list {
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 6px;
    padding-block: 20px;
    border-bottom-color: var(--ed-rule-soft);
  }
  & .ed-venue-tile {
    flex: 0 0 140px;
    height: 92px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 12px 14px;
    background: var(--ed-tint);
    border: 1px solid var(--ed-rule);
    border-radius: 4px;
  }
  & .ed-venue-tile-short {
    font-family: var(--font-serif);
    font-size: 20px;
    font-weight: 600;
    line-height: 1.1;
    color: var(--ed-accent);
  }
  & .ed-venue-tile-year {
    font-size: 12px;
    color: var(--ed-caption);
  }
  & .ed-paper-body {
    flex: 1 1 520px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  & .ed-paper-title {
    font-family: var(--font-serif);
    font-size: 20px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--ed-ink);
  }
  & a.ed-paper-title:hover {
    color: var(--ed-accent);
  }
  & .ed-paper--list .ed-paper-title {
    font-size: 19px;
  }
  & .ed-authors {
    font-size: 15px;
    color: var(--ed-muted);
  }
  & .ed-paper--list .ed-authors {
    font-size: 14.5px;
  }
  & .ed-authors strong {
    font-weight: 600;
    color: var(--ed-ink);
  }
  & .ed-paper-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
    padding-top: 4px;
    font-size: 14px;
  }
  & .ed-venue {
    font-weight: 600;
    color: var(--ed-ink);
    font-variant: small-caps;
    letter-spacing: 0.3px;
  }
  & .ed-paper--list .ed-venue {
    font-family: var(--font-serif);
    font-size: 15px;
    font-weight: 400;
    font-style: italic;
    font-variant: normal;
    letter-spacing: 0;
  }
  & .ed-note {
    padding: 2px 6px;
    border: 1px solid var(--ed-accent-border);
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--ed-accent);
  }
  & .ed-bib {
    min-width: 0;
    max-width: 100%;
  }
  & .ed-bib[open] {
    flex-basis: 100%;
  }
  & .ed-bib summary {
    display: inline;
    list-style: none;
    cursor: pointer;
    color: var(--ed-accent);
  }
  & .ed-bib summary::-webkit-details-marker {
    display: none;
  }
  & .ed-bib pre {
    margin: 8px 0 0;
    padding: 14px 16px;
    overflow-x: auto;
    background: var(--ed-hover);
    border: 1px solid var(--ed-rule);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 12.5px;
    line-height: 1.6;
    color: #2a2f45;
    white-space: pre;
  }

  /* ── News and writing rows ── */
  & .ed-news,
  & .ed-posts {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  & .ed-news li {
    display: flex;
    gap: 20px;
    padding-block: 14px;
    border-top: 1px solid var(--ed-rule);
  }
  & .ed-news-date {
    flex: 0 0 76px;
    padding-top: 1px;
    font-size: 14px;
    color: var(--ed-caption);
  }
  & .ed-news-text {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 15px;
    line-height: 1.55;
  }
  & .ed-posts li {
    border-top: 1px solid var(--ed-rule);
  }
  & .ed-post-link {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin: 0 -12px;
    padding: 14px 12px;
    border-radius: 6px;
    color: var(--ed-ink);
  }
  & .ed-post-link:hover {
    color: var(--ed-ink);
  }
  & .ed-post-link > span:first-child {
    min-width: 0;
  }
  & .ed-post-title {
    display: block;
    font-family: var(--font-serif);
    font-size: 19px;
    font-weight: 500;
    line-height: 1.35;
  }
  & .ed-post-meta {
    display: block;
    margin-top: 4px;
    font-size: 13px;
    color: var(--ed-caption);
  }
  & .ed-post-link .arr {
    padding-top: 2px;
    color: var(--ed-accent);
  }

  /* ── Dark contact footer ── */
  & .ed-contact {
    background: var(--ed-footer);
    color: var(--ed-footer-text);
  }
  & .ed-contact-inner {
    display: flex;
    flex-direction: column;
    gap: 48px;
    padding-block: 72px 32px;
  }
  & .ed-contact-top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: 28px;
  }
  & .ed-contact-copy {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 600px;
  }
  & .ed-contact h2 {
    margin: 0;
    font-family: var(--font-serif);
    font-size: clamp(28px, 5vw, 36px);
    line-height: 1.2;
    font-weight: 500;
    color: #fff;
  }
  & .ed-contact p {
    margin: 0;
    font-size: 16px;
    line-height: 1.6;
  }
  & .ed-btn-light {
    padding: 14px 22px;
    border-radius: 4px;
    background: #fff;
    color: var(--ed-ink);
    font-size: 15px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  & .ed-btn-light:hover {
    background: var(--ed-selection);
    color: var(--ed-ink);
  }
  & .ed-contact-bottom {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px;
    padding-top: 24px;
    border-top: 1px solid var(--ed-footer-rule);
    font-size: 14px;
    color: var(--ed-footer-muted);
  }
  & .ed-contact-links {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
  }
  & .ed-contact-links a {
    color: var(--ed-footer-text);
  }
  & .ed-contact-links a:hover {
    color: #fff;
  }
  & .ed-contact :focus-visible {
    outline-color: #fff;
  }

  /* ── Research ── */
  & .ed-research-intro {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 760px;
    padding-bottom: 40px;
  }
  & .ed-lede {
    margin: 0;
    font-family: var(--font-serif);
    font-size: clamp(18px, 3vw, 21px);
    line-height: 1.6;
    color: var(--ed-body-2);
  }
  & .ed-toc {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 32px;
    padding-block: 16px;
    border-block: 1px solid var(--ed-rule);
    font-size: 14px;
  }
  & .ed-toc-label {
    color: var(--ed-caption);
  }
  & .ed-area {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 40px 64px;
    padding-block: 72px;
    border-bottom: 1px solid var(--ed-rule);
    scroll-margin-top: 24px;
  }
  & .ed-area-text {
    flex: 1 1 460px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  & .ed-area-num {
    font-family: var(--font-serif);
    font-size: 28px;
    color: var(--ed-accent);
  }
  & .ed-area h2 {
    margin: 0;
    font-family: var(--font-serif);
    font-size: clamp(26px, 4.5vw, 32px);
    line-height: 1.2;
    font-weight: 500;
    color: var(--ed-ink);
  }
  & .ed-md {
    display: flex;
    flex-direction: column;
    gap: 18px;
    font-size: 16px;
    line-height: 1.75;
    color: var(--ed-body-2);
  }
  & .ed-md > * {
    margin: 0;
  }
  & .ed-md strong {
    font-weight: 600;
    color: var(--ed-ink);
  }
  & .ed-result {
    padding: 14px 18px;
    border-left: 2px solid var(--ed-accent);
    background: var(--ed-hover);
    font-size: 14px;
    line-height: 1.6;
    color: var(--ed-body-2);
  }
  & .ed-result b {
    font-weight: 600;
    color: var(--ed-ink);
  }
  & .ed-related {
    display: flex;
    flex-direction: column;
    padding-top: 8px;
  }
  & .ed-related .ed-label {
    padding-bottom: 6px;
  }
  & .ed-related a {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 0 -8px;
    padding: 10px 8px;
    border-top: 1px solid var(--ed-rule);
    border-radius: 4px;
    color: var(--ed-ink);
    font-size: 15px;
  }
  & .ed-related-venue {
    color: var(--ed-caption);
  }
  & .ed-related .arr {
    color: var(--ed-accent);
  }
  & .ed-area-fig {
    flex: 1 1 380px;
    max-width: 460px;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  & .ed-area-fig .ed-figure-box {
    padding: 28px 20px;
  }
  & .ed-software {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-top: 72px;
    scroll-margin-top: 24px;
  }
  & .ed-software-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
    gap: 24px;
  }
  & .ed-software-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 22px;
    border: 1px solid var(--ed-rule);
    border-radius: 6px;
    color: var(--ed-ink);
  }
  & .ed-software-card:hover {
    color: var(--ed-ink);
  }
  & .ed-software-name {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-family: var(--font-mono);
    font-size: 16px;
    font-weight: 500;
  }
  & .ed-software-name .arr {
    color: var(--ed-accent);
  }
  & .ed-software-desc {
    font-size: 15px;
    line-height: 1.6;
    color: var(--ed-muted);
  }
  & .ed-software-tech {
    font-size: 13px;
    color: var(--ed-caption);
  }

  /* ── Publications ── */
  & .ed-pubs-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: 20px;
  }
  & .ed-pubs-head .ed-stack {
    gap: 14px;
    max-width: 680px;
  }
  & .ed-stats {
    display: flex;
    gap: 28px;
  }
  & .ed-stat {
    display: flex;
    flex-direction: column;
  }
  & .ed-stat-num {
    font-family: var(--font-serif);
    font-size: 36px;
    line-height: 1.1;
  }
  & .ed-stat-label {
    font-size: 13px;
    color: var(--ed-caption);
  }
  & .ed-filterbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px 24px;
    border-bottom: 1px solid var(--ed-rule);
  }
  & .ed-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0 28px;
  }
  & .ed-tab {
    min-height: 44px;
    margin-bottom: -1px;
    padding: 10px 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    font: inherit;
    font-size: 15px;
    color: var(--ed-body-2);
    cursor: pointer;
  }
  & .ed-tab[aria-pressed='true'] {
    border-bottom-color: var(--ed-ink);
    color: var(--ed-ink);
    font-weight: 500;
  }
  & .ed-tab-count {
    font-size: 12px;
    color: var(--ed-caption);
  }
  & .ed-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    font-size: 14px;
    color: var(--ed-body-2);
    cursor: pointer;
  }
  & .ed-toggle input {
    width: 16px;
    height: 16px;
    accent-color: var(--ed-accent);
  }
  & .ed-year {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 40px;
    padding-top: 8px;
  }
  & .ed-year h2 {
    flex: 0 0 100px;
    margin: 0;
    padding-top: 20px;
    font-family: var(--font-serif);
    font-size: 28px;
    font-weight: 500;
    color: var(--ed-accent);
  }
  & .ed-year .ed-papers {
    flex: 1 1 600px;
    min-width: 0;
    border-top: 0;
  }

  /* ── Writing list ── */
  & .ed-entries {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  & .ed-entry {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 32px;
    padding-block: 24px;
    border-bottom: 1px solid var(--ed-rule-soft);
  }
  & .ed-entry-tile {
    flex: 0 0 150px;
    height: 96px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 12px 14px;
    background: var(--ed-tint);
    border: 1px solid var(--ed-rule);
    border-radius: 4px;
  }
  & .ed-entry-tag {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--ed-accent);
  }
  & .ed-entry-date {
    font-size: 13px;
    color: var(--ed-caption);
  }
  & .ed-entry-body {
    flex: 1 1 480px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  & .ed-entry-title {
    font-family: var(--font-serif);
    font-size: 21px;
    font-weight: 500;
    line-height: 1.35;
    color: var(--ed-ink);
  }
  & .ed-entry-title:hover {
    color: var(--ed-accent);
  }
  & .ed-entry-excerpt {
    margin: 0;
    font-size: 15px;
    line-height: 1.6;
    color: var(--ed-muted);
  }
  & .ed-entry-meta {
    font-size: 13px;
    color: var(--ed-caption);
  }
  & .ed-feedlink {
    font-size: 14px;
  }

  /* ── Post ── */
  & .ed-article {
    max-width: calc(680px + 2 * var(--ed-pad));
    margin-inline: auto;
    padding: 64px var(--ed-pad) 80px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  & .ed-back {
    align-self: flex-start;
    padding-block: 6px;
    font-size: 15px;
  }
  & .ed-article-head {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--ed-rule);
  }
  & .ed-article-title {
    margin: 0;
    font-family: var(--font-serif);
    font-size: clamp(30px, 6vw, 40px);
    line-height: 1.2;
    font-weight: 500;
    color: var(--ed-ink);
  }
  & .ed-subtitle {
    margin: 0;
    font-size: 18px;
    line-height: 1.55;
    color: var(--ed-muted);
  }
  & .ed-byline {
    font-size: 14px;
    color: var(--ed-caption);
  }
  & .ed-aside {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 20px 24px;
    background: var(--ed-tint);
    border-left: 3px solid var(--ed-accent);
  }
  & .ed-aside-label {
    font-size: 13px;
    color: var(--ed-caption);
  }
  & .ed-aside a {
    font-size: 16px;
    font-weight: 500;
  }
  & .ed-aside-venue {
    font-size: 14px;
    font-style: italic;
    color: var(--ed-muted);
  }
  & .ed-pager {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 16px;
    padding-top: 8px;
    font-size: 15px;
  }
  & .ed-prose {
    font-family: var(--font-serif);
    font-size: 19px;
    line-height: 1.75;
    color: var(--ed-ink);
    overflow-wrap: break-word;
  }
  & .ed-prose > * {
    margin: 0 0 22px;
  }
  & .ed-prose > :last-child {
    margin-bottom: 0;
  }
  & .ed-prose h2 {
    margin-top: 34px;
    font-family: var(--font-serif);
    font-size: 26px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--ed-ink);
  }
  & .ed-prose h3 {
    margin-top: 28px;
    font-family: var(--font-serif);
    font-size: 21px;
    font-weight: 500;
    line-height: 1.35;
    color: var(--ed-ink);
  }
  & .ed-prose a {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  & .ed-prose ul,
  & .ed-prose ol {
    padding-left: 1.4em;
  }
  & .ed-prose ul {
    list-style: disc;
  }
  & .ed-prose ol {
    list-style: decimal;
  }
  & .ed-prose li + li {
    margin-top: 6px;
  }
  & .ed-prose blockquote {
    padding-left: 18px;
    border-left: 3px solid var(--ed-rule);
    font-style: italic;
    color: var(--ed-body-2);
  }
  & .ed-prose code {
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--ed-tint);
    font-family: var(--font-mono);
    font-size: 0.82em;
  }
  & .ed-prose pre {
    padding: 16px;
    overflow-x: auto;
    border: 1px solid var(--ed-rule);
    border-radius: 4px;
    font-size: 14px;
    line-height: 1.6;
  }
  & .ed-prose pre code {
    padding: 0;
    background: none;
    font-size: inherit;
  }
  & .ed-prose table {
    display: block;
    width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
    font-family: var(--font-sans);
    font-size: 15px;
  }
  & .ed-prose th {
    padding: 10px 12px;
    border-bottom: 1px solid var(--ed-ink);
    text-align: left;
    font-weight: 500;
  }
  & .ed-prose td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--ed-rule);
  }
  & .ed-prose img {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
  }
  & .ed-prose figcaption {
    margin-top: 10px;
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--ed-caption);
  }
  & .ed-prose hr {
    border: 0;
    border-top: 1px solid var(--ed-rule);
  }
  & .ed-prose mjx-container[display='true'],
  & .ed-prose .katex-display {
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
  }

  /* ── CV ── */
  & .ed-cv-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    padding-bottom: 32px;
  }
  & .ed-cv-head .ed-stack {
    gap: 6px;
  }
  & .ed-cv-title {
    margin: 0;
    font-family: var(--font-serif);
    font-size: clamp(34px, 6vw, 48px);
    line-height: 1.1;
    font-weight: 500;
    color: var(--ed-ink);
  }
  & .ed-cv-updated {
    font-size: 15px;
    color: var(--ed-caption);
  }
  & .ed-cv-section {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 40px;
    padding-block: 32px;
    border-top: 1px solid var(--ed-rule);
  }
  & .ed-cv-section h2 {
    flex: 0 0 180px;
    margin: 0;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.8;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    color: var(--ed-accent);
  }
  & .ed-cv-entries {
    flex: 1 1 520px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  & .ed-cv-entry {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  & .ed-cv-entry-top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 0 16px;
  }
  & .ed-cv-entry-title {
    font-size: 16px;
    font-weight: 500;
    line-height: 1.45;
  }
  & .ed-cv-when {
    font-size: 14px;
    color: var(--ed-caption);
    white-space: nowrap;
  }
  & .ed-cv-org {
    font-size: 15px;
    color: var(--ed-muted);
  }
  & .ed-cv-points {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 6px 0 0;
    padding-left: 18px;
    list-style: disc;
  }
  & .ed-cv-points li {
    font-size: 15px;
    line-height: 1.6;
    color: var(--ed-body-2);
  }

  /* ── Phones ── */
  @media (max-width: 640px) {
    --ed-pad: 16px;

    & .ed-hero {
      gap: 40px;
      padding-block: 56px 48px;
    }
    & .ed-home-section {
      padding-block: 56px 32px;
    }
    & .ed-main {
      padding-block: 48px 64px;
    }
    & .ed-area {
      padding-block: 48px;
    }
    & .ed-split {
      padding-block: 24px 64px;
    }
    & .ed-contact-inner {
      padding-block: 56px 28px;
    }
    & .ed-article {
      padding-block: 40px 56px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    scroll-behavior: auto;

    & *,
    & *::before,
    & *::after {
      transition: none !important;
    }
  }
}
```

- [ ] **Step 4: Create `src/themes/editorial/Layout.astro`:**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { getSiteConfig, getSiteName } from '../../lib/config';
import { socialLinks } from '../../lib/editorial';
import './editorial.css';

interface Props {
  title: string;
  description?: string;
  ogImage?: string;
  keywords?: string;
  /** Dark "get in touch" footer (home page) instead of the light one. */
  contactFooter?: boolean;
}

const { title, description, ogImage, keywords, contactFooter = false } = Astro.props;
const config = getSiteConfig();
const name = getSiteName();
const email = config.socials?.email;
const links = socialLinks(config.socials);
const contact = config.editorial?.contact;
const year = new Date().getFullYear();
const path = Astro.url.pathname;
const isActive = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
---

<BaseLayout title={title} description={description} ogImage={ogImage} keywords={keywords}>
  <header class="ed-header">
    <nav class="ed-wrap ed-nav" aria-label="Primary">
      <a href="/" class="ed-brand">
        <span class="ed-brand-mark" aria-hidden="true"></span>
        <span class="ed-brand-name">{name}</span>
      </a>
      <div class="ed-navlinks">
        {
          config.nav.map((item) => (
            <a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
              {item.label}
            </a>
          ))
        }
      </div>
    </nav>
  </header>

  <main id="main-content" class="ed-grow">
    <slot />
  </main>

  {
    contactFooter ? (
      <footer class="ed-contact">
        <div class="ed-wrap ed-contact-inner">
          <div class="ed-contact-top">
            <div class="ed-contact-copy">
              <h2>{contact?.heading || 'Get in touch'}</h2>
              {contact?.text && <p>{contact.text}</p>}
            </div>
            {email && (
              <a class="ed-btn-light" href={`mailto:${email}`}>
                {email}
              </a>
            )}
          </div>
          <div class="ed-contact-bottom">
            <span>
              © {year} {name}
            </span>
            {links.length > 0 && (
              <span class="ed-contact-links">
                {links.map((l) => (
                  <a class="ul" href={l.href}>
                    {l.label}
                  </a>
                ))}
              </span>
            )}
          </div>
        </div>
      </footer>
    ) : (
      <footer class="ed-footer">
        <div class="ed-wrap ed-footer-inner">
          <span>
            © {year} {name}
          </span>
          {email && (
            <a class="ul" href={`mailto:${email}`}>
              {email}
            </a>
          )}
        </div>
      </footer>
    )
  }
</BaseLayout>
```

- [ ] **Step 5: Make `PageLayout` theme-aware.** Move its current body into `src/themes/classic/PageShell.astro`, unchanged apart from import paths:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import TopBar from '../../components/astro/TopBar.astro';
import Header from '../../components/astro/Header.astro';
import Footer from '../../components/astro/Footer.astro';

interface Props {
  title: string;
  description?: string;
  ogImage?: string;
  keywords?: string;
  fullWidth?: boolean;
}

const { title, description, ogImage, keywords, fullWidth = false } = Astro.props;
---

<BaseLayout title={title} description={description} ogImage={ogImage} keywords={keywords}>
  <div class="sticky top-0 z-40">
    <TopBar />
    <Header />
  </div>
  <main id="main-content" class="flex-1">
    {
      fullWidth ? (
        <slot />
      ) : (
        <div class="mx-auto max-w-[930px] px-4 py-8 sm:px-6">
          <slot />
        </div>
      )
    }
  </main>
  <Footer />
</BaseLayout>
```

Replace `src/layouts/PageLayout.astro` with:

```astro
---
import ClassicShell from '../themes/classic/PageShell.astro';
import EditorialLayout from '../themes/editorial/Layout.astro';
import { getTheme } from '../lib/config';

interface Props {
  title: string;
  description?: string;
  ogImage?: string;
  keywords?: string;
  fullWidth?: boolean;
}

const { title, description, ogImage, keywords } = Astro.props;
---

{
  getTheme() === 'editorial' ? (
    <EditorialLayout title={title} description={description} ogImage={ogImage} keywords={keywords}>
      <div class="ed-wrap ed-page">
        <slot />
      </div>
    </EditorialLayout>
  ) : (
    <ClassicShell {...Astro.props}>
      <slot />
    </ClassicShell>
  )
}
```

- [ ] **Step 6: Accent CSS and fonts.** In `src/layouts/BaseLayout.astro`, change the colors import to `import { editorialAccentCss, generateColorOverrides } from '../lib/colors';`. Then move `const theme = getTheme();` above `colorCSS` and change `colorCSS` to:

```ts
const theme = getTheme();
const colorCSS = generateColorOverrides(config) + (theme === 'editorial' ? editorialAccentCss(config) : '');
```

In `src/components/astro/FontStyles.astro`:
- change the import to `import { getSiteConfig, getTheme } from '../../lib/config';`
- after `const fonts = config.fonts;` add `const theme = getTheme();`
- after the `defaultFamilies` object add:

```ts
// Editorial defaults, used for any family fonts.families leaves unset
const editorialFamilies = {
  sans: 'IBM Plex Sans',
  serif: 'Source Serif 4',
  mono: 'IBM Plex Mono',
};
const themeFamilies = theme === 'editorial' ? editorialFamilies : defaultFamilies;

// Axes the editorial design uses (italic + 600). Only requested for these families, because
// Google Fonts rejects the whole stylesheet if a family lacks a requested axis value.
const editorialAxes: Record<string, string> = {
  'Source Serif 4': 'ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400',
  'IBM Plex Sans': 'wght@400;500;600',
};
```

- in the `families` object, replace each `|| defaultFamilies.<slot>` with `|| themeFamilies.<slot>`; `hasFamilyOverrides` keeps comparing against `defaultFamilies` (the `global.css` values)
- in the `fontParams` map, make the first statement after `const encoded = …`:

```ts
    if (theme === 'editorial' && editorialAxes[family]) return `family=${encoded}:${editorialAxes[family]}`;
```

- [ ] **Step 7: Run checks to verify they pass**

Run: `pnpm check:themes`
Expected: PASS. The editorial contact page has the editorial header and footer, and classic still matches `dist-baseline/`.

Run: `grep -o 'family=Source+Serif+4[^&"]*' dist-editorial/index.html | head -1; grep -c "html:root\[data-theme='editorial'\]" dist-editorial/index.html`
Expected: `family=Source+Serif+4:ital,opsz,wght@0,8..60,400;…` and a count ≥ 1 (the demo sets `colors.light.primary`).

- [ ] **Step 8: Commit**

```bash
git add src/themes/editorial/editorial.css src/themes/editorial/Layout.astro src/themes/classic/PageShell.astro src/layouts/PageLayout.astro src/layouts/BaseLayout.astro src/components/astro/FontStyles.astro scripts/check-themes.mjs
git commit -m "feat: editorial stylesheet and shell for every page" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Editorial home page (+ Eyebrow, PaperRow, NewsList, PostRow, data loaders)

**Files:**
- Create: `src/themes/editorial/{Eyebrow,PaperRow,NewsList,PostRow,Home}.astro`, `src/themes/editorial/data.ts`
- Modify: `src/pages/index.astro`, `scripts/check-themes.mjs`

**Interfaces:**
- Consumes: `Layout.astro` (Task 7); `homeBlocks`, `mergeWriting`, `normalizeAreas`, `shortTitle`, `socialLinks`, `jsonLd`, `isOwner`, `paperLink`, `WritingItem`, `ResearchConfig` (Tasks 2–3); `bibtexFor`; `formatNewsDate`, `readingTime`; `renderMarkdown`.
- Produces:
  - `Eyebrow.astro` with `Props { as?: 'span' | 'p' | 'h2'; id?: string }`
  - `PaperRow.astro` with `Props { pub: CollectionEntry<'publications'>; owner: string; variant?: 'home' | 'list'; topic?: string; first?: boolean }`. The list variant renders `<li id={pub.id} data-topic data-first>` and a BibTeX `<details class="ed-bib">`; the home variant renders the venue tile and a Cite link to `/publications#<id>`.
  - `NewsList.astro` with `Props { items: CollectionEntry<'announcements'>[] }`
  - `PostRow.astro` with `Props { item: WritingItem }`
  - `data.ts`: `loadResearchConfig(): ResearchConfig`, `pick<T>(ids: string[], byId: Map<string, T>, where: string): T[]`, `writingItems(): Promise<WritingItem[]>`, `loadHome()` with `type HomeData`.

- [ ] **Step 1: Write the failing check.** Insert above `// --- classic regression ---` in `scripts/check-themes.mjs`:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm check:themes`
Expected: FAIL, `editorial /: hero name`.

- [ ] **Step 3: Shared components.** `src/themes/editorial/Eyebrow.astro`:

```astro
---
interface Props {
  as?: 'span' | 'p' | 'h2';
  id?: string;
}

const { as: Tag = 'span', id } = Astro.props;
---

<Tag class="ed-eyebrow" id={id}><slot /></Tag>
```

`src/themes/editorial/PaperRow.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';
import { bibtexFor } from '../../lib/bibtex';
import { isOwner, paperLink } from '../../lib/editorial';

interface Props {
  pub: CollectionEntry<'publications'>;
  /** Site author; bolded wherever they appear in the author list. */
  owner: string;
  /** home: venue tile + Cite link. list: publications page row with filter data + BibTeX. */
  variant?: 'home' | 'list';
  topic?: string;
  first?: boolean;
}

const { pub, owner, variant = 'home', topic, first = false } = Astro.props;
const p = pub.data;
const link = paperLink(p);
const list = variant === 'list';
---

<li
  id={list ? pub.id : undefined}
  class:list={['row ed-paper', { 'ed-paper--list': list }]}
  data-topic={list ? topic : undefined}
  data-first={list ? String(first) : undefined}
>
  {
    !list && (
      <div class="ed-venue-tile" aria-hidden="true">
        <span class="ed-venue-tile-short">{p.venueShort ?? p.venue}</span>
        <span class="ed-venue-tile-year num">{p.year}</span>
      </div>
    )
  }
  <div class="ed-paper-body">
    {
      link ? (
        <a href={link} class="ed-paper-title">
          {p.title}
        </a>
      ) : (
        <span class="ed-paper-title">{p.title}</span>
      )
    }
    <span class="ed-authors">
      {
        p.authors.map((a, i) => (
          <>
            {i > 0 && ', '}
            {isOwner(a, owner) ? <strong>{a}</strong> : a}
          </>
        ))
      }
    </span>
    <span class="ed-paper-meta">
      <span class="ed-venue">{list ? `${p.venue}, ${p.year}` : p.venue}</span>
      {p.note && <span class="ed-note">{p.note}</span>}
      {
        link && (
          <a href={link} class="ul">
            Paper
          </a>
        )
      }
      {
        p.code && (
          <a href={p.code} class="ul">
            Code
          </a>
        )
      }
      {
        list ? (
          <details class="ed-bib">
            <summary class="ul">Cite</summary>
            <pre>{bibtexFor(p)}</pre>
          </details>
        ) : (
          <a href={`/publications#${pub.id}`} class="ul">
            Cite
          </a>
        )
      }
    </span>
  </div>
</li>
```

`src/themes/editorial/NewsList.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';
import { formatNewsDate } from '../../lib/utils';

interface Props {
  items: CollectionEntry<'announcements'>[];
}

const { items } = Astro.props;
---

<ul class="ed-news">
  {
    items.map((n) => (
      <li>
        <span class="ed-news-date num">{formatNewsDate(n.data.date, n.data.datePrecision)}</span>
        <span class="ed-news-text">{n.data.title}</span>
      </li>
    ))
  }
</ul>
```

`src/themes/editorial/PostRow.astro`:

```astro
---
import type { WritingItem } from '../../lib/editorial';
import { formatNewsDate } from '../../lib/utils';

interface Props {
  item: WritingItem;
}

const { item } = Astro.props;
const external = item.kind === 'external';
const meta = [formatNewsDate(item.date, 'month'), external ? item.source : `${item.minutes} min read`]
  .filter(Boolean)
  .join(' · ');
---

<li>
  <a href={item.href} class="row ed-post-link" rel={external ? 'noopener' : undefined}>
    <span>
      <span class="ed-post-title">{item.title}</span>
      <span class="ed-post-meta">{meta}</span>
    </span>
    <span class="arr" aria-hidden="true">{external ? '↗' : '→'}</span>
  </a>
</li>
```

- [ ] **Step 4: Data loaders.** Create `src/themes/editorial/data.ts`:

```ts
import { getCollection } from 'astro:content';
import { getHomepageSections, getSiteConfig, getSiteName, loadYamlConfig } from '../../lib/config';
import {
  homeBlocks,
  mergeWriting,
  normalizeAreas,
  shortTitle,
  type ResearchConfig,
  type WritingItem,
} from '../../lib/editorial';
import { renderMarkdown } from '../../lib/markdown';
import { readingTime } from '../../lib/utils';

export function loadResearchConfig(): ResearchConfig {
  try {
    return loadYamlConfig<ResearchConfig>('research.yml') ?? {};
  } catch {
    return {};
  }
}

/** Entries for `ids`, in order. Unknown ids are reported and skipped so a typo can't break the build. */
export function pick<T>(ids: string[], byId: Map<string, T>, where: string): T[] {
  return ids.flatMap((id) => {
    const hit = byId.get(id);
    // eslint-disable-next-line no-console
    if (!hit) console.warn(`[editorial] ${where}: unknown publication id "${id}"`);
    return hit ? [hit] : [];
  });
}

/** Site posts (non-draft) and feed items, newest first. External items never carry content. */
export async function writingItems(): Promise<WritingItem[]> {
  const posts = (await getCollection('posts')).filter((p) => !p.data.draft);
  const feeds = await getCollection('feeds');
  return mergeWriting([
    ...posts.map((p) => ({
      kind: 'site' as const,
      title: p.data.title,
      href: `/blog/${p.id}`,
      date: p.data.date,
      excerpt: p.data.excerpt,
      minutes: readingTime(p.body ?? ''),
      tag: p.data.tags?.[0],
    })),
    ...feeds.map((f) => ({
      kind: 'external' as const,
      title: f.data.title,
      href: f.data.link,
      date: new Date(f.data.date),
      excerpt: f.data.excerpt,
      source: f.data.source,
    })),
  ]);
}

export async function loadHome() {
  const config = getSiteConfig();
  const ed = config.editorial ?? {};
  const research = loadResearchConfig();
  const areas = normalizeAreas(research.areas);
  const pubs = await getCollection('publications');
  const byId = new Map(pubs.map((p) => [p.id, p]));
  const sections = getHomepageSections();
  const affiliations = (ed.affiliations ?? []).filter((a) => a?.trim());

  return {
    config,
    name: getSiteName(),
    blocks: homeBlocks(sections, { affiliations: affiliations.length > 0, research: areas.length > 0 }),
    showBio: sections.includes('about'),
    showNews: sections.includes('news'),
    showWriting: sections.includes('blog'),
    bioHtml: await renderMarkdown(ed.bio),
    affiliations,
    researchHeadline: research.headline,
    areas: areas.map((a) => ({
      ...a,
      papers: pick(a.publications, byId, `research.yml area "${a.id}"`).map((p) => shortTitle(p.data.title)),
    })),
    selected: [...pubs]
      .sort((a, b) => Number(b.data.featured) - Number(a.data.featured) || b.data.year - a.data.year)
      .slice(0, 4),
    pubCount: pubs.length,
    news: (await getCollection('announcements'))
      .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
      .slice(0, 5),
    writing: (await writingItems()).slice(0, 3),
  };
}

export type HomeData = Awaited<ReturnType<typeof loadHome>>;
```

- [ ] **Step 5: The page.** Create `src/themes/editorial/Home.astro`:

```astro
---
import Layout from './Layout.astro';
import Eyebrow from './Eyebrow.astro';
import PaperRow from './PaperRow.astro';
import NewsList from './NewsList.astro';
import PostRow from './PostRow.astro';
import { jsonLd, socialLinks } from '../../lib/editorial';
import type { HomeData } from './data';

type Props = HomeData;

const {
  config,
  name,
  blocks,
  showBio,
  showNews,
  showWriting,
  bioHtml,
  affiliations,
  researchHeadline,
  areas,
  selected,
  pubCount,
  news,
  writing,
} = Astro.props;
const ed = config.editorial ?? {};
const email = config.socials?.email;
const links = socialLinks(config.socials);
const blogLabel = config.nav.find((n) => n.href === '/blog')?.label ?? 'Writing';
const hasUpdates = (showNews && news.length > 0) || (showWriting && writing.length > 0);

const ld =
  config.siteMode === 'personal'
    ? {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name,
        jobTitle: ed.eyebrow,
        affiliation: affiliations.map((a) => ({ '@type': 'Organization', name: a })),
        sameAs: links.map((l) => l.href),
        email: email ? `mailto:${email}` : undefined,
        url: config.siteUrl,
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'ResearchOrganization',
        name,
        url: config.siteUrl,
        sameAs: links.map((l) => l.href),
      };
---

<Layout title={config.title} contactFooter>
  <script type="application/ld+json" set:html={jsonLd(ld)} />
  {!blocks.includes('hero') && <h1 class="ed-sr-only">{name}</h1>}
  {
    blocks.map((block) => {
      if (block === 'hero') {
        return (
          <section class="ed-wrap ed-hero">
            <div class="ed-hero-text">
              {ed.eyebrow && <Eyebrow>{ed.eyebrow}</Eyebrow>}
              <h1 class="ed-hero-name">{name}</h1>
              {ed.tagline && <p class="ed-tagline">{ed.tagline}</p>}
              {showBio && bioHtml && <div class="ed-bio" set:html={bioHtml} />}
              <div class="ed-actions">
                <a href="/publications" class="ed-btn">
                  View publications
                </a>
                <a href="/cv" class="ul ed-more">
                  Curriculum vitae <span class="arr">→</span>
                </a>
              </div>
              {(links.length > 0 || email) && (
                <div class="ed-links">
                  {links.map((l) => (
                    <a href={l.href} class="ul">
                      {l.label}
                    </a>
                  ))}
                  {email && (
                    <a href={`mailto:${email}`} class="ul">
                      {email}
                    </a>
                  )}
                </div>
              )}
            </div>
            {ed.figure?.image && (
              <figure class="ed-figure">
                <div class="ed-figure-box">
                  <img src={ed.figure.image} alt={ed.figure.alt ?? ''} width="360" height="320" decoding="async" />
                </div>
                {ed.figure.caption && (
                  <figcaption class="ed-figcaption">
                    <b>Fig. 1.</b> {ed.figure.caption}
                  </figcaption>
                )}
              </figure>
            )}
          </section>
        );
      }

      if (block === 'affiliations') {
        return (
          <section class="ed-band" aria-label="Affiliations">
            <div class="ed-wrap ed-band-inner">
              <span class="ed-band-label">Affiliations</span>
              {affiliations.map((a) => (
                <span class="ed-band-item">{a}</span>
              ))}
            </div>
          </section>
        );
      }

      if (block === 'research') {
        return (
          <section class="ed-wrap ed-home-section">
            <div class="ed-section-head">
              {researchHeadline ? (
                <div class="ed-stack">
                  <Eyebrow>Research</Eyebrow>
                  <h2 class="ed-h2">{researchHeadline}</h2>
                </div>
              ) : (
                <h2 class="ed-h2">Research</h2>
              )}
              <a href="/research" class="ul ed-more">
                Research overview <span class="arr">→</span>
              </a>
            </div>
            <div class="ed-cards">
              {areas.map((a) => (
                <a href={`/research#${a.id}`} class="row ed-card">
                  <span class="ed-card-num" aria-hidden="true">
                    {a.numeral}
                  </span>
                  <h3>{a.title}</h3>
                  <p>{a.description}</p>
                  {a.papers.length > 0 && (
                    <span class="ed-card-papers">
                      {a.papers.join(' · ')} <span class="arr">→</span>
                    </span>
                  )}
                </a>
              ))}
            </div>
          </section>
        );
      }

      if (block === 'publications' && selected.length > 0) {
        return (
          <section class="ed-wrap ed-home-section ed-home-section--papers">
            <div class="ed-section-head">
              <div class="ed-stack">
                <Eyebrow>Publications</Eyebrow>
                <h2 class="ed-h2">Selected papers</h2>
              </div>
              <a href="/publications" class="ul ed-more">
                All {pubCount} publications <span class="arr">→</span>
              </a>
            </div>
            <ol class="ed-papers">
              {selected.map((pub) => (
                <PaperRow pub={pub} owner={config.author} />
              ))}
            </ol>
          </section>
        );
      }

      if (block === 'updates' && hasUpdates) {
        return (
          <section class="ed-wrap ed-split" aria-label="News and writing">
            {showNews && news.length > 0 && (
              <div>
                <Eyebrow as="h2">News</Eyebrow>
                <NewsList items={news} />
              </div>
            )}
            {showWriting && writing.length > 0 && (
              <div>
                <div class="ed-split-head">
                  <Eyebrow as="h2">{blogLabel}</Eyebrow>
                  <a href="/blog" class="ul ed-more">
                    All posts <span class="arr">→</span>
                  </a>
                </div>
                <ul class="ed-posts">
                  {writing.map((item) => (
                    <PostRow item={item} />
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      }

      return null;
    })
  }
</Layout>
```

- [ ] **Step 6: Route switch.** In `src/pages/index.astro`:
- add after the `ClassicHome` import:

```ts
import EditorialHome from '../themes/editorial/Home.astro';
import { loadHome } from '../themes/editorial/data';
```

- add `getTheme` to the `../lib/config` import
- add as the last line before the closing `---`: `const editorialHome = getTheme() === 'editorial' ? await loadHome() : null;`
- wrap the template:

```astro
{
  editorialHome ? (
    <EditorialHome {...editorialHome} />
  ) : (
    <ClassicHome
      {config}
      {personal}
      {siteName}
      {sections}
      {enabledGridSections}
      {firstGridId}
      {bottomGridClass}
      {announcementData}
      {publications}
      {posts}
      {feeds}
    />
  )
}
```

- [ ] **Step 7: Run checks to verify they pass**

Run: `pnpm check:themes && pnpm test`
Expected: PASS. The build prints no `[editorial] … unknown publication id` warnings for the demo, and classic still matches the baseline.

- [ ] **Step 8: Commit**

```bash
git add src/themes/editorial src/pages/index.astro scripts/check-themes.mjs
git commit -m "feat: editorial home page and shared paper/news/post rows" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Editorial research page

**Files:**
- Create: `src/themes/editorial/Research.astro`
- Modify: `src/themes/editorial/data.ts`, `src/pages/research.astro`, `scripts/check-themes.mjs`

**Interfaces:**
- Consumes: `loadResearchConfig`, `pick` (Task 8); `normalizeAreas`, `shortTitle` (Task 3); `renderMarkdown` (Task 6); `Eyebrow`, `Layout`.
- Produces: `loadResearch()` and `type ResearchData` in `data.ts`; `<section id="<area id>" class="ed-area">` anchors and `#software`.

- [ ] **Step 1: Write the failing check.** Insert above `// --- classic regression ---`:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm check:themes`
Expected: FAIL, `editorial /research: section #nlp`.

- [ ] **Step 3: Loader.** Append to `src/themes/editorial/data.ts`:

```ts
export async function loadResearch() {
  const config = getSiteConfig();
  const research = loadResearchConfig();
  const pubs = await getCollection('publications');
  const byId = new Map(pubs.map((p) => [p.id, p]));
  const areas = await Promise.all(
    normalizeAreas(research.areas).map(async (a) => ({
      ...a,
      bodyHtml: await renderMarkdown(a.body || a.description),
      papers: pick(a.publications, byId, `research.yml area "${a.id}"`),
    })),
  );
  const software = (await getCollection('projects'))
    .filter((p) => p.data.type === 'software')
    .map((p) => ({
      name: p.data.title,
      href: p.data.repoUrl ?? p.data.url,
      description: p.data.excerpt,
      tech: (p.data.tags ?? []).join(' · '),
    }));
  return { config, headline: research.headline, description: research.description, areas, software };
}

export type ResearchData = Awaited<ReturnType<typeof loadResearch>>;
```

- [ ] **Step 4: The page.** Create `src/themes/editorial/Research.astro`:

```astro
---
import Layout from './Layout.astro';
import Eyebrow from './Eyebrow.astro';
import { shortTitle } from '../../lib/editorial';
import type { ResearchData } from './data';

type Props = ResearchData;

const { config, headline, description, areas, software } = Astro.props;
const personal = config.siteMode === 'personal';
const intro =
  description ||
  (personal
    ? 'My research focuses on artificial intelligence, with an emphasis on building systems that are capable, safe, and beneficial.'
    : 'Our lab explores the frontiers of artificial intelligence, with a focus on building systems that are capable, safe, and beneficial.');
let figureCount = 0;
const figureNumbers = areas.map((a) => (a.figure ? ++figureCount : 0));
---

<Layout
  title="Research"
  description={personal ? 'My research areas and current projects.' : 'Our research areas and current projects.'}
>
  <div class="ed-wrap ed-main ed-main--flush">
    <div class="ed-research-intro">
      <Eyebrow>Research</Eyebrow>
      <h1 class="ed-h1">{headline || 'Research'}</h1>
      <p class="ed-lede">{intro}</p>
    </div>

    {
      (areas.length > 0 || software.length > 0) && (
        <nav class="ed-toc" aria-label="On this page">
          <span class="ed-toc-label">On this page</span>
          {areas.map((a) => (
            <a href={`#${a.id}`} class="ul">
              {a.numeral} {a.title}
            </a>
          ))}
          {software.length > 0 && (
            <a href="#software" class="ul">
              Software
            </a>
          )}
        </nav>
      )
    }

    {
      areas.map((a, i) => (
        <section id={a.id} class="ed-area" aria-labelledby={`${a.id}-title`}>
          <div class="ed-area-text">
            <span class="ed-area-num" aria-hidden="true">
              {a.numeral}
            </span>
            <h2 id={`${a.id}-title`}>{a.title}</h2>
            <div class="ed-md" set:html={a.bodyHtml} />
            {a.result && (
              <aside class="ed-result">
                <b>Result.</b> {a.result}
              </aside>
            )}
            {a.papers.length > 0 && (
              <div class="ed-related">
                <span class="ed-label">Papers</span>
                {a.papers.map((p) => (
                  <a href={`/publications#${p.id}`} class="row">
                    <span>
                      {shortTitle(p.data.title)}{' '}
                      <span class="ed-related-venue">
                        · {p.data.venueShort ? `${p.data.venueShort} ${p.data.year}` : p.data.venue}
                      </span>
                    </span>
                    <span class="arr" aria-hidden="true">
                      →
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
          {a.figure && (
            <figure class="ed-area-fig">
              <div class="ed-figure-box">
                <img src={a.figure} alt={a.caption || a.title} loading="lazy" decoding="async" />
              </div>
              {a.caption && (
                <figcaption class="ed-figcaption">
                  <b>Fig. {figureNumbers[i]}.</b> {a.caption}
                </figcaption>
              )}
            </figure>
          )}
        </section>
      ))
    }

    {
      software.length > 0 && (
        <section id="software" class="ed-software" aria-labelledby="software-title">
          <Eyebrow as="h2" id="software-title">
            Software
          </Eyebrow>
          <div class="ed-software-grid">
            {software.map((s) => (
              <a href={s.href} class="row ed-software-card">
                <span class="ed-software-name">
                  {s.name}
                  {s.href && (
                    <span class="arr" aria-hidden="true">
                      ↗
                    </span>
                  )}
                </span>
                {s.description && <span class="ed-software-desc">{s.description}</span>}
                {s.tech && <span class="ed-software-tech">{s.tech}</span>}
              </a>
            ))}
          </div>
        </section>
      )
    }
  </div>
</Layout>
```

A software project without any URL renders `<a>` with no `href`. That is valid HTML: it is not focusable and not announced as a link.

- [ ] **Step 5: Route switch.** In `src/pages/research.astro`, add the imports:

```ts
import EditorialResearch from '../themes/editorial/Research.astro';
import { loadResearch } from '../themes/editorial/data';
```

Add `getTheme` to the `../lib/config` import. Add before the closing `---`:

```ts
const editorialResearch = getTheme() === 'editorial' ? await loadResearch() : null;
```

and replace the template with:

```astro
{
  editorialResearch ? (
    <EditorialResearch {...editorialResearch} />
  ) : (
    <ClassicResearch {personal} {projects} {publications} {researchAreas} {researchDescription} />
  )
}
```

- [ ] **Step 6: Run checks to verify they pass**

Run: `pnpm check:themes`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/themes/editorial/Research.astro src/themes/editorial/data.ts src/pages/research.astro scripts/check-themes.mjs
git commit -m "feat: editorial research page" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Editorial publications page (filters, BibTeX, JSON-LD)

**Files:**
- Create: `src/themes/editorial/Publications.astro`
- Modify: `src/themes/editorial/data.ts`, `src/pages/publications.astro`, `scripts/check-themes.mjs`

**Interfaces:**
- Consumes: `PaperRow` list variant (Task 8); `normalizeAreas`, `topicOf`, `topicFilters`, `isOwner`, `bareDoi`, `bareArxiv`, `jsonLd`.
- Produces: `loadPublications()` and `type PublicationsData`; page markup `[data-pub-filters]`, `button[data-filter]`, `input[data-first-only]`, `section[data-year]`, `li[data-topic][data-first]`, `[data-pub-empty]`.

- [ ] **Step 1: Write the failing check.** Insert above `// --- classic regression ---`:

```js
{
  const html = ed('publications/index.html');
  assert.equal((html.match(/data-topic="/g) ?? []).length, 5, 'editorial /publications: one filterable row per paper');
  assert.match(html, /<li id="smith2024adaptive"/, 'editorial /publications: row anchors for Cite links');
  assert.match(html, /data-topic="other"/, 'editorial /publications: unmatched topic → Other');
  assert.match(html, /data-filter="nlp"[^>]*>NLP <span class="ed-tab-count num">1<\/span>/, 'editorial /publications: topic filter with count');
  assert.match(html, /data-filter="other"/, 'editorial /publications: Other filter');
  assert.match(html, /<details class="ed-bib"><summary class="ul">Cite<\/summary><pre>@inproceedings\{smith2024adaptive,/, 'editorial /publications: BibTeX expander');
  assert.match(html, /@article\{smith2023fairness,/, 'editorial /publications: bibtex field used as-is');
  assert.match(html, /"@type":"ScholarlyArticle"/, 'editorial /publications: ScholarlyArticle JSON-LD');
  assert.match(html, /https:\/\/arxiv\.org\/abs\/2024\.00003/, 'editorial /publications: arXiv prefix stripped in sameAs');
  assert.match(html, /data-first-only/, 'editorial /publications: first-author toggle');
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm check:themes`
Expected: FAIL, `editorial /publications: one filterable row per paper`.

- [ ] **Step 3: Loader.** Extend the `../../lib/editorial` import in `data.ts` with `isOwner, topicFilters, topicOf`, then append:

```ts
export async function loadPublications() {
  const config = getSiteConfig();
  const areas = normalizeAreas(loadResearchConfig().areas);
  const areaIds = new Set(areas.map((a) => a.id));
  const items = (await getCollection('publications'))
    .sort((a, b) => b.data.year - a.data.year || a.data.title.localeCompare(b.data.title))
    .map((pub) => ({
      pub,
      topic: topicOf(pub.data.topic, areaIds),
      first: isOwner(pub.data.authors[0] ?? '', config.author),
    }));
  const years = [...new Set(items.map((i) => i.pub.data.year))];
  return {
    config,
    groups: years.map((year) => ({ year, items: items.filter((i) => i.pub.data.year === year) })),
    filters: topicFilters(
      items.map((i) => i.topic),
      areas,
    ),
    total: items.length,
    firstCount: items.filter((i) => i.first).length,
  };
}

export type PublicationsData = Awaited<ReturnType<typeof loadPublications>>;
```

- [ ] **Step 4: The page.** Create `src/themes/editorial/Publications.astro`:

```astro
---
import Layout from './Layout.astro';
import Eyebrow from './Eyebrow.astro';
import PaperRow from './PaperRow.astro';
import { bareArxiv, bareDoi, jsonLd } from '../../lib/editorial';
import type { PublicationsData } from './data';

type Props = PublicationsData;

const { config, groups, filters, total, firstCount } = Astro.props;
const personal = config.siteMode === 'personal';
const scholar = config.socials?.scholar;

const ld = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: groups
    .flatMap((g) => g.items)
    .map(({ pub }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'ScholarlyArticle',
        headline: pub.data.title,
        author: pub.data.authors.map((name) => ({ '@type': 'Person', name })),
        datePublished: String(pub.data.year),
        isPartOf: { '@type': 'Periodical', name: pub.data.venue },
        sameAs: [
          pub.data.doi && `https://doi.org/${bareDoi(pub.data.doi)}`,
          pub.data.arxiv && `https://arxiv.org/abs/${bareArxiv(pub.data.arxiv)}`,
        ].filter(Boolean),
      },
    })),
};
---

<Layout
  title="Publications"
  description={personal ? 'My published research papers and articles.' : 'Our published research papers and articles.'}
>
  <script type="application/ld+json" set:html={jsonLd(ld)} />
  <div class="ed-wrap ed-main">
    <div class="ed-pubs-head">
      <div class="ed-stack">
        <Eyebrow>Publications</Eyebrow>
        <h1 class="ed-h1">Papers</h1>
        {
          (personal || scholar) && (
            <p class="ed-intro">
              {personal && 'My name is shown in bold. '}
              {scholar && (
                <>
                  See also{' '}
                  <a href={scholar} class="ul">
                    Google Scholar
                  </a>
                  .
                </>
              )}
            </p>
          )
        }
      </div>
      <div class="ed-stats">
        <div class="ed-stat">
          <span class="ed-stat-num num">{total}</span><span class="ed-stat-label">publications</span>
        </div>
        {
          personal && (
            <div class="ed-stat">
              <span class="ed-stat-num num">{firstCount}</span>
              <span class="ed-stat-label">first-author</span>
            </div>
          )
        }
      </div>
    </div>

    <div class="ed-filterbar" data-pub-filters>
      {
        filters.length > 1 ? (
          <div class="ed-tabs" role="group" aria-label="Filter by topic">
            {filters.map((f) => (
              <button type="button" class="ed-tab" data-filter={f.id} aria-pressed={f.id === 'all' ? 'true' : 'false'}>
                {f.label} <span class="ed-tab-count num">{f.count}</span>
              </button>
            ))}
          </div>
        ) : (
          <span />
        )
      }
      {
        personal && (
          <label class="ed-toggle">
            <input type="checkbox" data-first-only /> First-author only
          </label>
        )
      }
    </div>

    <p class="ed-intro" data-pub-empty hidden>No papers match these filters.</p>

    {
      groups.map((g) => (
        <section class="ed-year" data-year={g.year} aria-labelledby={`y${g.year}`}>
          <h2 id={`y${g.year}`} class="num">
            {g.year}
          </h2>
          <ol class="ed-papers">
            {g.items.map((i) => (
              <PaperRow pub={i.pub} owner={config.author} variant="list" topic={i.topic} first={i.first} />
            ))}
          </ol>
        </section>
      ))
    }
  </div>
</Layout>

<script>
  function initPublicationFilters() {
    const bar = document.querySelector<HTMLElement>('[data-pub-filters]');
    if (!bar) return;
    const buttons = [...bar.querySelectorAll<HTMLButtonElement>('[data-filter]')];
    const firstOnly = bar.querySelector<HTMLInputElement>('[data-first-only]');
    const empty = document.querySelector<HTMLElement>('[data-pub-empty]');
    let topic = 'all';

    const apply = () => {
      document.querySelectorAll<HTMLElement>('li[data-topic]').forEach((li) => {
        const offTopic = topic !== 'all' && li.dataset.topic !== topic;
        const notFirst = !!firstOnly?.checked && li.dataset.first !== 'true';
        li.hidden = offTopic || notFirst;
      });
      let anyVisible = false;
      document.querySelectorAll<HTMLElement>('section[data-year]').forEach((section) => {
        section.hidden = !section.querySelector('li[data-topic]:not([hidden])');
        anyVisible ||= !section.hidden;
      });
      if (empty) empty.hidden = anyVisible;
    };

    buttons.forEach((button) =>
      button.addEventListener('click', () => {
        topic = button.dataset.filter ?? 'all';
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        apply();
      }),
    );
    firstOnly?.addEventListener('change', apply);
    apply(); // honours a checkbox state restored by the browser
  }

  document.addEventListener('astro:page-load', initPublicationFilters);
</script>
```

- [ ] **Step 5: Route switch.** In `src/pages/publications.astro`, add:

```ts
import EditorialPublications from '../themes/editorial/Publications.astro';
import { loadPublications } from '../themes/editorial/data';
```

Add `getTheme` to the config import, and before the closing `---`:

```ts
const editorialPublications = getTheme() === 'editorial' ? await loadPublications() : null;
```

Replace the template with:

```astro
{
  editorialPublications ? (
    <EditorialPublications {...editorialPublications} />
  ) : (
    <ClassicPublications {config} {personal} {pubData} />
  )
}
```

- [ ] **Step 6: Run checks to verify they pass**

Run: `pnpm check:themes`
Expected: PASS. The classic diff also confirms the publications `<script>` is not emitted on classic pages.

- [ ] **Step 7: Browser check of the filters** (Review Focus 2). Serve the editorial build in the background with `pnpm astro preview --outDir dist-editorial --port 4322`. Then, using the Playwright browser tools:
  1. Navigate to `http://localhost:4322/publications`.
  2. Evaluate `document.querySelectorAll('li[data-topic]:not([hidden])').length`. Expected `5`.
  3. Click `button[data-filter="nlp"]`, then evaluate the same count (expected `1`) and `[...document.querySelectorAll('li[data-topic]')].filter(li => getComputedStyle(li).display !== 'none').length` (expected `1`, which proves the `[hidden]` rule beats `display:flex`).
  4. Evaluate `document.querySelectorAll('section[data-year]:not([hidden])').length`. Expected `1` (only 2024).
  5. Click `button[data-filter="other"]` and tick `input[data-first-only]`. chen2023visual's first author isn't Jane Smith, so evaluate `!document.querySelector('[data-pub-empty]').hidden`. Expected `true`.
  6. Click `button[data-filter="all"]`, untick the checkbox, open the first `details.ed-bib`, and evaluate `document.documentElement.scrollWidth <= window.innerWidth` at width 390. Expected `true`.

Stop the preview server afterwards.

- [ ] **Step 8: Commit**

```bash
git add src/themes/editorial/Publications.astro src/themes/editorial/data.ts src/pages/publications.astro scripts/check-themes.mjs
git commit -m "feat: editorial publications page with topic/first-author filters and BibTeX" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Editorial CV, blog index and post pages

**Files:**
- Modify: `src/lib/cv.ts`, `src/lib/cv.test.ts`
- Create: `src/themes/editorial/{Cv,Blog,Post}.astro`
- Modify: `src/themes/editorial/data.ts`, `src/pages/cv.astro`, `src/pages/blog/index.astro`, `src/pages/blog/[id].astro`, `scripts/check-themes.mjs`

**Interfaces:**
- Consumes: `loadCv`, `loadCvMeta`, `cvSections`, `hasYamlPublications`, `sectionTitle`, `formatDateRange`, guards (Task 5); `writingItems` (Task 8); `elsewhereLabel`, `paperLink`; `formatNewsDate`, `readingTime`.
- Produces (`src/lib/cv.ts`): `interface CvEntryView { title: string; org?: string; when?: string; points: string[] }`, `cvEntryView(entry: unknown): CvEntryView | null`.
- Produces (`data.ts`): `loadCvPage()` / `CvPageData`, `loadBlog()` / `BlogData`, `loadPost(post)` / `PostData`.

- [ ] **Step 1: Write the failing unit test.** Append to `src/lib/cv.test.ts` (and add `cvEntryView` to its import):

```ts
test('cvEntryView: each RenderCV entry shape', () => {
  assert.deepEqual(cvEntryView('Program committee, ACL'), { title: 'Program committee, ACL', points: [] });
  assert.deepEqual(
    cvEntryView({
      institution: 'U of E',
      area: 'CS',
      degree: 'Ph.D.',
      location: 'City',
      startDate: '2010-09',
      endDate: '2015-05',
      highlights: ['Thesis: X'],
    }),
    { title: 'Ph.D. in CS', org: 'U of E, City', when: '2010-09 – 2015-05', points: ['Thesis: X'] },
  );
  assert.deepEqual(cvEntryView({ label: 'Languages', details: 'Python, Rust' }), {
    title: 'Languages',
    org: 'Python, Rust',
    points: [],
  });
  assert.deepEqual(cvEntryView({ company: 'U of T', position: 'Professor', startDate: '2020-01', endDate: 'present' }), {
    title: 'Professor',
    org: 'U of T',
    when: '2020-01 – Present',
    points: [],
  });
  assert.deepEqual(cvEntryView({ title: 'Paper', authors: ['**Jane Smith**', 'Alex Chen'], journal: 'ACL', date: 2024 }), {
    title: 'Paper',
    org: 'Jane Smith, Alex Chen · ACL',
    when: '2024',
    points: [],
  });
  assert.deepEqual(cvEntryView({ name: 'Best Paper', date: '2023', highlights: ['x', 3] }), {
    title: 'Best Paper',
    when: '2023',
    points: ['x'],
  });
  assert.equal(cvEntryView({ foo: 1 }), null);
  assert.equal(cvEntryView(42), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL, `cvEntryView` is not exported.

- [ ] **Step 3: Implement.** Append to `src/lib/cv.ts`:

```ts
export interface CvEntryView {
  title: string;
  org?: string;
  when?: string;
  points: string[];
}

const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const joined = (parts: unknown[], sep: string) => parts.map(str).filter(Boolean).join(sep);

function view(title: string, org: string, when: string, points: string[]): CvEntryView {
  return { title, ...(org ? { org } : {}), ...(when ? { when } : {}), points };
}

/** Any RenderCV entry in the editorial "title / org / dates / highlights" shape; null when unrecognized. */
export function cvEntryView(entry: unknown): CvEntryView | null {
  if (typeof entry === 'string') return { title: entry, points: [] };
  if (typeof entry !== 'object' || entry === null) return null;
  const e = entry as CvGenericEntry;
  const points = Array.isArray(e.highlights) ? e.highlights.filter((h): h is string => typeof h === 'string') : [];
  const range = e.startDate ? formatDateRange(e.startDate, e.endDate) : str(e.date);

  if (isEducationEntry(e)) return view(joined([e.degree, e.area], ' in '), joined([e.institution, e.location], ', '), range, points);
  if (isOneLineEntry(e)) return view(str(e.label), str(e.details), '', []);
  if (isExperienceEntry(e)) return view(str(e.position), joined([e.company, e.location], ', '), range, points);
  if (isPublicationEntry(e)) {
    const authors = (Array.isArray(e.authors) ? e.authors : []).map((a) => str(a).replace(/\*+/g, ''));
    return view(str(e.title), joined([authors.join(', '), e.journal], ' · '), str(e.date), points);
  }
  if (isNormalEntry(e)) return view(str(e.name), str(e.location), range, points);
  return null;
}
```

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Write the failing page checks.** Insert above `// --- classic regression ---`:

```js
{
  const html = ed('cv/index.html');
  assert.match(html, /<h1 class="ed-cv-title">Curriculum Vitae<\/h1>/, 'editorial /cv: title');
  assert.match(html, /<h2 id="cv-education">Education<\/h2>/, 'editorial /cv: section label');
  assert.match(html, /Ph\.D\. in Computer Science/, 'editorial /cv: education entry');
  assert.match(html, /2020-01 – Present/, 'editorial /cv: date range');
  assert.doesNotMatch(html, /Download PDF/, 'editorial /cv: no PDF button without cv.json pdfPath');
}
{
  const html = ed('blog/index.html');
  assert.match(html, /<li class="ed-entry" data-kind="site">/, 'editorial /blog: site rows');
  assert.match(html, /<li class="ed-entry" data-kind="external">/, 'editorial /blog: external rows');
  assert.match(html, /data-filter="external"[^>]*>Elsewhere</, 'editorial /blog: mixed feed sources → "Elsewhere"');
  assert.match(html, /Published on Medium ↗/, 'editorial /blog: external rows link out');
  assert.match(html, /href="\/feed\.xml"/, 'editorial /blog: RSS link');
  const post = ed('blog/research-update-summer-2024/index.html');
  assert.match(post, /<p class="ed-subtitle">Three papers, a toolkit release and two new lab members\.<\/p>/, 'editorial post: subtitle');
  assert.match(post, /<span class="ed-aside-label">Related paper<\/span>/, 'editorial post: related paper');
  assert.match(post, /\d+ min read/, 'editorial post: reading time');
  assert.match(post, /<div class="ed-prose">/, 'editorial post: prose wrapper');
  assert.match(post, /href="\/blog\/welcome-to-our-lab"/, 'editorial post: previous post link');
}
```

Run: `pnpm check:themes`
Expected: FAIL, `editorial /cv: title`.

- [ ] **Step 5: Loaders.** Extend the imports at the top of `data.ts`:

```ts
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { cvEntryView, cvSections, hasYamlPublications, loadCv, loadCvMeta, sectionTitle, type CvEntryView } from '../../lib/cv';
```

Also add `elsewhereLabel` to the `../../lib/editorial` import. Then append:

```ts
export async function loadCvPage() {
  const config = getSiteConfig();
  const cv = loadCv().cv;
  const sections = cvSections(cv);
  const meta = loadCvMeta();
  const shown = sections
    .map(([key, entries]) => ({
      key,
      title: sectionTitle(key),
      entries: entries.map(cvEntryView).filter((e): e is CvEntryView => e !== null),
    }))
    .filter((s) => s.entries.length > 0);
  if (!hasYamlPublications(sections)) {
    const pubs = (await getCollection('publications')).sort((a, b) => b.data.year - a.data.year).slice(0, 5);
    if (pubs.length > 0) {
      shown.push({
        key: 'selectedPublications',
        title: 'Selected Publications',
        entries: pubs.map((p) => ({ title: p.data.title, org: `${p.data.venue} · ${p.data.year}`, points: [] })),
      });
    }
  }
  return {
    name: cv.name || config.author,
    sections: shown,
    pdfHref: meta?.pdfPath ?? undefined,
    updated: meta?.lastGenerated ? new Date(meta.lastGenerated) : undefined,
  };
}

export type CvPageData = Awaited<ReturnType<typeof loadCvPage>>;

export async function loadBlog() {
  const items = await writingItems();
  return {
    config: getSiteConfig(),
    items,
    elsewhere: elsewhereLabel(items.filter((i) => i.kind === 'external').map((i) => i.source ?? '')),
  };
}

export type BlogData = Awaited<ReturnType<typeof loadBlog>>;

export async function loadPost(post: CollectionEntry<'posts'>) {
  const config = getSiteConfig();
  const posts = (await getCollection('posts'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const i = posts.findIndex((p) => p.id === post.id);
  const relatedId = post.data.relatedPublication;
  const related = relatedId ? await getEntry('publications', relatedId) : undefined;
  // eslint-disable-next-line no-console
  if (relatedId && !related) console.warn(`[editorial] post "${post.id}": unknown relatedPublication "${relatedId}"`);
  const people = await getCollection('people');
  return {
    config,
    post,
    author: people.find((p) => p.id === post.data.author)?.data.name ?? post.data.author ?? config.author,
    minutes: readingTime(post.body ?? ''),
    related,
    newer: i > 0 ? posts[i - 1] : undefined,
    older: posts[i + 1],
  };
}

export type PostData = Awaited<ReturnType<typeof loadPost>>;
```

- [ ] **Step 6: CV page.** Create `src/themes/editorial/Cv.astro`:

```astro
---
import Layout from './Layout.astro';
import Eyebrow from './Eyebrow.astro';
import type { CvPageData } from './data';

type Props = CvPageData;

const { name, sections, pdfHref, updated } = Astro.props;
---

<Layout title="CV" description={`Curriculum Vitae of ${name}`}>
  <div class="ed-wrap ed-main ed-main--narrow ed-main--flush">
    <div class="ed-cv-head">
      <div class="ed-stack">
        <Eyebrow>{name}</Eyebrow>
        <h1 class="ed-cv-title">Curriculum Vitae</h1>
        {
          updated && (
            <span class="ed-cv-updated">
              Updated {updated.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </span>
          )
        }
      </div>
      {
        pdfHref && (
          <a href={pdfHref} class="ed-btn-outline" download="cv.pdf">
            Download PDF
          </a>
        )
      }
    </div>

    {
      sections.map((s) => (
        <section class="ed-cv-section" aria-labelledby={`cv-${s.key}`}>
          <h2 id={`cv-${s.key}`}>{s.title}</h2>
          <div class="ed-cv-entries">
            {s.entries.map((e) => (
              <div class="ed-cv-entry">
                <div class="ed-cv-entry-top">
                  <span class="ed-cv-entry-title">{e.title}</span>
                  {e.when && <span class="ed-cv-when num">{e.when}</span>}
                </div>
                {e.org && <span class="ed-cv-org">{e.org}</span>}
                {e.points.length > 0 && (
                  <ul class="ed-cv-points">
                    {e.points.map((p) => (
                      <li>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      ))
    }
  </div>
</Layout>
```

- [ ] **Step 7: Blog page.** Create `src/themes/editorial/Blog.astro`:

```astro
---
import Layout from './Layout.astro';
import Eyebrow from './Eyebrow.astro';
import { formatNewsDate } from '../../lib/utils';
import type { BlogData } from './data';

type Props = BlogData;

const { config, items, elsewhere } = Astro.props;
const label = config.nav.find((n) => n.href === '/blog')?.label ?? 'Writing';
const personal = config.siteMode === 'personal';
const description = personal
  ? 'Posts, articles, and technical writing.'
  : 'Lab blog posts and external articles from our team.';
const hasBoth = items.some((i) => i.kind === 'site') && items.some((i) => i.kind === 'external');
const tabs = [
  { id: 'all', label: 'All' },
  { id: 'site', label: 'On this site' },
  { id: 'external', label: elsewhere },
];
---

<Layout title={label} description={description}>
  <div class="ed-wrap ed-main ed-main--narrow">
    <div class="ed-stack">
      <Eyebrow>{label}</Eyebrow>
      <h1 class="ed-h1">Essays &amp; notes</h1>
      <p class="ed-intro">{description}</p>
    </div>

    <div class="ed-filterbar" data-blog-filters>
      {
        hasBoth ? (
          <div class="ed-tabs" role="group" aria-label="Filter by source">
            {tabs.map((t) => (
              <button type="button" class="ed-tab" data-filter={t.id} aria-pressed={t.id === 'all' ? 'true' : 'false'}>
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )
      }
      <a href="/feed.xml" class="ul ed-feedlink">RSS</a>
    </div>

    {items.length === 0 && <p class="ed-intro">No posts yet.</p>}

    <ol class="ed-entries">
      {
        items.map((item) => {
          const external = item.kind === 'external';
          const date = formatNewsDate(item.date, 'month');
          return (
            <li class="ed-entry" data-kind={item.kind}>
              <div class="ed-entry-tile" aria-hidden="true">
                <span class="ed-entry-tag">{external ? item.source : (item.tag ?? 'Post')}</span>
                <span class="ed-entry-date num">{date}</span>
              </div>
              <div class="ed-entry-body">
                <a href={item.href} class="ed-entry-title" rel={external ? 'noopener' : undefined}>
                  {item.title}
                </a>
                {item.excerpt && <p class="ed-entry-excerpt">{item.excerpt}</p>}
                <span class="ed-entry-meta">
                  {external
                    ? `${date} · Published on ${item.source} ↗`
                    : [date, `${item.minutes} min read`, item.tag].filter(Boolean).join(' · ')}
                </span>
              </div>
            </li>
          );
        })
      }
    </ol>
  </div>
</Layout>

<script>
  function initBlogFilters() {
    const bar = document.querySelector<HTMLElement>('[data-blog-filters]');
    if (!bar) return;
    const buttons = [...bar.querySelectorAll<HTMLButtonElement>('[data-filter]')];
    buttons.forEach((button) =>
      button.addEventListener('click', () => {
        const kind = button.dataset.filter;
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        document.querySelectorAll<HTMLElement>('li[data-kind]').forEach((li) => {
          li.hidden = kind !== 'all' && li.dataset.kind !== kind;
        });
      }),
    );
  }

  document.addEventListener('astro:page-load', initBlogFilters);
</script>
```

- [ ] **Step 8: Post page.** Create `src/themes/editorial/Post.astro`:

```astro
---
import { render } from 'astro:content';
import Layout from './Layout.astro';
import Eyebrow from './Eyebrow.astro';
import SEO from '../../components/astro/SEO.astro';
import ProseEnhancements from '../../components/astro/ProseEnhancements.astro';
import { paperLink } from '../../lib/editorial';
import { formatNewsDate } from '../../lib/utils';
import type { PostData } from './data';

type Props = PostData & { ogImage?: string };

const { config, post, author, minutes, related, newer, older, ogImage } = Astro.props;
const { Content } = await render(post);
const label = config.nav.find((n) => n.href === '/blog')?.label ?? 'Writing';
const tags = post.data.tags ?? [];
---

<Layout title={post.data.title} description={post.data.excerpt} ogImage={ogImage} keywords={post.data.keywords}>
  <SEO
    type="blogPost"
    title={post.data.title}
    description={post.data.excerpt}
    datePublished={post.data.date}
    author={post.data.author}
    keywords={post.data.keywords}
  />
  <article class="ed-article">
    <a href="/blog" class="ed-back">← {label}</a>
    <header class="ed-article-head">
      {tags.length > 0 && <Eyebrow>{tags.join(' · ')}</Eyebrow>}
      <h1 class="ed-article-title">{post.data.title}</h1>
      {post.data.subtitle && <p class="ed-subtitle">{post.data.subtitle}</p>}
      <span class="ed-byline">
        {author} · <time datetime={post.data.date.toISOString()}>{formatNewsDate(post.data.date, 'day')}</time> · {
          minutes
        } min read
      </span>
    </header>

    <div class="ed-prose"><Content /></div>
    <ProseEnhancements />

    {
      related && (
        <aside class="ed-aside" aria-label="Related paper">
          <span class="ed-aside-label">Related paper</span>
          <a href={paperLink(related.data) ?? `/publications#${related.id}`}>{related.data.title}</a>
          <span class="ed-aside-venue">{related.data.venue}</span>
        </aside>
      )
    }

    {
      (older || newer) && (
        <nav class="ed-pager" aria-label="More posts">
          {older ? <a href={`/blog/${older.id}`}>← {older.data.title}</a> : <span />}
          {newer && <a href={`/blog/${newer.id}`}>{newer.data.title} →</a>}
        </nav>
      )
    }
  </article>
</Layout>
```

- [ ] **Step 9: Route switches.** In `src/pages/cv.astro`, import `EditorialCv from '../themes/editorial/Cv.astro'` and `{ loadCvPage } from '../themes/editorial/data'`, and add `getTheme` to the config import. Add before the closing `---`:

```ts
const editorialCv = getTheme() === 'editorial' ? await loadCvPage() : null;
```

and wrap the template:

```astro
{
  editorialCv ? (
    <EditorialCv {...editorialCv} />
  ) : (
    <ClassicCv
      {config}
      {cv}
      {cvMeta}
      {hasPdf}
      {pdfHref}
      {allSections}
      hasYamlPublications={hasYamlPublications(allSections)}
      {publications}
    />
  )
}
```

In `src/pages/blog/index.astro`, import `EditorialBlog from '../../themes/editorial/Blog.astro'` and `{ loadBlog } from '../../themes/editorial/data'`, and add `getTheme` to the config import. Add before `---`: `const editorialBlog = getTheme() === 'editorial' ? await loadBlog() : null;`. The template becomes:

```astro
{editorialBlog ? <EditorialBlog {...editorialBlog} /> : <ClassicBlog {personal} {posts} {feeds} {timeline} />}
```

In `src/pages/blog/[id].astro`, add:

```ts
import EditorialPost from '../../themes/editorial/Post.astro';
import { loadPost } from '../../themes/editorial/data';
import { getTheme } from '../../lib/config';
```

and before `---`: `const editorialPost = getTheme() === 'editorial' ? await loadPost(post) : null;`. The template becomes:

```astro
{editorialPost ? <EditorialPost {...editorialPost} {ogImage} /> : <ClassicPost {post} {ogImage} />}
```

- [ ] **Step 10: Run checks to verify they pass**

Run: `pnpm test && pnpm check:themes`
Expected: PASS.

Browser check (Review Focus 2): preview `dist-editorial` on port 4322 as in Task 10. On `/blog`, click `button[data-filter="external"]` and evaluate `[...document.querySelectorAll('li[data-kind]')].filter(li => getComputedStyle(li).display !== 'none').every(li => li.dataset.kind === 'external')`. Expected `true`.

- [ ] **Step 11: Commit**

```bash
git add src/lib/cv.ts src/lib/cv.test.ts src/themes/editorial/Cv.astro src/themes/editorial/Blog.astro src/themes/editorial/Post.astro src/themes/editorial/data.ts src/pages/cv.astro src/pages/blog/index.astro 'src/pages/blog/[id].astro' scripts/check-themes.mjs
git commit -m "feat: editorial CV, writing list and post pages" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: CI, green `check`/`lint`, visual and Lighthouse verification

**Files:**
- Modify: `.github/workflows/lint.yml`, `.prettierignore`
- Modify (pre-existing `astro check` errors): `src/components/astro/SocialLinks.astro`, `src/components/astro/ProseEnhancements.astro`, `src/components/astro/Nav.astro`
- Modify (formatting only): whatever `prettier --write` touches

**Interfaces:**
- Consumes: everything above.
- Produces: green `pnpm test`, `pnpm check:themes`, `pnpm check`, `pnpm lint`; a CI job that runs the tests and builds both themes.

- [ ] **Step 1: CI.** In `.github/workflows/lint.yml`, add after the `Install dependencies` step. These steps have no `continue-on-error`, so a theme regression fails CI:

```yaml
      - name: Unit tests
        run: pnpm test

      - name: Build both themes
        run: pnpm check:themes
```

CI has no `dist-baseline/`, so the script skips the regression diff and still checks every editorial page.

- [ ] **Step 2: Fix the 14 pre-existing `astro check` errors.**
  - `src/components/astro/SocialLinks.astro`: add `import type { SocialLinks as SocialLinksConfig } from '../../lib/types';` and change the prop to `socials: SocialLinksConfig | Record<string, string | undefined>;`. This fixes the Footer and contact errors.
  - `src/components/astro/ProseEnhancements.astro`: at each of the three `await import(` calls, put `// @ts-expect-error -- remote ESM module, no type declarations` on its own line directly above the `/* @vite-ignore */ 'https://cdn.jsdelivr.net/…'` line.
  - `src/components/astro/Nav.astro`: change `function measure() {` to `const measure = () => {` and its closing `}` (just before `// Toggle dropdown`) to `};`. An arrow function keeps TypeScript's null-narrowing from the guard above; a hoisted function declaration does not.

Run: `pnpm check 2>&1 | tail -4`
Expected: `0 errors`.

- [ ] **Step 3: Formatting.** Append to `.prettierignore`:

```
# design reference and planning docs (not code)
personal-site-handoff/
HANDOFF.md
docs/superpowers/
```

Run: `pnpm prettier --write . && pnpm check:themes`
Expected: PASS. If the classic regression check fails on a file prettier reformatted (whitespace between inline elements changes rendered HTML), revert that file with `git checkout -- <file>`, add it to `.prettierignore` under a `# verbatim classic markup; reformatting changes rendered whitespace` comment, and re-run until both pass.

Run: `pnpm lint; echo "exit $?"`
Expected: `exit 0`. Existing ESLint warnings may remain.

- [ ] **Step 4: Screenshots against the mockups.** Run `pnpm check:themes`, then serve with `pnpm astro preview --outDir dist-editorial --port 4322` in the background. With the Playwright browser tools, for each of `/`, `/research`, `/publications`, `/cv`, `/blog`, `/blog/research-update-summer-2024`, at 1440×900 and at 390×844:
  - evaluate `document.documentElement.scrollWidth <= window.innerWidth` (must be `true`)
  - evaluate `document.documentElement.classList.contains('dark')` (must be `false`)
  - take a full-page screenshot named `editorial-<page>-<width>.png`
  - compare against the matching `personal-site-handoff/design/*.dc.html` markup and inline styles (Main, Research, Publications, Resume, Blog, Post): header, eyebrow/heading hierarchy, row layouts, tiles, spacing, colors. Fix mismatches in `editorial.css` or the page component and re-run `pnpm check:themes`.

Also open `/people` and `/contact` at both widths. They should be readable in the editorial palette, with no dark-mode artifacts and no horizontal scroll.

- [ ] **Step 5: Lighthouse.** With the preview server still running:

```bash
for p in "" publications; do
  pnpm dlx lighthouse "http://localhost:4322/$p" --quiet --chrome-flags="--headless=new" \
    --only-categories=performance,accessibility,best-practices,seo \
    --output=json --output-path="${TMPDIR:-/tmp}/lh-${p:-home}.json"
  node -e 'const r=require(process.argv[1]);for(const[k,v]of Object.entries(r.categories))console.log(process.argv[2],k,Math.round(v.score*100))' "${TMPDIR:-/tmp}/lh-${p:-home}.json" "${p:-home}"
done
```

Expected: every score ≥ 95. If accessibility fails, read the failing audit ids from the JSON (`audits[*].score === 0`) and fix them in the component. If performance fails on the hero figure, add `fetchpriority="high"` to the hero `<img>`. Stop the preview server when done.

- [ ] **Step 6: Final run and commit**

Run: `pnpm test && pnpm check:themes && pnpm check && pnpm lint`
Expected: all pass; `check-themes` reports every classic page matches `dist-baseline/`.

```bash
git add .github/workflows/lint.yml .prettierignore src/components/astro/SocialLinks.astro src/components/astro/ProseEnhancements.astro src/components/astro/Nav.astro
git add -u   # files reformatted by prettier (tracked files only; never -A)
git commit -m "ci: test both themes; fix pre-existing astro check errors and formatting" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

`dist-baseline/` can be deleted after the branch merges. It is gitignored.
