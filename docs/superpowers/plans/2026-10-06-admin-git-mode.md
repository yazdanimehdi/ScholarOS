# Custom Admin (Git Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Vercel, the site owner signs in with GitHub at `/<adminPath>` and edits every piece of site content; each publish is one commit to the site's repo. Static hosts keep the Sveltia admin and a purely static build.

**Architecture:** A local Astro integration injects the admin's on-demand routes (`src/admin/routes/**`, `prerender = false`) only when `VERCEL` is set, and the `@astrojs/vercel` adapter is enabled only then; otherwise the integration injects the existing Sveltia pages. API handlers validate with the same zod schemas as the content collections (`src/lib/schemas.ts`), write Markdown/YAML with order- and comment-preserving serializers, and go through a `ContentStore` interface: `GitHubStore` (Git Data API, optimistic versions = git blob shas) in production, `MemoryStore` in dev and e2e. The UI is Vue 3 islands (`client:only`) styled with the editorial tokens. The post editor is Tiptap 3 with Markdown and math.

**Tech Stack:** Astro 5.17 (`output: 'static'`), `@astrojs/vercel` 8.2, Vue 3.5, Tiptap 3.31 (`@tiptap/vue-3`, `starter-kit`, `markdown`, `extension-mathematics`, `extension-image`, `extension-table`), KaTeX 0.18, `yaml` 2.9 (Document API), zod 3 via `astro/zod`, Web Crypto, `rss-parser`, `node:test` via `tsx --test`, `happy-dom` 20 (editor test only), `@playwright/test` 1.63 (e2e).

**Spec:** `docs/superpowers/specs/2026-10-06-admin-git-mode-design.md` (sub-project 2 of 4). Mockups: `personal-site-handoff/design/{Admin,AdminEditor,AdminResume}.dc.html`. They are untracked reference material; never commit them. Downstream specs build on this plan's interfaces: `2026-10-06-postgres-mode-design.md` (sub-project 3) and `2026-10-06-jobs-design.md` (sub-project 4).

**Baseline:** `main` at `95d3898`. `pnpm test` passes.

## Decisions made while planning (deviations from the spec)

1. **Tests stay colocated.** `src/**/*.test.ts` is the repo's convention, so `pnpm test` becomes `tsx --test "src/**/*.test.ts"`. Only the RenderCV fixture lives in `tests/fixtures/`, and the e2e suite in `tests/e2e/`.
2. **One injected Astro page.** `src/admin/routes/[...path].astro` serves every admin screen: it picks the screen from the path and mounts that screen's own Vue component `client:only="vue"`. The behavior is the same as one Astro file per screen, with a tenth of the boilerplate.
3. **No `vercel.json`.** `src/middleware.ts` sets `Cache-Control: no-store` and `X-Robots-Tag: noindex` on every admin response, because `vercel.json` can't follow a custom `adminPath`. Sub-project 4 adds `vercel.json` for its crons.
4. **Contents API in JSON mode.** `GitHubStore.read` asks for the JSON media type (base64 content + blob `sha`), not the raw one. The raw response carries no sha, and the sha is the version. Text files over 1 MB are refused with 413.
5. **Build-time settings.** Vercel functions don't ship the `config/` folder, so the values the runtime needs from `config/site.yml` and `config/cms.yml` (`adminPath`, `adminUsers`, media folders, site name) are baked in at build time through a Vite `define` (`__SCHOLAROS_ADMIN__`). A change to `adminUsers` takes effect on the redeploy that its own commit triggers.
6. **New `ContentStore` method.** `ContentStore` gains `lastModified(path): Promise<string | null>` (ISO date of the last change). The Dashboard uses it for "CV last updated" and "last sync". Sub-project 3's `PostgresStore` must implement it from `updated_at`.
7. **Two extra routes.** `GET /api/admin/dashboard` returns everything the Dashboard shows in one request. `GET /api/admin/auth/dev` is the e2e session stub, injected only by `astro dev`, and it answers 404 unless `ADMIN_STORE=memory`.
8. **Two media targets.** Config-file images (editorial figure, about image, research figures, hero images) and images inside Markdown bodies upload to `public/images` and return `/images/<file>`. They render as plain `<img src>`, which matches the per-field `media_folder` overrides in `config/cms.yml`. Collection image fields (`image()`) use `media_folder`/`public_folder`.
9. **`visible` never reaches RenderCV.** `render-cv.py` strips the `visible` key from the entries it keeps, so RenderCV never sees it.
10. **Denied sign-in.** The OAuth callback redirects a non-admin to `/<adminPath>/login?error=denied`, and that page is served with HTTP 403.
11. **`list()` is recursive.** `ContentStore.list(dir)` returns files recursively, because media folders have subfolders (`src/assets/images/people/…`).
12. **Stricter inline math.** The editor uses pandoc's rule for inline math: no space after the opening `$` or before the closing `$`, and no digit right after the closing `$`. With Tiptap's default tokenizer, saving a post that contains `$500K and $1M` would turn it into math and drop a space.
13. **Feed item ids stay stable.** `syncFeeds` keeps the old script's id slug function exactly (`[^a-z0-9]+ → -`), not `utils.slugify`. Existing ids and `hidden` ids must not change.
14. **No new BibTeX test.** The spec's "BibTeX generation" test already exists: `src/lib/bibtex.test.ts` covers `bibtexFor`, which the Publications screen's Regenerate button calls. This plan adds only the e2e click (Task 18).
15. **The e2e conflict test commits through the API.** To make the stored version stale, the test commits `config/cv.yml` with `PUT /api/admin/config/cv` from the browser context, not through a test-only hook. That is the same path a second tab takes.

## Global Constraints

- Static hosts are unchanged. Without `VERCEL`, `pnpm build` writes no `.vercel/output`, and Sveltia stays at `/<adminPath>`.
- No secret reaches the browser. Server code reads `GITHUB_TOKEN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `SESSION_SECRET` from `process.env`. Nothing under `src/admin/*.vue` or `src/admin/*.ts` reads env.
- Only `adminUsers` can sign in. Entries may be usernames or `https://github.com/<user>` URLs, matched case-insensitively.
- Use `@astrojs/vercel@^8.2.11` (Astro 5). `output` stays `'static'`, and public pages stay prerendered.
- GitHub OAuth scope is `read:user`, used for identity only. Writes use the fine-grained PAT `GITHUB_TOKEN` (one repo; Contents and Actions read/write). The commit author is `<name> <<login>@users.noreply.github.com>`.
- Session cookie `scholaros_session`: AES-GCM, key derived with HKDF-SHA-256 from `SESSION_SECRET` (≥ 32 chars). `HttpOnly; Secure; SameSite=Lax; Path=/`, 7-day expiry, no refresh.
- Mutating admin API requests must carry an `Origin` equal to the site origin, else 403.
- Errors are JSON `{ error: string, details?: unknown }`. Status codes: 400 validation, 401 no session, 403 not allowed or bad Origin, 409 version conflict, 413 too large, 415 unsupported media type, 422 import failure, 502 GitHub error (the message names the missing permission).
- Path allowlist: `config/{site,research,feeds,cv,cv-upload}.yml`, `src/content/<collection>/<slug>.md`, `src/data/feeds.json`, and image files under `media_folder` or `public/images`. Slugs match `[a-z0-9-]{1,80}`; anything else, `..` or an absolute path → 400.
- Uploads: PNG, JPEG, WebP, GIF, AVIF, SVG; at most 4 MB; type sniffed from the bytes. An SVG is rejected if it contains `<script`, an `on…=` attribute, `javascript:` or `<foreignObject`. Stored name = slugified base + 6-char content hash + extension.
- YAML config files are edited with the `yaml` Document API (`lineWidth: 0`, `flowCollectionPadding: false`) so that comments, quoting and key order survive. Markdown front matter is written in schema order, with unknown keys after.
- Writers write the user's raw values. They validate with zod but never write zod's parsed output (that would turn `2024-06-01` into an ISO timestamp and strip `''`).
- Every content-model addition is optional and backward compatible: posts `featured`, CV entry `visible`, feeds `hidden`.
- Tests use `node:test` + `node:assert/strict` via `pnpm test`. The only new dev dependencies are `happy-dom` (editor test) and `@playwright/test` (e2e).
- Node 22 (`.nvmrc`), pnpm 9.
- Commits: never `git add -A`. `HANDOFF.md` and `personal-site-handoff/` stay untracked. Every commit message ends with these two lines (pass them as a second `-m`):
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JcTFTmxBtKaryWWbgMbKxh
  ```

## Review Focus

1. **Re-importing a CV.** Owners will import the same RenderCV file again after editing it. Each publication must match its existing entry (by DOI, then by normalized title) and update it in place, keeping curated fields (`topic`, `abstract`, `type`, body). It must never be duplicated. Pinned by the DOI/title match test in Task 11.
2. **Stale tabs and bot commits.** `render-cv.yml` commits `config/cv.yml` back when it syncs an upload, and a second tab can save the same file. A save from a stale version must return 409 without writing anything, keep the local draft, and offer it again after Reload. Pinned by the stale-version tests in Tasks 8, 9 and 13 and the e2e conflict test in Task 19.
3. **Hand-edited YAML.** Users keep comments, quote styles and long lines in `config/*.yml`. Saving one field must not reflow, unquote or drop anything elsewhere. Pinned by the byte-identical round-trip tests in Task 6.
4. **Dollar signs and dates in content.** `$500K and $1M` in a post is not math, and `date: 2024-06-01` must stay a plain date. Pinned by the serializer test in Task 6 (date stays plain) and the editor test in Task 15 (dollar text survives a round trip).
5. **Image paths that don't resolve.** A collection image must be `/src/assets/images/…` (processed by `image()`); a config or body image must be `/images/…` (served from `public/`). Mixing them up breaks the build or shows a broken image. Pinned by the media route test in Task 14.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/schemas.ts` (create) | Zod schemas shared by `content.config.ts` and the admin (collections + config files) |
| `src/content.config.ts` (modify) | Collections built from `schemas.ts` |
| `src/lib/feeds.ts` (create) | `syncFeeds()`: fetch, parse, merge feeds (no fs) |
| `scripts/sync-feeds.ts` (modify) | Thin fs wrapper around `syncFeeds()` |
| `scripts/render-cv.py` (modify) | Skip hidden entries; build publications from the collection |
| `scripts/test_render_cv.py` (create) | Self-check for the Python helpers |
| `src/lib/{cv,utils,config,editorial}.ts` (modify) | Hidden CV entries, hidden feed items, featured posts |
| `src/lib/admin/settings.ts` | Build-time admin settings (`adminPath`, `adminUsers`, media folders), `isAdminUser()` |
| `src/lib/admin/paths.ts` | Path allowlist and slug rules |
| `src/lib/admin/serialize.ts` | Front matter and YAML writers |
| `src/lib/admin/session.ts` | Encrypted session cookie, env helpers |
| `src/lib/admin/store.ts` | `ContentStore` types, errors, `gitBlobSha()` |
| `src/lib/admin/memory-store.ts` | `MemoryStore` (dev/e2e) |
| `src/lib/admin/github-store.ts` | `GitHubStore` + Actions helpers |
| `src/lib/admin/get-store.ts` | `getStore()` (separate file to avoid an import cycle) |
| `src/lib/admin/media.ts` | Upload sniffing, SVG checks, file names |
| `src/lib/admin/cv-import.ts` | RenderCV YAML → `cv.yml` + publications |
| `src/lib/admin/http.ts` | Route wrapper, JSON errors, allowlisted commit |
| `src/lib/admin/content.ts` | Read/list/validate collection entries and config files |
| `src/integrations/admin.ts` | Injects admin or Sveltia routes; bakes settings |
| `src/middleware.ts` | Session + Origin checks, admin response headers |
| `src/env.d.ts` | `App.Locals.user` |
| `src/admin/sveltia/` | Sveltia page + config route (moved from `src/pages/`) |
| `src/admin/routes/[...path].astro` | The one admin page; picks the screen |
| `src/admin/routes/api/**` | API routes (`auth/*`, `me`, `dashboard`, `collections/*`, `config/*`, `cv/*`, `feeds/*`, `media`) |
| `src/admin/*.vue`, `src/admin/{api,useDocument,fields,types}.ts`, `src/admin/admin.css` | Admin UI |
| `src/admin/editor/extensions.ts` | Tiptap extension list shared by the editor and its test |
| `tests/fixtures/rendercv.yaml` | RenderCV import fixture (scrubbed copy of `personal-site-handoff/cv.yaml`) |
| `tests/e2e/admin.spec.ts`, `playwright.config.ts` | E2E against `astro dev` + `MemoryStore` |
| `.github/workflows/lint.yml` (modify) | Static and Vercel builds |
| `README.md`, `.env.example`, `.gitignore` (modify/create) | Setup docs |

---

### Task 1: Shared zod schemas

**Files:**
- Create: `src/lib/schemas.ts`
- Create: `src/lib/schemas.test.ts`
- Modify: `src/content.config.ts` (whole file)
- Modify: `package.json` (`test` script)

**Interfaces:**
- Produces: `peopleSchema(image)`, `announcementsSchema(image)`, `projectsSchema(image)`, `postsSchema(image)`, `publicationsSchema(image)` (factories taking Astro's `image` or `stringImage`), `talksSchema`, `positionsSchema`, `feedItemSchema`, `stringImage`, `adminCollections: { posts, publications, announcements, people, projects, talks, positions }` (ZodObjects with string images), `cvSchema`, `siteSchema`, `researchSchema`, `feedsConfigSchema`, `cvUploadSchema`, `configSchemas: { site, research, feeds, cv, 'cv-upload' }`.

- [ ] **Step 1: Branch**

```bash
git switch -c feat/admin-git-mode
```

- [ ] **Step 2: Widen the test glob** so that tests under `src/lib/admin/`, `src/admin/` and `src/middleware.test.ts` run. In `package.json`, replace

```json
    "test": "tsx --test src/lib/*.test.ts",
```

with

```json
    "test": "tsx --test \"src/**/*.test.ts\"",
```

Run: `pnpm test`
Expected: PASS (the same tests as before; Node expands the quoted glob itself).

- [ ] **Step 3: Write the failing test** `src/lib/schemas.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { adminCollections, configSchemas, cvSchema, feedsConfigSchema } from './schemas';

const config = (file: string) => yaml.load(fs.readFileSync(`config/${file}.yml`, 'utf8'));

test('posts: featured is optional and defaults to false', () => {
  const base = { title: 'T', date: '2024-01-01' };
  assert.equal(adminCollections.posts.parse(base).featured, false);
  assert.equal(adminCollections.posts.parse({ ...base, featured: true }).featured, true);
});

test('admin collection schemas take image paths as plain strings', () => {
  const person = adminCollections.people.parse({ name: 'A', role: 'phd', photo: '/src/assets/images/a.png' });
  assert.equal(person.photo, '/src/assets/images/a.png');
  assert.equal(adminCollections.publications.safeParse({ title: 'T', authors: [], venue: 'V', year: 2024 }).success, false);
});

test('every config file in the repo passes its admin schema', () => {
  for (const [file, schema] of Object.entries(configSchemas)) {
    const result = schema.safeParse(config(file));
    assert.ok(result.success, `${file}: ${JSON.stringify(result.error?.issues)}`);
  }
});

test('cv entries: RenderCV shapes and the visible flag pass, unknown shapes fail', () => {
  const ok = (entry: unknown) => cvSchema.safeParse({ cv: { name: 'N', sections: { s: [entry] } } }).success;
  assert.ok(ok({ institution: 'U', area: 'CS', visible: false }));
  assert.ok(ok({ company: 'C', position: 'P' }));
  assert.ok(ok({ position: 'P' }));
  assert.ok(ok({ title: 'Paper', authors: ['A'] }));
  assert.ok(ok({ label: 'Languages', details: 'Python' }));
  assert.ok(ok({ name: 'Award', date: '2024' }));
  assert.ok(ok({ bullet: 'Did a thing' }));
  assert.ok(ok('A plain text entry'));
  assert.ok(!ok({ foo: 1 }));
  assert.ok(!ok({ institution: 'U', area: 'CS', visible: 'no' }));
  assert.ok(!cvSchema.safeParse({ cv: { sections: {} } }).success, 'name is required');
});

test('feeds config: hidden is a list of ids', () => {
  assert.ok(feedsConfigSchema.safeParse({ feeds: [], hidden: ['feed-1'] }).success);
  assert.ok(!feedsConfigSchema.safeParse({ hidden: 'feed-1' }).success);
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './schemas'`.

- [ ] **Step 5: Write `src/lib/schemas.ts`**

```ts
import { z } from 'astro/zod';

/** Treat empty/whitespace-only strings as absent (CMS writes '' instead of omitting). */
const emptyToUndefined = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

/** Same but with .url() validation after stripping empties. */
const optionalUrl = emptyToUndefined.pipe(z.string().url().optional());

/** Same but with .email() validation after stripping empties. */
const optionalEmail = emptyToUndefined.pipe(z.string().email().optional());

/**
 * Collection schemas take an image schema factory: content.config.ts passes Astro's `image()`, the admin
 * passes `stringImage`, so both validate the same front matter.
 */
type ImageFn<I extends z.ZodTypeAny> = () => I;
export const stringImage = () => z.string();

export const peopleSchema = <I extends z.ZodTypeAny>(image: ImageFn<I>) =>
  z.object({
    name: z.string(),
    role: z.enum(['pi', 'postdoc', 'phd', 'masters', 'undergrad', 'research-assistant', 'visiting', 'alumni']),
    title: z.string().optional(),
    photo: image().optional(),
    email: optionalEmail,
    socials: z
      .object({
        github: optionalUrl,
        scholar: optionalUrl,
        twitter: optionalUrl,
        linkedin: optionalUrl,
        orcid: optionalUrl,
        mastodon: optionalUrl,
        bluesky: optionalUrl,
        website: optionalUrl,
      })
      .optional(),
    researchInterests: z.array(z.string()).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    sortOrder: z.number().default(99),
    active: z.boolean().default(true),
  });

export const announcementsSchema = <I extends z.ZodTypeAny>(image: ImageFn<I>) =>
  z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(['paper', 'grant', 'award', 'talk', 'media', 'general']),
    pinned: z.boolean().default(false),
    featured: z.boolean().default(false),
    image: image().optional(),
    emoji: z.string().optional(),
    excerpt: z.string().optional(),
    people: z.array(z.string()).optional(),
    // The CMS writes '' for an untouched select; treat it as unset.
    datePrecision: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['day', 'month', 'year']).default('month')),
  });

export const projectsSchema = <I extends z.ZodTypeAny>(image: ImageFn<I>) =>
  z.object({
    title: z.string(),
    type: z.enum(['software', 'dataset', 'benchmark', 'hardware', 'other']),
    status: z.enum(['active', 'completed', 'upcoming']),
    image: image().optional(),
    url: optionalUrl,
    repoUrl: optionalUrl,
    paperUrl: optionalUrl,
    team: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    excerpt: z.string().optional(),
  });

export const postsSchema = <I extends z.ZodTypeAny>(image: ImageFn<I>) =>
  z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string().optional(),
    excerpt: z.string().optional(),
    coverImage: image().optional(),
    tags: z.array(z.string()).optional(),
    keywords: z.string().optional(),
    draft: z.boolean().default(false),
    /** "Show on home page": the editorial home lists featured posts first. */
    featured: z.boolean().default(false),
    subtitle: emptyToUndefined,
    relatedPublication: emptyToUndefined,
  });

export const publicationsSchema = <I extends z.ZodTypeAny>(image: ImageFn<I>) =>
  z.object({
    title: z.string(),
    authors: z.array(z.string()),
    venue: z.string(),
    year: z.number(),
    doi: emptyToUndefined,
    url: optionalUrl,
    pdf: optionalUrl,
    bibtex: z.string().optional(),
    type: z.enum(['journal', 'conference', 'preprint', 'workshop', 'thesis', 'book-chapter']),
    featured: z.boolean().default(false),
    abstract: z.string().optional(),
    image: image().optional(),
    venueShort: emptyToUndefined,
    topic: emptyToUndefined,
    note: emptyToUndefined,
    arxiv: emptyToUndefined,
    code: optionalUrl,
  });

export const positionsSchema = z.object({
  title: z.string(),
  type: z.enum(['phd', 'postdoc', 'masters', 'undergrad', 'research-assistant', 'visiting', 'other']),
  status: z.enum(['open', 'closed']),
  deadline: z.coerce.date().optional(),
  excerpt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  contact: z.string().optional(),
  sortOrder: z.number().default(99),
});

export const talksSchema = z.object({
  title: z.string(),
  event: z.string(),
  date: z.string(),
  location: z.string().optional(),
  type: z.enum(['Conference Talk', 'Invited Talk', 'Seminar', 'Tutorial', 'Workshop', 'Keynote', 'Panel']),
  slidesUrl: optionalUrl,
  videoUrl: optionalUrl,
  sortDate: z.coerce.date().optional(),
});

export const feedItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  link: z.string().url(),
  date: z.string(),
  source: z.string(),
  excerpt: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/** Collections the admin edits, keyed like src/content/<name>/. */
export const adminCollections = {
  posts: postsSchema(stringImage),
  publications: publicationsSchema(stringImage),
  announcements: announcementsSchema(stringImage),
  people: peopleSchema(stringImage),
  projects: projectsSchema(stringImage),
  talks: talksSchema,
  positions: positionsSchema,
};

// ── Config files the admin edits. Permissive: unknown keys pass through untouched. ──

const cvDetails = z.union([z.string(), z.number()]);
const cvEntry = <T extends z.ZodRawShape>(shape: T) => z.object({ visible: z.boolean().optional(), ...shape }).passthrough();

/** RenderCV entry types (camelCase keys, as cv.yml stores them); a plain string is a TextEntry. */
const cvEntrySchema = z.union([
  z.string(),
  cvEntry({ institution: z.string(), area: z.string() }), // EducationEntry
  cvEntry({ company: z.string() }), // ExperienceEntry
  cvEntry({ position: z.string() }),
  cvEntry({ title: z.string(), authors: z.array(z.string()) }), // PublicationEntry
  cvEntry({ label: z.string(), details: cvDetails }), // OneLineEntry
  cvEntry({ bullet: z.string() }), // BulletEntry
  cvEntry({ number: z.string() }), // NumberedEntry
  cvEntry({ reversedNumber: z.string() }), // ReversedNumberedEntry
  cvEntry({ name: z.string() }), // NormalEntry
]);

export const cvSchema = z
  .object({
    cv: z
      .object({
        name: z.string().min(1),
        sections: z.record(z.array(cvEntrySchema)).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const siteSchema = z
  .object({
    siteMode: z.enum(['personal', 'lab']),
    title: z.string().min(1),
    author: z.string(),
    theme: z.enum(['classic', 'editorial', '']).optional(),
    adminPath: z.string().regex(/^[a-z0-9-]*$/, 'Use lowercase letters, digits and dashes').optional(),
    adminUsers: z.array(z.string()).optional(),
    nav: z.array(z.object({ label: z.string(), href: z.string() }).passthrough()).optional(),
    homepageSections: z
      .array(z.object({ id: z.enum(['hero', 'about', 'news', 'publications', 'blog']), enabled: z.boolean() }))
      .optional(),
  })
  .passthrough();

export const researchSchema = z
  .object({
    headline: z.string().optional(),
    description: z.string().optional(),
    areas: z
      .array(
        z
          .object({
            id: z.string().optional(),
            label: z.string().optional(),
            title: z.string().min(1),
            description: z.string(),
            publications: z.array(z.string()).optional(),
            tags: z.array(z.string()).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const feedsConfigSchema = z
  .object({
    mediumUrl: z.string().optional(),
    feeds: z
      .array(
        z
          .object({
            name: z.string().min(1),
            url: z.string().url(),
            author: z.string().nullable().optional(),
            tags: z.array(z.string()).optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
    syncInterval: z.string().optional(),
    maxItemsPerFeed: z.number().int().positive().optional(),
    /** Feed item ids hidden from the site. */
    hidden: z.array(z.string()).optional(),
  })
  .passthrough();

export const cvUploadSchema = z.object({ enabled: z.boolean(), content: z.string() }).passthrough();

export const configSchemas = {
  site: siteSchema,
  research: researchSchema,
  feeds: feedsConfigSchema,
  cv: cvSchema,
  'cv-upload': cvUploadSchema,
};
```

- [ ] **Step 6: Point `src/content.config.ts` at the shared schemas** (replace the whole file)

```ts
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import {
  announcementsSchema,
  feedItemSchema,
  peopleSchema,
  positionsSchema,
  postsSchema,
  projectsSchema,
  publicationsSchema,
  talksSchema,
} from './lib/schemas';

const markdown = (dir: string) => glob({ pattern: '**/*.{md,mdx}', base: `src/content/${dir}` });

export const collections = {
  people: defineCollection({ loader: markdown('people'), schema: ({ image }) => peopleSchema(image) }),
  announcements: defineCollection({
    loader: markdown('announcements'),
    schema: ({ image }) => announcementsSchema(image),
  }),
  projects: defineCollection({ loader: markdown('projects'), schema: ({ image }) => projectsSchema(image) }),
  posts: defineCollection({ loader: markdown('posts'), schema: ({ image }) => postsSchema(image) }),
  publications: defineCollection({
    loader: markdown('publications'),
    schema: ({ image }) => publicationsSchema(image),
  }),
  talks: defineCollection({ loader: markdown('talks'), schema: talksSchema }),
  feeds: defineCollection({ loader: file('src/data/feeds.json'), schema: feedItemSchema }),
  positions: defineCollection({ loader: markdown('positions'), schema: positionsSchema }),
};
```

- [ ] **Step 7: Run the tests and both theme builds**

Run: `pnpm test && pnpm check:themes`
Expected: all tests PASS. Both themes build and the theme checks pass, which shows the collections behave as before.

- [ ] **Step 8: Commit**

```bash
git add package.json src/lib/schemas.ts src/lib/schemas.test.ts src/content.config.ts
git commit -m "refactor: share content and config zod schemas with the admin; posts gain featured"
```

---

### Task 2: Public-site content-model changes (featured posts, hidden CV entries, hidden feed items)

**Files:**
- Modify: `src/lib/editorial.ts` (`WritingItem`, new `featuredFirst()`)
- Modify: `src/lib/cv.ts:52-58` (`cvSections`)
- Modify: `src/lib/utils.ts` (new `withoutHidden()`)
- Modify: `src/lib/config.ts` (new `hiddenFeedIds()`)
- Modify: `src/themes/editorial/data.ts:46-70,104` (featured flag, hidden filter, home order)
- Modify: `src/pages/index.astro:73-77`, `src/pages/blog/index.astro:14-16`
- Modify: `config/cms.yml` (posts `featured`, CV entry `visible`, feeds `hidden`)
- Test: `src/lib/editorial.test.ts`, `src/lib/cv.test.ts`, `src/lib/utils.test.ts`, `src/lib/schemas.test.ts`

**Interfaces:**
- Consumes: `postsSchema` with `featured` (Task 1).
- Produces: `featuredFirst(items: WritingItem[]): WritingItem[]`, `withoutHidden<T extends { id: string }>(items: T[], hidden: string[]): T[]`, `hiddenFeedIds(): string[]`, and `cvSections()` now drops `visible: false` entries.

- [ ] **Step 1: Write the failing tests.** Append the following.

To `src/lib/editorial.test.ts` (add `featuredFirst` to the existing `./editorial` import):

```ts
test('featuredFirst: featured site posts lead, each group keeps its order', () => {
  const item = (href: string, featured?: boolean) => ({ kind: 'site' as const, title: href, href, date: new Date(0), featured });
  const out = featuredFirst([item('/a'), item('/b', true), item('/c'), item('/d', true)]);
  assert.deepEqual(
    out.map((i) => i.href),
    ['/b', '/d', '/a', '/c'],
  );
});
```

To `src/lib/cv.test.ts`:

```ts
test('cvSections: entries with visible: false are hidden, and a section left empty disappears', () => {
  const cv = {
    name: 'x',
    sections: {
      education: [{ institution: 'A', visible: false }, { institution: 'B' }],
      awards: [{ label: 'L', details: 'D', visible: false }],
      summary: ['text'],
    },
  } as unknown as CvData;
  assert.deepEqual(cvSections(cv), [
    ['education', [{ institution: 'B' }]],
    ['summary', ['text']],
  ]);
});
```

To `src/lib/utils.test.ts` (add `withoutHidden` to the existing `./utils` import):

```ts
test('withoutHidden drops listed feed ids only', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(withoutHidden(items, ['b', 'zzz']), [{ id: 'a' }, { id: 'c' }]);
  assert.deepEqual(withoutHidden(items, []), items);
});
```

To `src/lib/schemas.test.ts`. This test keeps Sveltia users on par with the admin:

```ts
test('Sveltia config exposes the new fields (featured, visible, hidden)', () => {
  type Field = { name: string; fields?: Field[]; field?: Field };
  type Coll = { name: string; fields?: Field[]; files?: { name: string; fields: Field[] }[] };
  const cms = yaml.load(fs.readFileSync('config/cms.yml', 'utf8')) as { collections: Coll[] };
  const names = (fields: Field[] = []) => fields.map((f) => f.name);
  const posts = cms.collections.find((c) => c.name === 'posts')!;
  assert.ok(names(posts.fields).includes('featured'));
  const files = cms.collections.find((c) => c.name === 'settings')!.files!;
  assert.ok(names(files.find((f) => f.name === 'feeds')!.fields).includes('hidden'));
  const sections = files
    .find((f) => f.name === 'cv')!
    .fields[0].fields!.find((f) => f.name === 'sections')!.fields!;
  for (const s of ['education', 'experience', 'publications', 'awards', 'skills']) {
    assert.ok(names(sections.find((f) => f.name === s)!.fields).includes('visible'), `cv ${s} has visible`);
  }
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test`
Expected: FAIL. `featuredFirst` and `withoutHidden` are not exported, the cvSections test fails because hidden entries are still listed, and the Sveltia test fails on `featured`.

- [ ] **Step 3: Implement**

`src/lib/editorial.ts`: add to `WritingItem` after `tag?: string;`:

```ts
  /** Site only: "Show on home page". */
  featured?: boolean;
```

and add after `mergeWriting()`:

```ts
/** Home page order: featured site posts first; each group keeps its newest-first order. */
export function featuredFirst(items: WritingItem[]): WritingItem[] {
  return [...items.filter((i) => i.featured), ...items.filter((i) => !i.featured)];
}
```

`src/lib/cv.ts`: replace `cvSections` with:

```ts
/** All non-empty list sections in YAML order, without entries marked `visible: false`. */
export function cvSections(cv: CvData): [string, unknown[]][] {
  return Object.entries(cv.sections ?? {}).flatMap(([key, entries]): [string, unknown[]][] => {
    if (!Array.isArray(entries)) return [];
    const shown = (entries as unknown[]).filter(
      (e) => !(typeof e === 'object' && e !== null && (e as { visible?: unknown }).visible === false),
    );
    return shown.length > 0 ? [[key, shown]] : [];
  });
}
```

`src/lib/utils.ts`: append:

```ts
/** Feed items minus the ids listed in config/feeds.yml `hidden`. */
export function withoutHidden<T extends { id: string }>(items: T[], hidden: string[]): T[] {
  const set = new Set(hidden);
  return items.filter((item) => !set.has(item.id));
}
```

`src/lib/config.ts`: append:

```ts
/** Feed item ids hidden from the site (`hidden:` in config/feeds.yml). */
export function hiddenFeedIds(): string[] {
  try {
    return loadYamlConfig<{ hidden?: string[] } | null>('feeds.yml')?.hidden ?? [];
  } catch {
    return [];
  }
}
```

`src/themes/editorial/data.ts`:
- Imports: add `hiddenFeedIds` to the `../../lib/config` import, `featuredFirst` to the `../../lib/editorial` import, and `withoutHidden` to the `../../lib/utils` import.
- In `writingItems()`: replace `const feeds = await getCollection('feeds');` with `const feeds = withoutHidden(await getCollection('feeds'), hiddenFeedIds());`, and in the site-post mapping add `featured: p.data.featured,` after `tag: p.data.tags?.[0],`.
- In `loadHome()`: replace `writing: (await writingItems()).slice(0, 3),` with `writing: featuredFirst(await writingItems()).slice(0, 3),`.

`src/pages/index.astro`: add `hiddenFeedIds` to the `../lib/config` import and `withoutHidden` to the `../lib/utils` import, then replace

```ts
  ? (await getCollection('feeds'))
```

with

```ts
  ? withoutHidden(await getCollection('feeds'), hiddenFeedIds())
```

`src/pages/blog/index.astro`: add `import { withoutHidden } from '../../lib/utils';` and add `hiddenFeedIds` to the `../../lib/config` import, then replace `const feeds = (await getCollection('feeds')).sort(` with `const feeds = withoutHidden(await getCollection('feeds'), hiddenFeedIds()).sort(`.

`config/cms.yml`:
- `posts` collection: after the `draft` field block, add
  ```yaml
      - { label: 'Show on home page', name: 'featured', widget: 'boolean', default: false, required: false }
  ```
- `settings` → file `cv` → `cv` → `sections`: append this item as the last entry of the `fields:` list of each of `education`, `experience`, `publications`, `awards` and `skills`, at the same indentation as its sibling `- { label: … }` items:
  ```yaml
  - { label: 'Visible', name: 'visible', widget: 'boolean', default: true, required: false }
  ```
- `settings` → file `feeds`: after the `maxItemsPerFeed` field, add
  ```yaml
          - label: 'Hidden feed items'
            name: 'hidden'
            widget: 'list'
            required: false
            hint: 'Ids from src/data/feeds.json to hide from the site. The custom admin manages this list.'
  ```

- [ ] **Step 4: Run tests and builds**

Run: `pnpm test && pnpm check:themes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editorial.ts src/lib/editorial.test.ts src/lib/cv.ts src/lib/cv.test.ts src/lib/utils.ts src/lib/utils.test.ts src/lib/config.ts src/lib/schemas.test.ts src/themes/editorial/data.ts src/pages/index.astro src/pages/blog/index.astro config/cms.yml
git commit -m "feat: featured posts lead the editorial home; hide CV entries and feed items"
```

---

### Task 3: `render-cv.py` skips hidden entries and builds publications from the collection

**Files:**
- Modify: `scripts/render-cv.py` (new helpers, `build_rendercv_input`, `main`)
- Create: `scripts/test_render_cv.py`

**Interfaces:**
- Produces: `drop_hidden(sections) -> dict`, `collection_publications(directory=PUBLICATIONS_DIR) -> list[dict]`, `build_rendercv_input(config, with_collection=False)`. Only the site CV passes `with_collection=True`; per-person CVs don't get the site's publications.

- [ ] **Step 1: Write the failing self-check** `scripts/test_render_cv.py`

```python
"""Self-check for render-cv.py's pure helpers. Run: python3 scripts/test_render_cv.py"""

import importlib.util
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("render_cv", Path(__file__).with_name("render-cv.py"))
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)

sections = {
    "education": [{"institution": "A", "visible": False}, {"institution": "B", "visible": True}],
    "summary": ["text"],
}
assert rc.drop_hidden(sections) == {"education": [{"institution": "B"}], "summary": ["text"]}, rc.drop_hidden(sections)

with tempfile.TemporaryDirectory() as d:
    Path(d, "a.md").write_text("---\ntitle: Old\nauthors: [X]\nvenue: V\nyear: 2020\n---\nbody\n")
    Path(d, "b.md").write_text("---\ntitle: New\nauthors: [Y, Z]\nvenue: W\nyear: 2024\ndoi: 10.1/x\n---\n")
    Path(d, "c.md").write_text("no front matter\n")
    pubs = rc.collection_publications(Path(d))
    assert [p["title"] for p in pubs] == ["New", "Old"], pubs
    assert pubs[0] == {"title": "New", "authors": ["Y", "Z"], "journal": "W", "date": "2024", "doi": "10.1/x"}, pubs[0]

hidden_only = {"cv": {"name": "N", "sections": {"experience": [{"company": "C", "position": "P", "visible": False}]}}}
out = rc.build_rendercv_input(hidden_only, with_collection=True)
assert "experience" not in out["cv"]["sections"], out
assert out["cv"]["sections"]["publications"], "filled from src/content/publications"

own_pubs = {"cv": {"name": "N", "sections": {"selected": [{"title": "T", "authors": ["A"]}]}}}
assert "publications" not in rc.build_rendercv_input(own_pubs, with_collection=True)["cv"]["sections"]
assert "publications" not in rc.build_rendercv_input(hidden_only)["cv"]["sections"], "per-person CVs stay as written"
print("render-cv self-check passed")
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `python3 scripts/test_render_cv.py`
Expected: FAIL with `AttributeError: module 'render_cv' has no attribute 'drop_hidden'`. (If PyYAML is missing, `pip install pyyaml` first.)

- [ ] **Step 3: Implement.** In `scripts/render-cv.py`:

Add after `PERSON_META_PATH = …`:

```python
PUBLICATIONS_DIR = ROOT / "src" / "content" / "publications"
```

Add after `transform_one_line_entry`:

```python
def drop_hidden(sections: dict) -> dict:
    """Remove entries marked visible: false and strip the key from the rest (RenderCV rejects unknown keys)."""
    result = {}
    for name, entries in (sections or {}).items():
        if not isinstance(entries, list):
            result[name] = entries
            continue
        kept = []
        for entry in entries:
            if isinstance(entry, dict):
                if entry.get("visible") is False:
                    continue
                entry = {k: v for k, v in entry.items() if k != "visible"}
            kept.append(entry)
        result[name] = kept
    return result


def is_publication(entry) -> bool:
    return isinstance(entry, dict) and "title" in entry and "authors" in entry


def read_front_matter(path: Path) -> dict:
    match = re.match(r"^---\r?\n(.*?)\r?\n---", path.read_text(encoding="utf-8"), re.S)
    return (yaml.safe_load(match.group(1)) or {}) if match else {}


def collection_publications(directory: Path = PUBLICATIONS_DIR) -> list:
    """RenderCV publication entries built from the publications collection, newest first."""
    entries = []
    for path in sorted(directory.glob("*.md*")):
        data = read_front_matter(path)
        if not data.get("title"):
            continue
        entry = {"title": data["title"], "authors": data.get("authors") or []}
        if data.get("venue"):
            entry["journal"] = data["venue"]
        if data.get("year"):
            entry["date"] = str(data["year"])
        if data.get("doi"):
            entry["doi"] = data["doi"]
        if data.get("url"):
            entry["url"] = data["url"]
        entries.append(entry)
    return sorted(entries, key=lambda e: e.get("date", ""), reverse=True)
```

Replace `build_rendercv_input` with:

```python
def build_rendercv_input(config: dict, with_collection: bool = False) -> dict:
    """Convert our cv.yml format to RenderCV's expected YAML input.

    with_collection: when no section lists publications, add one from src/content/publications
    (the collection is the single source of publications for the site CV).
    """
    # Convert all keys from camelCase to snake_case
    converted = convert_keys(config)

    cv = converted.get("cv", {})
    sections_raw = drop_hidden(cv.pop("sections", {}))

    if with_collection and not any(
        isinstance(entries, list) and entries and is_publication(entries[0]) for entries in sections_raw.values()
    ):
        publications = collection_publications()
        if publications:
            sections_raw["publications"] = publications

    # Transform section entries to proper RenderCV types
    cv["sections"] = transform_section_entries(sections_raw)

    result = {"cv": cv}

    # Include design settings if present
    design = converted.get("design")
    if design:
        result["design"] = design

    return result
```

In `main()`, change `rendercv_input = build_rendercv_input(config)` to `rendercv_input = build_rendercv_input(config, with_collection=True)`. Leave `render_person_cvs` calling `build_rendercv_input(config)`.

- [ ] **Step 4: Run the self-check**

Run: `python3 scripts/test_render_cv.py`
Expected: `render-cv self-check passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/render-cv.py scripts/test_render_cv.py
git commit -m "feat(render-cv): skip hidden entries; publications come from the collection"
```

---

### Task 4: Feed sync moves into `src/lib/feeds.ts`

**Files:**
- Create: `src/lib/feeds.ts`
- Create: `src/lib/feeds.test.ts`
- Modify: `scripts/sync-feeds.ts` (whole file)
- Modify: `package.json` (move `rss-parser` to `dependencies`)

**Interfaces:**
- Consumes: `FeedItem` from `src/lib/types.ts`.
- Produces: `FeedSource`, `FeedsConfig`, `FetchText = (url: string) => Promise<string>`, `SyncResult = { items: FeedItem[]; ok: number; failed: { source: string; error: string }[] }`, `feedSources(config)`, `syncFeeds(config, existing, fetchText?) → Promise<SyncResult>`. It throws `Error` when no feeds are configured or when every feed fails. Sub-project 4's daily cron calls `syncFeeds` too.

- [ ] **Step 1: Make `rss-parser` a runtime dependency** (the Vercel function needs it):

```bash
pnpm remove rss-parser && pnpm add rss-parser@^3.13.0
```

- [ ] **Step 2: Write the failing test** `src/lib/feeds.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { syncFeeds } from './feeds';
import type { FeedItem } from './types';

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items}</channel></rss>`;
const BLOG = rss(
  `<item><title>First</title><link>https://ex.com/a/</link><pubDate>Tue, 01 Oct 2024 10:00:00 GMT</pubDate>` +
    `<description>&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;</description></item>` +
    `<item><title>Second</title><link>https://ex.com/b</link><pubDate>Mon, 02 Sep 2024 10:00:00 GMT</pubDate></item>`,
);
const fetcher = (pages: Record<string, string>) => async (url: string) => {
  if (!(url in pages)) throw new Error(`HTTP 404 for ${url}`);
  return pages[url];
};

test('syncFeeds: parses items, normalizes links, keeps ids stable', async () => {
  const config = { feeds: [{ name: "Jane Smith's Blog", url: 'https://ex.com/feed', author: 'jane', tags: ['blog'] }] };
  const { items, ok, failed } = await syncFeeds(config, [], fetcher({ 'https://ex.com/feed': BLOG }));
  assert.equal(ok, 1);
  assert.deepEqual(failed, []);
  assert.deepEqual(
    items.map((i) => [i.title, i.link, i.date]),
    [
      ['First', 'https://ex.com/a', '2024-10-01'],
      ['Second', 'https://ex.com/b', '2024-09-02'],
    ],
  );
  assert.match(items[0].id, /^feed-jane-smith-s-blog-[0-9a-f]{8}$/);
  assert.equal(items[0].excerpt, 'Hello & welcome');
  assert.equal(items[0].author, 'jane');
  assert.deepEqual(items[0].tags, ['blog']);
});

test('syncFeeds: merges with existing items and injects the Medium feed', async () => {
  const existing: FeedItem[] = [{ id: 'old', title: 'Old', link: 'https://ex.com/old', date: '2023-01-01', source: 'X' }];
  const config = { mediumUrl: 'https://medium.com/feed/@me', feeds: [] };
  const { items } = await syncFeeds(config, existing, fetcher({ 'https://medium.com/feed/@me': BLOG }));
  assert.deepEqual(
    items.map((i) => i.title),
    ['First', 'Second', 'Old'],
  );
  assert.equal(items[0].source, 'Medium');
});

test('syncFeeds: one failing feed is reported, all failing throws, none configured throws', async () => {
  const config = {
    feeds: [
      { name: 'Good', url: 'https://ex.com/feed' },
      { name: 'Bad', url: 'https://bad.example/feed' },
    ],
  };
  const result = await syncFeeds(config, [], fetcher({ 'https://ex.com/feed': BLOG }));
  assert.equal(result.ok, 1);
  assert.equal(result.failed[0].source, 'Bad');
  await assert.rejects(syncFeeds(config, [], fetcher({})), /All 2 feed\(s\) failed/);
  await assert.rejects(syncFeeds({ feeds: [] }, [], fetcher({})), /No feeds configured/);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './feeds'`.

- [ ] **Step 4: Write `src/lib/feeds.ts`.** The logic moves verbatim from `scripts/sync-feeds.ts`, except that it fetches the text itself and parses it with `parseString`, so tests can pass a fake fetcher.

```ts
import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import type { FeedItem } from './types';

export interface FeedSource {
  name: string;
  url: string;
  author?: string | null;
  tags?: string[];
}

export interface FeedsConfig {
  mediumUrl?: string;
  feeds?: FeedSource[] | null;
  maxItemsPerFeed?: number;
  hidden?: string[];
}

export type FetchText = (url: string) => Promise<string>;

export interface SyncResult {
  items: FeedItem[];
  ok: number;
  failed: { source: string; error: string }[];
}

const fetchText: FetchText = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'ScholarOS feed sync' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

/** Kept byte-for-byte from the original script: item ids (and `hidden` lists) depend on it. */
function idSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function shortHash(str: string): string {
  return createHash('sha256').update(str).digest('hex').slice(0, 8);
}

function normalizeLink(link: string): string {
  return link.replace(/\/+$/, '');
}

function formatDate(dateStr: string | undefined): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  return (isNaN(d.getTime()) ? new Date() : d).toISOString().split('T')[0];
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(str: string, maxLen = 300): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

function toItems(source: FeedSource, items: Parser.Item[], maxItems: number): FeedItem[] {
  return items
    .slice(0, maxItems)
    .filter((item) => item.title && item.link)
    .map((item) => {
      const link = normalizeLink(item.link!);
      const result: FeedItem = {
        id: `feed-${idSlug(source.name)}-${shortHash(link)}`,
        title: item.title!.trim(),
        link,
        date: formatDate(item.pubDate || item.isoDate),
        source: source.name,
      };
      const excerpt = truncate(stripHtml(item.contentSnippet || item.content || item.summary || ''));
      if (excerpt) result.excerpt = excerpt;
      if (source.author) result.author = source.author;
      if (source.tags?.length) result.tags = source.tags;
      return result;
    });
}

function deduplicateByLink(items: FeedItem[]): FeedItem[] {
  const seen = new Map<string, FeedItem>();
  for (const item of items) {
    const key = normalizeLink(item.link);
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

/** Fresh items update existing ones with the same link; existing items not in the feed are kept. */
function mergeWithExisting(fresh: FeedItem[], existing: FeedItem[]): FeedItem[] {
  const existingByLink = new Map(existing.map((item) => [normalizeLink(item.link), item]));
  const merged = new Map<string, FeedItem>();
  for (const item of fresh) {
    const key = normalizeLink(item.link);
    merged.set(key, { ...existingByLink.get(key), ...item });
  }
  for (const item of existing) {
    const key = normalizeLink(item.link);
    if (!merged.has(key)) merged.set(key, item);
  }
  return [...merged.values()];
}

/** Configured feeds plus the Medium feed when `mediumUrl` is set. */
export function feedSources(config: FeedsConfig): FeedSource[] {
  const sources = [...(config.feeds ?? [])];
  if (config.mediumUrl) sources.push({ name: 'Medium', url: config.mediumUrl, author: null, tags: ['medium'] });
  return sources;
}

/** Fetches every feed and returns the merged item list, newest first. Throws when nothing could be fetched. */
export async function syncFeeds(
  config: FeedsConfig,
  existing: FeedItem[],
  fetch: FetchText = fetchText,
): Promise<SyncResult> {
  const sources = feedSources(config);
  if (sources.length === 0) throw new Error('No feeds configured in config/feeds.yml');
  const parser = new Parser();
  const fresh: FeedItem[] = [];
  const failed: SyncResult['failed'] = [];
  for (const source of sources) {
    try {
      const feed = await parser.parseString(await fetch(source.url));
      fresh.push(...toItems(source, feed.items ?? [], config.maxItemsPerFeed || 20));
    } catch (err) {
      failed.push({ source: source.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (failed.length === sources.length) {
    throw new Error(
      `All ${sources.length} feed(s) failed: ${failed.map((f) => `${f.source}: ${f.error}`).join('; ')}`,
    );
  }
  const items = mergeWithExisting(deduplicateByLink(fresh), existing).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return { items, ok: sources.length - failed.length, failed };
}
```

- [ ] **Step 5: Make `scripts/sync-feeds.ts` a thin wrapper** (replace the whole file)

```ts
#!/usr/bin/env tsx
/**
 * Sync RSS/Atom feeds: reads config/feeds.yml, writes src/data/feeds.json.
 * The logic lives in src/lib/feeds.ts (shared with the admin's "Check now").
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { syncFeeds, type FeedsConfig } from '../src/lib/feeds';
import type { FeedItem } from '../src/lib/types';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'feeds.yml');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'feeds.json');

const config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) as FeedsConfig;
const existing: FeedItem[] = fs.existsSync(OUTPUT_PATH) ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8')) : [];

try {
  const { items, ok, failed } = await syncFeeds(config, existing);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(items, null, 2) + '\n');
  const net = items.length - existing.length;
  console.log(`Feeds fetched: ${ok}/${ok + failed.length}`);
  console.log(`Total items: ${items.length}`);
  console.log(`Net change: ${net >= 0 ? '+' : ''}${net}`);
  for (const f of failed) console.warn(`WARNING: ${f.source}: ${f.error}`);
} catch (err) {
  // Nothing fetched: keep the existing data.
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/feeds.ts src/lib/feeds.test.ts scripts/sync-feeds.ts package.json pnpm-lock.yaml
git commit -m "refactor: move feed sync into src/lib/feeds.ts for the admin"
```

---

### Task 5: Admin settings and the path allowlist

**Files:**
- Create: `src/lib/admin/settings.ts`, `src/lib/admin/settings.test.ts`
- Create: `src/lib/admin/paths.ts`, `src/lib/admin/paths.test.ts`

**Interfaces:**
- Consumes: `extractGitHubUsername` from `src/lib/utils.ts`.
- Produces:
  - `AdminSettings = { adminPath; adminUsers: string[]; mediaFolder; publicFolder; siteName }`, `loadAdminSettings(root?)`, `adminSettings()`, `isAdminUser(login, adminUsers): boolean`
  - `COLLECTIONS`, `CollectionName`, `CONFIG_FILES`, `ConfigFile`, `FEEDS_JSON = 'src/data/feeds.json'`, `SITE_MEDIA = { dir: 'public/images', url: '/images' }`, `PathError`
  - `assertSlug(x): string`, `assertCollection(x): CollectionName`, `assertConfigFile(x): ConfigFile`, `collectionDir(name)`, `collectionPath(name, slug, ext = 'md')`, `configPath(file)`, `isMediaPath(p)`, `assertMediaPath(x): string`, `assertAllowed(p): void`

- [ ] **Step 1: Write the failing tests**

`src/lib/admin/settings.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isAdminUser, loadAdminSettings } from './settings';

function fixture(site: string, cms: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-settings-'));
  fs.mkdirSync(path.join(root, 'config'));
  fs.writeFileSync(path.join(root, 'config/site.yml'), site);
  fs.writeFileSync(path.join(root, 'config/cms.yml'), cms);
  return root;
}

test('loadAdminSettings reads site.yml and cms.yml', () => {
  const root = fixture(
    "siteMode: personal\nauthor: 'Dr. A'\nlabName: Lab\nadminPath: '/manage/'\nadminUsers: [alice]\n",
    "media_folder: 'src/assets/images'\npublic_folder: '/src/assets/images'\n",
  );
  assert.deepEqual(loadAdminSettings(root), {
    adminPath: 'manage',
    adminUsers: ['alice'],
    mediaFolder: 'src/assets/images',
    publicFolder: '/src/assets/images',
    siteName: 'Dr. A',
  });
});

test('loadAdminSettings defaults: admin path, empty users, lab name in lab mode', () => {
  const s = loadAdminSettings(fixture('siteMode: lab\nauthor: A\nlabName: The Lab\n', 'media_folder: public/uploads\n'));
  assert.equal(s.adminPath, 'admin');
  assert.deepEqual(s.adminUsers, []);
  assert.equal(s.siteName, 'The Lab');
  assert.equal(s.publicFolder, '/public/uploads');
});

test('isAdminUser: usernames or profile URLs, case-insensitive', () => {
  const users = ['JaneSmith', 'https://github.com/alex-chen/', '@maria'];
  assert.ok(isAdminUser('janesmith', users));
  assert.ok(isAdminUser('Alex-Chen', users));
  assert.ok(isAdminUser('maria', users));
  assert.ok(!isAdminUser('jane', users));
  assert.ok(!isAdminUser('', users));
  assert.ok(!isAdminUser('github', ['https://github.com/org/repo']));
});
```

`src/lib/admin/paths.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { PathError, assertAllowed, assertCollection, assertConfigFile, assertSlug, collectionPath } from './paths';
import { adminSettings } from './settings';

const media = adminSettings().mediaFolder;

test('slugs: lowercase ascii letters, digits and dashes, 1–80 chars', () => {
  for (const ok of ['a', 'my-post-2', 'x'.repeat(80)]) assert.equal(assertSlug(ok), ok);
  const bad = ['', 'x'.repeat(81), 'Upper', 'with space', '../etc', 'a/b', 'café', 'ünï', '.hidden', 'a.md', '/abs', null, 42];
  for (const b of bad) assert.throws(() => assertSlug(b), PathError, String(b));
});

test('collections and config files are allowlisted by name', () => {
  assert.equal(assertCollection('posts'), 'posts');
  assert.throws(() => assertCollection('feeds'), PathError);
  assert.throws(() => assertCollection('../posts'), PathError);
  assert.equal(assertConfigFile('cv-upload'), 'cv-upload');
  assert.throws(() => assertConfigFile('cms'), PathError);
  assert.equal(collectionPath('posts', 'hello'), 'src/content/posts/hello.md');
  assert.throws(() => collectionPath('posts', 'Hello'), PathError);
});

test('assertAllowed accepts exactly the admin-writable paths', () => {
  const ok = [
    'config/site.yml',
    'config/cv-upload.yml',
    'src/content/posts/hello.md',
    'src/content/announcements/grant-2025.md',
    'src/data/feeds.json',
    `${media}/fig-abc123.png`,
    `${media}/people/jane.jpg`,
    'public/images/fig.svg',
  ];
  for (const p of ok) assert.doesNotThrow(() => assertAllowed(p), p);
  const bad = [
    'config/scholar.yml',
    'config/cms.yml',
    'src/content/posts/hello.mdx',
    'src/content/secret/x.md',
    'src/content/posts/UPPER.md',
    'src/content/posts/../../package.json',
    '/etc/passwd',
    'package.json',
    '.github/workflows/deploy.yml',
    `${media}/../x.png`,
    `${media}/.env.png`,
    `${media}/notes.txt`,
    'public/images/x.html',
    'public/index.html',
  ];
  for (const p of bad) assert.throws(() => assertAllowed(p), PathError, p);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './settings'` and `'./paths'`.

- [ ] **Step 3: Write `src/lib/admin/settings.ts`**

```ts
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

/** adminUsers entries may be usernames, @usernames or https://github.com/<user> URLs; logins are case-insensitive. */
export function isAdminUser(login: string, adminUsers: string[]): boolean {
  const wanted = login.trim().toLowerCase();
  if (!wanted) return false;
  return adminUsers.some(
    (entry) =>
      (extractGitHubUsername(entry) ?? entry)
        .trim()
        .replace(/^@/, '')
        .toLowerCase() === wanted,
  );
}
```

- [ ] **Step 4: Write `src/lib/admin/paths.ts`**

```ts
import { adminSettings } from './settings';

export const COLLECTIONS = ['posts', 'publications', 'announcements', 'people', 'projects', 'talks', 'positions'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];
export const CONFIG_FILES = ['site', 'research', 'feeds', 'cv', 'cv-upload'] as const;
export type ConfigFile = (typeof CONFIG_FILES)[number];
export const FEEDS_JSON = 'src/data/feeds.json';
/** Images referenced by plain URLs (config files, Markdown bodies): served from public/. */
export const SITE_MEDIA = { dir: 'public/images', url: '/images' };

/** A path or name outside the allowlist; the API answers 400. */
export class PathError extends Error {}

const SLUG = /^[a-z0-9-]{1,80}$/;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const IMAGE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

export function assertSlug(slug: unknown): string {
  if (typeof slug !== 'string' || !SLUG.test(slug)) {
    throw new PathError('A slug is 1–80 lowercase letters, digits or dashes');
  }
  return slug;
}

export function assertCollection(name: unknown): CollectionName {
  if (!COLLECTIONS.includes(name as CollectionName)) throw new PathError(`Unknown collection "${String(name)}"`);
  return name as CollectionName;
}

export function assertConfigFile(file: unknown): ConfigFile {
  if (!CONFIG_FILES.includes(file as ConfigFile)) throw new PathError(`Unknown config file "${String(file)}"`);
  return file as ConfigFile;
}

export const collectionDir = (name: CollectionName) => `src/content/${name}`;
export const collectionPath = (name: CollectionName, slug: string, ext: 'md' | 'mdx' = 'md') =>
  `${collectionDir(name)}/${assertSlug(slug)}.${ext}`;
export const configPath = (file: ConfigFile) => `config/${file}.yml`;

/** An image file inside `dir` whose every segment is a plain name (no dot-files, so no `..`). */
function isImageUnder(path: string, dir: string): boolean {
  return (
    path.startsWith(`${dir}/`) &&
    IMAGE.test(path) &&
    path
      .slice(dir.length + 1)
      .split('/')
      .every((segment) => SEGMENT.test(segment))
  );
}

export function isMediaPath(path: string): boolean {
  return isImageUnder(path, adminSettings().mediaFolder) || isImageUnder(path, SITE_MEDIA.dir);
}

export function assertMediaPath(path: unknown): string {
  if (typeof path !== 'string' || !isMediaPath(path)) throw new PathError('Not a media file path');
  return path;
}

/** The write allowlist: every path the admin may commit. */
export function assertAllowed(path: string): void {
  if (CONFIG_FILES.some((file) => path === configPath(file)) || path === FEEDS_JSON || isMediaPath(path)) return;
  const entry = /^src\/content\/([^/]+)\/([^/]+)\.md$/.exec(path);
  if (entry && COLLECTIONS.includes(entry[1] as CollectionName) && SLUG.test(entry[2])) return;
  throw new PathError(`Path not allowed: ${path}`);
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/settings.ts src/lib/admin/settings.test.ts src/lib/admin/paths.ts src/lib/admin/paths.test.ts
git commit -m "feat(admin): settings loader, admin user check and path allowlist"
```

---

### Task 6: Serializers (front matter in schema order, comment-preserving YAML)

**Files:**
- Create: `src/lib/admin/serialize.ts`, `src/lib/admin/serialize.test.ts`
- Modify: `package.json` (add `yaml`)

**Interfaces:**
- Produces: `parseMarkdown(text): { data: Record<string, unknown>; body: string }`, `serializeMarkdown(data, body, keyOrder: string[]): string`, `updateYaml(source: string, next: unknown): string`.

- [ ] **Step 1: Add the dependency**

```bash
pnpm add yaml@^2.9.1
```

- [ ] **Step 2: Write the failing test** `src/lib/admin/serialize.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { parseMarkdown, serializeMarkdown, updateYaml } from './serialize';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const comments = (src: string) =>
  src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('#'));

test('front matter: schema order first, unknown keys after, raw values kept', () => {
  const text = serializeMarkdown({ zeta: 1, date: '2024-06-01', title: 'Hello', draft: false }, 'Body\n', [
    'title',
    'date',
    'draft',
  ]);
  assert.equal(text, '---\ntitle: Hello\ndate: 2024-06-01\ndraft: false\nzeta: 1\n---\n\nBody\n');
});

test('front matter: no front matter, empty body, undefined values', () => {
  assert.deepEqual(parseMarkdown('Just text'), { data: {}, body: 'Just text' });
  assert.equal(serializeMarkdown({ title: 'T', gone: undefined }, '', ['title']), '---\ntitle: T\n---\n');
});

test('front matter: parse → serialize keeps every content file’s data and body', () => {
  const dir = 'src/content';
  for (const collection of fs.readdirSync(dir)) {
    for (const file of fs.readdirSync(path.join(dir, collection)).filter((f) => f.endsWith('.md'))) {
      const { data, body } = parseMarkdown(read(path.join(dir, collection, file)));
      const again = parseMarkdown(serializeMarkdown(data, body, []));
      assert.deepEqual(again.data, data, `${collection}/${file} data`);
      assert.equal(again.body.trim(), body.trim(), `${collection}/${file} body`);
    }
  }
});

test('updateYaml: an unchanged document comes back byte-identical', () => {
  for (const file of ['cv', 'research', 'feeds', 'cv-upload']) {
    const src = read(`config/${file}.yml`);
    assert.equal(updateYaml(src, parse(src)), src, file);
  }
  // site.yml: the yaml library re-indents one comment that follows a nested map; content and comments survive.
  const site = read('config/site.yml');
  const out = updateYaml(site, parse(site));
  assert.deepEqual(parse(out), parse(site));
  assert.deepEqual(comments(out), comments(site));
});

test('updateYaml: edits touch only the changed lines and keep comments and quoting', () => {
  const src = read('config/cv.yml');
  const data = parse(src);
  data.cv.name = 'Dr. Changed';
  delete data.cv.phone;
  data.cv.sections.education.pop();
  data.cv.sections.awards.push({ label: 'New Award', details: '2025' });
  const out = updateYaml(src, data);
  assert.deepEqual(parse(out), data);
  assert.deepEqual(comments(out), comments(src));
  assert.ok(out.includes("  name: 'Dr. Changed'"), 'existing single-quote style kept');
  assert.ok(!out.includes('phone:'));
  const unchanged = src.split('\n').filter((l) => !/name:|phone:|Another University|Mathematics|B\.S\.|2004-09|2008-05/.test(l));
  for (const line of unchanged) assert.ok(out.includes(line), `kept: ${line}`);
});

test('updateYaml: empty source and new keys', () => {
  assert.equal(updateYaml('', { enabled: false, content: '' }), 'enabled: false\ncontent: ""\n');
  const feeds = updateYaml(read('config/feeds.yml'), { ...parse(read('config/feeds.yml')), hidden: ['feed-1'] });
  assert.ok(feeds.endsWith('hidden:\n  - feed-1\n'));
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './serialize'`.

- [ ] **Step 4: Write `src/lib/admin/serialize.ts`**

```ts
import { isDeepStrictEqual } from 'node:util';
import { type Document, parse, parseDocument, stringify } from 'yaml';

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;
/** No folding (keeps long lines as written), no padding inside [flow, lists]: matches the repo's files. */
const YAML_OUT = { lineWidth: 0, flowCollectionPadding: false } as const;

export function parseMarkdown(text: string): { data: Record<string, unknown>; body: string } {
  const match = FRONT_MATTER.exec(text);
  if (!match) return { data: {}, body: text };
  return { data: (parse(match[1]) ?? {}) as Record<string, unknown>, body: match[2].replace(/^\r?\n/, '') };
}

/** `---\n<yaml>---\n\n<body>`: keys in `keyOrder` first, then the rest in their existing order. */
export function serializeMarkdown(data: Record<string, unknown>, body: string, keyOrder: string[]): string {
  const ordered: Record<string, unknown> = {};
  for (const key of [...keyOrder, ...Object.keys(data)]) {
    if (!(key in ordered) && data[key] !== undefined) ordered[key] = data[key];
  }
  const yaml = Object.keys(ordered).length > 0 ? stringify(ordered, YAML_OUT) : '';
  const text = body.replace(/^\s*\n/, '').trimEnd();
  return `---\n${yaml}---\n${text ? `\n${text}\n` : ''}`;
}

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Applies the difference between `prev` and `next` to the document node at `path`, recursing into maps and lists. */
function apply(doc: Document, path: (string | number)[], prev: unknown, next: unknown): void {
  if (isMap(prev) && isMap(next)) {
    for (const key of Object.keys(prev)) if (next[key] === undefined) doc.deleteIn([...path, key]);
    for (const [key, value] of Object.entries(next)) if (value !== undefined) apply(doc, [...path, key], prev[key], value);
    return;
  }
  if (Array.isArray(prev) && Array.isArray(next)) {
    for (let i = prev.length - 1; i >= next.length; i--) doc.deleteIn([...path, i]);
    next.forEach((value, i) => (i < prev.length ? apply(doc, [...path, i], prev[i], value) : doc.addIn(path, value)));
    return;
  }
  if (!isDeepStrictEqual(prev, next)) doc.setIn(path, next);
}

/** Rewrites a YAML file to hold `next`, keeping comments, key order and the quoting of untouched values. */
export function updateYaml(source: string, next: unknown): string {
  const doc = parseDocument(source);
  if (doc.contents === null) doc.contents = doc.createNode(next);
  else apply(doc, [], doc.toJS(), next);
  return doc.toString(YAML_OUT);
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/admin/serialize.ts src/lib/admin/serialize.test.ts
git commit -m "feat(admin): front matter and comment-preserving YAML writers"
```

---

### Task 7: Encrypted session cookie

**Files:**
- Create: `src/lib/admin/session.ts`, `src/lib/admin/session.test.ts`

**Interfaces:**
- Produces: `SessionUser = { login; name; avatar }`, `SESSION_COOKIE = 'scholaros_session'`, `OAUTH_STATE_COOKIE`, `SESSION_TTL` (seconds), `SESSION_COOKIE_OPTIONS`, `sealSession(user, secret, now?) → Promise<string>`, `openSession(token, secret, now?) → Promise<SessionUser | null>`, `sessionSecret(): string` (throws if < 32 chars), `oauthEnv(): { clientId; clientSecret }`.

- [ ] **Step 1: Write the failing test** `src/lib/admin/session.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_TTL, openSession, sealSession, sessionSecret } from './session';

const SECRET = 'a'.repeat(32);
const user = { login: 'jane', name: 'Jane', avatar: 'https://avatars.example/x' };

test('seal → open round trip', async () => {
  assert.deepEqual(await openSession(await sealSession(user, SECRET), SECRET), user);
});

test('tampered, wrong-key and malformed tokens are rejected', async () => {
  const token = await sealSession(user, SECRET);
  const i = token.length - 2;
  const flipped = token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1);
  assert.equal(await openSession(flipped, SECRET), null);
  assert.equal(await openSession(token, 'b'.repeat(32)), null);
  assert.equal(await openSession('not-a-token', SECRET), null);
  assert.equal(await openSession('', SECRET), null);
});

test('sessions expire after 7 days', async () => {
  const now = Date.UTC(2026, 0, 1);
  const token = await sealSession(user, SECRET, now);
  assert.deepEqual(await openSession(token, SECRET, now + SESSION_TTL * 1000 - 1000), user);
  assert.equal(await openSession(token, SECRET, now + SESSION_TTL * 1000 + 1000), null);
});

test('a short SESSION_SECRET is refused', async () => {
  await assert.rejects(sealSession(user, 'short'), /at least 32/);
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'short';
  try {
    assert.throws(() => sessionSecret(), /at least 32/);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './session'`.

- [ ] **Step 3: Write `src/lib/admin/session.ts`**

```ts
export interface SessionUser {
  login: string;
  name: string;
  avatar: string;
}

export const SESSION_COOKIE = 'scholaros_session';
export const OAUTH_STATE_COOKIE = 'scholaros_oauth_state';
/** Seconds. Sessions are never refreshed: sign in again after a week. */
export const SESSION_TTL = 7 * 24 * 60 * 60;
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL,
} as const;

const encoder = new TextEncoder();

async function sessionKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  const base = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('scholaros-session'), info: encoder.encode('v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** `base64url(iv ‖ AES-GCM(JSON { login, name, avatar, exp }))`. */
export async function sealSession(user: SessionUser, secret: string, now = Date.now()): Promise<string> {
  const key = await sessionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const exp = Math.floor(now / 1000) + SESSION_TTL;
  const payload = encoder.encode(JSON.stringify({ login: user.login, name: user.name, avatar: user.avatar, exp }));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload));
  return Buffer.concat([iv, sealed]).toString('base64url');
}

/** The session's user, or null when the token is tampered with, from another key, malformed or expired. */
export async function openSession(token: string, secret: string, now = Date.now()): Promise<SessionUser | null> {
  const key = await sessionKey(secret);
  try {
    const raw = Buffer.from(token, 'base64url');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, key, raw.subarray(12));
    const p = JSON.parse(new TextDecoder().decode(plain)) as SessionUser & { exp: unknown };
    if (typeof p.exp !== 'number' || p.exp * 1000 <= now || typeof p.login !== 'string') return null;
    return { login: p.login, name: p.name, avatar: p.avatar };
  } catch {
    return null;
  }
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters');
  return secret;
}

export function oauthEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set');
  return { clientId, clientSecret };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/session.ts src/lib/admin/session.test.ts
git commit -m "feat(admin): AES-GCM session cookie with HKDF key"
```

---

### Task 8: `ContentStore` interface and `MemoryStore`

**Files:**
- Create: `src/lib/admin/store.ts`, `src/lib/admin/memory-store.ts`, `src/lib/admin/memory-store.test.ts`

**Interfaces:**
- Produces:
  - `StoredFile = { path; content; version }`
  - `Change = { path; content: string | null; encoding?: 'utf-8' | 'base64' }`
  - `Author = { name; email }`
  - `ContentStore { list(dir); read(path); commit(changes, message, base); lastModified(path) }`
  - `ConflictError(path)`, `UpstreamError(message, status = 502)`, `gitBlobSha(content: string | Uint8Array, encoding?) → string`
  - `MemoryStore(root = process.cwd())` with `log: { id; message; paths }[]`, and `memoryStore()` (one per process).

  A version is always the git blob sha of the file's bytes. That lets the API return the new version of a file it just wrote without asking the store again.

- [ ] **Step 1: Write the failing test** `src/lib/admin/memory-store.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from './memory-store';
import { ConflictError, gitBlobSha } from './store';

function tree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-store-'));
  const write = (p: string, content: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), content);
  };
  write('config/feeds.yml', 'maxItemsPerFeed: 20\n');
  write('src/content/posts/old.md', '---\ntitle: Old\n---\n');
  write('src/assets/images/people/jane.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return root;
}

test('gitBlobSha matches git', () => {
  assert.equal(gitBlobSha('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.equal(gitBlobSha(Buffer.from('hello\n').toString('base64'), 'base64'), gitBlobSha('hello\n'));
});

test('reads fall through to disk; list is recursive', async () => {
  const root = tree();
  const store = new MemoryStore(root);
  const file = await store.read('config/feeds.yml');
  assert.equal(file?.content, 'maxItemsPerFeed: 20\n');
  assert.equal(file?.version, gitBlobSha('maxItemsPerFeed: 20\n'));
  assert.equal(await store.read('missing.md'), null);
  assert.deepEqual(
    (await store.list('src/assets/images')).map((f) => f.path),
    ['src/assets/images/people/jane.png'],
  );
  assert.deepEqual(await store.list('nope'), []);
});

test('commit: create, update and delete in one commit; disk untouched', async () => {
  const root = tree();
  const store = new MemoryStore(root);
  const feeds = (await store.read('config/feeds.yml'))!;
  const old = (await store.read('src/content/posts/old.md'))!;
  const result = await store.commit(
    [
      { path: 'config/feeds.yml', content: 'hidden: []\n' },
      { path: 'src/content/posts/new.md', content: '---\ntitle: New\n---\n' },
      { path: 'src/content/posts/old.md', content: null },
    ],
    'Edit',
    { 'config/feeds.yml': feeds.version, 'src/content/posts/new.md': null, 'src/content/posts/old.md': old.version },
  );
  assert.equal(result.id, 'memory-1');
  assert.deepEqual(store.log, [{ id: 'memory-1', message: 'Edit', paths: ['config/feeds.yml', 'src/content/posts/new.md', 'src/content/posts/old.md'] }]);
  assert.equal((await store.read('config/feeds.yml'))?.version, gitBlobSha('hidden: []\n'));
  assert.deepEqual(
    (await store.list('src/content/posts')).map((f) => f.path),
    ['src/content/posts/new.md'],
  );
  assert.ok(await store.lastModified('config/feeds.yml'));
  assert.equal(fs.readFileSync(path.join(root, 'config/feeds.yml'), 'utf8'), 'maxItemsPerFeed: 20\n');
});

test('commit: one stale version fails the whole commit', async () => {
  const store = new MemoryStore(tree());
  await assert.rejects(
    store.commit(
      [
        { path: 'src/content/posts/x.md', content: 'x' },
        { path: 'config/feeds.yml', content: 'y' },
      ],
      'Edit',
      { 'src/content/posts/x.md': null, 'config/feeds.yml': 'stale' },
    ),
    (e) => e instanceof ConflictError && e.path === 'config/feeds.yml',
  );
  assert.equal(await store.read('src/content/posts/x.md'), null);
  await assert.rejects(store.commit([{ path: 'src/content/posts/old.md', content: 'z' }], 'Edit', {}), ConflictError);
  assert.equal(store.log.length, 0);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './memory-store'`.

- [ ] **Step 3: Write `src/lib/admin/store.ts`**

```ts
import { createHash } from 'node:crypto';

export interface StoredFile {
  path: string;
  content: string;
  /** Git blob sha (GitHub, memory) or row version (Postgres, sub-project 3). */
  version: string;
}

export interface Change {
  path: string;
  /** null deletes the file. */
  content: string | null;
  encoding?: 'utf-8' | 'base64';
}

export interface Author {
  name: string;
  email: string;
}

export interface ContentStore {
  /** Files under `dir`, recursively; [] when the folder doesn't exist. */
  list(dir: string): Promise<{ path: string; version: string }[]>;
  read(path: string): Promise<StoredFile | null>;
  /**
   * One atomic commit. `base[path]` is the version the caller started from (null or missing: the file must not
   * exist yet). Any mismatch throws ConflictError and writes nothing.
   */
  commit(changes: Change[], message: string, base: Record<string, string | null>): Promise<{ id: string; url?: string }>;
  /** ISO time of the last change to `path`, or null when unknown. */
  lastModified(path: string): Promise<string | null>;
}

export class ConflictError extends Error {
  constructor(readonly path: string) {
    super(`${path} changed since you opened it`);
  }
}

/** The backing store failed; `status` is what the admin API answers with. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** The sha git assigns to a blob with these bytes: the version of a file the admin just wrote. */
export function gitBlobSha(content: string | Uint8Array, encoding: 'utf-8' | 'base64' = 'utf-8'): string {
  const bytes =
    typeof content === 'string' ? Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8') : Buffer.from(content);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
```

- [ ] **Step 4: Write `src/lib/admin/memory-store.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { ConflictError, gitBlobSha, type Change, type ContentStore, type StoredFile } from './store';

type Overlay = { content: string; encoding: 'utf-8' | 'base64' } | null;

/** The working tree plus in-memory edits: reads fall through to disk, commits never touch it. Dev and tests only. */
export class MemoryStore implements ContentStore {
  private overlay = new Map<string, Overlay>();
  private modified = new Map<string, string>();
  /** Every commit, oldest first. */
  readonly log: { id: string; message: string; paths: string[] }[] = [];

  constructor(private root = process.cwd()) {}

  private version(p: string): string | null {
    if (this.overlay.has(p)) {
      const file = this.overlay.get(p);
      return file ? gitBlobSha(file.content, file.encoding) : null;
    }
    try {
      return gitBlobSha(fs.readFileSync(path.join(this.root, p)));
    } catch {
      return null;
    }
  }

  async read(p: string): Promise<StoredFile | null> {
    const version = this.version(p);
    if (version === null) return null;
    const file = this.overlay.get(p);
    const content = file
      ? Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8')
      : fs.readFileSync(path.join(this.root, p), 'utf8');
    return { path: p, content, version };
  }

  async list(dir: string): Promise<{ path: string; version: string }[]> {
    const paths = new Set<string>();
    const walk = (d: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(path.join(this.root, d), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) walk(`${d}/${e.name}`);
        else if (e.isFile()) paths.add(`${d}/${e.name}`);
      }
    };
    walk(dir);
    for (const p of this.overlay.keys()) if (p.startsWith(`${dir}/`)) paths.add(p);
    return [...paths].sort().flatMap((p) => {
      const version = this.version(p);
      return version ? [{ path: p, version }] : [];
    });
  }

  async commit(changes: Change[], message: string, base: Record<string, string | null>) {
    for (const c of changes) if (this.version(c.path) !== (base[c.path] ?? null)) throw new ConflictError(c.path);
    const now = new Date().toISOString();
    for (const c of changes) {
      this.overlay.set(c.path, c.content === null ? null : { content: c.content, encoding: c.encoding ?? 'utf-8' });
      this.modified.set(c.path, now);
    }
    const id = `memory-${this.log.length + 1}`;
    this.log.push({ id, message, paths: changes.map((c) => c.path) });
    return { id };
  }

  async lastModified(p: string): Promise<string | null> {
    return this.modified.get(p) ?? null;
  }
}

const holder = globalThis as { __scholarosMemoryStore?: MemoryStore };

/** One store per dev-server process, so edits survive across requests and Vite module reloads. */
export function memoryStore(): MemoryStore {
  return (holder.__scholarosMemoryStore ??= new MemoryStore());
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/store.ts src/lib/admin/memory-store.ts src/lib/admin/memory-store.test.ts
git commit -m "feat(admin): ContentStore interface and in-memory store"
```

---

### Task 9: `GitHubStore` and `getStore()`

**Files:**
- Create: `src/lib/admin/github-store.ts`, `src/lib/admin/github-store.test.ts`
- Create: `src/lib/admin/get-store.ts`

**Interfaces:**
- Consumes: `ContentStore`, `ConflictError`, `UpstreamError`, `Author`, `Change` (Task 8); `memoryStore()` (Task 8).
- Produces:
  - `GitHubConfig = { token; owner; repo; branch }`, `githubConfig(env)` (throws `UpstreamError(…, 500)` when unset)
  - `GitHubStore(cfg, author?, fetchFn = fetch)` with the `ContentStore` methods plus `dispatchWorkflow(file): Promise<void>`, `latestRun(file): Promise<WorkflowRun | null>` and `capabilities(): Promise<{ contents: boolean; actions: boolean; error?: string }>`
  - `WorkflowRun = { status; conclusion: string | null; url; createdAt }`
  - `getStore(author): ContentStore`, `setStoreForTests(factory | null)`

- [ ] **Step 1: Write the failing test** `src/lib/admin/github-store.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubStore, githubConfig } from './github-store';
import { ConflictError, UpstreamError } from './store';

type Reply = { status?: number; json?: unknown; headers?: Record<string, string> };
type Call = { method: string; path: string; body?: Record<string, any> };

/** Routes are "METHOD /path?query" relative to /repos/o/r; unmatched requests get 404. */
function fakeGitHub(routes: Record<string, (body: any, n: number) => Reply>) {
  const calls: Call[] = [];
  const counts = new Map<string, number>();
  const fetchFn = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const path = url.pathname.replace('/repos/o/r', '') + url.search;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    const reply = routes[key]?.(body, n) ?? { status: 404, json: { message: 'Not Found' } };
    return new Response(reply.json === undefined ? null : JSON.stringify(reply.json), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json', ...reply.headers },
    });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const cfg = { token: 't', owner: 'o', repo: 'r', branch: 'main' };
const author = { name: 'Jane', email: 'jane@users.noreply.github.com' };
const commitRoutes = (patch: (n: number) => Reply = () => ({ json: {} })) => ({
  'GET /git/ref/heads/main': () => ({ json: { object: { sha: 'head1' } } }),
  'GET /git/commits/head1': () => ({ json: { tree: { sha: 'tree1' } } }),
  'GET /contents/config/cv.yml?ref=head1': () => ({ json: { type: 'file', sha: 'cvsha' } }),
  'POST /git/blobs': (_: unknown, n: number) => ({ status: 201, json: { sha: `blob${n}` } }),
  'POST /git/trees': () => ({ status: 201, json: { sha: 'tree2' } }),
  'POST /git/commits': () => ({ status: 201, json: { sha: 'c2', html_url: 'https://github.com/o/r/commit/c2' } }),
  'PATCH /git/refs/heads/main': (_: unknown, n: number) => patch(n),
});

test('commit: blobs → tree on the head → commit with author → fast-forward ref', async () => {
  const { fetchFn, calls } = fakeGitHub(commitRoutes());
  const store = new GitHubStore(cfg, author, fetchFn);
  const result = await store.commit(
    [
      { path: 'config/cv.yml', content: 'cv: {}\n' },
      { path: 'src/content/posts/new.md', content: '---\ntitle: N\n---\n' },
      { path: 'public/images/x.png', content: 'iVBORw==', encoding: 'base64' },
    ],
    'Update CV',
    { 'config/cv.yml': 'cvsha', 'src/content/posts/new.md': null, 'public/images/x.png': null },
  );
  assert.deepEqual(result, { id: 'c2', url: 'https://github.com/o/r/commit/c2' });
  const blobs = calls.filter((c) => c.path === '/git/blobs').map((c) => c.body!.encoding);
  assert.deepEqual(blobs.sort(), ['base64', 'utf-8', 'utf-8']);
  const tree = calls.find((c) => c.path === '/git/trees')!.body!;
  assert.equal(tree.base_tree, 'tree1');
  assert.deepEqual(
    tree.tree.map((e: { path: string; mode: string }) => [e.path, e.mode]),
    [
      ['config/cv.yml', '100644'],
      ['src/content/posts/new.md', '100644'],
      ['public/images/x.png', '100644'],
    ],
  );
  const commit = calls.find((c) => c.method === 'POST' && c.path === '/git/commits')!.body!;
  assert.deepEqual(commit.parents, ['head1']);
  assert.equal(commit.message, 'Update CV');
  assert.equal(commit.author.email, 'jane@users.noreply.github.com');
  assert.deepEqual(calls.find((c) => c.method === 'PATCH')!.body, { sha: 'c2', force: false });
});

test('commit: a deletion is a null tree entry', async () => {
  const { fetchFn, calls } = fakeGitHub(commitRoutes());
  await new GitHubStore(cfg, author, fetchFn).commit([{ path: 'config/cv.yml', content: null }], 'Delete', {
    'config/cv.yml': 'cvsha',
  });
  assert.deepEqual(calls.find((c) => c.path === '/git/trees')!.body!.tree, [
    { path: 'config/cv.yml', mode: '100644', type: 'blob', sha: null },
  ]);
  assert.ok(!calls.some((c) => c.path === '/git/blobs'));
});

test('commit: a stale version is a conflict and nothing is written', async () => {
  const { fetchFn, calls } = fakeGitHub(commitRoutes());
  await assert.rejects(
    new GitHubStore(cfg, author, fetchFn).commit([{ path: 'config/cv.yml', content: 'x' }], 'm', {
      'config/cv.yml': 'old',
    }),
    ConflictError,
  );
  await assert.rejects(
    new GitHubStore(cfg, author, fetchFn).commit([{ path: 'config/cv.yml', content: 'x' }], 'm', {}),
    ConflictError,
    'missing base means "must not exist"',
  );
  assert.ok(!calls.some((c) => c.method !== 'GET'));
});

test('commit: a ref race is retried once from the top, then reported as a conflict', async () => {
  const race: Reply = { status: 422, json: { message: 'Update is not a fast forward' } };
  const once = fakeGitHub(commitRoutes((n) => (n === 1 ? race : { json: {} })));
  const ok = await new GitHubStore(cfg, author, once.fetchFn).commit([{ path: 'config/cv.yml', content: 'x' }], 'm', {
    'config/cv.yml': 'cvsha',
  });
  assert.equal(ok.id, 'c2');
  assert.equal(once.calls.filter((c) => c.path === '/git/ref/heads/main').length, 2);

  const always = fakeGitHub(commitRoutes(() => race));
  await assert.rejects(
    new GitHubStore(cfg, author, always.fetchFn).commit([{ path: 'config/cv.yml', content: 'x' }], 'm', {
      'config/cv.yml': 'cvsha',
    }),
    ConflictError,
  );
});

test('a 403 becomes a 502 naming the missing permission', async () => {
  const { fetchFn } = fakeGitHub({
    'GET /git/ref/heads/main': () => ({
      status: 403,
      json: { message: 'Resource not accessible by personal access token' },
      headers: { 'x-accepted-github-permissions': 'contents=write' },
    }),
  });
  await assert.rejects(
    new GitHubStore(cfg, author, fetchFn).commit([{ path: 'config/cv.yml', content: 'x' }], 'm', {}),
    (e) => e instanceof UpstreamError && e.status === 502 && /contents=write/.test(e.message) && /o\/r/.test(e.message),
  );
});

test('read decodes base64 and returns the blob sha; missing files are null', async () => {
  const { fetchFn } = fakeGitHub({
    'GET /contents/config/site.yml?ref=main': () => ({
      json: { type: 'file', sha: 's1', encoding: 'base64', content: Buffer.from('title: Hi\n').toString('base64') },
    }),
  });
  const store = new GitHubStore(cfg, author, fetchFn);
  assert.deepEqual(await store.read('config/site.yml'), { path: 'config/site.yml', content: 'title: Hi\n', version: 's1' });
  assert.equal(await store.read('config/nope.yml'), null);
});

test('list recurses into folders', async () => {
  const { fetchFn } = fakeGitHub({
    'GET /contents/public/images?ref=main': () => ({
      json: [
        { type: 'file', path: 'public/images/a.png', sha: 'a' },
        { type: 'dir', path: 'public/images/sub', sha: 'd' },
      ],
    }),
    'GET /contents/public/images/sub?ref=main': () => ({ json: [{ type: 'file', path: 'public/images/sub/b.png', sha: 'b' }] }),
  });
  assert.deepEqual(await new GitHubStore(cfg, author, fetchFn).list('public/images'), [
    { path: 'public/images/a.png', version: 'a' },
    { path: 'public/images/sub/b.png', version: 'b' },
  ]);
});

test('githubConfig: explicit repo and branch win over Vercel metadata', () => {
  const vercel = { GITHUB_TOKEN: 't', VERCEL_GIT_REPO_OWNER: 'vo', VERCEL_GIT_REPO_SLUG: 'vr', VERCEL_GIT_COMMIT_REF: 'preview' };
  assert.deepEqual(githubConfig(vercel), { token: 't', owner: 'vo', repo: 'vr', branch: 'preview' });
  assert.deepEqual(githubConfig({ ...vercel, GITHUB_REPO: 'me/site', GITHUB_BRANCH: 'main' }), {
    token: 't',
    owner: 'me',
    repo: 'site',
    branch: 'main',
  });
  assert.throws(() => githubConfig({ GITHUB_REPO: 'me/site' }), /GITHUB_TOKEN/);
  assert.throws(() => githubConfig({ GITHUB_TOKEN: 't' }), /GITHUB_REPO/);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './github-store'`.

- [ ] **Step 3: Write `src/lib/admin/github-store.ts`**

```ts
import { ConflictError, UpstreamError, type Author, type Change, type ContentStore, type StoredFile } from './store';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface WorkflowRun {
  status: string;
  conclusion: string | null;
  url: string;
  createdAt: string;
}

/** Repo from GITHUB_REPO ("owner/name") or Vercel's git metadata; branch from GITHUB_BRANCH, the deployed ref, or main. */
export function githubConfig(env: Record<string, string | undefined>): GitHubConfig {
  const [owner, repo] = env.GITHUB_REPO
    ? env.GITHUB_REPO.split('/')
    : [env.VERCEL_GIT_REPO_OWNER, env.VERCEL_GIT_REPO_SLUG];
  if (!env.GITHUB_TOKEN) {
    throw new UpstreamError('GITHUB_TOKEN is not set. Add a fine-grained token in the Vercel project settings.', 500);
  }
  if (!owner || !repo) throw new UpstreamError('Set GITHUB_REPO to "owner/name" (Vercel git metadata is missing).', 500);
  return { token: env.GITHUB_TOKEN, owner, repo, branch: env.GITHUB_BRANCH || env.VERCEL_GIT_COMMIT_REF || 'main' };
}

class GitHubError extends UpstreamError {
  constructor(
    message: string,
    readonly githubStatus: number,
  ) {
    super(message);
  }
}

/** The branch moved between reading the head and updating the ref. */
class RefRace extends Error {}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export class GitHubStore implements ContentStore {
  constructor(
    private cfg: GitHubConfig,
    private author?: Author,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private async gh<T>(method: string, route: string, body?: unknown, allow404 = false): Promise<T | null> {
    const res = await this.fetchFn(`https://api.github.com/repos/${this.cfg.owner}/${this.cfg.repo}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ScholarOS-admin',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (allow404 && res.status === 404) return null;
    if (res.status === 204) return null;
    if (!res.ok) throw await this.error(res);
    return (await res.json()) as T;
  }

  private async error(res: Response): Promise<GitHubError> {
    const text = await res.text().catch(() => '');
    let message = text;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      // not JSON: keep the text
    }
    if (res.status === 401) return new GitHubError(`GitHub rejected GITHUB_TOKEN (expired or revoked): ${message}`, 401);
    if (res.status === 403 || res.status === 404) {
      const needed = res.headers.get('x-accepted-github-permissions') || 'Contents: read and write, Actions: read and write';
      return new GitHubError(
        `GitHub refused the request (${res.status}: ${message}). The token needs ${needed} on ${this.cfg.owner}/${this.cfg.repo}.`,
        res.status,
      );
    }
    return new GitHubError(`GitHub error ${res.status}: ${message}`, res.status);
  }

  private ref(ref = this.cfg.branch): string {
    return `?ref=${encodeURIComponent(ref)}`;
  }

  async read(path: string): Promise<StoredFile | null> {
    const file = await this.gh<{ type?: string; sha: string; content?: string; encoding?: string }>(
      'GET',
      `/contents/${encodePath(path)}${this.ref()}`,
      undefined,
      true,
    );
    if (!file || Array.isArray(file) || file.type !== 'file') return null;
    if (file.encoding !== 'base64') throw new UpstreamError(`${path} is larger than 1 MB and can't be edited here.`, 413);
    return { path, content: Buffer.from(file.content ?? '', 'base64').toString('utf8'), version: file.sha };
  }

  async list(dir: string): Promise<{ path: string; version: string }[]> {
    const entries = await this.gh<{ type: string; path: string; sha: string }[]>(
      'GET',
      `/contents/${encodePath(dir)}${this.ref()}`,
      undefined,
      true,
    );
    if (!Array.isArray(entries)) return [];
    const nested = await Promise.all(
      entries.map(async (e) =>
        e.type === 'dir' ? this.list(e.path) : e.type === 'file' ? [{ path: e.path, version: e.sha }] : [],
      ),
    );
    return nested.flat();
  }

  async commit(changes: Change[], message: string, base: Record<string, string | null>) {
    try {
      return await this.tryCommit(changes, message, base);
    } catch (e) {
      if (!(e instanceof RefRace)) throw e;
      // The branch moved: start again from the new head (versions are checked again there).
      try {
        return await this.tryCommit(changes, message, base);
      } catch (again) {
        throw again instanceof RefRace ? new ConflictError(changes[0]?.path ?? this.cfg.branch) : again;
      }
    }
  }

  private async tryCommit(changes: Change[], message: string, base: Record<string, string | null>) {
    const branch = encodePath(this.cfg.branch);
    const head = (await this.gh<{ object: { sha: string } }>('GET', `/git/ref/heads/${branch}`))!.object.sha;
    const baseTree = (await this.gh<{ tree: { sha: string } }>('GET', `/git/commits/${head}`))!.tree.sha;
    const current = await Promise.all(
      changes.map((c) => this.gh<{ sha: string }>('GET', `/contents/${encodePath(c.path)}${this.ref(head)}`, undefined, true)),
    );
    changes.forEach((c, i) => {
      const file = current[i];
      const sha = file && !Array.isArray(file) ? file.sha : null;
      if (sha !== (base[c.path] ?? null)) throw new ConflictError(c.path);
    });
    const tree = await Promise.all(
      changes.map(async (c) => ({
        path: c.path,
        mode: '100644',
        type: 'blob',
        sha:
          c.content === null
            ? null
            : (await this.gh<{ sha: string }>('POST', '/git/blobs', { content: c.content, encoding: c.encoding ?? 'utf-8' }))!
                .sha,
      })),
    );
    const newTree = (await this.gh<{ sha: string }>('POST', '/git/trees', { base_tree: baseTree, tree }))!.sha;
    const author = this.author && { ...this.author, date: new Date().toISOString() };
    const commit = (await this.gh<{ sha: string; html_url: string }>('POST', '/git/commits', {
      message,
      tree: newTree,
      parents: [head],
      ...(author ? { author } : {}),
    }))!;
    try {
      await this.gh('PATCH', `/git/refs/heads/${branch}`, { sha: commit.sha, force: false });
    } catch (e) {
      if (e instanceof GitHubError && e.githubStatus === 422) throw new RefRace();
      throw e;
    }
    return { id: commit.sha, url: commit.html_url };
  }

  async lastModified(path: string): Promise<string | null> {
    const commits = await this.gh<{ commit: { committer: { date: string } } }[]>(
      'GET',
      `/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(this.cfg.branch)}&per_page=1`,
    );
    return commits?.[0]?.commit.committer.date ?? null;
  }

  /** Starts a workflow_dispatch run (e.g. render-cv.yml) on the configured branch. */
  async dispatchWorkflow(file: string): Promise<void> {
    await this.gh('POST', `/actions/workflows/${encodeURIComponent(file)}/dispatches`, { ref: this.cfg.branch });
  }

  async latestRun(file: string): Promise<WorkflowRun | null> {
    const runs = await this.gh<{
      workflow_runs: { status: string; conclusion: string | null; html_url: string; created_at: string }[];
    }>('GET', `/actions/workflows/${encodeURIComponent(file)}/runs?per_page=1&branch=${encodeURIComponent(this.cfg.branch)}`);
    const run = runs?.workflow_runs[0];
    return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url, createdAt: run.created_at } : null;
  }

  /** Read probes for the admin's permission banner; missing write access shows up as a 502 on the first save. */
  async capabilities(): Promise<{ contents: boolean; actions: boolean; error?: string }> {
    const probe = (route: string) => this.gh('GET', route).then(
      () => true,
      () => false,
    );
    const [contents, actions] = await Promise.all([
      probe(`/contents/config/site.yml${this.ref()}`),
      probe('/actions/workflows?per_page=1'),
    ]);
    const error = !contents
      ? `The GitHub token can't read ${this.cfg.owner}/${this.cfg.repo}. It needs Contents: read and write.`
      : !actions
        ? 'The GitHub token lacks Actions: read and write, so "Generate PDF" will not work.'
        : undefined;
    return { contents, actions, ...(error ? { error } : {}) };
  }
}
```

- [ ] **Step 4: Write `src/lib/admin/get-store.ts`.** It is a separate file because `store.ts` must not import the stores (that would be an import cycle).

```ts
import { GitHubStore, githubConfig } from './github-store';
import { memoryStore } from './memory-store';
import type { Author, ContentStore } from './store';

let testFactory: ((author: Author) => ContentStore) | null = null;

/** Tests swap the store; production code never calls this. */
export function setStoreForTests(factory: ((author: Author) => ContentStore) | null): void {
  testFactory = factory;
}

/** The store for one request: GitHub in production, the in-memory overlay under `astro dev` with ADMIN_STORE=memory. */
export function getStore(author: Author): ContentStore {
  if (testFactory) return testFactory(author);
  if (process.env.ADMIN_STORE === 'memory') {
    if (!import.meta.env?.DEV) throw new Error('ADMIN_STORE=memory is only honored by `astro dev`');
    return memoryStore();
  }
  return new GitHubStore(githubConfig(process.env), author);
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/github-store.ts src/lib/admin/github-store.test.ts src/lib/admin/get-store.ts
git commit -m "feat(admin): GitHub store over the Git Data API with optimistic versions"
```

---

### Task 10: Upload checks

**Files:**
- Create: `src/lib/admin/media.ts`, `src/lib/admin/media.test.ts`

**Interfaces:**
- Consumes: `slugify` from `src/lib/utils.ts`.
- Produces: `MAX_UPLOAD` (4 MiB), `MediaError(message, status: 413 | 415)`, `sniffImage(bytes): 'png' | 'jpg' | 'gif' | 'webp' | 'avif' | 'svg' | null`, `prepareUpload(name, bytes): { filename; base64 }`.

- [ ] **Step 1: Write the failing test** `src/lib/admin/media.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_UPLOAD, MediaError, prepareUpload, sniffImage } from './media';

const bytes = (...parts: (number | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p, 'latin1')] : [p])));
const PNG = bytes(0x89, 'PNG\r\n\x1a\n', 0, 0, 0, 13);
const isMediaError = (status: number) => (e: unknown) => e instanceof MediaError && e.status === status;

test('sniffImage recognizes each allowed type by its bytes, not its name', () => {
  assert.equal(sniffImage(PNG), 'png');
  assert.equal(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0)), 'jpg');
  assert.equal(sniffImage(bytes('GIF89a')), 'gif');
  assert.equal(sniffImage(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 ')), 'webp');
  assert.equal(sniffImage(bytes(0, 0, 0, 0x1c, 'ftypavif')), 'avif');
  assert.equal(sniffImage(bytes('<?xml version="1.0"?>\n<!-- c -->\n<svg xmlns="http://www.w3.org/2000/svg"/>')), 'svg');
  assert.equal(sniffImage(bytes('<html><svg></svg></html>')), null);
  assert.equal(sniffImage(bytes('%PDF-1.7')), null);
  assert.equal(sniffImage(new Uint8Array([0xc3, 0x28])), null, 'invalid UTF-8 is not an SVG');
});

test('prepareUpload: slug + content hash + sniffed extension', () => {
  const a = prepareUpload('My Figure (final).PNG', PNG);
  assert.match(a.filename, /^my-figure-final-[0-9a-f]{6}\.png$/);
  const b = prepareUpload('other.jpg', PNG);
  assert.equal(b.filename.slice(-10), a.filename.slice(-10), 'same bytes, same hash; the real type wins');
  assert.equal(Buffer.from(a.base64, 'base64').length, PNG.length);
  assert.match(prepareUpload('Été ü.png', PNG).filename, /^t-[0-9a-f]{6}\.png$|^image-[0-9a-f]{6}\.png$/);
});

test('prepareUpload rejects big, unknown and scripted files', () => {
  assert.throws(() => prepareUpload('big.png', new Uint8Array(MAX_UPLOAD + 1)), isMediaError(413));
  assert.throws(() => prepareUpload('notes.txt', bytes('hello')), isMediaError(415));
  const evil = [
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><a href="javascript:alert(1)">x</a></svg>',
    '<svg><foreignObject><div/></foreignObject></svg>',
  ];
  for (const svg of evil) assert.throws(() => prepareUpload('x.svg', bytes(svg)), isMediaError(415), svg);
  assert.match(prepareUpload('Logo.svg', bytes('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')).filename, /^logo-[0-9a-f]{6}\.svg$/);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './media'`.

- [ ] **Step 3: Write `src/lib/admin/media.ts`**

```ts
import { createHash } from 'node:crypto';
import { slugify } from '../utils';

export const MAX_UPLOAD = 4 * 1024 * 1024;

export class MediaError extends Error {
  constructor(
    message: string,
    readonly status: 413 | 415,
  ) {
    super(message);
  }
}

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

const SIGNATURES: [ext: string, test: (b: Uint8Array) => boolean][] = [
  ['png', (b) => b[0] === 0x89 && ascii(b, 1, 4) === 'PNG'],
  ['jpg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['gif', (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a'],
  ['webp', (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP'],
  ['avif', (b) => ascii(b, 4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(b, 8, 12))],
];

/** Root element is <svg>, after an optional BOM, XML declaration, comments and doctype. */
const SVG_ROOT = /^﻿?\s*(<\?xml[\s\S]*?\?>\s*)?((<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s>/]/i;
const SVG_DANGER: [RegExp, string][] = [
  [/<script/i, 'scripts'],
  [/\son[a-z]+\s*=/i, 'event handler attributes'],
  [/javascript:/i, 'javascript: URLs'],
  [/<foreignObject/i, '<foreignObject>'],
];

function svgText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return SVG_ROOT.test(text) ? text : null;
  } catch {
    return null;
  }
}

/** The file's real type from its bytes, or null. */
export function sniffImage(bytes: Uint8Array): string | null {
  const hit = SIGNATURES.find(([, test]) => test(bytes));
  if (hit) return hit[0];
  return svgText(bytes) ? 'svg' : null;
}

/** Validates an upload and names it `<slug>-<6 hex of sha256>.<ext>`. Throws MediaError (413 / 415). */
export function prepareUpload(name: string, bytes: Uint8Array): { filename: string; base64: string } {
  if (bytes.length > MAX_UPLOAD) throw new MediaError('Files must be 4 MB or smaller', 413);
  const ext = sniffImage(bytes);
  if (!ext) throw new MediaError('Only PNG, JPEG, WebP, GIF, AVIF and SVG images can be uploaded', 415);
  if (ext === 'svg') {
    const danger = SVG_DANGER.find(([re]) => re.test(svgText(bytes)!));
    if (danger) throw new MediaError(`SVG files with ${danger[1]} are not allowed`, 415);
  }
  const base =
    slugify(name.replace(/\.[^.]*$/, ''))
      .slice(0, 60)
      .replace(/-+$/, '') || 'image';
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 6);
  return { filename: `${base}-${hash}.${ext}`, base64: Buffer.from(bytes).toString('base64') };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/media.ts src/lib/admin/media.test.ts
git commit -m "feat(admin): sniff uploads, reject scripted SVGs, content-hashed names"
```

---

### Task 11: RenderCV import mapping

**Files:**
- Create: `tests/fixtures/rendercv.yaml` (scrubbed copy)
- Create: `src/lib/admin/cv-import.ts`, `src/lib/admin/cv-import.test.ts`
- Modify: `.prettierignore` (ignore `tests/fixtures/`)

**Interfaces:**
- Consumes: `normalizeKeys` (`src/lib/config.ts`), `isPublicationEntry` (`src/lib/cv.ts`), `bibtexKey` (`src/lib/bibtex.ts`), `bareDoi` (`src/lib/editorial.ts`), `cvSchema` (Task 1).
- Produces:
  - `ImportError(message, details?)`
  - `ExistingPublication = { slug; data: Record<string, unknown>; version: string; readonly?: boolean }`
  - `ImportedPublication = { slug; data; version: string | null }`
  - `CvImport = { cv; publications: ImportedPublication[]; summary: { sections: { key; count }[]; newPublications; updatedPublications; skipped } }`
  - `importRenderCv(text, existing: ExistingPublication[]): CvImport`

- [ ] **Step 1: Copy the fixture without contact details.** The owner's email and phone, and the referees' `mailto:` links, must not go into a public template repo.

```bash
mkdir -p tests/fixtures
sed -e 's/^  email: .*/  email: "owner@example.com"/' \
    -e 's/^  phone: .*/  phone: "tel:+1-555-0100"/' \
    -e 's/ *\[Email\](mailto:[^)]*)//' \
    personal-site-handoff/cv.yaml > tests/fixtures/rendercv.yaml
grep -nE '^  (email|phone):' tests/fixtures/rendercv.yaml
grep -c 'mailto:' tests/fixtures/rendercv.yaml
printf '\n# RenderCV import fixture, kept byte-for-byte\ntests/fixtures/\n' >> .prettierignore
```

Expected: `4:  email: "owner@example.com"`, `5:  phone: "tel:+1-555-0100"`, then `0`.

- [ ] **Step 2: Write the failing test** `src/lib/admin/cv-import.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml';
import { cvSchema } from '../schemas';
import { ImportError, importRenderCv } from './cv-import';

const FIXTURE = fs.readFileSync('tests/fixtures/rendercv.yaml', 'utf8');
const FIXTURE_PUBS = (parse(FIXTURE).cv.sections.selected_publications as unknown[]).length;
type Sections = Record<string, Record<string, unknown>[]>;

test('maps the fixture into cv.yml shape and moves publications into the collection', () => {
  const { cv, publications, summary } = importRenderCv(FIXTURE, []);
  const sections = (cv as { cv: { sections: Sections } }).cv.sections;
  assert.ok(cvSchema.safeParse(cv).success);
  assert.ok(!('selectedPublications' in sections));
  assert.ok('researchExperience' in sections, 'snake_case keys become camelCase');
  assert.equal(sections.education[0].startDate, '2021-01');
  assert.equal(publications.length, FIXTURE_PUBS);
  assert.deepEqual(
    { n: summary.newPublications, u: summary.updatedPublications },
    { n: FIXTURE_PUBS, u: 0 },
  );
  assert.ok(summary.sections.some((s) => s.key === 'education' && s.count === 3));
  for (const p of publications) {
    assert.equal(p.version, null);
    assert.match(p.slug, /^[a-z0-9-]{1,80}$/);
    assert.ok((p.data.authors as string[]).every((a) => !a.includes('*')), 'bold markers stripped');
    assert.equal(typeof p.data.year, 'number');
    assert.ok(['journal', 'conference', 'preprint', 'workshop'].includes(p.data.type as string));
  }
  assert.equal(new Set(publications.map((p) => p.slug)).size, publications.length, 'slugs are unique');
});

test('re-import updates matching entries in place and keeps curated fields', () => {
  const fresh = importRenderCv(FIXTURE, []).publications;
  const [a, b] = fresh;
  const existing = [
    {
      slug: 'curated',
      version: 'v1',
      data: { ...a.data, doi: `https://doi.org/${a.data.doi}`, title: 'Old title', topic: 'nlp', type: 'journal', abstract: 'Kept' },
    },
    { slug: 'by-title', version: 'v2', data: { title: `${String(b.data.title).toUpperCase()}!`, authors: [], venue: 'x', year: 2000, type: 'preprint' } },
  ];
  const { publications, summary } = importRenderCv(FIXTURE, existing);
  const curated = publications.find((p) => p.slug === 'curated')!;
  assert.equal(curated.version, 'v1');
  assert.equal(curated.data.title, a.data.title, 'the CV owns title/authors/venue/year/doi/url');
  assert.deepEqual([curated.data.topic, curated.data.type, curated.data.abstract], ['nlp', 'journal', 'Kept']);
  assert.equal(publications.find((p) => p.slug === 'by-title')?.version, 'v2');
  assert.deepEqual(
    [summary.updatedPublications, summary.newPublications, publications.length],
    [2, FIXTURE_PUBS - 2, FIXTURE_PUBS],
  );
});

test('MDX publications are left alone', () => {
  const [a] = importRenderCv(FIXTURE, []).publications;
  const result = importRenderCv(FIXTURE, [{ slug: 'mdx-one', version: 'v', readonly: true, data: a.data }]);
  assert.equal(result.summary.skipped, 1);
  assert.ok(!result.publications.some((p) => p.slug === 'mdx-one'));
});

test('invalid YAML and non-RenderCV documents are import errors', () => {
  assert.throws(() => importRenderCv('cv: [unclosed', []), ImportError);
  assert.throws(() => importRenderCv('name: no cv key', []), ImportError);
  assert.throws(() => importRenderCv('cv:\n  name: X\n  sections:\n    odd:\n      - foo: 1\n', []), ImportError);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './cv-import'`.

- [ ] **Step 4: Write `src/lib/admin/cv-import.ts`**

```ts
import { parse } from 'yaml';
import { bibtexKey } from '../bibtex';
import { normalizeKeys } from '../config';
import { isPublicationEntry } from '../cv';
import { bareDoi } from '../editorial';
import { cvSchema } from '../schemas';

/** The upload isn't a usable RenderCV document; the API answers 422. */
export class ImportError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ExistingPublication {
  slug: string;
  data: Record<string, unknown>;
  version: string;
  readonly?: boolean;
}

export interface ImportedPublication {
  slug: string;
  data: Record<string, unknown>;
  /** The existing entry's version, or null for a new entry. */
  version: string | null;
}

export interface CvImport {
  cv: Record<string, unknown>;
  publications: ImportedPublication[];
  summary: {
    sections: { key: string; count: number }[];
    newPublications: number;
    updatedPublications: number;
    skipped: number;
  };
}

/** Fields the CV is authoritative for; everything else on an existing entry (topic, abstract, type, …) is kept. */
const CV_OWNED = ['title', 'authors', 'venue', 'year', 'doi', 'url'];
const titleKey = (title: unknown) => String(title ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const doiKey = (doi: unknown) => (doi ? bareDoi(String(doi)).toLowerCase() : '');

// ponytail: keyword heuristic for `type`; the owner fixes it in the Publications screen and re-imports keep the fix.
function guessType(venue: string): string {
  if (/arxiv|biorxiv|medrxiv|preprint/i.test(venue)) return 'preprint';
  if (/journal|transactions|letters|briefings|molecules|review/i.test(venue)) return 'journal';
  if (/^[^,]*workshop/i.test(venue)) return 'workshop';
  return 'conference';
}

function toPublication(entry: Record<string, unknown>): Record<string, unknown> {
  const venue = String(entry.journal ?? '').trim() || 'Unpublished';
  return {
    title: String(entry.title ?? '').trim(),
    authors: (Array.isArray(entry.authors) ? entry.authors : [])
      .map((a) => String(a).replace(/\*+/g, '').trim())
      .filter(Boolean),
    venue,
    year: Number(String(entry.date ?? '').slice(0, 4)) || new Date().getFullYear(),
    type: guessType(venue),
    ...(entry.doi ? { doi: String(entry.doi) } : {}),
    ...(entry.url ? { url: String(entry.url) } : {}),
  };
}

/** RenderCV YAML → the cv.yml document (publication sections removed) + publications for the collection. */
export function importRenderCv(text: string, existing: ExistingPublication[]): CvImport {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (e) {
    throw new ImportError(`Not valid YAML: ${(e as Error).message}`);
  }
  const root = normalizeKeys(doc) as { cv?: { name?: unknown; sections?: Record<string, unknown> } } | null;
  if (!root?.cv || typeof root.cv.name !== 'string') {
    throw new ImportError('Expected a RenderCV document: a top-level `cv:` with a `name`.');
  }

  const sections: Record<string, unknown> = { ...(root.cv.sections ?? {}) };
  const found: Record<string, unknown>[] = [];
  for (const [key, list] of Object.entries(sections)) {
    if (Array.isArray(list) && list.length > 0 && list.every(isPublicationEntry)) {
      found.push(...(list as Record<string, unknown>[]));
      delete sections[key];
    }
  }
  const cv = { ...root, cv: { ...root.cv, sections } };
  const checked = cvSchema.safeParse(cv);
  if (!checked.success) {
    throw new ImportError(
      'Some CV entries have a shape RenderCV does not define',
      checked.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }

  const byDoi = new Map(existing.filter((e) => e.data.doi).map((e) => [doiKey(e.data.doi), e]));
  const byTitle = new Map(existing.map((e) => [titleKey(e.data.title), e]));
  const slugs = new Set(existing.map((e) => e.slug));
  const publications: ImportedPublication[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const entry of found) {
    const mapped = toPublication(entry);
    const match = (mapped.doi && byDoi.get(doiKey(mapped.doi))) || byTitle.get(titleKey(mapped.title));
    if (match?.readonly) {
      skipped++;
    } else if (match) {
      const owned = Object.fromEntries(CV_OWNED.filter((k) => k in mapped).map((k) => [k, mapped[k]]));
      publications.push({ slug: match.slug, data: { ...match.data, ...owned }, version: match.version });
      updated++;
    } else {
      const base = bibtexKey(mapped as { title: string; authors: string[]; year: number }).slice(0, 76) || 'publication';
      let slug = base;
      for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
      slugs.add(slug);
      publications.push({ slug, data: mapped, version: null });
      created++;
    }
  }

  return {
    cv,
    publications,
    summary: {
      sections: Object.entries(sections).map(([key, list]) => ({ key, count: Array.isArray(list) ? list.length : 0 })),
      newPublications: created,
      updatedPublications: updated,
      skipped,
    },
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/rendercv.yaml .prettierignore src/lib/admin/cv-import.ts src/lib/admin/cv-import.test.ts
git commit -m "feat(admin): RenderCV import that merges publications into the collection"
```

---

### Task 12: Runtime: Vercel adapter, admin integration, middleware, GitHub sign-in, CI builds

**Files:**
- Modify: `package.json` (add `@astrojs/vercel`), `astro.config.mjs`, `.gitignore`, `.github/workflows/lint.yml`
- Create: `src/integrations/admin.ts`
- Move: `src/pages/[...cms].astro` → `src/admin/sveltia/[...cms].astro`; `src/pages/[...cmsConfig].ts` → `src/admin/sveltia/[...cmsConfig].ts`
- Create: `src/env.d.ts`, `src/middleware.ts`, `src/middleware.test.ts`
- Create: `src/admin/routes/[...path].astro` (minimal: Task 16 replaces it)
- Create: `src/admin/routes/api/auth/login.ts`, `callback.ts`, `logout.ts`, `dev.ts`

**Interfaces:**
- Consumes: `loadAdminSettings`, `adminSettings`, `isAdminUser` (Task 5); `SESSION_COOKIE`, `OAUTH_STATE_COOKIE`, `SESSION_COOKIE_OPTIONS`, `sealSession`, `openSession`, `sessionSecret`, `oauthEnv` (Task 7).
- Produces:
  - `App.Locals.user?: SessionUser`.
  - Every `src/admin/routes/api/<path>.ts` (except `*.test.ts`) becomes `/api/admin/<path>` when `VERCEL` is set. `auth/dev.ts` is injected only by `astro dev`.
  - Admin pages live at `/<adminPath>/[...path]`.
  - Sign-in flow: `GET /api/admin/auth/login` → GitHub → `GET /api/admin/auth/callback` → `/<adminPath>`; `POST /api/admin/auth/logout`.

- [ ] **Step 1: Write the failing middleware test** `src/middleware.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_COOKIE, sealSession } from './lib/admin/session';
import { adminSettings } from './lib/admin/settings';
import { onRequest } from './middleware';

process.env.SESSION_SECRET = 'm'.repeat(32);
const ORIGIN = 'https://site.test';
const admin = `/${adminSettings().adminPath}`;
const user = { login: 'jane', name: 'Jane', avatar: '' };

function context(path: string, opts: { method?: string; cookie?: string; origin?: string } = {}) {
  const url = new URL(path, ORIGIN);
  return {
    url,
    isPrerendered: false,
    locals: {} as { user?: unknown },
    request: new Request(url, { method: opts.method ?? 'GET', headers: opts.origin ? { origin: opts.origin } : {} }),
    cookies: { get: (name: string) => (name === SESSION_COOKIE && opts.cookie ? { value: opts.cookie } : undefined) },
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  };
}
const run = (ctx: ReturnType<typeof context>) =>
  onRequest(ctx as never, async () => new Response('ok')) as Promise<Response>;

test('public pages pass through untouched', async () => {
  const res = await run(context('/blog'));
  assert.equal(await res.text(), 'ok');
  assert.equal(res.headers.get('cache-control'), null);
});

test('without a session: API → 401, pages → login; the login page and auth routes stay open', async () => {
  assert.equal((await run(context('/api/admin/me'))).status, 401);
  const page = await run(context(`${admin}/cv`));
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), `${admin}/login`);
  const login = await run(context(`${admin}/login`));
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('cache-control'), 'no-store');
  assert.equal(login.headers.get('x-robots-tag'), 'noindex');
  assert.equal((await run(context('/api/admin/auth/login'))).status, 200);
});

test('a valid session reaches the route with locals.user set; a forged one does not', async () => {
  const ctx = context(admin, { cookie: await sealSession(user, process.env.SESSION_SECRET!) });
  const res = await run(ctx);
  assert.equal(res.status, 200);
  assert.deepEqual(ctx.locals.user, user);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const forged = await sealSession(user, 'x'.repeat(32));
  assert.equal((await run(context('/api/admin/me', { cookie: forged }))).status, 401);
});

test('writes need a same-origin Origin header', async () => {
  const cookie = await sealSession(user, process.env.SESSION_SECRET!);
  const put = (origin?: string) => run(context('/api/admin/config/site', { method: 'PUT', cookie, origin }));
  assert.equal((await put('https://evil.test')).status, 403);
  assert.equal((await put()).status, 403, 'missing Origin');
  assert.equal((await put(ORIGIN)).status, 200);
  assert.equal((await run(context('/api/admin/auth/logout', { method: 'POST', origin: 'https://evil.test' }))).status, 403);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './middleware'`.

- [ ] **Step 3: Write `src/env.d.ts` and `src/middleware.ts`**

`src/env.d.ts`:

```ts
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Set by src/middleware.ts on admin routes once the session cookie checks out. */
    user?: import('./lib/admin/session').SessionUser;
  }
}
```

`src/middleware.ts`:

```ts
import type { MiddlewareHandler } from 'astro';
import { SESSION_COOKIE, openSession, sessionSecret } from './lib/admin/session';
import { adminSettings } from './lib/admin/settings';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });

/** Guards the admin (pages under /<adminPath>, API under /api/admin): session, same-origin writes, no caching or indexing. */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  if (ctx.isPrerendered) return next();
  const { pathname } = ctx.url;
  const { adminPath } = adminSettings();
  const api = pathname.startsWith('/api/admin/');
  const page = pathname === `/${adminPath}` || pathname.startsWith(`/${adminPath}/`);
  if (!api && !page) return next();

  let res: Response;
  if (api && MUTATING.has(ctx.request.method) && ctx.request.headers.get('origin') !== ctx.url.origin) {
    res = jsonError(403, 'Cross-origin request refused');
  } else if (pathname.startsWith('/api/admin/auth/') || pathname === `/${adminPath}/login`) {
    res = await next();
  } else {
    const token = ctx.cookies.get(SESSION_COOKIE)?.value;
    const user = token ? await openSession(token, sessionSecret()) : null;
    if (user) {
      ctx.locals.user = user;
      res = await next();
    } else {
      res = api ? jsonError(401, 'Not signed in') : ctx.redirect(`/${adminPath}/login`);
    }
  }
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Robots-Tag', 'noindex');
  return out;
};
```

- [ ] **Step 4: Run the test**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Add the adapter and the integration**

```bash
pnpm add @astrojs/vercel@^8.2.11
mkdir -p src/admin/sveltia src/integrations
git mv 'src/pages/[...cms].astro' 'src/admin/sveltia/[...cms].astro'
git mv 'src/pages/[...cmsConfig].ts' 'src/admin/sveltia/[...cmsConfig].ts'
```

In both moved files, change `from '../lib/config'` to `from '../../lib/config'`.

`src/integrations/admin.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { AstroIntegration } from 'astro';
import { loadAdminSettings } from '../lib/admin/settings';

const API_DIR = 'src/admin/routes/api';

/** `auth/login.ts`, `collections/[name]/[slug].ts`, … relative to API_DIR. */
function apiRouteFiles(): string[] {
  return fs
    .readdirSync(API_DIR, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
}

/**
 * On Vercel (VERCEL set): injects the custom admin's on-demand pages and API routes, with the settings the
 * functions need baked in. Everywhere else: injects the Sveltia admin, so static builds have no functions.
 */
export default function admin(): AstroIntegration {
  return {
    name: 'scholaros-admin',
    hooks: {
      'astro:config:setup': ({ command, injectRoute, logger, updateConfig }) => {
        if (!process.env.VERCEL) {
          injectRoute({ pattern: '/[...cms]', entrypoint: './src/admin/sveltia/[...cms].astro' });
          injectRoute({ pattern: '/[...cmsConfig]', entrypoint: './src/admin/sveltia/[...cmsConfig].ts' });
          return;
        }
        const settings = loadAdminSettings();
        if (!process.env.SESSION_SECRET) logger.warn('SESSION_SECRET is not set: the admin will refuse every request.');
        updateConfig({ vite: { define: { __SCHOLAROS_ADMIN__: JSON.stringify(settings) } } });
        injectRoute({
          pattern: `/${settings.adminPath}/[...path]`,
          entrypoint: './src/admin/routes/[...path].astro',
          prerender: false,
        });
        for (const file of apiRouteFiles()) {
          if (file === 'auth/dev.ts' && command !== 'dev') continue;
          injectRoute({
            pattern: `/api/admin/${file.replace(/\.ts$/, '')}`,
            entrypoint: `./${API_DIR}/${file}`,
            prerender: false,
          });
        }
      },
    },
  };
}
```

`astro.config.mjs`: add the imports

```js
import vercel from '@astrojs/vercel';
import admin from './src/integrations/admin';
```

and change the config head to

```js
export default defineConfig({
  site: 'https://example.com',
  // Vercel only: the custom admin's routes run as functions. Every public page stays prerendered.
  adapter: process.env.VERCEL ? vercel() : undefined,
  integrations: [vue({ appEntrypoint: '/src/pages/_app.ts' }), mdx(), sitemap(), admin()],
```

`.gitignore`: append

```
# Vercel build output (VERCEL=1 pnpm build)
.vercel/
```

- [ ] **Step 6: Write the auth routes**

`src/admin/routes/api/auth/login.ts`:

```ts
import type { APIRoute } from 'astro';
import { OAUTH_STATE_COOKIE, oauthEnv } from '../../../../lib/admin/session';

export const prerender = false;

export const GET: APIRoute = ({ cookies, redirect, url }) => {
  const { clientId } = oauthEnv();
  const state = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  cookies.set(OAUTH_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/admin/auth', maxAge: 600 });
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${url.origin}/api/admin/auth/callback`,
    scope: 'read:user',
    state,
  });
  return redirect(`https://github.com/login/oauth/authorize?${query}`);
};
```

`src/admin/routes/api/auth/callback.ts`:

```ts
import type { APIRoute } from 'astro';
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  oauthEnv,
  sealSession,
  sessionSecret,
} from '../../../../lib/admin/session';
import { adminSettings, isAdminUser } from '../../../../lib/admin/settings';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  const { adminPath, adminUsers } = adminSettings();
  const fail = (error: 'expired' | 'denied') => redirect(`/${adminPath}/login?error=${error}`);

  const expected = cookies.get(OAUTH_STATE_COOKIE)?.value;
  cookies.delete(OAUTH_STATE_COOKIE, { path: '/api/admin/auth' });
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || !expected || state !== expected) return fail('expired');

  const { clientId, clientSecret } = oauthEnv();
  const token = (await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${url.origin}/api/admin/auth/callback`,
    }),
  })
    .then((r) => r.json())
    .catch(() => ({}))) as { access_token?: string };
  if (!token.access_token) return fail('expired');

  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ScholarOS-admin' },
  });
  if (!res.ok) return fail('expired');
  const gh = (await res.json()) as { login: string; name?: string | null; avatar_url?: string };
  if (!isAdminUser(gh.login, adminUsers)) return fail('denied');

  const session = await sealSession({ login: gh.login, name: gh.name || gh.login, avatar: gh.avatar_url ?? '' }, sessionSecret());
  cookies.set(SESSION_COOKIE, session, SESSION_COOKIE_OPTIONS);
  return redirect(`/${adminPath}`);
};
```

`src/admin/routes/api/auth/logout.ts`:

```ts
import type { APIRoute } from 'astro';
import { SESSION_COOKIE } from '../../../../lib/admin/session';

export const prerender = false;

export const POST: APIRoute = ({ cookies }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
```

`src/admin/routes/api/auth/dev.ts` (the e2e session stub; injected only by `astro dev`, and guarded again here):

```ts
import type { APIRoute } from 'astro';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, sealSession, sessionSecret } from '../../../../lib/admin/session';
import { adminSettings } from '../../../../lib/admin/settings';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  if (!import.meta.env.DEV || process.env.ADMIN_STORE !== 'memory') return new Response('Not found', { status: 404 });
  const login = url.searchParams.get('login') ?? 'dev';
  cookies.set(SESSION_COOKIE, await sealSession({ login, name: 'Dev User', avatar: '' }, sessionSecret()), SESSION_COOKIE_OPTIONS);
  return redirect(`/${adminSettings().adminPath}`);
};
```

- [ ] **Step 7: Write the minimal admin page** `src/admin/routes/[...path].astro`. Task 16 replaces it with the full screen switch.

```astro
---
import { adminSettings } from '../../lib/admin/settings';

export const prerender = false;

const { siteName } = adminSettings();
const screen = (Astro.params.path ?? '').split('/')[0];
const error = Astro.url.searchParams.get('error');
if (screen === 'login' && error === 'denied') Astro.response.status = 403;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Site admin · {siteName}</title>
  </head>
  <body>
    {
      screen === 'login' ? (
        <main>
          <h1>{siteName}</h1>
          <a href="/api/admin/auth/login">Sign in with GitHub</a>
          {error && <p role="alert">{error === 'denied' ? 'Not on the admin list.' : 'Sign-in expired. Try again.'}</p>}
        </main>
      ) : (
        <main>
          <p>Signed in as {Astro.locals.user?.login}</p>
        </main>
      )
    }
  </body>
</html>
```

- [ ] **Step 8: Verify both builds**

```bash
rm -rf .vercel dist
pnpm build && test -f dist/admin/index.html && test ! -e .vercel/output && echo STATIC_OK
VERCEL=1 SESSION_SECRET=build-only-secret-build-only-secret pnpm build && test -d .vercel/output/functions && echo VERCEL_OK
grep -rl "__SCHOLAROS_ADMIN__" .vercel/output/functions || echo DEFINE_OK
```

Expected: `STATIC_OK`, `VERCEL_OK`, `DEFINE_OK`. (If `pnpm build` fails on the injected routes, check that `src/admin/routes/[...path].astro` exists and every API file exports `prerender = false`.)

- [ ] **Step 9: Smoke-test sign-in in dev.** In a second terminal run:

```bash
VERCEL=1 ADMIN_STORE=memory SESSION_SECRET=dev-only-secret-dev-only-secret-00 pnpm astro dev --port 4329
```

Then:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4329/api/admin/me
curl -s -c /tmp/admin-jar -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:4329/api/admin/auth/dev
curl -s -b /tmp/admin-jar http://localhost:4329/admin | grep -o 'Signed in as dev'
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:4329/admin/login?error=denied'
curl -s -o /dev/null -w '%{http_code}\n' -X POST -b /tmp/admin-jar http://localhost:4329/api/admin/auth/logout
```

Expected, in order: `401`, `302 http://localhost:4329/admin`, `Signed in as dev`, `403`, `403` (no Origin header). Stop the dev server.

- [ ] **Step 10: CI builds both ways.** In `.github/workflows/lint.yml`, add after the `Unit tests` step:

```yaml
      - name: Static build (no adapter output; Sveltia admin present)
        run: |
          pnpm build
          admin_path=$(node -e "const y=require('js-yaml');console.log(y.load(require('fs').readFileSync('config/site.yml','utf8')).adminPath||'admin')")
          test -f "dist/$admin_path/index.html"
          test ! -e .vercel/output

      - name: Vercel build (admin routes are functions)
        env:
          VERCEL: '1'
          SESSION_SECRET: ci-build-only-not-a-real-secret-0000
        run: |
          pnpm build
          test -d .vercel/output/functions
          if grep -rq "__SCHOLAROS_ADMIN__" .vercel/output/functions; then echo "admin settings were not baked in"; exit 1; fi
```

- [ ] **Step 11: Run all tests and commit**

Run: `pnpm test`
Expected: PASS.

```bash
git add package.json pnpm-lock.yaml astro.config.mjs .gitignore .github/workflows/lint.yml src/integrations/admin.ts src/admin/sveltia src/env.d.ts src/middleware.ts src/middleware.test.ts 'src/admin/routes/[...path].astro' src/admin/routes/api/auth
git commit -m "feat(admin): Vercel adapter, admin route injection, session middleware, GitHub sign-in"
```

(`git mv` already staged the deletions under `src/pages/`.)

---

### Task 13: API core: errors, entries and config (`me`, `dashboard`, `collections`, `config`)

**Files:**
- Create: `src/lib/admin/http.ts`, `src/lib/admin/content.ts`
- Create: `src/admin/routes/api/me.ts`, `dashboard.ts`, `collections/[name].ts`, `collections/[name]/[slug].ts`, `config/[file].ts`
- Create: `src/lib/admin/routes.test.ts`

**Interfaces:**
- Consumes: Tasks 5–11 (`paths`, `serialize`, `store`, `get-store`, `github-store`, `media`, `cv-import`, `schemas`).
- Produces:
  - `http.ts`: `HttpError(status, message, details?)`, `CommitResult = { id; url?; versions: Record<path, string | null> }`, `json(body, status?)`, `authorOf(user)`, `fieldErrors(zodError)`, `route(handler)`, `readBody<T>(ctx)`, `commitChanges(store, changes, message, base): Promise<CommitResult>`
  - `content.ts`: `EntrySummary = { slug; data; version; readonly? }`, `Entry = { data; body; version; readonly }`, `listEntries(store, name)`, `readEntry(store, name, slug)`, `entryChange(name, slug, data, body): Change`, `readConfig(store, file): { data; version; source }`, `configChange(file, source, data): Change`
  - HTTP:
    - `GET /api/admin/me` → `{ user, capabilities: { contents, actions, error? } }`
    - `GET /api/admin/dashboard` → `{ posts: EntrySummary[], feedItems: FeedItem[], feeds: { data, version }, publications: number, cvUpdated: string | null, lastSync: string | null }`
    - `GET /api/admin/collections/:name` → `EntrySummary[]`
    - `GET|PUT|DELETE /api/admin/collections/:name/:slug`: GET → `Entry`; PUT `{ data, body, version | null, message? }` → `CommitResult`; DELETE `{ version }` → `CommitResult`
    - `GET|PUT /api/admin/config/:file`: GET → `{ data, version }`; PUT `{ data, version }` → `CommitResult`

- [ ] **Step 1: Write the failing test** `src/lib/admin/routes.test.ts`

```ts
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setStoreForTests } from './get-store';
import { MemoryStore } from './memory-store';
import { GET as listCollection } from '../../admin/routes/api/collections/[name]';
import { DELETE as deleteEntry, GET as getEntry, PUT as putEntry } from '../../admin/routes/api/collections/[name]/[slug]';
import { GET as getConfig, PUT as putConfig } from '../../admin/routes/api/config/[file]';
import { GET as dashboard } from '../../admin/routes/api/dashboard';

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  setStoreForTests(() => store);
});

const user = { login: 'jane', name: 'Jane', avatar: '' };
type Options = { method?: string; params?: Record<string, string>; body?: unknown; query?: string; signedIn?: boolean };

/** Calls an Astro route handler the way the adapter would, with the middleware's `locals.user`. */
function call(handler: (ctx: never) => Response | Promise<Response>, opts: Options = {}): Promise<Response> {
  const url = new URL(`https://site.test/api/admin/test${opts.query ?? ''}`);
  const body = opts.body === undefined ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body);
  const request = new Request(url, { method: opts.method ?? 'GET', body });
  const locals = opts.signedIn === false ? {} : { user };
  return Promise.resolve(handler({ request, url, params: opts.params ?? {}, locals } as never));
}

const comments = (s: string) => s.split('\n').filter((l) => l.trim().startsWith('#'));

test('collections: create → read → list; stale versions and duplicate creates conflict', async () => {
  const params = { name: 'posts', slug: 'route-test' };
  const data = { title: 'Hello', date: '2024-06-01', draft: true };
  const created = await call(putEntry, { method: 'PUT', params, body: { data, body: 'Costs $5 and $10.', version: null } });
  assert.equal(created.status, 200);
  const { versions } = await created.json();
  assert.equal(
    (await store.read('src/content/posts/route-test.md'))!.content,
    '---\ntitle: Hello\ndate: 2024-06-01\ndraft: true\n---\n\nCosts $5 and $10.\n',
  );
  const read = await (await call(getEntry, { params })).json();
  assert.deepEqual([read.data, read.body, read.version, read.readonly], [data, 'Costs $5 and $10.\n', versions['src/content/posts/route-test.md'], false]);

  const stale = await call(putEntry, { method: 'PUT', params, body: { data, body: '', version: 'stale' } });
  assert.equal(stale.status, 409);
  const duplicate = await call(putEntry, { method: 'PUT', params, body: { data, body: '', version: null } });
  assert.equal(duplicate.status, 409);

  const listed = await (await call(listCollection, { params: { name: 'posts' } })).json();
  assert.ok(listed.some((e: { slug: string; data: { title: string } }) => e.slug === 'route-test' && e.data.title === 'Hello'));
});

test('collections: field errors, bad names, missing entries, no session', async () => {
  const bad = await call(putEntry, { method: 'PUT', params: { name: 'posts', slug: 'x' }, body: { data: { date: 'not a date' }, body: '' } });
  assert.equal(bad.status, 400);
  const { details } = await bad.json();
  assert.ok(details.title && details.date, JSON.stringify(details));
  assert.equal((await call(putEntry, { method: 'PUT', params: { name: 'posts', slug: 'Bad Slug' }, body: { data: {} } })).status, 400);
  assert.equal((await call(getEntry, { params: { name: 'secrets', slug: 'x' } })).status, 400);
  assert.equal((await call(getEntry, { params: { name: 'posts', slug: 'does-not-exist' } })).status, 404);
  assert.equal((await call(getEntry, { params: { name: 'posts', slug: 'x' }, signedIn: false })).status, 401);
});

test('collections: deleting needs the current version', async () => {
  const params = { name: 'talks', slug: 'route-delete' };
  const data = { title: 'T', event: 'E', date: '2024', type: 'Seminar' };
  const created = await (await call(putEntry, { method: 'PUT', params, body: { data, body: '' } })).json();
  assert.equal((await call(deleteEntry, { method: 'DELETE', params, body: {} })).status, 400);
  const version = created.versions['src/content/talks/route-delete.md'];
  assert.equal((await call(deleteEntry, { method: 'DELETE', params, body: { version } })).status, 200);
  assert.equal(await store.read('src/content/talks/route-delete.md'), null);
});

test('config: save keeps comments; stale → 409; invalid → 400; unknown file → 400', async () => {
  const before = (await store.read('config/cv.yml'))!.content;
  const { data, version } = await (await call(getConfig, { params: { file: 'cv' } })).json();
  const renamed = { ...data, cv: { ...data.cv, name: 'Renamed Person' } };
  assert.equal((await call(putConfig, { method: 'PUT', params: { file: 'cv' }, body: { data: renamed, version } })).status, 200);
  const after = (await store.read('config/cv.yml'))!.content;
  assert.deepEqual(comments(after), comments(before));
  assert.match(after, /name: .?Renamed Person/);
  assert.equal((await call(putConfig, { method: 'PUT', params: { file: 'cv' }, body: { data, version } })).status, 409);
  const fresh = (await store.read('config/cv.yml'))!.version;
  assert.equal((await call(putConfig, { method: 'PUT', params: { file: 'cv' }, body: { data: { cv: {} }, version: fresh } })).status, 400);
  assert.equal((await call(getConfig, { params: { file: 'cms' } })).status, 400);
});

test('dashboard: posts, feed items, feeds config and counts in one response', async () => {
  const d = await (await call(dashboard)).json();
  assert.ok(Array.isArray(d.posts));
  assert.ok(Array.isArray(d.feedItems));
  assert.equal(typeof d.publications, 'number');
  assert.ok('version' in d.feeds && 'data' in d.feeds);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module '…/collections/[name]'`.

- [ ] **Step 3: Write `src/lib/admin/http.ts`**

```ts
import type { APIContext, APIRoute } from 'astro';
import { ZodError } from 'astro/zod';
import { ImportError } from './cv-import';
import { getStore } from './get-store';
import { MediaError } from './media';
import { PathError, assertAllowed } from './paths';
import type { SessionUser } from './session';
import { ConflictError, UpstreamError, gitBlobSha, type Author, type Change, type ContentStore } from './store';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface CommitResult {
  id: string;
  url?: string;
  /** New version of every file in the commit (null for deletions). */
  versions: Record<string, string | null>;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const authorOf = (user: SessionUser): Author => ({
  name: user.name || user.login,
  email: `${user.login}@users.noreply.github.com`,
});

/** Zod issues keyed like the admin's form fields: { "authors.0": "Required" }. */
export function fieldErrors(error: ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((i) => [i.path.join('.') || '_', i.message]));
}

function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message, details: e.details }, e.status);
  if (e instanceof ZodError) return json({ error: 'Some fields are invalid', details: fieldErrors(e) }, 400);
  if (e instanceof PathError) return json({ error: e.message }, 400);
  if (e instanceof ConflictError) return json({ error: e.message, details: { path: e.path } }, 409);
  if (e instanceof MediaError) return json({ error: e.message }, e.status);
  if (e instanceof ImportError) return json({ error: e.message, details: e.details }, 422);
  if (e instanceof UpstreamError) return json({ error: e.message }, e.status);
  // eslint-disable-next-line no-console
  console.error(e);
  return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
}

type Handler = (ctx: APIContext, store: ContentStore, user: SessionUser) => Promise<Response>;

/** An admin API route: needs the session user (set by the middleware), gets a per-request store, maps errors. */
export function route(handler: Handler): APIRoute {
  return async (ctx) => {
    const user = ctx.locals.user;
    if (!user) return json({ error: 'Not signed in' }, 401);
    try {
      return await handler(ctx, getStore(authorOf(user)), user);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readBody<T>(ctx: APIContext): Promise<T> {
  try {
    return (await ctx.request.json()) as T;
  } catch {
    throw new HttpError(400, 'The request body must be JSON');
  }
}

/** Checks every path against the allowlist, commits once, and returns the new version of each file. */
export async function commitChanges(
  store: ContentStore,
  changes: Change[],
  message: string,
  base: Record<string, string | null>,
): Promise<CommitResult> {
  if (new Set(changes.map((c) => c.path)).size !== changes.length) {
    throw new HttpError(400, 'The same file appears twice in one save');
  }
  for (const c of changes) assertAllowed(c.path);
  const result = await store.commit(changes, message, base);
  const versions = Object.fromEntries(
    changes.map((c) => [c.path, c.content === null ? null : gitBlobSha(c.content, c.encoding)]),
  );
  return { ...result, versions };
}
```

- [ ] **Step 4: Write `src/lib/admin/content.ts`**

```ts
import { parse } from 'yaml';
import { adminCollections, configSchemas } from '../schemas';
import { HttpError } from './http';
import { collectionDir, collectionPath, configPath, type CollectionName, type ConfigFile } from './paths';
import { parseMarkdown, serializeMarkdown, updateYaml } from './serialize';
import type { Change, ContentStore } from './store';

export interface EntrySummary {
  slug: string;
  data: Record<string, unknown>;
  version: string;
  /** .mdx entries: listed and readable, never written. */
  readonly?: boolean;
}

export interface Entry {
  data: Record<string, unknown>;
  body: string;
  version: string;
  readonly: boolean;
}

const slugOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.mdx?$/, '');

export async function listEntries(store: ContentStore, name: CollectionName): Promise<EntrySummary[]> {
  const files = (await store.list(collectionDir(name))).filter((f) => /\.mdx?$/.test(f.path));
  // ponytail: one read per entry (N GitHub requests); batch through GraphQL if long lists get slow.
  return Promise.all(
    files.map(async (f) => {
      const file = await store.read(f.path);
      return {
        slug: slugOf(f.path),
        data: file ? parseMarkdown(file.content).data : {},
        version: f.version,
        ...(f.path.endsWith('.mdx') ? { readonly: true } : {}),
      };
    }),
  );
}

export async function readEntry(store: ContentStore, name: CollectionName, slug: string): Promise<Entry | null> {
  for (const ext of ['md', 'mdx'] as const) {
    const file = await store.read(collectionPath(name, slug, ext));
    if (file) return { ...parseMarkdown(file.content), version: file.version, readonly: ext === 'mdx' };
  }
  return null;
}

/** Fields the form left empty are dropped: every schema treats absent and '' alike. */
function withoutEmpty(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

/** Validates front matter with the collection's schema; writes the raw values in schema key order. */
export function entryChange(name: CollectionName, slug: string, data: unknown, body: unknown): Change {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, '`data` must be an object');
  const schema = adminCollections[name];
  const fields = withoutEmpty(data as Record<string, unknown>);
  schema.parse(fields);
  return {
    path: collectionPath(name, slug),
    content: serializeMarkdown(fields, typeof body === 'string' ? body : '', Object.keys(schema.shape)),
  };
}

export async function readConfig(
  store: ContentStore,
  file: ConfigFile,
): Promise<{ data: Record<string, unknown>; version: string | null; source: string }> {
  const found = await store.read(configPath(file));
  return {
    data: ((found ? parse(found.content) : null) ?? {}) as Record<string, unknown>,
    version: found?.version ?? null,
    source: found?.content ?? '',
  };
}

/** Validates a whole config object and rewrites the file around it (comments and order kept). */
export function configChange(file: ConfigFile, source: string, data: unknown): Change {
  configSchemas[file].parse(data);
  return { path: configPath(file), content: updateYaml(source, data) };
}
```

- [ ] **Step 5: Write the routes**

`src/admin/routes/api/me.ts`:

```ts
import type { APIRoute } from 'astro';
import { getStore } from '../../../lib/admin/get-store';
import { GitHubStore } from '../../../lib/admin/github-store';
import { authorOf, json } from '../../../lib/admin/http';

export const prerender = false;

/** The signed-in user and what the GitHub token can do (drives the admin's permission banner). */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Not signed in' }, 401);
  let capabilities: { contents: boolean; actions: boolean; error?: string } = { contents: true, actions: true };
  try {
    const store = getStore(authorOf(locals.user));
    if (store instanceof GitHubStore) capabilities = await store.capabilities();
  } catch (e) {
    capabilities = { contents: false, actions: false, error: e instanceof Error ? e.message : String(e) };
  }
  return json({ user: locals.user, capabilities });
};
```

`src/admin/routes/api/dashboard.ts`:

```ts
import { listEntries, readConfig } from '../../../lib/admin/content';
import { json, route } from '../../../lib/admin/http';
import { FEEDS_JSON, collectionDir, configPath } from '../../../lib/admin/paths';

export const prerender = false;

export const GET = route(async (_ctx, store) => {
  const [posts, publications, feeds, feedsJson, cvUpdated, lastSync] = await Promise.all([
    listEntries(store, 'posts'),
    store.list(collectionDir('publications')),
    readConfig(store, 'feeds'),
    store.read(FEEDS_JSON),
    store.lastModified(configPath('cv')),
    store.lastModified(FEEDS_JSON),
  ]);
  return json({
    posts,
    feedItems: feedsJson ? JSON.parse(feedsJson.content) : [],
    feeds: { data: feeds.data, version: feeds.version },
    publications: publications.filter((f) => /\.mdx?$/.test(f.path)).length,
    cvUpdated,
    lastSync,
  });
});
```

`src/admin/routes/api/collections/[name].ts`:

```ts
import { listEntries } from '../../../../lib/admin/content';
import { json, route } from '../../../../lib/admin/http';
import { assertCollection } from '../../../../lib/admin/paths';

export const prerender = false;

export const GET = route(async ({ params }, store) => json(await listEntries(store, assertCollection(params.name))));
```

`src/admin/routes/api/collections/[name]/[slug].ts`:

```ts
import { entryChange, readEntry } from '../../../../../lib/admin/content';
import { HttpError, commitChanges, json, readBody, route } from '../../../../../lib/admin/http';
import { assertCollection, assertSlug, collectionPath } from '../../../../../lib/admin/paths';

export const prerender = false;

export const GET = route(async ({ params }, store) => {
  const entry = await readEntry(store, assertCollection(params.name), assertSlug(params.slug));
  if (!entry) throw new HttpError(404, 'Not found');
  return json(entry);
});

export const PUT = route(async (ctx, store) => {
  const name = assertCollection(ctx.params.name);
  const slug = assertSlug(ctx.params.slug);
  const { data, body, version = null, message } = await readBody<{
    data?: unknown;
    body?: unknown;
    version?: string | null;
    message?: unknown;
  }>(ctx);
  const change = entryChange(name, slug, data, body);
  const summary =
    typeof message === 'string' && message.trim() ? message.trim().slice(0, 200) : `${version ? 'Update' : 'Create'} ${name}/${slug}`;
  return json(await commitChanges(store, [change], summary, { [change.path]: version }));
});

export const DELETE = route(async (ctx, store) => {
  const name = assertCollection(ctx.params.name);
  const slug = assertSlug(ctx.params.slug);
  const { version } = await readBody<{ version?: string }>(ctx);
  if (!version) throw new HttpError(400, '`version` is required to delete');
  const path = collectionPath(name, slug);
  return json(await commitChanges(store, [{ path, content: null }], `Delete ${name}/${slug}`, { [path]: version }));
});
```

`src/admin/routes/api/config/[file].ts`:

```ts
import { configChange, readConfig } from '../../../../lib/admin/content';
import { commitChanges, json, readBody, route } from '../../../../lib/admin/http';
import { assertConfigFile, configPath } from '../../../../lib/admin/paths';
import { ConflictError } from '../../../../lib/admin/store';

export const prerender = false;

export const GET = route(async ({ params }, store) => {
  const { data, version } = await readConfig(store, assertConfigFile(params.file));
  return json({ data, version });
});

/** Takes the whole object plus the version it was loaded at. */
export const PUT = route(async (ctx, store) => {
  const file = assertConfigFile(ctx.params.file);
  const { data, version = null } = await readBody<{ data?: unknown; version?: string | null }>(ctx);
  const current = await readConfig(store, file);
  if (current.version !== version) throw new ConflictError(configPath(file));
  const change = configChange(file, current.source, data);
  return json(await commitChanges(store, [change], `Update ${configPath(file)}`, { [change.path]: version }));
});
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin/http.ts src/lib/admin/content.ts src/lib/admin/routes.test.ts src/admin/routes/api/me.ts src/admin/routes/api/dashboard.ts src/admin/routes/api/collections src/admin/routes/api/config
git commit -m "feat(admin): API for entries, config files, dashboard and token capabilities"
```

---

### Task 14: API: CV publish/import/PDF, feeds, media

**Files:**
- Create: `src/admin/routes/api/cv/publish.ts`, `cv/import.ts`, `cv/pdf.ts`
- Create: `src/admin/routes/api/feeds/sync.ts`, `feeds/hidden.ts`
- Create: `src/admin/routes/api/media.ts`
- Modify: `src/lib/admin/routes.test.ts` (append)

**Interfaces:**
- Consumes: Task 13 helpers; `importRenderCv` (Task 11); `syncFeeds` (Task 4); `prepareUpload`, `MAX_UPLOAD`, `MediaError` (Task 10); `GitHubStore.dispatchWorkflow` / `latestRun` (Task 9); `SITE_MEDIA`, `assertMediaPath` (Task 5).
- Produces (HTTP):
  - `POST /api/admin/cv/publish` takes `{ cv, cvVersion, publications: { slug, data, body, version | null }[], uploadVersion? }` and returns `CommitResult` (one commit; with `uploadVersion` it also sets `enabled: false` in `cv-upload.yml`).
  - `POST /api/admin/cv/import` takes `{ yaml }` and returns `{ cv, publications: { slug, data, body, version }[], summary }` (no commit).
  - `POST /api/admin/cv/pdf` returns `{ dispatched: true }` (501 without GitHub). `GET /api/admin/cv/pdf` returns `{ run: WorkflowRun | null }`.
  - `POST /api/admin/feeds/sync` returns `{ changed, count, failed, …CommitResult? }`.
  - `PUT /api/admin/feeds/hidden` takes `{ id, hidden }` and returns `CommitResult`.
  - `GET /api/admin/media?folder=content|site` returns `{ path, url, version }[]`.
  - `POST /api/admin/media` takes a multipart `file` and `folder` and returns `{ path, url, version, commit: { id, url } | null }`.
  - `DELETE /api/admin/media` takes `{ path, version }` and returns `CommitResult`.

- [ ] **Step 1: Append the failing tests** to `src/lib/admin/routes.test.ts`. Add these imports at the top:

```ts
import fs from 'node:fs';
import { POST as importCv } from '../../admin/routes/api/cv/import';
import { GET as pdfStatus, POST as generatePdf } from '../../admin/routes/api/cv/pdf';
import { POST as publishCv } from '../../admin/routes/api/cv/publish';
import { PUT as hideFeed } from '../../admin/routes/api/feeds/hidden';
import { DELETE as deleteMedia, GET as listMedia, POST as uploadMedia } from '../../admin/routes/api/media';
import { adminSettings } from './settings';
```

and these tests at the end:

```ts
const publication = (title: string) => ({ title, authors: ['A'], venue: 'V', year: 2024, type: 'journal' });

test('cv/publish: cv.yml, publications and the upload switch land in one commit', async () => {
  const cv = await (await call(getConfig, { params: { file: 'cv' } })).json();
  const upload = (await store.read('config/cv-upload.yml'))!;
  const res = await call(publishCv, {
    method: 'POST',
    body: {
      cv: cv.data,
      cvVersion: cv.version,
      publications: [{ slug: 'route-pub', data: publication('P'), body: '', version: null }],
      uploadVersion: upload.version,
    },
  });
  assert.equal(res.status, 200);
  assert.equal(store.log.length, 1);
  assert.deepEqual(store.log[0].paths.sort(), ['config/cv-upload.yml', 'config/cv.yml', 'src/content/publications/route-pub.md']);
  assert.match((await store.read('config/cv-upload.yml'))!.content, /enabled: false/);

  const { versions } = await res.json();
  const twice = [
    { slug: 'dup', data: publication('A'), body: '', version: null },
    { slug: 'dup', data: publication('B'), body: '', version: null },
  ];
  const dup = await call(publishCv, { method: 'POST', body: { cv: cv.data, cvVersion: versions['config/cv.yml'], publications: twice } });
  assert.equal(dup.status, 400);
  const stale = await call(publishCv, { method: 'POST', body: { cv: cv.data, cvVersion: cv.version, publications: [] } });
  assert.equal(stale.status, 409);
});

test('cv/import: a preview with bodies, never a commit; bad input → 422', async () => {
  const res = await call(importCv, { method: 'POST', body: { yaml: fs.readFileSync('tests/fixtures/rendercv.yaml', 'utf8') } });
  assert.equal(res.status, 200);
  const preview = await res.json();
  assert.ok(preview.publications.length > 0);
  assert.ok(preview.publications.every((p: { body: unknown }) => typeof p.body === 'string'));
  assert.equal(store.log.length, 0);
  assert.equal((await call(importCv, { method: 'POST', body: { yaml: 'cv: [' } })).status, 422);
  assert.equal((await call(importCv, { method: 'POST', body: {} })).status, 422);
});

test('cv/pdf: needs the GitHub store', async () => {
  assert.deepEqual(await (await call(pdfStatus)).json(), { run: null });
  assert.equal((await call(generatePdf, { method: 'POST' })).status, 501);
});

test('feeds/hidden toggles an id in feeds.yml', async () => {
  assert.equal((await call(hideFeed, { method: 'PUT', body: { id: 'feed-x', hidden: true } })).status, 200);
  assert.match((await store.read('config/feeds.yml'))!.content, /- feed-x\n/);
  assert.equal((await call(hideFeed, { method: 'PUT', body: { id: 'feed-x', hidden: false } })).status, 200);
  assert.doesNotMatch((await store.read('config/feeds.yml'))!.content, /feed-x/);
  assert.equal((await call(hideFeed, { method: 'PUT', body: { id: '', hidden: true } })).status, 400);
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
function upload(folder: string, name = 'Fig One.png', bytes: Uint8Array = PNG) {
  const form = new FormData();
  form.append('file', new File([bytes], name));
  form.append('folder', folder);
  return call(uploadMedia, { method: 'POST', body: form });
}

test('media: collection images vs site images get the right folder and URL', async () => {
  const { mediaFolder, publicFolder } = adminSettings();
  const content = await (await upload('content')).json();
  assert.match(content.path, new RegExp(`^${mediaFolder}/fig-one-[0-9a-f]{6}\\.png$`));
  assert.equal(content.url, `${publicFolder}/${content.path.split('/').pop()}`);
  assert.ok(content.commit.id);

  const site = await (await upload('site')).json();
  assert.match(site.path, /^public\/images\/fig-one-[0-9a-f]{6}\.png$/);
  assert.match(site.url, /^\/images\/fig-one-[0-9a-f]{6}\.png$/);
  assert.equal((await (await upload('site')).json()).commit, null, 'same bytes: no second commit');

  const listed = await (await call(listMedia, { query: '?folder=site' })).json();
  assert.ok(listed.some((f: { path: string; url: string }) => f.path === site.path && f.url === site.url));
  assert.equal((await upload('site', 'notes.txt', Buffer.from('hello'))).status, 415);
  assert.equal((await upload('elsewhere')).status, 400);

  assert.equal((await call(deleteMedia, { method: 'DELETE', body: { path: site.path, version: site.version } })).status, 200);
  assert.equal((await call(deleteMedia, { method: 'DELETE', body: { path: 'package.json', version: 'x' } })).status, 400);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test`
Expected: FAIL with `Cannot find module '…/cv/import'`.

- [ ] **Step 3: Write the CV routes**

`src/admin/routes/api/cv/publish.ts`:

```ts
import { ZodError } from 'astro/zod';
import { configChange, entryChange, readConfig } from '../../../../lib/admin/content';
import { HttpError, commitChanges, fieldErrors, json, readBody, route } from '../../../../lib/admin/http';
import { assertSlug, collectionPath, configPath } from '../../../../lib/admin/paths';
import { ConflictError, type Change } from '../../../../lib/admin/store';

export const prerender = false;

interface PublicationIn {
  slug?: unknown;
  data?: unknown;
  body?: unknown;
  version?: string | null;
}

/** The CV screen's Publish: cv.yml + imported publications (+ turning a raw upload off) in one commit. */
export const POST = route(async (ctx, store) => {
  const {
    cv,
    cvVersion = null,
    publications = [],
    uploadVersion,
  } = await readBody<{ cv?: unknown; cvVersion?: string | null; publications?: PublicationIn[]; uploadVersion?: string | null }>(ctx);
  if (!Array.isArray(publications)) throw new HttpError(400, '`publications` must be a list');

  const current = await readConfig(store, 'cv');
  if (current.version !== cvVersion) throw new ConflictError(configPath('cv'));
  const changes: Change[] = [configChange('cv', current.source, cv)];
  const base: Record<string, string | null> = { [configPath('cv')]: cvVersion };

  for (const p of publications) {
    const slug = assertSlug(p.slug);
    try {
      changes.push(entryChange('publications', slug, p.data, p.body));
    } catch (e) {
      if (e instanceof ZodError) throw new HttpError(400, `Publication "${slug}" is invalid`, fieldErrors(e));
      throw e;
    }
    base[collectionPath('publications', slug)] = p.version ?? null;
  }

  if (uploadVersion !== undefined) {
    const upload = await readConfig(store, 'cv-upload');
    changes.push(configChange('cv-upload', upload.source, { ...upload.data, enabled: false }));
    base[configPath('cv-upload')] = uploadVersion;
  }

  const message = publications.length ? `Update CV and ${publications.length} publication(s)` : 'Update CV';
  return json(await commitChanges(store, changes, message, base));
});
```

`src/admin/routes/api/cv/import.ts`:

```ts
import { listEntries, readEntry } from '../../../../lib/admin/content';
import { ImportError, importRenderCv } from '../../../../lib/admin/cv-import';
import { json, readBody, route } from '../../../../lib/admin/http';

export const prerender = false;

/** RenderCV YAML → a preview for the CV screen. Nothing is committed until Publish. */
export const POST = route(async (ctx, store) => {
  const { yaml } = await readBody<{ yaml?: unknown }>(ctx);
  if (typeof yaml !== 'string' || !yaml.trim()) throw new ImportError('Paste a RenderCV YAML document or choose a file');
  const result = importRenderCv(yaml, await listEntries(store, 'publications'));
  const publications = await Promise.all(
    result.publications.map(async (p) => ({
      ...p,
      // Matched entries keep their body; Publish rewrites the whole file.
      body: p.version ? ((await readEntry(store, 'publications', p.slug))?.body ?? '') : '',
    })),
  );
  return json({ ...result, publications });
});
```

`src/admin/routes/api/cv/pdf.ts`:

```ts
import { GitHubStore } from '../../../../lib/admin/github-store';
import { HttpError, json, route } from '../../../../lib/admin/http';

export const prerender = false;

const WORKFLOW = 'render-cv.yml';

export const POST = route(async (_ctx, store) => {
  if (!(store instanceof GitHubStore)) throw new HttpError(501, 'PDF generation runs on GitHub Actions');
  await store.dispatchWorkflow(WORKFLOW);
  return json({ dispatched: true });
});

export const GET = route(async (_ctx, store) =>
  json({ run: store instanceof GitHubStore ? await store.latestRun(WORKFLOW) : null }),
);
```

- [ ] **Step 4: Write the feeds routes**

`src/admin/routes/api/feeds/sync.ts`:

```ts
import { readConfig } from '../../../../lib/admin/content';
import { HttpError, commitChanges, json, route } from '../../../../lib/admin/http';
import { FEEDS_JSON } from '../../../../lib/admin/paths';
import { syncFeeds, type FeedsConfig } from '../../../../lib/feeds';

export const prerender = false;

/** "Check now": fetch every feed, commit src/data/feeds.json when it changed. */
export const POST = route(async (_ctx, store) => {
  const [config, current] = await Promise.all([readConfig(store, 'feeds'), store.read(FEEDS_JSON)]);
  let result;
  try {
    result = await syncFeeds(config.data as FeedsConfig, current ? JSON.parse(current.content) : []);
  } catch (e) {
    throw new HttpError(502, e instanceof Error ? e.message : String(e));
  }
  const content = JSON.stringify(result.items, null, 2) + '\n';
  const summary = { count: result.items.length, failed: result.failed };
  if (current?.content === content) return json({ changed: false, ...summary });
  const commit = await commitChanges(store, [{ path: FEEDS_JSON, content }], 'Sync feeds', {
    [FEEDS_JSON]: current?.version ?? null,
  });
  return json({ changed: true, ...summary, ...commit });
});
```

`src/admin/routes/api/feeds/hidden.ts`:

```ts
import { configChange, readConfig } from '../../../../lib/admin/content';
import { HttpError, commitChanges, json, readBody, route } from '../../../../lib/admin/http';

export const prerender = false;

/** Hide or unhide one feed item on the public site (`hidden:` in config/feeds.yml). */
export const PUT = route(async (ctx, store) => {
  const { id, hidden } = await readBody<{ id?: unknown; hidden?: unknown }>(ctx);
  if (typeof id !== 'string' || !id || id.length > 200 || typeof hidden !== 'boolean') {
    throw new HttpError(400, '`id` (string) and `hidden` (boolean) are required');
  }
  const current = await readConfig(store, 'feeds');
  const ids = new Set(Array.isArray(current.data.hidden) ? (current.data.hidden as string[]) : []);
  if (hidden) ids.add(id);
  else ids.delete(id);
  const change = configChange('feeds', current.source, { ...current.data, hidden: [...ids] });
  return json(
    await commitChanges(store, [change], `${hidden ? 'Hide' : 'Unhide'} feed item ${id}`, { [change.path]: current.version }),
  );
});
```

- [ ] **Step 5: Write `src/admin/routes/api/media.ts`**

```ts
import { HttpError, commitChanges, json, readBody, route } from '../../../lib/admin/http';
import { MAX_UPLOAD, MediaError, prepareUpload } from '../../../lib/admin/media';
import { SITE_MEDIA, assertMediaPath } from '../../../lib/admin/paths';
import { adminSettings } from '../../../lib/admin/settings';

export const prerender = false;

/** `content`: collection images (processed by image()); `site`: plain-URL images for config files and post bodies. */
function folderOf(value: unknown): { dir: string; url: string } {
  if (value === 'content') return { dir: adminSettings().mediaFolder, url: adminSettings().publicFolder };
  if (value === 'site') return SITE_MEDIA;
  throw new HttpError(400, "`folder` must be 'content' or 'site'");
}

const IMAGE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

export const GET = route(async ({ url }, store) => {
  const folder = folderOf(url.searchParams.get('folder') ?? 'content');
  const files = (await store.list(folder.dir)).filter((f) => IMAGE.test(f.path));
  return json(files.map((f) => ({ path: f.path, version: f.version, url: folder.url + f.path.slice(folder.dir.length) })));
});

export const POST = route(async ({ request }, store) => {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_UPLOAD + 64 * 1024) {
    throw new MediaError('Files must be 4 MB or smaller', 413);
  }
  const form = await request.formData().catch(() => {
    throw new HttpError(400, 'Expected a multipart form upload');
  });
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'No file in the upload');
  const folder = folderOf(form.get('folder') ?? 'content');
  const { filename, base64 } = prepareUpload(file.name, new Uint8Array(await file.arrayBuffer()));
  const path = `${folder.dir}/${filename}`;
  const url = `${folder.url}/${filename}`;
  // The name carries a content hash: the same image is already there, nothing to commit.
  const existing = (await store.list(folder.dir)).find((f) => f.path === path);
  if (existing) return json({ path, url, version: existing.version, commit: null });
  const result = await commitChanges(store, [{ path, content: base64, encoding: 'base64' }], `Upload ${path}`, { [path]: null });
  return json({ path, url, version: result.versions[path], commit: { id: result.id, url: result.url } });
});

export const DELETE = route(async (ctx, store) => {
  const { path, version } = await readBody<{ path?: unknown; version?: unknown }>(ctx);
  if (typeof version !== 'string' || !version) throw new HttpError(400, '`version` is required to delete');
  const file = assertMediaPath(path);
  return json(await commitChanges(store, [{ path: file, content: null }], `Delete ${file}`, { [file]: version }));
});
```

- [ ] **Step 6: Run the tests and the Vercel build**

Run: `pnpm test && rm -rf .vercel && VERCEL=1 SESSION_SECRET=build-only-secret-build-only-secret pnpm build`
Expected: tests PASS, and the build succeeds with every route injected.

- [ ] **Step 7: Commit**

```bash
git add src/admin/routes/api/cv src/admin/routes/api/feeds src/admin/routes/api/media.ts src/lib/admin/routes.test.ts
git commit -m "feat(admin): API for CV publish/import/PDF, feed sync and hiding, media uploads"
```

---

### Task 15: Editor schema and the Markdown round trip

**Files:**
- Modify: `package.json` (Tiptap, KaTeX, happy-dom)
- Create: `src/admin/editor/extensions.ts`, `src/admin/editor/markdown.test.ts`

**Interfaces:**
- Produces: `INLINE_MATH: RegExp`, `MathClick = (kind: 'inline' | 'block', node, pos) => void`, `editorExtensions(onMathClick?): AnyExtension[]`. `MarkdownEditor.vue` (Task 16) and the test both build their editor from this list.

- [ ] **Step 1: Add the dependencies**

```bash
pnpm add @tiptap/core@^3.31.4 @tiptap/pm@^3.31.4 @tiptap/vue-3@^3.31.4 @tiptap/starter-kit@^3.31.4 @tiptap/markdown@^3.31.4 @tiptap/extension-mathematics@^3.31.4 @tiptap/extension-image@^3.31.4 @tiptap/extension-table@^3.31.4 katex@^0.18.11
pnpm add -D happy-dom@^20.14.5
```

(`@tiptap/extension-mathematics` 3.31 needs KaTeX `^0.16 || ^0.17 || ^0.18`, so 0.19 doesn't fit.)

- [ ] **Step 2: Write the failing test** `src/admin/editor/markdown.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

// Tiptap needs a DOM even without a mounted view.
const window = new Window();
window.document.write('<!DOCTYPE html><html><body></body></html>');
Object.assign(globalThis, { window, document: window.document });
for (const key of ['navigator', 'Node', 'HTMLElement', 'Element', 'getComputedStyle', 'DOMParser', 'MutationObserver']) {
  (globalThis as Record<string, unknown>)[key] ??= (window as unknown as Record<string, unknown>)[key];
}

const { Editor } = await import('@tiptap/core');
const { editorExtensions } = await import('./extensions');

const editor = (markdown: string) => new Editor({ extensions: editorExtensions(), content: markdown, contentType: 'markdown' });
const roundTrip = (markdown: string) => editor(markdown).getMarkdown();
const tidy = (s: string) => s.replace(/\n{3,}/g, '\n\n').trim();

/** Written the way the editor writes it (tables padded), so the round trip is exact. */
const CANONICAL = [
  '## Heading',
  '',
  'Some **bold** and *italic* text with a [link](https://example.com) and `code`.',
  '',
  '- one',
  '- two',
  '',
  '1. first',
  '2. second',
  '',
  '> quoted',
  '',
  '```python',
  'print("hi")',
  '```',
  '',
  'Inline math $E = mc^2$ here.',
  '',
  '$$',
  '\\int_0^1 x\\,dx',
  '$$',
  '',
  '![alt text](/images/fig.png)',
  '',
  '| a   | b   |',
  '| --- | --- |',
  '| 1   | 2   |',
].join('\n');

test('headings, lists, code, inline and block math, images and tables survive a round trip', () => {
  assert.equal(tidy(roundTrip(CANONICAL)), tidy(CANONICAL));
});

test('the round trip is stable', () => {
  const once = roundTrip(CANONICAL);
  assert.equal(roundTrip(once), once);
});

test('dollar amounts stay text; real inline math is math', () => {
  assert.equal(roundTrip('Costs $500K and $1M per year.').trim(), 'Costs $500K and $1M per year.');
  assert.equal(roundTrip('Price is $5.').trim(), 'Price is $5.');
  assert.ok(!JSON.stringify(editor('Costs $500K and $1M per year.').getJSON()).includes('inlineMath'));
  assert.ok(JSON.stringify(editor('Inline $E = mc^2$ and $x$.').getJSON()).includes('"latex":"E = mc^2"'));
  assert.equal(roundTrip('Inline $E = mc^2$ and $x$.').trim(), 'Inline $E = mc^2$ and $x$.');
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './extensions'`.

- [ ] **Step 4: Write `src/admin/editor/extensions.ts`**

```ts
import type { AnyExtension } from '@tiptap/core';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import type { Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';

/**
 * Pandoc's rule for inline math: no space just inside the dollars and no digit right after the closing one.
 * Tiptap's default tokenizer reads "$500K and $1M" as math and drops a space when it saves.
 */
export const INLINE_MATH = /^\$(?!\s)((?:\\.|[^$\\\n])*?[^\s$\\])\$(?![\d$])/;

const StrictInlineMath = InlineMath.extend({
  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: (src: string) => src.indexOf('$'),
    tokenize: (src: string) => {
      const match = INLINE_MATH.exec(src);
      return match ? { type: 'inlineMath', raw: match[0], latex: match[1] } : undefined;
    },
  },
});

export type MathClick = (kind: 'inline' | 'block', node: PMNode, pos: number) => void;

/** The editor's schema: Markdown in and out ($…$ / $$…$$ math, ![alt](src) images, GFM tables). */
export function editorExtensions(onMathClick?: MathClick): AnyExtension[] {
  return [
    StarterKit.configure({ link: { openOnClick: false } }),
    Markdown,
    StrictInlineMath.configure({ onClick: onMathClick && ((node: PMNode, pos: number) => onMathClick('inline', node, pos)) }),
    BlockMath.configure({ onClick: onMathClick && ((node: PMNode, pos: number) => onMathClick('block', node, pos)) }),
    Image,
    TableKit,
  ];
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS. (A KaTeX "quirks mode" warning means the doctype line in the test is missing.)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/admin/editor
git commit -m "feat(admin): Tiptap Markdown schema with strict inline math, round-trip tested"
```

---

### Task 16: Admin UI foundation: page, styles, shell, forms, media, editor, e2e harness

**Files:**
- Create: `src/admin/admin.css`, `src/admin/types.ts`, `src/admin/api.ts`, `src/admin/useDocument.ts`, `src/admin/fields.ts`, `src/admin/fields.test.ts`
- Create: `src/admin/AdminShell.vue`, `DocBanners.vue`, `ListInput.vue`, `FormFields.vue`, `ImagePicker.vue`, `MediaGrid.vue`, `MarkdownEditor.vue`, `Media.vue`
- Replace: `src/admin/routes/[...path].astro`
- Create: `playwright.config.ts`, `tests/e2e/admin.spec.ts`
- Modify: `package.json` (`test:e2e`, `@playwright/test`), `.gitignore`

**Interfaces:**
- Consumes: the HTTP API (Tasks 13–14), `editorExtensions` (Task 15), `bibtexFor` (`src/lib/bibtex.ts`), `isOwner` (`src/lib/editorial.ts`).
- Produces (later screens rely on these):
  - `types.ts`: `AdminCtx = { adminPath; siteName; user }`, `CommitResult`, `Entry = { slug; data; version; readonly? }`, `MediaFile = { path; url; version }`
  - `api.ts`: `api<T>(path, { method?, body?, form? })`, `ApiError(status, message, details?)`, `toast(text, href?)`, `toasts`, `committed(result)`, `report(error)`
  - `useDocument<T>()` → reactive `{ key, current, version, draft, errors, conflict, saving, open(key, load), reload(), restore(), discard(), save(send, path) }`
  - `fields.ts`: `FieldDef`, `FieldType`, `Option`, `OptionSource`, `getIn`, `setIn`, `replaceAt`, `resolveOptions`, `optionOf`
  - Components:
    - `<AdminShell :ctx active title>` with an `actions` slot
    - `<DocBanners :draft :conflict @restore @discard @reload>`
    - `<FormFields :fields :model :errors? :prefix? :owner?>`
    - `<ListInput :items :blank? :fixed? :add-label? @update>`
    - `<ImagePicker v-model :folder :label>`
    - `<MediaGrid :folder :pickable? @pick>`
    - `<MarkdownEditor v-model :compact? :preview?>`
  - Admin page screens so far: `login`, `media`. Later tasks add one import, one `SCREENS` entry and one render line each.

- [ ] **Step 1: Write the failing unit test** `src/admin/fields.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getIn, replaceAt, resolveOptions, setIn, type FieldDef } from './fields';

test('getIn/setIn walk dotted paths; empty strings and undefined delete the key', () => {
  const model: Record<string, any> = {};
  setIn(model, 'socials.github', 'https://github.com/x');
  assert.deepEqual(model, { socials: { github: 'https://github.com/x' } });
  assert.equal(getIn(model, 'socials.github'), 'https://github.com/x');
  assert.equal(getIn(model, 'missing.deep'), undefined);
  setIn(model, 'socials.github', '');
  assert.deepEqual(model, { socials: {} });
  setIn(model, 'count', 0);
  setIn(model, 'flag', false);
  assert.deepEqual([model.count, model.flag], [0, false]);
  setIn(model, 'count', undefined);
  assert.ok(!('count' in model));
});

test('replaceAt returns a new list', () => {
  const list = ['a', 'b'];
  assert.deepEqual(replaceAt(list, 1, 'c'), ['a', 'c']);
  assert.deepEqual(list, ['a', 'b']);
  assert.deepEqual(replaceAt(undefined, 0, 'x'), []);
});

test('resolveOptions fills option lists, including nested object fields', () => {
  const fields: FieldDef[] = [
    { key: 'topic', label: 'Topic', type: 'select', optionsFrom: 'topics' },
    { key: 'areas', label: 'Areas', type: 'objects', fields: [{ key: 'publications', label: 'P', type: 'pubs', optionsFrom: 'publications' }] },
  ];
  const out = resolveOptions(fields, { topics: [{ value: 'nlp', label: 'NLP' }], publications: [{ value: 'p1', label: 'Paper' }] });
  assert.deepEqual(out[0].options, [{ value: 'nlp', label: 'NLP' }]);
  assert.deepEqual(out[1].fields![0].options, [{ value: 'p1', label: 'Paper' }]);
  assert.equal(fields[0].options, undefined, 'inputs are not mutated');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test`
Expected: FAIL with `Cannot find module './fields'`.

- [ ] **Step 3: Write `src/admin/types.ts`, `src/admin/fields.ts`, `src/admin/api.ts` and `src/admin/useDocument.ts`**

`src/admin/types.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any -- front matter is user data of any shape */

export interface AdminCtx {
  adminPath: string;
  siteName: string;
  user: { login: string; name: string; avatar: string } | null;
}

export interface CommitResult {
  id: string;
  url?: string;
  versions: Record<string, string | null>;
}

export interface Entry {
  slug: string;
  data: Record<string, any>;
  version: string;
  readonly?: boolean;
}

export interface MediaFile {
  path: string;
  url: string;
  version: string;
}
```

`src/admin/fields.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any -- form models are user data of any shape */

export type Option = { value: string; label: string };
export type OptionSource = 'publications' | 'topics';
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'color'
  | 'list'
  | 'authors'
  | 'image'
  | 'markdown'
  | 'pubs'
  | 'bibtex'
  | 'objects'
  | 'readonly';

export interface FieldDef {
  /** Dotted path into the model, e.g. "socials.github". */
  key: string;
  label: string;
  type: FieldType;
  options?: (string | Option)[];
  /** Filled in at runtime by resolveOptions(). */
  optionsFrom?: OptionSource;
  /** image: 'content' → media_folder (image() fields); 'site' → public/images (plain URLs). */
  folder?: 'content' | 'site';
  /** objects: the fields of each item. */
  fields?: FieldDef[];
  /** objects: reorder only, no add/remove. */
  fixed?: boolean;
  /** checkbox: what an absent key means. */
  default?: unknown;
  hint?: string;
}

export function getIn(obj: unknown, key: string): any {
  return key.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Sets a dotted path, creating objects on the way; '' and undefined delete the key (absent = empty everywhere). */
export function setIn(obj: Record<string, any>, key: string, value: unknown): void {
  const parts = key.split('.');
  const last = parts.pop()!;
  let target = obj;
  for (const part of parts) target = target[part] ??= {};
  if (value === undefined || value === '') delete target[last];
  else target[last] = value;
}

export const replaceAt = <T>(list: T[] | undefined, index: number, value: T): T[] =>
  (list ?? []).map((item, i) => (i === index ? value : item));

export const optionOf = (o: string | Option): Option => (typeof o === 'string' ? { value: o, label: o } : o);

export function resolveOptions(fields: FieldDef[], sources: Partial<Record<OptionSource, Option[]>>): FieldDef[] {
  return fields.map((f) => ({
    ...f,
    ...(f.optionsFrom ? { options: sources[f.optionsFrom] ?? [] } : {}),
    ...(f.fields ? { fields: resolveOptions(f.fields, sources) } : {}),
  }));
}
```

`src/admin/api.ts`:

```ts
import { reactive } from 'vue';
import type { CommitResult } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const toasts = reactive<{ id: number; text: string; href?: string }[]>([]);
let lastToast = 0;

export function toast(text: string, href?: string): void {
  const id = ++lastToast;
  toasts.push({ id, text, href });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, 8000);
}

export function committed(result: Pick<CommitResult, 'url'>): void {
  toast('Committed · live in about a minute', result.url);
}

/** A toast for any failure, listing field errors or import problems when the API sent them. */
export function report(e: unknown): void {
  if (e instanceof ApiError && Array.isArray(e.details)) return toast(`${e.message}: ${e.details.join('; ')}`);
  if (e instanceof ApiError && e.status === 400 && e.details && typeof e.details === 'object') {
    const fields = Object.entries(e.details as Record<string, string>).map(([k, v]) => `${k}: ${v}`);
    return toast(`${e.message} (${fields.join('; ')})`);
  }
  toast(e instanceof Error ? e.message : String(e));
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  // The session ended: reloading lets the middleware send the page to the login screen.
  if (res.status === 401) location.reload();
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data?.details);
  return data as T;
}
```

`src/admin/useDocument.ts`:

```ts
import { nextTick, reactive, watch } from 'vue';
import { ApiError, committed, report } from './api';
import type { CommitResult } from './types';

const storageKey = (key: string) => `scholaros-draft:${key}`;

function readDraft(key: string): unknown {
  try {
    const saved = localStorage.getItem(storageKey(key));
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, value: unknown): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    // Storage full or blocked: drafts are a convenience.
  }
}
function dropDraft(key: string): void {
  try {
    localStorage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}

type Loader<T> = () => Promise<{ value: T; version: string | null }>;

/**
 * One editable document: load it, keep every edit as a localStorage draft (cleared only after a successful
 * commit), save with the version it was loaded at, and expose the conflict and field-error states.
 * Use it as `doc.current`, `doc.save(…)`; don't destructure (that drops reactivity).
 */
export function useDocument<T extends object>() {
  let loader: Loader<T> | null = null;
  let tracking = false;
  const doc = reactive({
    key: '',
    current: null as T | null,
    version: null as string | null,
    draft: null as T | null,
    errors: {} as Record<string, string>,
    conflict: false,
    saving: false,
    async open(key: string, load: Loader<T>) {
      doc.key = key;
      loader = load;
      await doc.reload();
    },
    async reload() {
      if (!loader) return;
      tracking = false;
      try {
        const { value, version } = await loader();
        const saved = readDraft(doc.key) as T | null;
        doc.draft = saved && JSON.stringify(saved) !== JSON.stringify(value) ? saved : null;
        doc.current = value;
        doc.version = version;
        doc.conflict = false;
        doc.errors = {};
      } catch (e) {
        report(e);
      }
      await nextTick(); // let the watcher see the loaded value before drafts are recorded
      tracking = true;
    },
    restore() {
      if (doc.draft) doc.current = doc.draft;
      doc.draft = null;
    },
    discard() {
      doc.draft = null;
      dropDraft(doc.key);
    },
    async save(send: (value: T, version: string | null) => Promise<CommitResult>, path: string) {
      if (!doc.current) return undefined;
      doc.saving = true;
      doc.errors = {};
      try {
        const result = await send(doc.current as T, doc.version);
        doc.version = result.versions[path] ?? null;
        doc.discard();
        committed(result);
        return result;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          doc.conflict = true;
          return undefined;
        }
        if (e instanceof ApiError && e.status === 400 && e.details && typeof e.details === 'object' && !Array.isArray(e.details)) {
          doc.errors = e.details as Record<string, string>;
        }
        report(e);
        return undefined;
      } finally {
        doc.saving = false;
      }
    },
  });
  watch(
    () => doc.current,
    (value) => {
      if (tracking && value && doc.key) writeDraft(doc.key, value);
    },
    { deep: true },
  );
  return doc;
}
```

- [ ] **Step 4: Run the unit test**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Write the stylesheet** `src/admin/admin.css`. It is loaded only by the admin page. The page sets `data-theme="editorial"` so that `editorial.css` supplies the tokens and the `.ed-prose` styles used by the post preview.

```css
/* Admin UI. Tokens come from src/themes/editorial/editorial.css; layout follows personal-site-handoff/design/Admin*. */
:root {
  --font-sans: 'IBM Plex Sans', system-ui, sans-serif;
  --font-serif: 'Source Serif 4', Georgia, serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
}
.adm {
  --adm-ink: var(--ed-ink, #15192b);
  --adm-muted: var(--ed-caption, #6a7085);
  --adm-rule: var(--ed-rule, #e4e7ee);
  --adm-tint: var(--ed-tint, #f3f5fa);
  --adm-hover: var(--ed-hover, #f6f8fc);
  --adm-accent: var(--ed-accent, #1f3c88);
  --adm-accent-hover: var(--ed-accent-hover, #142a63);
  --adm-danger: #a12a2a;
  margin: 0;
}
.adm *,
.adm *::before,
.adm *::after {
  box-sizing: border-box;
}
.adm a {
  color: var(--adm-accent);
  text-decoration: none;
}
.adm a:hover {
  text-decoration: underline;
}
.adm :focus-visible {
  outline: 2px solid var(--adm-accent);
  outline-offset: 2px;
}
.adm-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.adm-layout {
  display: flex;
  min-height: 100vh;
}
.adm-side {
  flex: 0 0 232px;
  background: var(--adm-tint);
  border-right: 1px solid var(--adm-rule);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.adm-side nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.adm-side nav a,
.adm-side nav button {
  padding: 9px 10px;
  border-radius: 6px;
  color: var(--adm-ink);
  background: none;
  border: 0;
  font: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}
.adm-side nav a[aria-current='page'] {
  background: #e9ecf3;
  font-weight: 500;
}
.adm-side nav .adm-sub {
  padding-left: 24px;
}
.adm-side-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.adm-main {
  flex: 1;
  min-width: 0;
  padding: 32px 40px 56px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.adm-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.adm-head h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}
.adm-h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.adm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.adm-grow {
  flex: 1;
}
.adm-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--adm-rule);
  border-radius: 6px;
  background: #fff;
  color: var(--adm-ink);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.adm a.adm-btn {
  color: var(--adm-ink);
}
.adm-btn:hover {
  background: var(--adm-hover);
  text-decoration: none;
}
.adm-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.adm-btn-primary,
.adm a.adm-btn-primary {
  background: var(--adm-accent);
  border-color: var(--adm-accent);
  color: #fff;
}
.adm-btn-primary:hover {
  background: var(--adm-accent-hover);
}
.adm-btn-danger {
  color: var(--adm-danger);
}
.adm-btn-small {
  min-height: 30px;
  padding: 0 10px;
  font-size: 13px;
}
.adm-add {
  align-self: flex-start;
}
.adm-banner {
  padding: 12px 16px;
  border: 1px solid #e8d9a8;
  background: #fdf8e7;
  border-radius: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin: 0;
}
.adm-banner-error {
  border-color: #e9b8b8;
  background: #fdf1f1;
}
.adm-card {
  border: 1px solid var(--adm-rule);
  border-radius: 6px;
  padding: 16px;
}
.adm-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}
.adm-tile b {
  display: block;
  font-size: 26px;
  font-weight: 600;
}
.adm-tile span {
  color: var(--adm-muted);
  font-size: 13px;
}
.adm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.adm-table th,
.adm-table td {
  text-align: left;
  padding: 10px 8px;
  border-bottom: 1px solid var(--adm-rule);
  vertical-align: top;
}
.adm-table th {
  color: var(--adm-muted);
  font-weight: 500;
  font-size: 13px;
}
.adm-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--adm-tint);
  white-space: nowrap;
}
.adm-status-draft {
  background: #fdf8e7;
}
.adm-status-hidden {
  background: #f1f1f1;
  color: var(--adm-muted);
}
.adm-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.adm-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.adm-field > span:first-child {
  font-size: 13px;
  font-weight: 500;
}
.adm-field small,
.adm-muted {
  color: var(--adm-muted);
  font-size: 13px;
}
.adm-err,
.adm-error {
  color: var(--adm-danger);
  font-size: 13px;
}
.adm input[type='text'],
.adm input[type='date'],
.adm input[type='number'],
.adm input[type='search'],
.adm select,
.adm textarea {
  width: 100%;
  font: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border: 1px solid var(--adm-rule);
  border-radius: 6px;
  background: #fff;
  color: var(--adm-ink);
}
.adm textarea {
  resize: vertical;
}
.adm input[type='color'] {
  width: 44px;
  height: 36px;
  padding: 2px;
  border: 1px solid var(--adm-rule);
  border-radius: 6px;
  background: #fff;
}
.adm-owner {
  font-weight: 600;
  color: var(--adm-accent) !important;
}
.adm-check {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}
.adm-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.adm-list-row {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.adm-list-row > :first-child {
  flex: 1;
  min-width: 0;
}
.adm-group {
  border: 1px solid var(--adm-rule);
  border-radius: 6px;
  padding: 14px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.adm-group > legend {
  font-weight: 600;
  padding: 0 6px;
}
.adm-split {
  display: grid;
  grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.adm-split-wide {
  grid-template-columns: minmax(0, 1fr) 280px;
}
.adm-cols3 {
  display: grid;
  grid-template-columns: 220px 260px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.adm-pick {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.adm-pick button,
.adm-pick a {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: none;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  color: var(--adm-ink);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.adm-pick button:hover {
  background: var(--adm-hover);
}
.adm-pick button[aria-current='true'] {
  background: #e9ecf3;
  font-weight: 500;
}
.adm-pre {
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: 13px;
  margin: 0;
}
.adm-toasts {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 50;
}
.adm-toast {
  background: var(--adm-ink);
  color: #fff;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 14px;
  max-width: 380px;
}
.adm .adm-toast a {
  color: #c9d4ff;
  margin-left: 8px;
}
.adm-modal {
  position: fixed;
  inset: 0;
  background: rgb(21 25 43 / 0.45);
  display: grid;
  place-items: center;
  z-index: 40;
  padding: 16px;
}
.adm-modal > div {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  width: min(760px, 100%);
  max-height: 90vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.adm-media {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.adm-media figure {
  margin: 0;
  border: 1px solid var(--adm-rule);
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  word-break: break-all;
}
.adm-media img,
.adm-thumb {
  width: 100%;
  height: 100px;
  object-fit: contain;
  background: var(--adm-tint);
}
.adm-thumb {
  display: grid;
  place-items: center;
  color: var(--adm-muted);
}
.adm-drop {
  border: 2px dashed var(--adm-rule);
  border-radius: 6px;
  padding: 18px;
  text-align: center;
  color: var(--adm-muted);
  cursor: pointer;
}
.adm-drop.is-over {
  border-color: var(--adm-accent);
  color: var(--adm-accent);
}
.adm-editor {
  position: relative;
  border: 1px solid var(--adm-rule);
  border-radius: 6px;
}
.adm-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px;
  border-bottom: 1px solid var(--adm-rule);
  background: var(--adm-tint);
  position: sticky;
  top: 0;
  z-index: 2;
}
.adm-toolbar button {
  min-width: 32px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.adm-toolbar button.is-active {
  background: #fff;
  border-color: var(--adm-rule);
}
.adm-editor .tiptap {
  min-height: 320px;
  padding: 16px 18px;
  outline: none;
}
.adm-editor.is-compact .tiptap {
  min-height: 140px;
}
.adm-editor .tiptap table {
  border-collapse: collapse;
}
.adm-editor .tiptap td,
.adm-editor .tiptap th {
  border: 1px solid var(--adm-rule);
  padding: 4px 8px;
}
.adm-editor .tiptap img {
  max-width: 100%;
}
.adm-slash {
  position: absolute;
  z-index: 30;
  background: #fff;
  border: 1px solid var(--adm-rule);
  border-radius: 6px;
  box-shadow: 0 6px 20px rgb(21 25 43 / 0.12);
  padding: 4px;
  display: flex;
  flex-direction: column;
  min-width: 180px;
}
.adm-slash button {
  text-align: left;
  padding: 6px 10px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 14px;
  border-radius: 4px;
  cursor: pointer;
}
.adm-slash button:hover,
.adm-slash button:focus-visible {
  background: var(--adm-tint);
}
.adm .adm-title-input {
  font-family: var(--font-serif);
  font-size: 30px;
  border: 0;
  padding: 4px 0;
}
.adm .adm-subtitle-input {
  font-size: 18px;
  border: 0;
  padding: 2px 0;
  color: var(--adm-muted);
}
.adm-login {
  max-width: 380px;
  margin: 14vh auto;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: flex-start;
}
.adm-login h1 {
  margin: 0;
  font-size: 24px;
}
@media (max-width: 860px) {
  .adm-layout {
    flex-direction: column;
  }
  .adm-side {
    flex: none;
    padding: 12px 16px;
    gap: 10px;
    border-right: 0;
    border-bottom: 1px solid var(--adm-rule);
  }
  .adm-side nav {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .adm-side-foot {
    flex-direction: row;
    margin-top: 0;
  }
  .adm-main {
    padding: 20px 16px 40px;
  }
  .adm-split,
  .adm-split-wide,
  .adm-cols3 {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .adm * {
    transition: none !important;
  }
}
```

- [ ] **Step 6: Write the shared components**

`src/admin/AdminShell.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, toasts } from './api';
import type { AdminCtx } from './types';

const props = defineProps<{ ctx: AdminCtx; active: string; title: string }>();
const base = `/${props.ctx.adminPath}`;
const banner = ref('');
const contentOpen = ref(props.active.startsWith('content/'));
const TOP = [
  ['', 'Dashboard'],
  ['posts', 'Posts'],
  ['cv', 'CV'],
  ['publications', 'Publications'],
] as const;
const CONTENT = [
  ['announcements', 'News'],
  ['people', 'People'],
  ['projects', 'Projects'],
  ['talks', 'Talks'],
  ['positions', 'Positions'],
] as const;
const BOTTOM = [
  ['pages', 'Pages'],
  ['media', 'Media'],
  ['settings', 'Settings'],
] as const;
const href = (path: string) => (path ? `${base}/${path}` : base);

onMounted(async () => {
  try {
    const { capabilities } = await api<{ capabilities: { error?: string } }>('me');
    banner.value = capabilities.error ?? '';
  } catch {
    // 401 reloads to the login page; other errors surface on the first save
  }
});

async function signOut() {
  await api('auth/logout', { method: 'POST' }).catch(() => undefined);
  location.href = `${base}/login`;
}
</script>

<template>
  <div class="adm-layout">
    <aside class="adm-side">
      <div>
        <strong>{{ ctx.siteName }}</strong>
        <div class="adm-muted">Site admin</div>
      </div>
      <nav aria-label="Admin">
        <a v-for="[path, label] in TOP" :key="path" :href="href(path)" :aria-current="active === path ? 'page' : undefined">{{ label }}</a>
        <button type="button" :aria-expanded="contentOpen" @click="contentOpen = !contentOpen">Content {{ contentOpen ? '▾' : '▸' }}</button>
        <template v-if="contentOpen">
          <a
            v-for="[name, label] in CONTENT"
            :key="name"
            class="adm-sub"
            :href="href(`content/${name}`)"
            :aria-current="active === `content/${name}` ? 'page' : undefined"
            >{{ label }}</a
          >
        </template>
        <a v-for="[path, label] in BOTTOM" :key="path" :href="href(path)" :aria-current="active === path ? 'page' : undefined">{{ label }}</a>
      </nav>
      <div class="adm-side-foot">
        <a href="/" target="_blank" rel="noopener">View site ↗</a>
        <button type="button" class="adm-btn adm-btn-small" @click="signOut">Sign out</button>
      </div>
    </aside>
    <main class="adm-main">
      <p v-if="banner" class="adm-banner adm-banner-error" role="alert">{{ banner }}</p>
      <div class="adm-head">
        <h1>{{ title }}</h1>
        <div class="adm-actions"><slot name="actions" /></div>
      </div>
      <slot />
    </main>
    <div class="adm-toasts" aria-live="polite">
      <div v-for="t in toasts" :key="t.id" class="adm-toast">
        {{ t.text }}<a v-if="t.href" :href="t.href" target="_blank" rel="noopener">View commit</a>
      </div>
    </div>
  </div>
</template>
```

`src/admin/DocBanners.vue`:

```vue
<script setup lang="ts">
defineProps<{ draft: boolean; conflict: boolean }>();
defineEmits<{ restore: []; discard: []; reload: [] }>();
const vFocus = { mounted: (el: HTMLElement) => el.focus() };
</script>

<template>
  <div v-if="conflict" class="adm-modal" role="dialog" aria-modal="true" aria-labelledby="adm-conflict-title">
    <div>
      <h2 id="adm-conflict-title" class="adm-h2">This file changed since you opened it</h2>
      <p>Someone, or an automated job, saved a newer version. Reload to get it. Your edits stay in this browser, and you can re-apply them after reloading.</p>
      <div class="adm-actions">
        <button v-focus type="button" class="adm-btn adm-btn-primary" @click="$emit('reload')">Reload</button>
      </div>
    </div>
  </div>
  <p v-if="draft" class="adm-banner" role="status">
    <span>You have unsaved edits from an earlier session.</span>
    <span class="adm-actions">
      <button type="button" class="adm-btn adm-btn-small" @click="$emit('restore')">Restore edits</button>
      <button type="button" class="adm-btn adm-btn-small" @click="$emit('discard')">Discard</button>
    </span>
  </p>
</template>
```

`src/admin/ListInput.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{ items: unknown[]; blank?: () => unknown; fixed?: boolean; addLabel?: string }>();
const emit = defineEmits<{ update: [items: unknown[]] }>();

function move(index: number, by: number) {
  const next = [...props.items];
  [next[index], next[index + by]] = [next[index + by], next[index]];
  emit('update', next);
}
</script>

<template>
  <div class="adm-list">
    <div v-for="(item, index) in items" :key="index" class="adm-list-row">
      <div><slot :item="item" :index="index" /></div>
      <button type="button" class="adm-btn adm-btn-small" :disabled="index === 0" aria-label="Move up" @click="move(index, -1)">↑</button>
      <button type="button" class="adm-btn adm-btn-small" :disabled="index === items.length - 1" aria-label="Move down" @click="move(index, 1)">↓</button>
      <button
        v-if="!fixed"
        type="button"
        class="adm-btn adm-btn-small adm-btn-danger"
        aria-label="Remove"
        @click="emit('update', items.filter((_, i) => i !== index))"
      >
        ✕
      </button>
    </div>
    <button v-if="!fixed && blank" type="button" class="adm-btn adm-btn-small adm-add" @click="emit('update', [...items, blank()])">
      + {{ addLabel ?? 'Add' }}
    </button>
  </div>
</template>
```

`src/admin/MediaGrid.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, committed, report, toast } from './api';
import type { CommitResult, MediaFile } from './types';

const props = defineProps<{ folder: 'content' | 'site'; pickable?: boolean }>();
const emit = defineEmits<{ pick: [url: string] }>();
const files = ref<MediaFile[]>([]);
const loading = ref(true);
const busy = ref(false);
const over = ref(false);
const confirming = ref<string | null>(null);
// Content images are processed at build time and have no URL in production; only `astro dev` serves them.
const showPreview = props.folder === 'site' || import.meta.env.DEV;
const fileName = (f: MediaFile) => f.path.slice(f.path.lastIndexOf('/') + 1);

onMounted(async () => {
  try {
    files.value = await api<MediaFile[]>(`media?folder=${props.folder}`);
  } catch (e) {
    report(e);
  } finally {
    loading.value = false;
  }
});

async function upload(list: FileList | null | undefined) {
  if (!list?.length) return;
  busy.value = true;
  for (const file of [...list]) {
    const form = new FormData();
    form.append('file', file);
    form.append('folder', props.folder);
    try {
      const uploaded = await api<MediaFile & { commit: Pick<CommitResult, 'id' | 'url'> | null }>('media', { form });
      if (uploaded.commit) committed(uploaded.commit);
      else toast(`${fileName(uploaded)} is already in the library`);
      files.value = [uploaded, ...files.value.filter((f) => f.path !== uploaded.path)];
    } catch (e) {
      report(e);
    }
  }
  busy.value = false;
}

async function remove(f: MediaFile) {
  if (confirming.value !== f.path) {
    confirming.value = f.path;
    return;
  }
  confirming.value = null;
  try {
    committed(await api<CommitResult>('media', { method: 'DELETE', body: { path: f.path, version: f.version } }));
    files.value = files.value.filter((x) => x.path !== f.path);
  } catch (e) {
    report(e);
  }
}

function copy(f: MediaFile) {
  navigator.clipboard.writeText(f.url).then(
    () => toast(`Copied ${f.url}`),
    () => toast(f.url),
  );
}

function drop(e: DragEvent) {
  over.value = false;
  upload(e.dataTransfer?.files);
}
</script>

<template>
  <div class="adm-form">
    <label class="adm-drop" :class="{ 'is-over': over }" @dragover.prevent="over = true" @dragleave="over = false" @drop.prevent="drop">
      {{ busy ? 'Uploading…' : 'Drop images here or click to choose (PNG, JPEG, WebP, GIF, AVIF, SVG; up to 4 MB)' }}
      <input
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
        class="adm-visually-hidden"
        aria-label="Upload images"
        @change="upload(($event.target as HTMLInputElement).files)"
      />
    </label>
    <p v-if="loading" class="adm-muted">Loading…</p>
    <p v-else-if="!files.length" class="adm-muted">No images yet.</p>
    <div class="adm-media">
      <figure v-for="f in files" :key="f.path">
        <img v-if="showPreview" :src="f.url" :alt="fileName(f)" loading="lazy" />
        <div v-else class="adm-thumb" aria-hidden="true">{{ fileName(f).split('.').pop()?.toUpperCase() }}</div>
        <figcaption>{{ fileName(f) }}</figcaption>
        <div class="adm-actions">
          <button v-if="pickable" type="button" class="adm-btn adm-btn-small adm-btn-primary" @click="emit('pick', f.url)">Use</button>
          <button type="button" class="adm-btn adm-btn-small" @click="copy(f)">Copy path</button>
          <button type="button" class="adm-btn adm-btn-small adm-btn-danger" @click="remove(f)">
            {{ confirming === f.path ? 'Confirm delete' : 'Delete' }}
          </button>
        </div>
      </figure>
    </div>
  </div>
</template>
```

`src/admin/ImagePicker.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import MediaGrid from './MediaGrid.vue';

defineProps<{ modelValue?: string; folder: 'content' | 'site'; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>();
const open = ref(false);
const vFocus = { mounted: (el: HTMLElement) => el.focus() };

function pick(url: string) {
  emit('update:modelValue', url);
  open.value = false;
}
</script>

<template>
  <div class="adm-list-row">
    <input
      type="text"
      :value="modelValue ?? ''"
      :aria-label="`${label} path`"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value || undefined)"
    />
    <button type="button" class="adm-btn adm-btn-small" @click="open = true">Choose…</button>
  </div>
  <div v-if="open" class="adm-modal" role="dialog" aria-modal="true" :aria-label="`Choose ${label}`" @keydown.esc="open = false">
    <div>
      <div class="adm-head">
        <h2 class="adm-h2">Choose an image</h2>
        <button v-focus type="button" class="adm-btn adm-btn-small" @click="open = false">Close</button>
      </div>
      <MediaGrid :folder="folder" pickable @pick="pick" />
    </div>
  </div>
</template>
```

`src/admin/MarkdownEditor.vue`:

```vue
<script setup lang="ts">
import type { ChainedCommands } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import 'katex/dist/katex.min.css';
import { ref, watch } from 'vue';
import MediaGrid from './MediaGrid.vue';
import { editorExtensions } from './editor/extensions';

const props = defineProps<{ modelValue: string; compact?: boolean; preview?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const host = ref<HTMLElement>();
const picking = ref(false);
const slash = ref<{ top: number; left: number } | null>(null);
const vFocus = { mounted: (el: HTMLElement) => el.focus() };
// In preview the content takes the public post styles (.ed-prose from editorial.css).
const contentClass = (preview?: boolean) => (preview ? 'tiptap ed-prose' : 'tiptap');

function editMath(kind: 'inline' | 'block', node: PMNode, pos: number) {
  const latex = window.prompt('LaTeX', String(node.attrs.latex ?? ''));
  if (latex === null || !editor.value) return;
  const chain = editor.value.chain().setNodeSelection(pos);
  (kind === 'inline' ? chain.updateInlineMath({ latex }) : chain.updateBlockMath({ latex })).focus().run();
}

const editor = useEditor({
  extensions: editorExtensions(editMath),
  content: props.modelValue,
  contentType: 'markdown',
  editable: !props.preview,
  editorProps: { attributes: { class: contentClass(props.preview) } },
  onUpdate: ({ editor: e }) => {
    emit('update:modelValue', e.getMarkdown());
    updateSlash();
  },
  onSelectionUpdate: () => updateSlash(),
});

watch(
  () => props.modelValue,
  (markdown) => {
    if (editor.value && markdown !== editor.value.getMarkdown()) {
      editor.value.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
    }
  },
);
watch(
  () => props.preview,
  (preview) => {
    editor.value?.setEditable(!preview);
    editor.value?.setOptions({ editorProps: { attributes: { class: contentClass(preview) } } });
  },
);

function run(command: (chain: ChainedCommands) => ChainedCommands) {
  if (editor.value) command(editor.value.chain().focus()).run();
}

function link() {
  const previous = editor.value?.getAttributes('link').href as string | undefined;
  const href = window.prompt('Link URL (leave empty to remove the link)', previous ?? 'https://');
  if (href === null) return;
  run((c) => (href ? c.extendMarkRange('link').setLink({ href }) : c.extendMarkRange('link').unsetLink()));
}

function equation(block: boolean) {
  const latex = window.prompt(block ? 'LaTeX (display equation)' : 'LaTeX', '');
  if (latex) run((c) => (block ? c.insertBlockMath({ latex }) : c.insertInlineMath({ latex })));
}

function insertImage(url: string) {
  picking.value = false;
  const alt = window.prompt('Alt text: describe the image for screen readers', '') ?? '';
  run((c) => c.setImage({ src: url, alt }));
}

type Active = string | [string, Record<string, unknown>];
const TOOLBAR: { label: string; title: string; active?: Active; action: () => void }[] = [
  { label: 'B', title: 'Bold', active: 'bold', action: () => run((c) => c.toggleBold()) },
  { label: 'I', title: 'Italic', active: 'italic', action: () => run((c) => c.toggleItalic()) },
  { label: 'H', title: 'Heading', active: ['heading', { level: 2 }], action: () => run((c) => c.toggleHeading({ level: 2 })) },
  { label: '❝', title: 'Quote', active: 'blockquote', action: () => run((c) => c.toggleBlockquote()) },
  { label: 'Link', title: 'Link', active: 'link', action: link },
  { label: '•', title: 'List', active: 'bulletList', action: () => run((c) => c.toggleBulletList()) },
  { label: '</>', title: 'Code', active: 'code', action: () => run((c) => c.toggleCode()) },
  { label: '∑', title: 'Equation', action: () => equation(false) },
  { label: 'Img', title: 'Image', action: () => (picking.value = true) },
];
const isActive = (a?: Active) =>
  !!a && !!editor.value && (Array.isArray(a) ? editor.value.isActive(a[0], a[1]) : editor.value.isActive(a));

const SLASH: [string, () => void][] = [
  ['Heading', () => run((c) => c.setNode('heading', { level: 2 }))],
  ['Quote', () => run((c) => c.setBlockquote())],
  ['Code block', () => run((c) => c.setCodeBlock())],
  ['Equation', () => equation(true)],
  ['Image', () => (picking.value = true)],
  ['Table', () => run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))],
];

/** The "/" menu opens when an empty paragraph holds just "/". */
function updateSlash() {
  const ed = editor.value;
  if (!ed || props.compact || !host.value) return;
  const { $from, empty } = ed.state.selection;
  if (!empty || $from.parent.type.name !== 'paragraph' || $from.parent.textContent !== '/') {
    slash.value = null;
    return;
  }
  const at = ed.view.coordsAtPos($from.pos);
  const box = host.value.getBoundingClientRect();
  slash.value = { top: at.bottom - box.top + 4, left: at.left - box.left };
}

function choose(action: () => void) {
  const ed = editor.value;
  if (!ed) return;
  const { $from } = ed.state.selection;
  ed.chain().focus().deleteRange({ from: $from.pos - 1, to: $from.pos }).run();
  slash.value = null;
  action();
}
</script>

<template>
  <div ref="host" class="adm-editor" :class="{ 'is-compact': compact }" @keydown.esc="slash = null">
    <div v-if="!preview" class="adm-toolbar" role="toolbar" aria-label="Formatting">
      <button
        v-for="t in TOOLBAR"
        :key="t.title"
        type="button"
        :title="t.title"
        :aria-label="t.title"
        :class="{ 'is-active': isActive(t.active) }"
        @click="t.action"
      >
        {{ t.label }}
      </button>
    </div>
    <EditorContent :editor="editor" />
    <div v-if="slash" class="adm-slash" role="menu" :style="{ top: `${slash.top}px`, left: `${slash.left}px` }">
      <button v-for="[label, action] in SLASH" :key="label" type="button" role="menuitem" @mousedown.prevent="choose(action)">
        {{ label }}
      </button>
    </div>
    <div v-if="picking" class="adm-modal" role="dialog" aria-modal="true" aria-label="Insert an image" @keydown.esc="picking = false">
      <div>
        <div class="adm-head">
          <h2 class="adm-h2">Insert an image</h2>
          <button v-focus type="button" class="adm-btn adm-btn-small" @click="picking = false">Close</button>
        </div>
        <MediaGrid folder="site" pickable @pick="insertImage" />
      </div>
    </div>
  </div>
</template>
```

`src/admin/FormFields.vue`:

```vue
<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- `model` is the screen's reactive document; fields edit it in place. */
/* eslint-disable @typescript-eslint/no-explicit-any -- form models are user data of any shape */
import ImagePicker from './ImagePicker.vue';
import ListInput from './ListInput.vue';
import MarkdownEditor from './MarkdownEditor.vue';
import { getIn, optionOf, replaceAt, setIn, type FieldDef } from './fields';
import { bibtexFor, type BibSource } from '../lib/bibtex';
import { isOwner } from '../lib/editorial';

const props = defineProps<{
  fields: FieldDef[];
  model: Record<string, any>;
  errors?: Record<string, string>;
  prefix?: string;
  owner?: string;
}>();

const labelId = (key: string) => `f-${props.prefix ?? ''}${key}`.replace(/[^\w-]/g, '-');
const error = (key: string) => props.errors?.[`${props.prefix ?? ''}${key}`];
const value = (key: string) => getIn(props.model, key);
const set = (key: string, v: unknown) => setIn(props.model, key, v);
const text = (e: Event) => (e.target as HTMLInputElement).value;
const strings = (key: string): string[] => (Array.isArray(value(key)) ? value(key) : []);
const chosen = (e: Event) => [...(e.target as HTMLSelectElement).selectedOptions].map((o) => o.value);
const regenerate = (key: string) => set(key, bibtexFor({ ...(props.model as BibSource), bibtex: undefined }));
</script>

<template>
  <div class="adm-form">
    <template v-for="f in fields" :key="f.key">
      <label v-if="f.type === 'checkbox'" class="adm-check">
        <input
          type="checkbox"
          :checked="value(f.key) ?? f.default ?? false"
          @change="set(f.key, ($event.target as HTMLInputElement).checked)"
        />
        {{ f.label }}
      </label>

      <fieldset v-else-if="f.type === 'objects'" class="adm-group">
        <legend>{{ f.label }}</legend>
        <ListInput :items="value(f.key) ?? []" :blank="() => ({})" :fixed="f.fixed" add-label="Add item" @update="set(f.key, $event)">
          <template #default="{ item, index }">
            <FormFields
              :fields="f.fields ?? []"
              :model="item as Record<string, any>"
              :errors="errors"
              :prefix="`${prefix ?? ''}${f.key}.${index}.`"
              :owner="owner"
            />
          </template>
        </ListInput>
      </fieldset>

      <div v-else-if="['list', 'authors', 'image', 'markdown'].includes(f.type)" class="adm-field" role="group" :aria-labelledby="labelId(f.key)">
        <span :id="labelId(f.key)">{{ f.label }}</span>
        <ListInput
          v-if="f.type === 'list' || f.type === 'authors'"
          :items="strings(f.key)"
          :blank="() => ''"
          @update="set(f.key, $event)"
        >
          <template #default="{ item, index }">
            <input
              type="text"
              :value="item"
              :class="{ 'adm-owner': f.type === 'authors' && !!owner && isOwner(String(item), owner) }"
              :aria-label="`${f.label} ${index + 1}`"
              @input="set(f.key, replaceAt(strings(f.key), index, text($event)))"
            />
          </template>
        </ListInput>
        <ImagePicker
          v-else-if="f.type === 'image'"
          :model-value="value(f.key)"
          :folder="f.folder ?? 'content'"
          :label="f.label"
          @update:model-value="set(f.key, $event)"
        />
        <MarkdownEditor v-else :model-value="value(f.key) ?? ''" compact @update:model-value="set(f.key, $event)" />
        <small v-if="f.hint">{{ f.hint }}</small>
        <span v-if="error(f.key)" class="adm-err">{{ error(f.key) }}</span>
      </div>

      <label v-else class="adm-field">
        <span>{{ f.label }}</span>
        <textarea
          v-if="f.type === 'textarea' || f.type === 'bibtex'"
          :value="value(f.key) ?? ''"
          :rows="f.type === 'bibtex' ? 8 : 3"
          @input="set(f.key, text($event))"
        />
        <input
          v-else-if="f.type === 'number'"
          type="number"
          :value="value(f.key) ?? ''"
          @input="set(f.key, text($event) === '' ? undefined : Number(text($event)))"
        />
        <input v-else-if="f.type === 'date'" type="date" :value="String(value(f.key) ?? '').slice(0, 10)" @input="set(f.key, text($event))" />
        <select v-else-if="f.type === 'select'" :value="value(f.key) ?? ''" @change="set(f.key, text($event))">
          <option value="">—</option>
          <option v-for="o in (f.options ?? []).map(optionOf)" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select v-else-if="f.type === 'pubs'" multiple size="6" @change="set(f.key, chosen($event))">
          <option v-for="o in (f.options ?? []).map(optionOf)" :key="o.value" :value="o.value" :selected="strings(f.key).includes(o.value)">
            {{ o.label }}
          </option>
        </select>
        <span v-else-if="f.type === 'color'" class="adm-list-row">
          <input type="text" :value="value(f.key) ?? ''" @input="set(f.key, text($event))" />
          <input type="color" :value="value(f.key) || '#1f3c88'" :aria-label="`${f.label} picker`" @input="set(f.key, text($event))" />
        </span>
        <output v-else-if="f.type === 'readonly'">{{ value(f.key) }}</output>
        <input v-else type="text" :value="value(f.key) ?? ''" @input="set(f.key, text($event))" />
        <button v-if="f.type === 'bibtex'" type="button" class="adm-btn adm-btn-small adm-add" @click="regenerate(f.key)">Regenerate</button>
        <small v-if="f.hint">{{ f.hint }}</small>
        <span v-if="error(f.key)" class="adm-err">{{ error(f.key) }}</span>
      </label>
    </template>
  </div>
</template>
```

`src/admin/Media.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import MediaGrid from './MediaGrid.vue';
import type { AdminCtx } from './types';

defineProps<{ ctx: AdminCtx }>();
const TABS = [
  { id: 'content', label: 'Content images', note: 'Used by posts, people, projects and other entries. Optimized at build time.' },
  { id: 'site', label: 'Site images', note: 'Used by pages, settings and images inside post text. Served as-is from /images.' },
] as const;
const folder = ref<'content' | 'site'>('content');
const note = computed(() => TABS.find((t) => t.id === folder.value)!.note);
</script>

<template>
  <AdminShell :ctx="ctx" active="media" title="Media">
    <div role="tablist" aria-label="Image folders" class="adm-actions">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        role="tab"
        class="adm-btn"
        :class="{ 'adm-btn-primary': folder === t.id }"
        :aria-selected="folder === t.id"
        @click="folder = t.id"
      >
        {{ t.label }}
      </button>
    </div>
    <p class="adm-muted">{{ note }}</p>
    <MediaGrid :key="folder" :folder="folder" />
  </AdminShell>
</template>
```

- [ ] **Step 7: Replace the admin page** `src/admin/routes/[...path].astro`

```astro
---
import Media from '../Media.vue';
import { adminSettings } from '../../lib/admin/settings';
import '../../themes/editorial/editorial.css';
import '../admin.css';

export const prerender = false;

const { adminPath, siteName } = adminSettings();
const [screen = '', arg = ''] = (Astro.params.path ?? '').split('/');
const SCREENS = new Set(['login', 'media']);
if (!SCREENS.has(screen)) return new Response('Not found', { status: 404 });

const ctx = { adminPath, siteName, user: Astro.locals.user ?? null };
const error = Astro.url.searchParams.get('error');
if (screen === 'login' && error === 'denied') Astro.response.status = 403;
const LOGIN_ERRORS: Record<string, string> = {
  denied: "That GitHub account isn't on this site's admin list (adminUsers in config/site.yml).",
  expired: 'Sign-in expired or was interrupted. Please try again.',
};
---

<!doctype html>
<html lang="en" data-theme="editorial">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Site admin · {siteName}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap"
    />
  </head>
  <body class="adm">
    {
      screen === 'login' && (
        <main class="adm-login">
          <h1>{siteName}</h1>
          <p class="adm-muted">Site admin</p>
          <a class="adm-btn adm-btn-primary" href="/api/admin/auth/login">
            Sign in with GitHub
          </a>
          {error && (
            <p class="adm-error" role="alert">
              {LOGIN_ERRORS[error] ?? LOGIN_ERRORS.expired}
            </p>
          )}
        </main>
      )
    }
    {screen === 'media' && <Media client:only="vue" ctx={ctx} />}
  </body>
</html>
```

(`arg` is unused until Task 17. Leave it: later tasks use it.)

- [ ] **Step 8: Set up Playwright and write the first e2e test**

```bash
pnpm add -D @playwright/test@^1.63.0
pnpm exec playwright install chromium
printf '\n# Playwright\ntest-results/\nplaywright-report/\n' >> .gitignore
```

In `package.json` `scripts`, add `"test:e2e": "playwright test",`.

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

/** E2E against `astro dev` with the in-memory store: nothing is committed anywhere. */
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  use: { baseURL: 'http://localhost:4329', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm astro dev --port 4329',
    url: 'http://localhost:4329/admin/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VERCEL: '1', ADMIN_STORE: 'memory', SESSION_SECRET: 'e2e-only-session-secret-e2e-only-0000' },
  },
});
```

`tests/e2e/admin.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

/** The template's adminPath (config/site.yml). */
const ADMIN = '/admin';
const COMMITTED = 'Committed · live in about a minute';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** The dev-only session stub (src/admin/routes/api/auth/dev.ts) sets the cookie. */
async function signIn(page: Page) {
  await page.goto('/api/admin/auth/dev');
}

test('media: upload a site image, then delete it', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/media`);
  await page.getByRole('tab', { name: 'Site images' }).click();
  await page.getByLabel('Upload images').setInputFiles({ name: 'E2E Figure.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText(COMMITTED)).toBeVisible();
  const tile = page.getByRole('figure').filter({ hasText: /e2e-figure-[0-9a-f]{6}\.png/ });
  await expect(tile).toBeVisible();
  await tile.getByRole('button', { name: 'Delete' }).click();
  await tile.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(tile).toHaveCount(0);
});
```

- [ ] **Step 9: Run the e2e test**

Run: `pnpm test:e2e`
Expected: 1 passed.

- [ ] **Step 10: Check the login page in a browser.** With the dev server from Task 12 Step 9 running, open `http://localhost:4329/admin/login?error=expired`. Expected: the site name, "Site admin", a blue "Sign in with GitHub" button and the red expired message, in IBM Plex Sans. At 375px width, nothing scrolls horizontally.

- [ ] **Step 11: Run unit tests and the Vercel build, then commit**

Run: `pnpm test && rm -rf .vercel && VERCEL=1 SESSION_SECRET=build-only-secret-build-only-secret pnpm build`
Expected: PASS and the build succeeds.

```bash
git add src/admin/admin.css src/admin/types.ts src/admin/api.ts src/admin/useDocument.ts src/admin/fields.ts src/admin/fields.test.ts src/admin/AdminShell.vue src/admin/DocBanners.vue src/admin/ListInput.vue src/admin/FormFields.vue src/admin/ImagePicker.vue src/admin/MediaGrid.vue src/admin/MarkdownEditor.vue src/admin/Media.vue 'src/admin/routes/[...path].astro' playwright.config.ts tests/e2e/admin.spec.ts package.json pnpm-lock.yaml .gitignore
git commit -m "feat(admin): UI foundation (shell, forms, media library, Markdown editor) and e2e harness"
```

---

### Task 17: Dashboard, Posts list and the post editor

**Files:**
- Create: `src/admin/Dashboard.vue`, `src/admin/Posts.vue`, `src/admin/PostEditor.vue`
- Modify: `src/admin/routes/[...path].astro` (three screens)
- Modify: `tests/e2e/admin.spec.ts` (append)

**Interfaces:**
- Consumes: Task 16 components and helpers; `GET dashboard`, `PUT feeds/hidden`, `PUT config/feeds`, `POST feeds/sync`, `GET/PUT collections/posts[/slug]`, `GET collections/publications`.
- Produces: screens `''` (Dashboard), `posts`, `posts/<slug>` (with `posts/new` for a new post).

- [ ] **Step 1: Append the failing e2e tests** to `tests/e2e/admin.spec.ts`

```ts
test('posts: create, save a draft, then publish', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/posts/new`);
  const title = `E2E post ${Date.now()}`;
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.locator('.tiptap').click();
  await page.keyboard.type('Hello from the admin.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/posts\/e2e-post-\d+$/);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(COMMITTED)).toHaveCount(2);
  await page.goto(`${ADMIN}/posts`);
  await expect(page.getByRole('row', { name: new RegExp(title) }).getByText('Published')).toBeVisible();
});

test('dashboard: hide and unhide an imported post', async ({ page }) => {
  await signIn(page);
  await page.goto(ADMIN);
  const hide = page.getByRole('button', { name: 'Hide', exact: true });
  const row = page.getByRole('row').filter({ has: hide }).first();
  const title = (await row.getByRole('cell').first().innerText()).trim();
  await row.getByRole('button', { name: 'Hide', exact: true }).click();
  const same = page.getByRole('row').filter({ hasText: title });
  await expect(same.getByText('Hidden')).toBeVisible();
  await same.getByRole('button', { name: 'Unhide' }).click();
  await expect(same.getByText('Published')).toBeVisible();
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test:e2e`
Expected: the two new tests FAIL (404 on `/admin/posts/new` and `/admin`); the media test passes.

- [ ] **Step 3: Write `src/admin/Dashboard.vue`**

```vue
<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- feeds.yml is user data */
import { computed, onMounted, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import { api, committed, report, toast } from './api';
import type { AdminCtx, CommitResult, Entry } from './types';
import type { FeedItem } from '../lib/types';

interface DashboardData {
  posts: Entry[];
  feedItems: FeedItem[];
  feeds: { data: Record<string, any>; version: string | null };
  publications: number;
  cvUpdated: string | null;
  lastSync: string | null;
}
interface Row {
  key: string;
  title: string;
  date: string;
  source: string;
  status: 'Published' | 'Draft' | 'Hidden';
  slug?: string;
  id?: string;
}

const props = defineProps<{ ctx: AdminCtx }>();
const base = `/${props.ctx.adminPath}`;
const d = ref<DashboardData | null>(null);
const query = ref('');
const medium = ref('');
const syncing = ref(false);

const rows = computed<Row[]>(() => {
  if (!d.value) return [];
  const hidden = new Set<string>(d.value.feeds.data.hidden ?? []);
  const q = query.value.trim().toLowerCase();
  return [
    ...d.value.posts.map(
      (p): Row => ({
        key: `post:${p.slug}`,
        title: String(p.data.title ?? p.slug),
        date: String(p.data.date ?? '').slice(0, 10),
        source: 'This site',
        status: p.data.draft ? 'Draft' : 'Published',
        slug: p.slug,
      }),
    ),
    ...d.value.feedItems.map(
      (f): Row => ({
        key: `feed:${f.id}`,
        title: f.title,
        date: f.date,
        source: f.source,
        status: hidden.has(f.id) ? 'Hidden' : 'Published',
        id: f.id,
      }),
    ),
  ]
    .filter((r) => !q || r.title.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
});

async function load() {
  try {
    d.value = await api<DashboardData>('dashboard');
    medium.value = String(d.value.feeds.data.mediumUrl ?? '');
  } catch (e) {
    report(e);
  }
}

async function setHidden(row: Row, hidden: boolean) {
  if (!d.value || !row.id) return;
  try {
    const result = await api<CommitResult>('feeds/hidden', { method: 'PUT', body: { id: row.id, hidden } });
    committed(result);
    const ids = new Set<string>(d.value.feeds.data.hidden ?? []);
    if (hidden) ids.add(row.id);
    else ids.delete(row.id);
    d.value.feeds = { data: { ...d.value.feeds.data, hidden: [...ids] }, version: result.versions['config/feeds.yml'] ?? null };
  } catch (e) {
    report(e);
  }
}

async function saveMedium() {
  if (!d.value) return;
  const data = { ...d.value.feeds.data, mediumUrl: medium.value.trim() };
  try {
    const result = await api<CommitResult>('config/feeds', { method: 'PUT', body: { data, version: d.value.feeds.version } });
    committed(result);
    d.value.feeds = { data, version: result.versions['config/feeds.yml'] ?? null };
  } catch (e) {
    report(e);
  }
}

async function checkNow() {
  syncing.value = true;
  try {
    const result = await api<{ changed: boolean; count: number; failed: { source: string; error: string }[]; url?: string }>(
      'feeds/sync',
      { method: 'POST' },
    );
    if (result.changed) committed(result);
    else toast(`No new items (${result.count} in total)`);
    for (const f of result.failed) toast(`${f.source}: ${f.error}`);
    await load();
  } catch (e) {
    report(e);
  } finally {
    syncing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <AdminShell :ctx="ctx" active="" title="Dashboard">
    <template #actions>
      <a class="adm-btn" :href="`${base}/cv`">Edit CV</a>
      <a class="adm-btn adm-btn-primary" :href="`${base}/posts/new`">New post</a>
    </template>
    <p v-if="!d" class="adm-muted">Loading…</p>
    <template v-else>
      <div class="adm-tiles">
        <div class="adm-card adm-tile"><b>{{ d.posts.length }}</b><span>Site posts</span></div>
        <div class="adm-card adm-tile"><b>{{ d.feedItems.length }}</b><span>Imported posts</span></div>
        <div class="adm-card adm-tile"><b>{{ d.publications }}</b><span>Publications</span></div>
        <div class="adm-card adm-tile">
          <b>{{ d.cvUpdated ? new Date(d.cvUpdated).toLocaleDateString() : '—' }}</b><span>CV last updated</span>
        </div>
      </div>

      <section class="adm-card adm-form" aria-labelledby="adm-medium">
        <h2 id="adm-medium" class="adm-h2">Medium</h2>
        <label class="adm-field">
          <span>Medium feed URL</span>
          <input v-model="medium" type="text" placeholder="https://medium.com/feed/@username" />
        </label>
        <div class="adm-actions">
          <button type="button" class="adm-btn" @click="saveMedium">Save</button>
          <button type="button" class="adm-btn" :disabled="syncing" @click="checkNow">{{ syncing ? 'Checking…' : 'Check now' }}</button>
          <span class="adm-muted">Last sync: {{ d.lastSync ? new Date(d.lastSync).toLocaleString() : '—' }}</span>
        </div>
      </section>

      <section class="adm-form" aria-labelledby="adm-posts">
        <div class="adm-head">
          <h2 id="adm-posts" class="adm-h2">Posts</h2>
          <input v-model="query" type="search" placeholder="Search posts" aria-label="Search posts" style="max-width: 260px" />
        </div>
        <table class="adm-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Source</th>
              <th>Status</th>
              <th>Date</th>
              <th><span class="adm-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.key">
              <td>{{ r.title }}</td>
              <td>{{ r.source }}</td>
              <td>
                <span class="adm-status" :class="{ 'adm-status-draft': r.status === 'Draft', 'adm-status-hidden': r.status === 'Hidden' }">{{
                  r.status
                }}</span>
              </td>
              <td>{{ r.date }}</td>
              <td>
                <a v-if="r.slug" class="adm-btn adm-btn-small" :href="`${base}/posts/${r.slug}`">Edit</a>
                <button v-else-if="r.status === 'Hidden'" type="button" class="adm-btn adm-btn-small" @click="setHidden(r, false)">Unhide</button>
                <button v-else type="button" class="adm-btn adm-btn-small" @click="setHidden(r, true)">Hide</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!rows.length" class="adm-muted">No posts match.</p>
      </section>
    </template>
  </AdminShell>
</template>
```

- [ ] **Step 4: Write `src/admin/Posts.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import { api, report } from './api';
import type { AdminCtx, Entry } from './types';

const props = defineProps<{ ctx: AdminCtx }>();
const base = `/${props.ctx.adminPath}`;
const posts = ref<Entry[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    posts.value = (await api<Entry[]>('collections/posts')).sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)));
  } catch (e) {
    report(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <AdminShell :ctx="ctx" active="posts" title="Posts">
    <template #actions>
      <a class="adm-btn adm-btn-primary" :href="`${base}/posts/new`">New post</a>
    </template>
    <table class="adm-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in posts" :key="p.slug">
          <td>
            <a :href="`${base}/posts/${p.slug}`">{{ p.data.title || p.slug }}</a>
          </td>
          <td>
            <span class="adm-status" :class="{ 'adm-status-draft': p.data.draft }">{{ p.data.draft ? 'Draft' : 'Published' }}</span>
          </td>
          <td>{{ String(p.data.date ?? '').slice(0, 10) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!loading && !posts.length" class="adm-muted">No posts yet.</p>
  </AdminShell>
</template>
```

- [ ] **Step 5: Write `src/admin/PostEditor.vue`**

```vue
<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- front matter is user data */
import { computed, onMounted, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import DocBanners from './DocBanners.vue';
import FormFields from './FormFields.vue';
import MarkdownEditor from './MarkdownEditor.vue';
import { api, report, toast } from './api';
import { resolveOptions, setIn, type FieldDef, type Option } from './fields';
import { useDocument } from './useDocument';
import type { AdminCtx, CommitResult, Entry } from './types';
import { slugify } from '../lib/utils';

type Post = { data: Record<string, any>; body: string };

const props = defineProps<{ ctx: AdminCtx; slug: string }>();
const isNew = ref(props.slug === 'new');
const slug = ref(isNew.value ? '' : props.slug);
const readonly = ref(false);
const preview = ref(false);
const publications = ref<Option[]>([]);
const doc = useDocument<Post>();

const SIDEBAR: FieldDef[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'tags', label: 'Tags', type: 'list' },
  { key: 'relatedPublication', label: 'Related publication', type: 'select', optionsFrom: 'publications' },
  { key: 'excerpt', label: 'Summary', type: 'textarea', hint: 'Shown in post lists and link previews.' },
  { key: 'featured', label: 'Show on home page', type: 'checkbox' },
];
const sidebar = computed(() => resolveOptions(SIDEBAR, { publications: publications.value }));
const suggested = computed(() => slugify(String(doc.current?.data.title ?? '')));

onMounted(async () => {
  await doc.open(`posts/${props.slug}`, async () => {
    if (isNew.value) {
      return { value: { data: { title: '', date: new Date().toISOString().slice(0, 10), draft: true }, body: '' }, version: null };
    }
    const entry = await api<Post & { version: string; readonly: boolean }>(`collections/posts/${props.slug}`);
    readonly.value = entry.readonly;
    return { value: { data: entry.data, body: entry.body }, version: entry.version };
  });
  api<Entry[]>('collections/publications').then((list) => {
    publications.value = list.map((p) => ({ value: p.slug, label: String(p.data.title ?? p.slug) }));
  }, report);
});

async function save(draft: boolean) {
  if (!doc.current) return;
  const target = isNew.value ? slug.value || suggested.value : slug.value;
  if (!/^[a-z0-9-]{1,80}$/.test(target)) {
    toast('The slug needs 1–80 lowercase letters, digits or dashes');
    return;
  }
  doc.current.data.draft = draft;
  const path = `src/content/posts/${target}.md`;
  const result = await doc.save(
    (post, version) => api<CommitResult>(`collections/posts/${target}`, { method: 'PUT', body: { data: post.data, body: post.body, version } }),
    path,
  );
  if (result && isNew.value) {
    isNew.value = false;
    slug.value = target;
    doc.key = `posts/${target}`;
    history.replaceState(null, '', `/${props.ctx.adminPath}/posts/${target}`);
  }
}

function setSubtitle(e: Event) {
  if (doc.current) setIn(doc.current.data, 'subtitle', (e.target as HTMLInputElement).value);
}
</script>

<template>
  <AdminShell :ctx="ctx" active="posts" :title="isNew ? 'New post' : 'Edit post'">
    <template #actions>
      <button type="button" class="adm-btn" :aria-pressed="preview" @click="preview = !preview">{{ preview ? 'Edit' : 'Preview' }}</button>
      <button type="button" class="adm-btn" :disabled="doc.saving || readonly" @click="save(true)">Save draft</button>
      <button type="button" class="adm-btn adm-btn-primary" :disabled="doc.saving || readonly" @click="save(false)">Publish</button>
    </template>
    <template v-if="doc.current">
      <DocBanners :draft="!!doc.draft" :conflict="doc.conflict" @restore="doc.restore()" @discard="doc.discard()" @reload="doc.reload()" />
      <p v-if="readonly" class="adm-banner">This post is MDX. The admin shows it read-only; edit it in the repository.</p>
      <div class="adm-split adm-split-wide">
        <div class="adm-form">
          <input v-model="doc.current.data.title" class="adm-title-input" type="text" placeholder="Title" aria-label="Title" :readonly="readonly" />
          <span v-if="doc.errors.title" class="adm-err">{{ doc.errors.title }}</span>
          <input
            :value="doc.current.data.subtitle ?? ''"
            class="adm-subtitle-input"
            type="text"
            placeholder="Subtitle"
            aria-label="Subtitle"
            :readonly="readonly"
            @input="setSubtitle"
          />
          <pre v-if="readonly" class="adm-card adm-pre">{{ doc.current.body }}</pre>
          <MarkdownEditor v-else v-model="doc.current.body" :preview="preview" />
        </div>
        <aside class="adm-form" aria-label="Post settings">
          <label class="adm-field">
            <span>Slug (URL)</span>
            <input v-model="slug" type="text" :readonly="!isNew" :placeholder="suggested" />
            <small>/blog/{{ slug || suggested }}</small>
          </label>
          <FormFields :fields="sidebar" :model="doc.current.data" :errors="doc.errors" />
        </aside>
      </div>
    </template>
  </AdminShell>
</template>
```

- [ ] **Step 6: Register the screens** in `src/admin/routes/[...path].astro`. Add the imports:

```astro
import Dashboard from '../Dashboard.vue';
import PostEditor from '../PostEditor.vue';
import Posts from '../Posts.vue';
```

change `const SCREENS = new Set(['login', 'media']);` to `const SCREENS = new Set(['', 'login', 'media', 'posts']);`, and add after the `media` line:

```astro
    {screen === '' && <Dashboard client:only="vue" ctx={ctx} />}
    {screen === 'posts' && !arg && <Posts client:only="vue" ctx={ctx} />}
    {screen === 'posts' && arg && <PostEditor client:only="vue" ctx={ctx} slug={arg} />}
```

- [ ] **Step 7: Run the e2e tests**

Run: `pnpm test:e2e`
Expected: 3 passed.

- [ ] **Step 8: Check the editor by hand.** With the dev server from Task 12 Step 9, open `/api/admin/auth/dev`, then `/admin/posts/new`, and check each of these:
  - typing `/` on an empty line opens the menu, and "Table" inserts a 3×3 table;
  - ∑ asks for LaTeX and renders it with KaTeX, and clicking the formula lets you edit it;
  - Img opens the media library and inserts `![alt](/images/…)`;
  - Preview switches the content to the public post typography;
  - reloading the page offers "Restore edits".

- [ ] **Step 9: Commit**

```bash
git add src/admin/Dashboard.vue src/admin/Posts.vue src/admin/PostEditor.vue 'src/admin/routes/[...path].astro' tests/e2e/admin.spec.ts
git commit -m "feat(admin): dashboard, posts list and Tiptap post editor"
```

---

### Task 18: Publications and content collections (News, People, Projects, Talks, Positions)

**Files:**
- Modify: `src/admin/fields.ts` (append `COLLECTIONS`)
- Create: `src/admin/Collection.vue`
- Modify: `src/admin/routes/[...path].astro`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Task 16; `normalizeAreas` (`src/lib/editorial.ts`) for topic options.
- Produces: `CollectionConfig`, `COLLECTIONS: Record<'publications' | 'announcements' | 'people' | 'projects' | 'talks' | 'positions', CollectionConfig>`, the field helpers `text(key, label)`, `date(key, label)`, `select(key, label, options)` and `SOCIALS` (Tasks 19–20 use them), and `<Collection :ctx :name>`. Screens: `publications` and `content/<name>`.

- [ ] **Step 1: Append the failing e2e tests**

```ts
test('publications: edit a field, regenerate BibTeX, publish', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/publications`);
  await page.getByRole('region', { name: 'Entries' }).getByRole('button').first().click();
  await page.getByLabel('Note', { exact: true }).fill('E2E note');
  await page.getByRole('button', { name: 'Regenerate' }).click();
  await expect(page.getByLabel('BibTeX (leave empty to generate)')).toHaveValue(/^@(article|inproceedings)\{/);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
});

test('news: create an item', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/content/announcements`);
  await page.getByRole('button', { name: 'New news item' }).click();
  await page.getByLabel('Title', { exact: true }).fill(`E2E news ${Date.now()}`);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Entries' }).getByText(/E2E news/)).toBeVisible();
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test:e2e`
Expected: the two new tests FAIL with 404.

- [ ] **Step 3: Append the collection definitions** to `src/admin/fields.ts`. The fields mirror `src/lib/schemas.ts`.

```ts
export interface CollectionConfig {
  label: string;
  singular: string;
  titleKey: string;
  dateKey?: string;
  /** Keys offered as list filters. */
  filters?: string[];
  /** Front matter of a new entry: every required field, so the first save validates. */
  blank: Record<string, unknown>;
  fields: FieldDef[];
}

const today = () => new Date().toISOString().slice(0, 10);
export const text = (key: string, label: string): FieldDef => ({ key, label, type: 'text' });
export const date = (key: string, label: string): FieldDef => ({ key, label, type: 'date' });
export const select = (key: string, label: string, options: string[]): FieldDef => ({ key, label, type: 'select', options });
export const SOCIALS = ['github', 'scholar', 'twitter', 'linkedin', 'orcid', 'mastodon', 'bluesky', 'website'];

export const COLLECTIONS: Record<string, CollectionConfig> = {
  publications: {
    label: 'Publications',
    singular: 'publication',
    titleKey: 'title',
    dateKey: 'year',
    filters: ['year', 'topic'],
    blank: { title: '', authors: [], venue: '', year: new Date().getFullYear(), type: 'conference' },
    fields: [
      text('title', 'Title'),
      { key: 'authors', label: 'Authors (in order)', type: 'authors' },
      text('venue', 'Venue'),
      text('venueShort', 'Venue (short)'),
      { key: 'year', label: 'Year', type: 'number' },
      select('type', 'Type', ['journal', 'conference', 'preprint', 'workshop', 'thesis', 'book-chapter']),
      { key: 'topic', label: 'Topic', type: 'select', optionsFrom: 'topics' },
      text('note', 'Note'),
      text('doi', 'DOI'),
      text('arxiv', 'arXiv id'),
      text('url', 'URL'),
      text('pdf', 'PDF URL'),
      text('code', 'Code URL'),
      { key: 'featured', label: 'Featured', type: 'checkbox' },
      { key: 'abstract', label: 'Abstract', type: 'textarea' },
      { key: 'image', label: 'Image', type: 'image', folder: 'content' },
      { key: 'bibtex', label: 'BibTeX (leave empty to generate)', type: 'bibtex' },
    ],
  },
  announcements: {
    label: 'News',
    singular: 'news item',
    titleKey: 'title',
    dateKey: 'date',
    blank: { title: '', date: today(), category: 'general' },
    fields: [
      text('title', 'Title'),
      date('date', 'Date'),
      select('category', 'Category', ['paper', 'grant', 'award', 'talk', 'media', 'general']),
      select('datePrecision', 'Show date as', ['day', 'month', 'year']),
      { key: 'pinned', label: 'Pinned', type: 'checkbox' },
      { key: 'featured', label: 'Featured', type: 'checkbox' },
      { key: 'image', label: 'Image', type: 'image', folder: 'content' },
      text('emoji', 'Emoji'),
      { key: 'excerpt', label: 'Excerpt', type: 'textarea' },
      { key: 'people', label: 'People (ids)', type: 'list' },
    ],
  },
  people: {
    label: 'People',
    singular: 'person',
    titleKey: 'name',
    blank: { name: '', role: 'phd' },
    fields: [
      text('name', 'Name'),
      select('role', 'Role', ['pi', 'postdoc', 'phd', 'masters', 'undergrad', 'research-assistant', 'visiting', 'alumni']),
      text('title', 'Title'),
      { key: 'photo', label: 'Photo', type: 'image', folder: 'content' },
      text('email', 'Email'),
      ...SOCIALS.map((s) => text(`socials.${s}`, `${s[0].toUpperCase()}${s.slice(1)} URL`)),
      { key: 'researchInterests', label: 'Research interests', type: 'list' },
      date('startDate', 'Start date'),
      date('endDate', 'End date'),
      { key: 'sortOrder', label: 'Sort order', type: 'number' },
      { key: 'active', label: 'Active', type: 'checkbox', default: true },
    ],
  },
  projects: {
    label: 'Projects',
    singular: 'project',
    titleKey: 'title',
    dateKey: 'startDate',
    blank: { title: '', type: 'software', status: 'active' },
    fields: [
      text('title', 'Title'),
      select('type', 'Type', ['software', 'dataset', 'benchmark', 'hardware', 'other']),
      select('status', 'Status', ['active', 'completed', 'upcoming']),
      { key: 'image', label: 'Image', type: 'image', folder: 'content' },
      text('url', 'URL'),
      text('repoUrl', 'Repository URL'),
      text('paperUrl', 'Paper URL'),
      { key: 'team', label: 'Team (people ids)', type: 'list' },
      { key: 'tags', label: 'Tags', type: 'list' },
      date('startDate', 'Start date'),
      date('endDate', 'End date'),
      { key: 'excerpt', label: 'Excerpt', type: 'textarea' },
    ],
  },
  talks: {
    label: 'Talks',
    singular: 'talk',
    titleKey: 'title',
    dateKey: 'sortDate',
    blank: { title: '', event: '', date: '', type: 'Invited Talk' },
    fields: [
      text('title', 'Title'),
      text('event', 'Event'),
      { key: 'date', label: 'Date (as shown)', type: 'text', hint: 'Free text, e.g. "March 2025".' },
      date('sortDate', 'Date (for sorting)'),
      text('location', 'Location'),
      select('type', 'Type', ['Conference Talk', 'Invited Talk', 'Seminar', 'Tutorial', 'Workshop', 'Keynote', 'Panel']),
      text('slidesUrl', 'Slides URL'),
      text('videoUrl', 'Video URL'),
    ],
  },
  positions: {
    label: 'Positions',
    singular: 'position',
    titleKey: 'title',
    dateKey: 'deadline',
    blank: { title: '', type: 'phd', status: 'open' },
    fields: [
      text('title', 'Title'),
      select('type', 'Type', ['phd', 'postdoc', 'masters', 'undergrad', 'research-assistant', 'visiting', 'other']),
      select('status', 'Status', ['open', 'closed']),
      date('deadline', 'Deadline'),
      { key: 'excerpt', label: 'Excerpt', type: 'textarea' },
      { key: 'tags', label: 'Tags', type: 'list' },
      text('contact', 'Contact'),
      { key: 'sortOrder', label: 'Sort order', type: 'number' },
    ],
  },
};
```

- [ ] **Step 4: Write `src/admin/Collection.vue`**

```vue
<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- front matter is user data */
import { computed, onMounted, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import DocBanners from './DocBanners.vue';
import FormFields from './FormFields.vue';
import MarkdownEditor from './MarkdownEditor.vue';
import { api, committed, report, toast } from './api';
import { COLLECTIONS, resolveOptions, type Option } from './fields';
import { useDocument } from './useDocument';
import type { AdminCtx, CommitResult, Entry } from './types';
import { normalizeAreas, type ResearchAreaInput } from '../lib/editorial';
import { slugify } from '../lib/utils';

type Doc = { data: Record<string, any>; body: string };

const props = defineProps<{ ctx: AdminCtx; name: string }>();
const cfg = COLLECTIONS[props.name];
const entries = ref<Entry[]>([]);
const selected = ref<string | null>(null);
const creating = ref(false);
const newSlug = ref('');
const readonly = ref(false);
const confirmDelete = ref(false);
const filters = ref<Record<string, string>>({});
const topics = ref<Option[]>([]);
const doc = useDocument<Doc>();

const path = (slug: string) => `src/content/${props.name}/${slug}.md`;
const fields = computed(() => resolveOptions(cfg.fields, { topics: topics.value }));
const title = (e: Entry) => String(e.data[cfg.titleKey] || e.slug);
const when = (e: Entry) => (cfg.dateKey ? String(e.data[cfg.dateKey] ?? '').slice(0, 10) : '');
const filterOptions = (key: string) => [...new Set(entries.value.map((e) => String(e.data[key] ?? '')).filter(Boolean))].sort().reverse();
const visible = computed(() =>
  entries.value
    .filter((e) => Object.entries(filters.value).every(([k, v]) => !v || String(e.data[k] ?? '') === v))
    .sort((a, b) => when(b).localeCompare(when(a)) || title(a).localeCompare(title(b))),
);
const suggested = computed(() => slugify(String(doc.current?.data[cfg.titleKey] ?? '')));

onMounted(async () => {
  try {
    entries.value = await api<Entry[]>(`collections/${props.name}`);
  } catch (e) {
    report(e);
  }
  if (props.name === 'publications') {
    api<{ data: { areas?: ResearchAreaInput[] } }>('config/research').then(({ data }) => {
      topics.value = [...normalizeAreas(data.areas).map((a) => ({ value: a.id, label: a.title })), { value: 'other', label: 'Other' }];
    }, report);
  }
  const wanted = new URLSearchParams(location.search).get('slug');
  if (wanted) await select(wanted);
});

async function select(slug: string) {
  creating.value = false;
  confirmDelete.value = false;
  selected.value = slug;
  history.replaceState(null, '', `?slug=${slug}`);
  await doc.open(`${props.name}/${slug}`, async () => {
    const entry = await api<Doc & { version: string; readonly: boolean }>(`collections/${props.name}/${slug}`);
    readonly.value = entry.readonly;
    return { value: { data: entry.data, body: entry.body }, version: entry.version };
  });
}

function startNew() {
  creating.value = true;
  selected.value = null;
  newSlug.value = '';
  readonly.value = false;
  history.replaceState(null, '', location.pathname);
  doc.open(`${props.name}/new`, async () => ({ value: { data: structuredClone(cfg.blank), body: '' }, version: null }));
}

async function save() {
  if (!doc.current) return;
  const slug = creating.value ? newSlug.value || suggested.value : selected.value!;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    toast('The slug needs 1–80 lowercase letters, digits or dashes');
    return;
  }
  const result = await doc.save(
    (v, version) => api<CommitResult>(`collections/${props.name}/${slug}`, { method: 'PUT', body: { data: v.data, body: v.body, version } }),
    path(slug),
  );
  if (!result) return;
  const entry: Entry = { slug, data: { ...doc.current.data }, version: result.versions[path(slug)] ?? '' };
  entries.value = [...entries.value.filter((e) => e.slug !== slug), entry];
  if (creating.value) {
    creating.value = false;
    selected.value = slug;
    doc.key = `${props.name}/${slug}`;
    history.replaceState(null, '', `?slug=${slug}`);
  }
}

async function remove() {
  if (!selected.value || !doc.version) return;
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    return;
  }
  confirmDelete.value = false;
  try {
    committed(await api<CommitResult>(`collections/${props.name}/${selected.value}`, { method: 'DELETE', body: { version: doc.version } }));
    entries.value = entries.value.filter((e) => e.slug !== selected.value);
    selected.value = null;
    doc.current = null;
    history.replaceState(null, '', location.pathname);
  } catch (e) {
    report(e);
  }
}
</script>

<template>
  <AdminShell :ctx="ctx" :active="name === 'publications' ? 'publications' : `content/${name}`" :title="cfg.label">
    <template #actions>
      <button type="button" class="adm-btn adm-btn-primary" @click="startNew">New {{ cfg.singular }}</button>
    </template>
    <div class="adm-split">
      <section aria-label="Entries" class="adm-form">
        <div v-if="cfg.filters" class="adm-actions">
          <label v-for="key in cfg.filters" :key="key" class="adm-field adm-grow">
            <span>{{ key[0].toUpperCase() + key.slice(1) }}</span>
            <select v-model="filters[key]">
              <option value="">All</option>
              <option v-for="o in filterOptions(key)" :key="o" :value="o">{{ o }}</option>
            </select>
          </label>
        </div>
        <ul class="adm-pick">
          <li v-for="e in visible" :key="e.slug">
            <button type="button" :aria-current="selected === e.slug" @click="select(e.slug)">
              <span>{{ title(e) }}</span><span class="adm-muted">{{ when(e) }}</span>
            </button>
          </li>
        </ul>
        <p v-if="!visible.length" class="adm-muted">Nothing here yet.</p>
      </section>
      <section v-if="doc.current" aria-label="Editor" class="adm-form">
        <DocBanners :draft="!!doc.draft" :conflict="doc.conflict" @restore="doc.restore()" @discard="doc.discard()" @reload="doc.reload()" />
        <p v-if="readonly" class="adm-banner">This entry is MDX: read-only here, edit it in the repository.</p>
        <label v-if="creating" class="adm-field">
          <span>Slug (file name)</span>
          <input v-model="newSlug" type="text" :placeholder="suggested" />
        </label>
        <FormFields :fields="fields" :model="doc.current.data" :errors="doc.errors" :owner="ctx.siteName" />
        <div class="adm-field" role="group" aria-labelledby="adm-body-label">
          <span id="adm-body-label">Body</span>
          <MarkdownEditor v-model="doc.current.body" compact />
        </div>
        <div class="adm-actions">
          <button type="button" class="adm-btn adm-btn-primary" :disabled="doc.saving || readonly" @click="save">
            {{ creating ? 'Create' : 'Publish' }}
          </button>
          <button v-if="!creating" type="button" class="adm-btn adm-btn-danger" :disabled="readonly" @click="remove">
            {{ confirmDelete ? 'Click again to delete' : 'Delete' }}
          </button>
        </div>
      </section>
      <p v-else class="adm-muted">Choose an entry or create a new one.</p>
    </div>
  </AdminShell>
</template>
```

- [ ] **Step 5: Register the screens.** In `src/admin/routes/[...path].astro`:
  - add the import `import Collection from '../Collection.vue';`
  - change `SCREENS` to `new Set(['', 'login', 'media', 'posts', 'publications', 'content'])`
  - after the `SCREENS` check, add
    ```ts
    const CONTENT = ['announcements', 'people', 'projects', 'talks', 'positions'];
    if (screen === 'content' && !CONTENT.includes(arg)) return new Response('Not found', { status: 404 });
    ```
  - add the render lines:
    ```astro
        {screen === 'publications' && <Collection client:only="vue" ctx={ctx} name="publications" />}
        {screen === 'content' && <Collection client:only="vue" ctx={ctx} name={arg} />}
    ```

- [ ] **Step 6: Run the e2e tests**

Run: `pnpm test:e2e`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add src/admin/fields.ts src/admin/Collection.vue 'src/admin/routes/[...path].astro' tests/e2e/admin.spec.ts
git commit -m "feat(admin): publications and content collection screens"
```

---

### Task 19: CV screen (three columns, RenderCV import, PDF, publish)

**Files:**
- Modify: `src/admin/fields.ts` (CV entry kinds, fields, preview, section names), `src/admin/fields.test.ts`
- Create: `src/admin/Cv.vue`
- Modify: `src/admin/routes/[...path].astro`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `POST cv/publish`, `POST cv/import`, `GET|POST cv/pdf`, `GET config/cv`, `GET config/cv-upload`, `GET collections/publications`; `text` and `FieldDef` (Tasks 16, 18).
- Produces: `CvEntryKind`, `cvEntryKind(entry)`, `CV_BLANK: Record<CvEntryKind, () => unknown>`, `CV_FIELDS`, `cvEntryPreview(entry): { title; org; when; points }`, `sectionLabel(key)`, `sectionKey(name)`. Screen `cv`.

- [ ] **Step 1: Write the failing unit tests.** Append to `src/admin/fields.test.ts` (and add the new names to its import from `./fields`):

```ts
test('cvEntryKind recognizes the RenderCV entry shapes', () => {
  assert.equal(cvEntryKind('A text entry'), 'text');
  assert.equal(cvEntryKind({ institution: 'U', area: 'CS' }), 'education');
  assert.equal(cvEntryKind({ company: 'C' }), 'experience');
  assert.equal(cvEntryKind({ position: 'P' }), 'experience');
  assert.equal(cvEntryKind({ title: 'T', authors: [] }), 'publication');
  assert.equal(cvEntryKind({ label: 'L', details: 'D' }), 'oneLine');
  assert.equal(cvEntryKind({ bullet: 'B' }), 'bullet');
  assert.equal(cvEntryKind({ name: 'N' }), 'normal');
});

test('cvEntryPreview mirrors the public CV layout (title / org / dates / points)', () => {
  assert.deepEqual(
    cvEntryPreview({ institution: 'MIT', area: 'CS', degree: 'PhD', location: 'Boston', startDate: '2020-09', endDate: 'present', highlights: ['Thesis'] }),
    { title: 'PhD in CS', org: 'MIT, Boston', when: '2020-09 – Present', points: ['Thesis'] },
  );
  assert.deepEqual(cvEntryPreview({ label: 'Languages', details: 'Python' }), { title: 'Languages', org: 'Python', when: '', points: [] });
  assert.deepEqual(cvEntryPreview({ title: 'Paper', authors: ['**Me**', 'You'], journal: 'NeurIPS', date: 2025 }), {
    title: 'Paper',
    org: 'Me, You · NeurIPS',
    when: '2025',
    points: [],
  });
  assert.equal(cvEntryPreview('Plain text').title, 'Plain text');
});

test('section names ↔ camelCase keys', () => {
  assert.equal(sectionLabel('researchExperience'), 'Research Experience');
  assert.equal(sectionKey('Teaching experience'), 'teachingExperience');
  assert.equal(sectionKey('  Awards & Honors '), 'awardsHonors');
  assert.equal(sectionKey('!!!'), '');
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test`
Expected: FAIL. `cvEntryKind`, `cvEntryPreview`, `sectionLabel` and `sectionKey` are not exported.

- [ ] **Step 3: Append the CV helpers to `src/admin/fields.ts`**

```ts
// ── CV (config/cv.yml stores RenderCV entries with camelCase keys) ──

export type CvEntryKind = 'text' | 'education' | 'experience' | 'publication' | 'oneLine' | 'bullet' | 'normal';

/** Same shape tests as src/lib/cv.ts (which can't be imported here: it reads files). */
export function cvEntryKind(entry: unknown): CvEntryKind {
  if (typeof entry !== 'object' || entry === null) return 'text';
  const has = (key: string) => key in entry;
  if (has('institution')) return 'education';
  if (has('company') || has('position')) return 'experience';
  if (has('title') && has('authors')) return 'publication';
  if (has('label') && has('details')) return 'oneLine';
  if (has('bullet')) return 'bullet';
  return 'normal';
}

export const CV_BLANK: Record<CvEntryKind, () => unknown> = {
  text: () => '',
  education: () => ({ institution: '', area: '' }),
  experience: () => ({ company: '', position: '' }),
  publication: () => ({ title: '', authors: [] }),
  oneLine: () => ({ label: '', details: '' }),
  bullet: () => ({ bullet: '' }),
  normal: () => ({ name: '' }),
};

const highlights: FieldDef = { key: 'highlights', label: 'Highlights', type: 'list' };
const cvDates = [text('startDate', 'Start (YYYY-MM)'), text('endDate', "End (YYYY-MM or 'present')")];

export const CV_FIELDS: Record<Exclude<CvEntryKind, 'text'>, FieldDef[]> = {
  education: [text('institution', 'Institution'), text('area', 'Area'), text('degree', 'Degree'), text('location', 'Location'), ...cvDates, highlights],
  experience: [text('company', 'Company'), text('position', 'Position'), text('location', 'Location'), ...cvDates, highlights],
  publication: [
    text('title', 'Title'),
    { key: 'authors', label: 'Authors', type: 'authors' },
    text('journal', 'Journal or venue'),
    text('date', 'Date or year'),
    text('doi', 'DOI'),
    text('url', 'URL'),
  ],
  oneLine: [text('label', 'Label'), text('details', 'Details')],
  bullet: [text('bullet', 'Text')],
  normal: [text('name', 'Name'), text('location', 'Location'), text('date', 'Date'), ...cvDates, text('summary', 'Summary'), highlights],
};

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const joined = (parts: unknown[], sep: string) => parts.map(str).filter(Boolean).join(sep);

/** The live preview: the same title / org / dates / highlights the public CV shows. */
export function cvEntryPreview(entry: unknown): { title: string; org: string; when: string; points: string[] } {
  if (typeof entry === 'string') return { title: entry, org: '', when: '', points: [] };
  const e = (entry ?? {}) as Record<string, any>;
  const when = e.startDate ? `${str(e.startDate)} – ${e.endDate === 'present' ? 'Present' : str(e.endDate)}` : str(e.date);
  const points = Array.isArray(e.highlights) ? e.highlights.map(str).filter(Boolean) : [];
  switch (cvEntryKind(entry)) {
    case 'education':
      return { title: joined([e.degree, e.area], ' in '), org: joined([e.institution, e.location], ', '), when, points };
    case 'experience':
      return { title: str(e.position), org: joined([e.company, e.location], ', '), when, points };
    case 'publication': {
      const authors = (Array.isArray(e.authors) ? e.authors : []).map((a: unknown) => str(a).replace(/\*+/g, ''));
      return { title: str(e.title), org: joined([authors.join(', '), e.journal], ' · '), when: str(e.date), points };
    }
    case 'oneLine':
      return { title: str(e.label), org: str(e.details), when: '', points: [] };
    case 'bullet':
      return { title: str(e.bullet), org: '', when: '', points: [] };
    default:
      return { title: str(e.name), org: str(e.location), when, points };
  }
}

export const sectionLabel = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** "Teaching experience" → "teachingExperience"; '' when nothing usable is left. */
export function sectionKey(name: string): string {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
}
```

- [ ] **Step 4: Run the unit tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Append the failing e2e tests** to `tests/e2e/admin.spec.ts`

```ts
test('cv: edit an entry, see the preview, publish', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/cv`);
  await page.getByRole('region', { name: 'Sections' }).getByRole('button', { name: /^Experience/ }).click();
  await page.getByRole('region', { name: 'Entries' }).getByRole('button').first().click();
  await page.getByLabel('Position', { exact: true }).fill('Professor (e2e)');
  await expect(page.getByLabel('Preview')).toContainText('Professor (e2e)');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
});

test('cv: a stale save shows the conflict dialog and keeps the edits', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/cv`);
  await expect(page.getByRole('region', { name: 'Sections' }).getByRole('button').first()).toBeVisible();
  // Someone else commits config/cv.yml after this page loaded it.
  const current = await (await page.request.get('/api/admin/config/cv')).json();
  const origin = new URL(page.url()).origin;
  const res = await page.request.put('/api/admin/config/cv', {
    headers: { Origin: origin },
    data: { data: { ...current.data, cv: { ...current.data.cv, phone: '+1-555-0199' } }, version: current.version },
  });
  expect(res.ok()).toBeTruthy();
  await page.getByRole('region', { name: 'Sections' }).getByRole('button', { name: /^Education/ }).click();
  await page.getByRole('region', { name: 'Entries' }).getByRole('button').first().click();
  await page.getByLabel('Institution', { exact: true }).fill('Changed University');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'This file changed since you opened it' })).toBeVisible();
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByRole('button', { name: 'Restore edits' })).toBeVisible();
});
```

- [ ] **Step 6: Run them to make sure they fail**

Run: `pnpm test:e2e`
Expected: the two CV tests FAIL with 404.

- [ ] **Step 7: Write `src/admin/Cv.vue`.** Columns follow `personal-site-handoff/design/AdminResume.dc.html`.

```vue
<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- cv.yml is user data */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import DocBanners from './DocBanners.vue';
import FormFields from './FormFields.vue';
import { api, report, toast } from './api';
import { CV_BLANK, CV_FIELDS, cvEntryKind, cvEntryPreview, sectionKey, sectionLabel, type CvEntryKind } from './fields';
import { useDocument } from './useDocument';
import type { AdminCtx, CommitResult, Entry } from './types';

interface CvDoc {
  cv: { name: string; sections?: Record<string, unknown[]>; [key: string]: unknown };
  [key: string]: unknown;
}
interface PendingPublication {
  slug: string;
  data: Record<string, unknown>;
  body: string;
  version: string | null;
}
interface ImportPreview {
  cv: CvDoc;
  publications: PendingPublication[];
  summary: { sections: { key: string; count: number }[]; newPublications: number; updatedPublications: number; skipped: number };
}
interface Run {
  status: string;
  conclusion: string | null;
  url: string;
}

defineProps<{ ctx: AdminCtx }>();
const doc = useDocument<CvDoc>();
const upload = ref<{ enabled: boolean; version: string | null }>({ enabled: false, version: null });
const publicationCount = ref(0);
const section = ref<string | null>(null);
const index = ref<number | null>(null);
const kind = ref<CvEntryKind>('normal');
const newKind = ref<CvEntryKind>('normal');
const newSection = ref('');
const confirmSection = ref(false);
const confirmEntry = ref(false);
const pending = ref<PendingPublication[]>([]);
const turnOffUpload = ref(false);
const importing = ref(false);
const importText = ref('');
const preview = ref<ImportPreview | null>(null);
const pdf = ref<Run | null>(null);
let pdfTimer: number | undefined;
let pdfStarted = 0;

const KINDS: [CvEntryKind, string][] = [
  ['normal', 'Normal (name, dates, highlights)'],
  ['experience', 'Experience'],
  ['education', 'Education'],
  ['oneLine', 'One line (label: details)'],
  ['bullet', 'Bullet'],
  ['text', 'Text'],
  ['publication', 'Publication'],
];

const sections = computed<Record<string, unknown[]>>(() => doc.current?.cv.sections ?? {});
const keys = computed(() => Object.keys(sections.value));
const entries = computed(() => (section.value ? (sections.value[section.value] ?? []) : []));
const entry = computed(() => (index.value === null ? undefined : entries.value[index.value]));
const entryPreview = computed(() => cvEntryPreview(entry.value));
const hasPublicationSection = computed(() =>
  Object.values(sections.value).some((list) => list.some((e) => cvEntryKind(e) === 'publication')),
);
const pdfLabel = computed(() => {
  if (!pdf.value) return '';
  if (pdf.value.status !== 'completed') return 'PDF: generating…';
  return pdf.value.conclusion === 'success' ? 'PDF: up to date' : `PDF: last run ${pdf.value.conclusion}`;
});

function setSections(next: Record<string, unknown[]>) {
  if (doc.current) doc.current.cv.sections = next;
}

onMounted(async () => {
  await doc.open('config/cv', async () => {
    const { data, version } = await api<{ data: CvDoc; version: string | null }>('config/cv');
    data.cv ??= { name: '' };
    data.cv.sections ??= {};
    return { value: data, version };
  });
  section.value = keys.value[0] ?? null;
  try {
    const [cvUpload, publications] = await Promise.all([
      api<{ data: { enabled?: boolean }; version: string | null }>('config/cv-upload'),
      api<Entry[]>('collections/publications'),
    ]);
    upload.value = { enabled: !!cvUpload.data.enabled, version: cvUpload.version };
    publicationCount.value = publications.length;
  } catch (e) {
    report(e);
  }
  checkPdf();
});
onBeforeUnmount(() => clearTimeout(pdfTimer));

// ── Sections ──
function selectSection(key: string | null) {
  section.value = key;
  index.value = null;
  confirmSection.value = false;
  confirmEntry.value = false;
}
function addSection() {
  const key = sectionKey(newSection.value);
  if (!key) return;
  if (key in sections.value) return toast(`There is already a "${sectionLabel(key)}" section`);
  setSections({ ...sections.value, [key]: [] });
  newSection.value = '';
  selectSection(key);
}
function renameSection() {
  if (!section.value) return;
  const name = window.prompt('Section name', sectionLabel(section.value));
  const key = name ? sectionKey(name) : '';
  if (!key || key === section.value) return;
  if (key in sections.value) return toast(`There is already a "${sectionLabel(key)}" section`);
  const old = section.value;
  setSections(Object.fromEntries(Object.entries(sections.value).map(([k, v]) => [k === old ? key : k, v])));
  section.value = key;
}
function deleteSection() {
  if (!section.value) return;
  if (!confirmSection.value) {
    confirmSection.value = true;
    return;
  }
  const rest = Object.fromEntries(Object.entries(sections.value).filter(([k]) => k !== section.value));
  setSections(rest);
  selectSection(Object.keys(rest)[0] ?? null);
}

// ── Entries ──
function selectEntry(i: number) {
  index.value = i;
  kind.value = cvEntryKind(entries.value[i]);
  confirmEntry.value = false;
}
function setEntries(list: unknown[]) {
  if (section.value) setSections({ ...sections.value, [section.value]: list });
}
function addEntry() {
  if (!section.value) return;
  const entryKind = entries.value.length ? cvEntryKind(entries.value[0]) : newKind.value;
  setEntries([...entries.value, CV_BLANK[entryKind]()]);
  selectEntry(entries.value.length - 1);
}
function moveEntry(by: number) {
  if (index.value === null) return;
  const to = index.value + by;
  if (to < 0 || to >= entries.value.length) return;
  const list = [...entries.value];
  [list[index.value], list[to]] = [list[to], list[index.value]];
  setEntries(list);
  index.value = to;
}
function deleteEntry() {
  if (index.value === null) return;
  if (!confirmEntry.value) {
    confirmEntry.value = true;
    return;
  }
  setEntries(entries.value.filter((_, i) => i !== index.value));
  index.value = null;
  confirmEntry.value = false;
}
function setText(value: string) {
  if (index.value !== null) setEntries(entries.value.map((e, i) => (i === index.value ? value : e)));
}
function setVisible(visible: boolean) {
  const e = entry.value as Record<string, unknown> | undefined;
  if (!e || typeof e !== 'object') return;
  if (visible) delete e.visible;
  else e.visible = false;
}

// ── Publish ──
async function publish() {
  const result = await doc.save(
    (cv, cvVersion) =>
      api<CommitResult>('cv/publish', {
        method: 'POST',
        body: { cv, cvVersion, publications: pending.value, ...(turnOffUpload.value ? { uploadVersion: upload.value.version } : {}) },
      }),
    'config/cv.yml',
  );
  if (!result) return;
  publicationCount.value += pending.value.filter((p) => !p.version).length;
  pending.value = [];
  if (turnOffUpload.value) {
    upload.value = { enabled: false, version: result.versions['config/cv-upload.yml'] ?? null };
    turnOffUpload.value = false;
  }
}

// ── Import ──
async function readFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) importText.value = await file.text();
}
async function previewImport() {
  preview.value = null;
  try {
    preview.value = await api<ImportPreview>('cv/import', { body: { yaml: importText.value } });
  } catch (e) {
    report(e);
  }
}
function applyImport() {
  if (!preview.value) return;
  const cv = preview.value.cv;
  doc.current = { ...cv, cv: { ...cv.cv, sections: cv.cv.sections ?? {} } };
  pending.value = preview.value.publications;
  turnOffUpload.value = upload.value.enabled;
  selectSection(Object.keys(doc.current.cv.sections ?? {})[0] ?? null);
  closeImport();
  toast('Imported into the editor. Review it, then click Publish.');
}
function closeImport() {
  importing.value = false;
  preview.value = null;
  importText.value = '';
}

// ── PDF (GitHub Actions: render-cv.yml) ──
async function checkPdf() {
  try {
    const { run } = await api<{ run: Run | null }>('cv/pdf');
    pdf.value = run;
    const justStarted = Date.now() - pdfStarted < 60_000; // a new run takes a moment to appear
    if ((run && run.status !== 'completed') || justStarted) pdfTimer = window.setTimeout(checkPdf, 5000);
  } catch (e) {
    report(e);
  }
}
async function generatePdf() {
  try {
    await api('cv/pdf', { method: 'POST' });
    pdfStarted = Date.now();
    toast('PDF generation started on GitHub Actions');
    clearTimeout(pdfTimer);
    pdfTimer = window.setTimeout(checkPdf, 4000);
  } catch (e) {
    report(e);
  }
}
</script>

<template>
  <AdminShell :ctx="ctx" active="cv" title="CV">
    <template #actions>
      <span v-if="pdf" class="adm-muted">{{ pdfLabel }} · <a :href="pdf.url" target="_blank" rel="noopener">run</a></span>
      <button type="button" class="adm-btn" @click="importing = true">Import YAML</button>
      <button type="button" class="adm-btn" @click="generatePdf">Generate PDF</button>
      <button type="button" class="adm-btn adm-btn-primary" :disabled="doc.saving || !doc.current" @click="publish">Publish</button>
    </template>

    <p v-if="upload.enabled && !turnOffUpload" class="adm-banner">
      A raw RenderCV upload (config/cv-upload.yml) is turned on and replaces this CV on the site. Importing YAML here turns the upload off.
    </p>
    <p v-if="turnOffUpload" class="adm-banner">Publishing will turn off the raw RenderCV upload.</p>
    <p v-if="pending.length" class="adm-banner">
      {{ pending.length }} publication(s) from the import will be saved to Publications when you publish.
    </p>
    <DocBanners :draft="!!doc.draft" :conflict="doc.conflict" @restore="doc.restore()" @discard="doc.discard()" @reload="doc.reload()" />

    <div v-if="doc.current" class="adm-cols3">
      <section aria-label="Sections" class="adm-form">
        <ul class="adm-pick">
          <li v-for="key in keys" :key="key">
            <button type="button" :aria-current="section === key" @click="selectSection(key)">
              <span>{{ sectionLabel(key) }}</span><span class="adm-muted">{{ sections[key].length }}</span>
            </button>
          </li>
          <li v-if="!hasPublicationSection">
            <a :href="`/${ctx.adminPath}/publications`"><span>Publications</span><span class="adm-muted">{{ publicationCount }} ↗</span></a>
          </li>
        </ul>
        <div class="adm-list-row">
          <input v-model="newSection" type="text" placeholder="New section" aria-label="New section name" @keydown.enter="addSection" />
          <button type="button" class="adm-btn adm-btn-small" @click="addSection">Add</button>
        </div>
        <div v-if="section" class="adm-actions">
          <button type="button" class="adm-btn adm-btn-small" @click="renameSection">Rename</button>
          <button type="button" class="adm-btn adm-btn-small adm-btn-danger" @click="deleteSection">
            {{ confirmSection ? 'Click again to delete' : 'Delete section' }}
          </button>
        </div>
      </section>

      <section aria-label="Entries" class="adm-form">
        <ul class="adm-pick">
          <li v-for="(e, i) in entries" :key="i">
            <button type="button" :aria-current="index === i" @click="selectEntry(i)">
              <span>{{ cvEntryPreview(e).title || '(untitled)' }}</span>
              <span v-if="(e as any)?.visible === false" class="adm-muted">hidden</span>
            </button>
          </li>
        </ul>
        <p v-if="section && !entries.length" class="adm-muted">No entries yet.</p>
        <div v-if="section" class="adm-actions">
          <select v-if="!entries.length" v-model="newKind" aria-label="Entry type">
            <option v-for="[k, label] in KINDS" :key="k" :value="k">{{ label }}</option>
          </select>
          <button type="button" class="adm-btn adm-btn-small" @click="addEntry">+ Entry</button>
          <template v-if="index !== null">
            <button type="button" class="adm-btn adm-btn-small" aria-label="Move entry up" @click="moveEntry(-1)">↑</button>
            <button type="button" class="adm-btn adm-btn-small" aria-label="Move entry down" @click="moveEntry(1)">↓</button>
            <button type="button" class="adm-btn adm-btn-small adm-btn-danger" @click="deleteEntry">
              {{ confirmEntry ? 'Click again to delete' : 'Delete' }}
            </button>
          </template>
        </div>
      </section>

      <section aria-label="Entry" class="adm-form">
        <template v-if="entry !== undefined && section && index !== null">
          <label v-if="kind === 'text'" class="adm-field">
            <span>Text</span>
            <textarea :value="String(entry)" rows="5" @input="setText(($event.target as HTMLTextAreaElement).value)" />
          </label>
          <template v-else>
            <label class="adm-check">
              <input type="checkbox" :checked="(entry as any).visible !== false" @change="setVisible(($event.target as HTMLInputElement).checked)" />
              Visible
            </label>
            <FormFields
              :fields="CV_FIELDS[kind as Exclude<CvEntryKind, 'text'>]"
              :model="entry as Record<string, any>"
              :errors="doc.errors"
              :prefix="`cv.sections.${section}.${index}.`"
              :owner="ctx.siteName"
            />
          </template>
          <section class="adm-card" aria-label="Preview">
            <strong>{{ entryPreview.title || '(untitled)' }}</strong>
            <div v-if="entryPreview.org" class="adm-muted">{{ entryPreview.org }}</div>
            <div v-if="entryPreview.when" class="adm-muted">{{ entryPreview.when }}</div>
            <ul v-if="entryPreview.points.length">
              <li v-for="(point, i) in entryPreview.points" :key="i">{{ point }}</li>
            </ul>
          </section>
        </template>
        <p v-else class="adm-muted">Choose an entry.</p>
      </section>
    </div>

    <div v-if="importing" class="adm-modal" role="dialog" aria-modal="true" aria-labelledby="adm-import-title" @keydown.esc="closeImport">
      <div>
        <h2 id="adm-import-title" class="adm-h2">Import a RenderCV YAML file</h2>
        <p class="adm-muted">
          The import replaces the CV in this editor and moves publication sections into Publications. Papers that already exist
          are updated, not duplicated. Nothing is saved until you click Publish.
        </p>
        <input type="file" accept=".yaml,.yml,text/yaml" aria-label="RenderCV file" @change="readFile" />
        <label class="adm-field">
          <span>Or paste the YAML</span>
          <textarea v-model="importText" rows="10" />
        </label>
        <div v-if="preview" class="adm-card">
          <p><strong>{{ preview.cv.cv.name }}</strong></p>
          <ul>
            <li v-for="s in preview.summary.sections" :key="s.key">{{ sectionLabel(s.key) }}: {{ s.count }}</li>
          </ul>
          <p>
            Publications: {{ preview.summary.newPublications }} new, {{ preview.summary.updatedPublications }} updated<span
              v-if="preview.summary.skipped"
              >, {{ preview.summary.skipped }} skipped (MDX)</span
            >.
          </p>
        </div>
        <div class="adm-actions">
          <button v-if="!preview" type="button" class="adm-btn adm-btn-primary" :disabled="!importText.trim()" @click="previewImport">
            Preview
          </button>
          <button v-else type="button" class="adm-btn adm-btn-primary" @click="applyImport">Apply to editor</button>
          <button type="button" class="adm-btn" @click="closeImport">Cancel</button>
        </div>
      </div>
    </div>
  </AdminShell>
</template>
```

- [ ] **Step 8: Register the screen.** In `src/admin/routes/[...path].astro`, add `import Cv from '../Cv.vue';`, add `'cv'` to `SCREENS`, and add the render line `{screen === 'cv' && <Cv client:only="vue" ctx={ctx} />}`.

- [ ] **Step 9: Run the e2e tests**

Run: `pnpm test:e2e`
Expected: 7 passed.

- [ ] **Step 10: Try the import by hand.** In the dev server, open `/admin/cv`, click Import YAML and choose `tests/fixtures/rendercv.yaml`. The preview should list Summary, Skills, Education 3, Research Experience and the other sections, plus "Publications: 12 new, 0 updated". Click Apply: the sections column shows the imported sections plus a "Publications ↗" link, and the banner says 12 publications will be saved. Don't publish.

- [ ] **Step 11: Commit**

```bash
git add src/admin/fields.ts src/admin/fields.test.ts src/admin/Cv.vue 'src/admin/routes/[...path].astro' tests/e2e/admin.spec.ts
git commit -m "feat(admin): three-column CV editor with RenderCV import and PDF status"
```

---

### Task 20: Pages and Settings

**Files:**
- Create: `src/admin/Pages.vue`, `src/admin/Settings.vue`
- Modify: `src/admin/routes/[...path].astro`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `GET|PUT config/site`, `GET|PUT config/research`, `GET|PUT config/feeds`, `GET collections/publications`; `text`, `select`, `SOCIALS`, `resolveOptions`, `FormFields`, `useDocument` (Tasks 16, 18).
- Produces: screens `pages` and `settings`. Both edit `config/site.yml`, with separate draft keys (`config/site#pages`, `config/site#settings`); a stale second save gets the usual 409 dialog.

- [ ] **Step 1: Append the failing e2e tests**

```ts
test('pages: reorder home sections and publish', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/pages`);
  const sections = page.getByRole('group', { name: 'Home page sections' });
  await sections.getByRole('button', { name: 'Move down' }).first().click();
  await page.getByRole('button', { name: 'Publish home page' }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
});

test('settings: change the site title and publish', async ({ page }) => {
  await signIn(page);
  await page.goto(`${ADMIN}/settings`);
  await page.getByLabel('Site title', { exact: true }).fill('E2E Lab');
  await page.getByRole('button', { name: 'Publish settings' }).click();
  await expect(page.getByText(COMMITTED)).toBeVisible();
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test:e2e`
Expected: the two new tests FAIL with 404.

- [ ] **Step 3: Write `src/admin/Pages.vue`**

```vue
<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- config files are user data */
import { computed, onMounted, ref } from 'vue';
import AdminShell from './AdminShell.vue';
import DocBanners from './DocBanners.vue';
import FormFields from './FormFields.vue';
import { api, report } from './api';
import { resolveOptions, text, type FieldDef, type Option } from './fields';
import { useDocument } from './useDocument';
import type { AdminCtx, CommitResult, Entry } from './types';

type Config = Record<string, any>;
defineProps<{ ctx: AdminCtx }>();

const HOME: FieldDef[] = [
  text('editorial.eyebrow', 'Eyebrow'),
  { key: 'editorial.tagline', label: 'Tagline', type: 'textarea' },
  { key: 'editorial.bio', label: 'Bio', type: 'markdown' },
  { key: 'editorial.figure.image', label: 'Figure image', type: 'image', folder: 'site' },
  text('editorial.figure.alt', 'Figure alt text'),
  text('editorial.figure.caption', 'Figure caption'),
  { key: 'editorial.affiliations', label: 'Affiliations', type: 'list' },
  text('editorial.contact.heading', 'Contact heading'),
  { key: 'editorial.contact.text', label: 'Contact text', type: 'textarea' },
  { key: 'about.enabled', label: 'Show the about section (classic theme)', type: 'checkbox', default: true },
  text('about.title', 'About title'),
  { key: 'about.text', label: 'About text', type: 'markdown' },
  { key: 'about.image', label: 'About image', type: 'image', folder: 'site' },
  {
    key: 'homepageSections',
    label: 'Home page sections',
    type: 'objects',
    fixed: true,
    fields: [
      { key: 'id', label: 'Section', type: 'readonly' },
      { key: 'enabled', label: 'Enabled', type: 'checkbox' },
    ],
  },
];

const RESEARCH: FieldDef[] = [
  { key: 'headline', label: 'Headline', type: 'textarea' },
  { key: 'description', label: 'Description', type: 'textarea' },
  {
    key: 'areas',
    label: 'Research areas',
    type: 'objects',
    fields: [
      text('title', 'Title'),
      text('label', 'Short label'),
      text('id', 'Anchor id (optional)'),
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'body', label: 'Body (Research page)', type: 'markdown' },
      { key: 'result', label: 'Key result', type: 'textarea' },
      { key: 'figure', label: 'Figure', type: 'image', folder: 'site' },
      text('caption', 'Figure caption'),
      { key: 'publications', label: 'Related publications', type: 'pubs', optionsFrom: 'publications' },
      { key: 'tags', label: 'Tags', type: 'list' },
    ],
  },
];

const tab = ref<'home' | 'research'>('home');
const home = useDocument<Config>();
const research = useDocument<Config>();
const publications = ref<Option[]>([]);
const researchFields = computed(() => resolveOptions(RESEARCH, { publications: publications.value }));

const loader = (file: string) => async () => {
  const { data, version } = await api<{ data: Config; version: string | null }>(`config/${file}`);
  return { value: data, version };
};
const publish = (doc: typeof home, file: string) =>
  doc.save((data, version) => api<CommitResult>(`config/${file}`, { method: 'PUT', body: { data, version } }), `config/${file}.yml`);

onMounted(() => {
  home.open('config/site#pages', loader('site'));
  research.open('config/research', loader('research'));
  api<Entry[]>('collections/publications').then((list) => {
    publications.value = list.map((p) => ({ value: p.slug, label: String(p.data.title ?? p.slug) }));
  }, report);
});
</script>

<template>
  <AdminShell :ctx="ctx" active="pages" title="Pages">
    <div role="tablist" aria-label="Pages" class="adm-actions">
      <button type="button" role="tab" class="adm-btn" :class="{ 'adm-btn-primary': tab === 'home' }" :aria-selected="tab === 'home'" @click="tab = 'home'">
        Home
      </button>
      <button
        type="button"
        role="tab"
        class="adm-btn"
        :class="{ 'adm-btn-primary': tab === 'research' }"
        :aria-selected="tab === 'research'"
        @click="tab = 'research'"
      >
        Research
      </button>
    </div>

    <section v-show="tab === 'home'" class="adm-form" aria-label="Home page">
      <DocBanners :draft="!!home.draft" :conflict="home.conflict" @restore="home.restore()" @discard="home.discard()" @reload="home.reload()" />
      <p class="adm-muted">Saved to config/site.yml.</p>
      <FormFields v-if="home.current" :fields="HOME" :model="home.current" :errors="home.errors" />
      <div class="adm-actions">
        <button type="button" class="adm-btn adm-btn-primary" :disabled="home.saving" @click="publish(home, 'site')">Publish home page</button>
      </div>
    </section>

    <section v-show="tab === 'research'" class="adm-form" aria-label="Research page">
      <DocBanners
        :draft="!!research.draft"
        :conflict="research.conflict"
        @restore="research.restore()"
        @discard="research.discard()"
        @reload="research.reload()"
      />
      <p class="adm-muted">Saved to config/research.yml.</p>
      <FormFields v-if="research.current" :fields="researchFields" :model="research.current" :errors="research.errors" />
      <div class="adm-actions">
        <button type="button" class="adm-btn adm-btn-primary" :disabled="research.saving" @click="publish(research, 'research')">
          Publish research page
        </button>
      </div>
    </section>
  </AdminShell>
</template>
```

- [ ] **Step 4: Write `src/admin/Settings.vue`**

```vue
<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- config files are user data */
import { onMounted } from 'vue';
import AdminShell from './AdminShell.vue';
import DocBanners from './DocBanners.vue';
import FormFields from './FormFields.vue';
import { api } from './api';
import { SOCIALS, select, text, type FieldDef } from './fields';
import { useDocument } from './useDocument';
import type { AdminCtx, CommitResult } from './types';

type Config = Record<string, any>;
defineProps<{ ctx: AdminCtx }>();

const GROUPS: { label: string; fields: FieldDef[] }[] = [
  {
    label: 'Identity',
    fields: [
      select('siteMode', 'Site mode', ['personal', 'lab']),
      text('title', 'Site title'),
      { key: 'description', label: 'Description', type: 'textarea' },
      text('author', 'Author (personal mode)'),
      text('labName', 'Lab name (lab mode)'),
      text('university', 'University'),
      text('department', 'Department'),
      text('siteUrl', 'Site URL'),
      text('lang', 'Language (BCP 47, e.g. en)'),
    ],
  },
  {
    label: 'Theme & colors',
    fields: [
      select('theme', 'Theme', ['classic', 'editorial']),
      select('defaultTheme', 'Light or dark by default (classic)', ['light', 'dark', 'system']),
      { key: 'colors.light.primary', label: 'Accent color', type: 'color' },
      { key: 'colors.dark.primary', label: 'Accent color in dark mode (classic)', type: 'color' },
    ],
  },
  {
    label: 'Fonts',
    fields: [text('fonts.families.sans', 'Sans-serif font'), text('fonts.families.serif', 'Serif font'), text('fonts.families.mono', 'Monospace font')],
  },
  {
    label: 'Navigation',
    fields: [{ key: 'nav', label: 'Menu items', type: 'objects', fields: [text('label', 'Label'), text('href', 'Link')] }],
  },
  {
    label: 'Socials',
    fields: [text('socials.email', 'Email'), ...SOCIALS.map((s) => text(`socials.${s}`, `${s[0].toUpperCase()}${s.slice(1)} URL`))],
  },
  {
    label: 'Top bar',
    fields: [{ key: 'topBar.enabled', label: 'Show the top bar', type: 'checkbox' }, text('topBar.text', 'Top bar text')],
  },
  {
    label: 'Hero',
    fields: [
      select('hero.type', 'Background', ['image', 'video', 'pattern', 'animation', 'none']),
      { key: 'hero.light.bgColor', label: 'Background color', type: 'color' },
      { key: 'hero.light.bgImage', label: 'Background image', type: 'image', folder: 'site' },
      { key: 'hero.dark.bgColor', label: 'Background color (dark mode)', type: 'color' },
      { key: 'hero.dark.bgImage', label: 'Background image (dark mode)', type: 'image', folder: 'site' },
    ],
  },
  {
    label: 'Admin users',
    fields: [
      {
        key: 'adminUsers',
        label: 'GitHub usernames',
        type: 'list',
        hint: 'Who can sign in here. Changes take effect after the redeploy this save triggers.',
      },
    ],
  },
];

const FEEDS: FieldDef[] = [
  {
    key: 'feeds',
    label: 'Feed sources',
    type: 'objects',
    fields: [text('name', 'Name'), text('url', 'Feed URL'), text('author', 'Author (people id)'), { key: 'tags', label: 'Tags', type: 'list' }],
  },
  { key: 'maxItemsPerFeed', label: 'Items per feed', type: 'number' },
];

const site = useDocument<Config>();
const feeds = useDocument<Config>();
const loader = (file: string) => async () => {
  const { data, version } = await api<{ data: Config; version: string | null }>(`config/${file}`);
  return { value: data, version };
};
const publish = (doc: typeof site, file: string) =>
  doc.save((data, version) => api<CommitResult>(`config/${file}`, { method: 'PUT', body: { data, version } }), `config/${file}.yml`);

onMounted(() => {
  site.open('config/site#settings', loader('site'));
  feeds.open('config/feeds', loader('feeds'));
});
</script>

<template>
  <AdminShell :ctx="ctx" active="settings" title="Settings">
    <template #actions>
      <button type="button" class="adm-btn adm-btn-primary" :disabled="site.saving || !site.current" @click="publish(site, 'site')">
        Publish settings
      </button>
    </template>
    <DocBanners :draft="!!site.draft" :conflict="site.conflict" @restore="site.restore()" @discard="site.discard()" @reload="site.reload()" />
    <template v-if="site.current">
      <fieldset v-for="group in GROUPS" :key="group.label" class="adm-group">
        <legend>{{ group.label }}</legend>
        <FormFields :fields="group.fields" :model="site.current" :errors="site.errors" />
      </fieldset>
    </template>

    <fieldset class="adm-group">
      <legend>Feeds</legend>
      <DocBanners :draft="!!feeds.draft" :conflict="feeds.conflict" @restore="feeds.restore()" @discard="feeds.discard()" @reload="feeds.reload()" />
      <p class="adm-muted">Saved to config/feeds.yml. The Medium feed is set on the Dashboard.</p>
      <FormFields v-if="feeds.current" :fields="FEEDS" :model="feeds.current" :errors="feeds.errors" />
      <div class="adm-actions">
        <button type="button" class="adm-btn" :disabled="feeds.saving || !feeds.current" @click="publish(feeds, 'feeds')">Publish feeds</button>
      </div>
    </fieldset>
  </AdminShell>
</template>
```

- [ ] **Step 5: Register the screens.** In `src/admin/routes/[...path].astro`, add `import Pages from '../Pages.vue';` and `import Settings from '../Settings.vue';`, add `'pages'` and `'settings'` to `SCREENS`, and add:

```astro
    {screen === 'pages' && <Pages client:only="vue" ctx={ctx} />}
    {screen === 'settings' && <Settings client:only="vue" ctx={ctx} />}
```

- [ ] **Step 6: Run the e2e tests**

Run: `pnpm test:e2e`
Expected: 9 passed.

- [ ] **Step 7: Commit**

```bash
git add src/admin/Pages.vue src/admin/Settings.vue 'src/admin/routes/[...path].astro' tests/e2e/admin.spec.ts
git commit -m "feat(admin): pages (home, research) and settings screens"
```

---

### Task 21: Setup docs and final verification

**Files:**
- Create: `.env.example`
- Modify: `README.md` (new section after "### CMS Admin Panel", plus a Table of Contents line)
- Possibly modify: any file that `pnpm check` or `pnpm lint` flags

**Interfaces:**
- Consumes: everything above.
- Produces: the README "Deploy on Vercel (custom admin)" section and `.env.example`.

- [ ] **Step 1: Write `.env.example`**

```
# Custom admin on Vercel. See README → "Deploy on Vercel (custom admin)". Never commit real values.
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_TOKEN=
# At least 32 random characters, e.g. `openssl rand -base64 48`
SESSION_SECRET=
# Optional: default to the repository and branch Vercel deploys
GITHUB_REPO=
GITHUB_BRANCH=
```

- [ ] **Step 2: Add the README section** right after the "### CMS Admin Panel" section, before "### Cookie Consent (GDPR)":

````markdown
### Deploy on Vercel (custom admin)

On Vercel, ScholarOS replaces Sveltia with its own admin at `/<adminPath>` (default `/admin`). It has a dashboard, a post editor with math, a three-column CV editor with RenderCV import, and forms for every other kind of content. Every publish is one commit to your repository; Vercel redeploys and the change is live in about a minute. Public pages stay static, and GitHub Pages and Netlify keep using Sveltia.

1. **Import the repository in Vercel** (New Project → your repository). No build settings are needed.
2. **Create a GitHub OAuth App** (GitHub → Settings → Developer settings → OAuth Apps → New OAuth App).
   - Homepage URL: `https://<your-domain>`
   - Authorization callback URL: `https://<your-domain>/api/admin/auth/callback`
   - Keep the client ID, and generate a client secret.
3. **Create a fine-grained personal access token** (GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens).
   - Repository access: only this repository.
   - Permissions: **Contents: Read and write**, and **Actions: Read and write** (needed for "Generate PDF").
4. **Set the environment variables** in Vercel (Project → Settings → Environment Variables):

   | Variable               | Value                                                                      |
   | ---------------------- | -------------------------------------------------------------------------- |
   | `GITHUB_CLIENT_ID`     | OAuth App client ID                                                        |
   | `GITHUB_CLIENT_SECRET` | OAuth App client secret                                                    |
   | `GITHUB_TOKEN`         | the fine-grained token                                                     |
   | `SESSION_SECRET`       | at least 32 random characters (`openssl rand -base64 48`)                  |
   | `GITHUB_REPO`          | optional: `owner/name` (defaults to the repository Vercel deploys)         |
   | `GITHUB_BRANCH`        | optional: the branch to commit to (defaults to the deployed branch, then `main`) |

5. **Add your GitHub username to `adminUsers`** in `config/site.yml`, commit, and let Vercel redeploy.

Sign in at `https://<your-domain>/<adminPath>`. Only `adminUsers` can sign in, and the token never leaves the server. `.env.example` lists the same variables.

To try the admin locally without GitHub, run `VERCEL=1 ADMIN_STORE=memory SESSION_SECRET=<32+ characters> pnpm dev` and open `http://localhost:4321/api/admin/auth/dev`. Edits stay in memory and are never written to disk.
````

In the README's Table of Contents, add `  - [Deploy on Vercel (custom admin)](#deploy-on-vercel-custom-admin)` right after the CMS Admin Panel entry, if the ToC lists subsections.

- [ ] **Step 3: Format, lint and type-check**

```bash
pnpm lint:fix
pnpm check
pnpm lint
```

Expected: `pnpm check` reports 0 errors and `pnpm lint` passes. If `astro check` flags the new TypeScript, fix the types in place. Don't add `@ts-ignore` and don't loosen `tsconfig.json`. If `lint:fix` rewrote files, look at the diff before committing.

- [ ] **Step 4: Run every check**

```bash
pnpm test
python3 scripts/test_render_cv.py
pnpm check:themes
rm -rf .vercel dist && pnpm build && test -f dist/admin/index.html && test ! -e .vercel/output && echo STATIC_OK
VERCEL=1 SESSION_SECRET=build-only-secret-build-only-secret pnpm build && test -d .vercel/output/functions && echo VERCEL_OK
pnpm test:e2e
```

Expected: unit tests PASS, `render-cv self-check passed`, the theme checks pass, `STATIC_OK`, `VERCEL_OK`, and 9 e2e tests pass.

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md
git add -u
git status --short   # HANDOFF.md and personal-site-handoff/ must still be untracked
git commit -m "docs: deploy the custom admin on Vercel; lint and type fixes"
```

- [ ] **Step 6: Manual check on a Vercel preview** (a throwaway fork; do not use the real site). This is the spec's manual test, and it needs real GitHub credentials, so a human runs it. Record the result in the PR description.
  1. Fork the repo, import the fork in Vercel, and do steps 2–5 of the README section with the preview domain.
  2. Sign in with an account listed in `adminUsers` and land on the Dashboard. A second GitHub account that is not listed gets the "not on the admin list" message and HTTP 403.
  3. Make one commit from each screen, and check that each shows up in the fork's history authored by `<login>@users.noreply.github.com`:
     - Dashboard: Hide an imported post.
     - Posts: create a post with an equation and an image.
     - CV: edit an entry, then import the fixture and Publish.
     - Publications: edit a field.
     - News, People, Projects, Talks, Positions: one edit each.
     - Pages: home and research.
     - Media: upload an image.
     - Settings: one change.
  4. After the redeploy, the change is live, and `/admin` responses carry `Cache-Control: no-store` and `X-Robots-Tag: noindex` (`curl -sI https://<preview>/admin/login`).
  5. Generate PDF starts a `render-cv.yml` run, and its status appears next to the button.
  6. Revoke the token's Actions permission. The banner names the missing permission and saves still work.
  7. Deploy the same fork on Netlify or GitHub Pages: `/admin` is Sveltia and there are no functions.
