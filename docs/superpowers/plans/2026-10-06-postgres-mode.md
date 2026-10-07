# Postgres Mode on Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a ScholarOS site on Vercel has `DATABASE_URL`, content lives in Postgres (same path → text documents as the repo), images in Vercel Blob, public pages render per request and are cached on Vercel's CDN with tag-precise purges on publish; static and git modes stay byte-for-byte the same.

**Architecture:** A build-time mode (`static | git | postgres`) is baked into the bundle. In postgres mode every public route is a function; `src/middleware.ts` opens an `AsyncLocalStorage` request context holding `config/*.yml` + `src/data/*.json` snapshots, renders the whole page inside it (buffering the stream), and tags the response with every document it read. A new `PostgresStore` implements sub-project 2's `ContentStore` (documents + revisions + media rows, purge by tag after commit). Pages switch from `astro:content`/`fs`/`getImage` to a thin data layer (`src/lib/content/`) that delegates to Astro in static/git mode and to the database in postgres mode.

**Tech Stack:** Astro 5.17, `@astrojs/vercel` 8.2, `postgres` (postgres.js) 3.4, `@vercel/blob` 2.x, `@vercel/functions` 3.x (`dangerouslyDeleteByTag`), `@electric-sql/pglite` (dev, in-process Postgres for tests), `node:test` via `tsx --test`, Vue 3 admin.

**Spec:** `docs/superpowers/specs/2026-10-06-postgres-mode-design.md` (sub-project 3 of 4). Also read `docs/superpowers/specs/2026-10-06-admin-git-mode-design.md` for `ContentStore`, the path allowlist and the admin API conventions.

## Global Constraints

- Mode: `postgres` when `VERCEL` and `DATABASE_URL` are set at build; `git` when only `VERCEL`; else `static`. `DATABASE_URL` without `VERCEL` fails the build with an explanatory error.
- The build never connects to the database.
- Static and git modes behave exactly as before: the static build output must be identical to a snapshot taken before Task 1 (`diff -r` clean), and existing tests keep passing unchanged.
- Driver `postgres` (postgres.js), no ORM; pool `max: 5`, `idle_timeout: 20`, `prepare: false`.
- Tables exactly as spec §2 (`documents`, `revisions`, `media`, `schema_migrations`); `revisions.content` null = a delete. Keep the newest 50 revisions per path.
- Cache headers on public 200 GETs in postgres mode: `Vercel-CDN-Cache-Control: public, max-age=31536000`, `Cache-Control: public, max-age=0, must-revalidate`, `Vercel-Cache-Tag: <tags>`; 404/5xx: `Cache-Control: no-store`.
- Tags: `cfg:<file>`, `col:<name>`, `doc:<name>/<id>`; each ≤ 256 bytes, no commas; every response also carries `all`; more than 128 distinct tags → the single tag `all`.
- Purge with `dangerouslyDeleteByTag` from `@vercel/functions`; purge failure never fails a save: API returns 200 with `warning: 'cache-purge-failed'` (+ `tags`), admin offers "Retry refresh" (`POST /api/admin/cache/purge`).
- Upload validation (magic bytes, SVG rules, 4 MB) stays in the API layer, before either store.
- DB unreachable: public uncached request → minimal 503 page, `Cache-Control: no-store`, `Retry-After: 30`; admin → 503 JSON + persistent banner. Blob failure → 502 with reason. Conflict → 409 (same dialog as git mode).
- Cron route requires `Authorization: Bearer ${CRON_SECRET}`; schedule `0 3 * * *`; branch `content-backup`; no `GITHUB_TOKEN` → `{ skipped: 'no token' }`.
- Env vars: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET` (added to `.env.example`).
- Out of scope (sub-project 4): PDF CV generation in postgres mode, Medium cron, "Also publish to Medium".
- Style: match the surrounding code — short doc comments on exported functions, `ponytail:` comments for deliberate ceilings, no new abstractions beyond what a task names.

## Decisions (where this plan narrows or adapts the spec)

1. **Markdown pipeline:** spec §4 lists the unified plugins Astro uses. `@astrojs/markdown-remark`'s `createMarkdownProcessor` *is* that pipeline (remark-gfm, smartypants, heading ids, shiki) and is already used in `src/lib/markdown.ts`, so postgres mode renders with it, fed the exact options object `astro.config.mjs` now imports (`markdownOptions`). Parity is by construction and still tested against the build. It also returns headings, which `news/[id]` and the classic post page need for their table of contents.
2. **Media interface:** spec's `putMedia(name, bytes, contentType)/deleteMedia(path)/listMedia()` keeps the repo's existing folder (`content` | `site`) and delete-version semantics: `listMedia(folder)`, `putMedia(folder, filename, base64, contentType)`, `deleteMedia(path, version)`. Filenames stay `prepareUpload`'s `<slug>-<6 hex>.<ext>`. Git stores share one implementation (`git-media.ts`).
3. **Mode is baked** (`__SCHOLAROS_MODE__` Vite define, like `__SCHOLAROS_ADMIN__`), so adding `DATABASE_URL` without a redeploy can't make functions disagree with how pages were built.
4. **Buffered render:** in postgres mode the middleware reads the whole response body inside the request context. Child components (header search index, `PersonCard`) read content while the body streams; without buffering those reads would run outside the context and their tags would be missing from the header.
5. **Generated `[id]` / tag / category routes** resolve per request by running the page's own `getStaticPaths` and picking the entry matching the URL (`staticProps`), so draft filtering and props stay exactly as in static mode; no match → 404.
6. **Tag mapping is one function** (`tagsForPath`) used for both reads and purges. Beyond the spec's table: other `src/data/<x>.json` → `data:<x>`; images → none; anything unknown → `all`.
7. **Request context** loads `config/*` and `src/data/*` documents in one query (spec: config + `cv.json`). Seed also copies `src/data/cv.json`, `src/data/cv-people.json` and collection `.mdx` files (read-only; MDX shows the spec's notice), and lists every repo content file it could not copy.
8. **`--force` seeding upserts** (version + 1, revision recorded) instead of wiping, so history survives a re-seed.
9. **Admin mode on the client** comes from `AdminCtx.mode` (server-rendered), not an extra request.
10. **History preview** shows the revision's source text (YAML/Markdown) read-only.

**Known limit (not addressed here, flag to the user):** `adminUsers` is baked at build (sub-project 2). In postgres mode there is no rebuild on save, so editing `adminUsers` in `site.yml` takes effect only after a redeploy.

## Review Focus

1. **Content read in a child component while the page streams** (header search index, `PersonCard`'s image shape): must not throw "outside a request", and its cache tags must be in `Vercel-Cache-Tag`. → Task 7, test "a read while the body streams is inside the context and tagged".
2. **A warm function serving the next request after `site.yml` changes**: the new value must show, not a module-level cache. → Task 7, test "a warm function sees the next site.yml".
3. **URL of an unknown, draft or deleted entry** in postgres mode: 404 page with status 404, not a 500. → Task 8, test "staticProps: unknown id → null, known → its props"; Task 9 manual curl.
4. **Seeding a repo with MDX entries, nonconforming filenames or relative image paths**: nothing silently lost — MDX copied, non-allowlisted files reported, relative references rewritten. → Task 11, tests "seedFiles copies MDX and reports what it can't copy" and "relative front-matter paths are rewritten".
5. **The cron URL called without the secret, with a wrong one, or on a git-mode deployment** (vercel.json applies to every deployment): 401 / skipped, never a backup. → Task 12, test "cron: 401 without or with a wrong secret; git mode skips".

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/mode.ts` (new) | `modeFromEnv`, `getMode` (baked) |
| `src/integrations/admin.ts` | bake mode; postgres: all routes on demand, inject sitemap route |
| `astro.config.mjs` | adapter image service + Blob remote pattern + no `sitemap()` in postgres; `markdown: markdownOptions` |
| `src/lib/db.ts` (new) | `Sql` interface, lazy pool `getSql`, `setSqlForTests`, `isUnreachable` |
| `src/lib/db-migrate.ts` (new), `migrations/001_init.sql` (new), `scripts/db-migrate.ts` (new) | migrations |
| `src/lib/pglite-sql.ts` (new) | test adapter: PGlite behind `Sql` |
| `src/lib/cache-tags.ts` (new) | `tagsForPath`, `tagsForPaths`, `cacheTagHeader`, `isValidTag` |
| `src/lib/admin/postgres-store.ts` (new) | `PostgresStore` |
| `src/lib/admin/git-media.ts` (new) | repo-file media for GitHub/memory stores |
| `src/lib/admin/store.ts`, `github-store.ts`, `memory-store.ts`, `media.ts`, `paths.ts`, `http.ts`, `get-store.ts` | interface amendment, store selection, helpers |
| `src/admin/routes/api/media.ts`, `dashboard.ts` | use store media methods; mode + backup |
| `src/admin/routes/api/history.ts`, `history/[id].ts`, `history/[id]/restore.ts`, `cache/purge.ts`, `cron/backup.ts` (new) | admin API |
| `src/lib/content/context.ts` (new) | request context, `readSiteFile`, `memo`, `loadSiteFiles` |
| `src/lib/config.ts`, `src/lib/cv.ts` | read through `readSiteFile`; per-request config cache in postgres |
| `src/middleware.ts` | postgres public branch: context, buffer, cache headers, 503; cron bypass |
| `src/lib/content/documents.ts` (new) | DB documents → entries (pure) |
| `src/lib/content/index.ts` (new) | `getEntries`, `getEntry`, `staticProps`, `entryHeadings`, `renderEntryHtml` |
| `src/lib/content/image.ts` (new), `src/components/astro/EntryBody.astro` (new), `src/lib/content/sitemap.ts` (new) | images, entry bodies, postgres sitemap |
| `src/lib/markdown.ts` | `markdownOptions`, `renderMarkdownDocument` |
| ≈25 pages/themes/lib files | mechanical swap (Task 9) |
| `src/admin/*.vue`, `api.ts`, `types.ts`, `[...path].astro` | Published toast, retry, outage banner, History, badge, PDF note |
| `src/lib/db-seed.ts` (new), `scripts/db-setup.ts`, `scripts/db-export.ts` (new) | seed/export |
| `src/lib/admin/backup.ts` (new), `vercel.json` (new) | backup cron |
| `README.md`, `.env.example`, `.github/workflows/lint.yml`, `package.json` | docs, CI, scripts |

---

### Task 1: Mode selection and build wiring

**Files:**
- Create: `src/lib/mode.ts`, `src/lib/mode.test.ts`
- Modify: `src/integrations/admin.ts`, `src/integrations/admin.test.ts`, `astro.config.mjs`, `.github/workflows/lint.yml`

**Interfaces:**
- Produces: `type Mode = 'static' | 'git' | 'postgres'`; `modeFromEnv(env: Record<string, string | undefined>): Mode`; `getMode(): Mode`. Vite define `__SCHOLAROS_MODE__` (JSON string) on Vercel builds.

- [ ] **Step 1: Snapshot the static build (the "unchanged" gate for the whole plan)**

```bash
pnpm install --frozen-lockfile
pnpm astro build --outDir node_modules/.cache/dist-pre-postgres
```
Expected: build succeeds. This directory is git-ignored (under `node_modules`). Task 9 and Task 13 diff against it.

- [ ] **Step 2: Write the failing test**

`src/lib/mode.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { modeFromEnv } from './mode';

test('static without VERCEL, git on Vercel, postgres on Vercel with DATABASE_URL', () => {
  assert.equal(modeFromEnv({}), 'static');
  assert.equal(modeFromEnv({ VERCEL: '1' }), 'git');
  assert.equal(modeFromEnv({ VERCEL: '1', DATABASE_URL: 'postgres://x' }), 'postgres');
});

test('DATABASE_URL without VERCEL fails with an explanation', () => {
  assert.throws(() => modeFromEnv({ DATABASE_URL: 'postgres://x' }), /Postgres mode only runs on Vercel/);
});
```

Append to `src/integrations/admin.test.ts`:
```ts
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function setupHook(define: Record<string, string>, injected: { pattern: string }[]) {
  const setup = admin().hooks['astro:config:setup'] as (options: unknown) => void;
  setup({
    command: 'build',
    config: { root: pathToFileURL(`${process.cwd()}/`) },
    injectRoute: (r: { pattern: string }) => injected.push(r),
    logger: { warn: () => {} },
    updateConfig: (c: { vite: { define: Record<string, string> } }) => Object.assign(define, c.vite.define),
  });
}

test('postgres mode: every route renders on demand, the mode is baked in, the sitemap is served', () => {
  withEnv({ VERCEL: '1', DATABASE_URL: 'postgres://ci@localhost:1/ci' }, () => {
    const define: Record<string, string> = {};
    const injected: { pattern: string }[] = [];
    setupHook(define, injected);
    assert.equal(define.__SCHOLAROS_MODE__, '"postgres"');
    const route = { component: 'src/pages/index.astro', prerender: undefined as boolean | undefined };
    (admin().hooks['astro:route:setup'] as (o: unknown) => void)({ route, logger: {} });
    assert.equal(route.prerender, false);
  });
});

test('git mode: public routes stay prerendered', () => {
  withEnv({ VERCEL: '1', DATABASE_URL: undefined }, () => {
    const define: Record<string, string> = {};
    setupHook(define, []);
    assert.equal(define.__SCHOLAROS_MODE__, '"git"');
    const route = { component: 'src/pages/index.astro', prerender: undefined as boolean | undefined };
    (admin().hooks['astro:route:setup'] as (o: unknown) => void)({ route, logger: {} });
    assert.equal(route.prerender, undefined);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/lib/mode.test.ts src/integrations/admin.test.ts`
Expected: FAIL — `Cannot find module './mode'`.

- [ ] **Step 4: Implement**

`src/lib/mode.ts`:
```ts
export type Mode = 'static' | 'git' | 'postgres';

/** Replaced at build time by src/integrations/admin.ts (Vite define): functions keep the mode the build chose. */
declare const __SCHOLAROS_MODE__: Mode | undefined;

/** Where content lives: Postgres on Vercel with DATABASE_URL, git on Vercel, otherwise a static build. */
export function modeFromEnv(env: Record<string, string | undefined>): Mode {
  if (env.DATABASE_URL && !env.VERCEL) {
    throw new Error(
      'DATABASE_URL is set but VERCEL is not: Postgres mode only runs on Vercel. ' +
        'Unset DATABASE_URL for a static build, or build on Vercel (or with `vercel build`).',
    );
  }
  if (env.VERCEL) return env.DATABASE_URL ? 'postgres' : 'git';
  return 'static';
}

export function getMode(): Mode {
  return typeof __SCHOLAROS_MODE__ !== 'undefined' ? __SCHOLAROS_MODE__ : modeFromEnv(process.env);
}
```

`src/integrations/admin.ts` — add the import and replace the hooks object:
```ts
import { modeFromEnv } from '../lib/mode';
```
```ts
    hooks: {
      'astro:config:setup': ({ command, config, injectRoute, logger, updateConfig }) => {
        const root = fileURLToPath(config.root);
        const entry = (file: string) => path.join(root, file);
        const mode = modeFromEnv(process.env);
        if (mode === 'static') {
          injectRoute({ pattern: '/[...cms]', entrypoint: entry('src/admin/sveltia/[...cms].astro') });
          injectRoute({ pattern: '/[...cmsConfig]', entrypoint: entry('src/admin/sveltia/[...cmsConfig].ts') });
          return;
        }
        const settings = loadAdminSettings(root);
        if (!process.env.SESSION_SECRET) logger.warn('SESSION_SECRET is not set: the admin will refuse every request.');
        updateConfig({
          vite: {
            define: { __SCHOLAROS_ADMIN__: JSON.stringify(settings), __SCHOLAROS_MODE__: JSON.stringify(mode) },
          },
        });
        injectRoute({
          pattern: `/${settings.adminPath}/[...path]`,
          entrypoint: entry('src/admin/routes/[...path].astro'),
          prerender: false,
        });
        for (const file of apiRouteFiles(root)) {
          if (file === 'auth/dev.ts' && command !== 'dev') continue;
          injectRoute({
            pattern: `/api/admin/${file.replace(/\.ts$/, '')}`,
            entrypoint: entry(`${API_DIR}/${file}`),
            prerender: false,
          });
        }
      },
      'astro:route:setup': ({ route }) => {
        // Postgres mode: every page renders per request from the database and is cached on Vercel's CDN.
        if (modeFromEnv(process.env) === 'postgres') route.prerender = false;
      },
    },
```
Also update the doc comment above `admin()` to: `On Vercel: injects the custom admin's on-demand pages and API routes (settings and mode baked in); in Postgres mode every public route renders on demand too. Static builds get the Sveltia admin and no functions.`

`astro.config.mjs` — replace the top through `integrations` (keep the rest):
```js
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import remarkMath from 'remark-math';
import { rehypeExternalLinks } from './src/lib/rehype-external-links';
import { rehypeMathJaxPassthrough } from './src/lib/rehype-mathjax-passthrough';
import admin from './src/integrations/admin';
import { modeFromEnv } from './src/lib/mode';

const mode = modeFromEnv(process.env);

export default defineConfig({
  site: 'https://example.com',
  // Vercel only. Git mode: admin routes are functions, public pages prerendered. Postgres mode: every page is a
  // function, and Blob images are optimized by /_vercel/image.
  adapter: mode === 'static' ? undefined : mode === 'postgres' ? vercel({ imageService: true }) : vercel(),
  ...(mode === 'postgres'
    ? { image: { remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }] } }
    : {}),
  // @astrojs/sitemap only sees prerendered pages; Postgres mode serves its own /sitemap-index.xml.
  integrations: [vue({ appEntrypoint: '/src/pages/_app.ts' }), mdx(), ...(mode === 'postgres' ? [] : [sitemap()]), admin()],
```
(`markdown:` stays as is here; Task 8 swaps it for `markdownOptions`.)

`.github/workflows/lint.yml` — insert after the "Vercel build" step:
```yaml
      - name: Postgres-mode build (public pages are functions; the build never connects)
        env:
          VERCEL: '1'
          DATABASE_URL: postgres://ci@localhost:1/ci
          SESSION_SECRET: ci-build-only-not-a-real-secret-0000
        run: |
          rm -rf .vercel/output
          pnpm build
          test -d .vercel/output/functions
          test ! -e .vercel/output/static/index.html
          test ! -e .vercel/output/static/blog/index.html
```

- [ ] **Step 5: Run tests and builds**

Run: `pnpm exec tsx --test src/lib/mode.test.ts src/integrations/admin.test.ts` → PASS.
Run: `rm -rf .vercel/output && VERCEL=1 DATABASE_URL=postgres://ci@localhost:1/ci SESSION_SECRET=ci-build-only-not-a-real-secret-0000 pnpm build && test ! -e .vercel/output/static/index.html && echo OK` → `OK` (pages compile; `getStaticPaths` warnings are expected).
Run: `pnpm build && diff -r node_modules/.cache/dist-pre-postgres dist && echo SAME` → `SAME`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mode.ts src/lib/mode.test.ts src/integrations/admin.ts src/integrations/admin.test.ts astro.config.mjs .github/workflows/lint.yml
git commit -m "feat(postgres): build-time mode selection; public routes on demand in postgres mode"
```

---

### Task 2: Database foundation (driver, migrations, test adapter)

**Files:**
- Create: `src/lib/db.ts`, `src/lib/db-migrate.ts`, `src/lib/pglite-sql.ts`, `src/lib/db.test.ts`, `migrations/001_init.sql`, `scripts/db-migrate.ts`
- Modify: `package.json` (deps, `db:migrate` script)

**Interfaces:**
- Produces:
  - `interface Sql { <T = any>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>; begin<T>(fn: (tx: Sql) => Promise<T>): Promise<T>; unsafe(query: string): Promise<unknown> }`
  - `getSql(): Sql`, `setSqlForTests(sql: Sql | null): void`, `isUnreachable(e: unknown): boolean`
  - `migrate(sql: Sql, dir?: string): Promise<string[]>` (names applied)
  - `pgliteSql(db?: PGlite | Transaction): Sql`

- [ ] **Step 1: Add dependencies**

```bash
pnpm add postgres @vercel/blob @vercel/functions
pnpm add -D @electric-sql/pglite
```

- [ ] **Step 2: Write the failing test**

`src/lib/db.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnreachable } from './db';
import { migrate } from './db-migrate';
import { pgliteSql } from './pglite-sql';

test('migrate creates the tables once; a second run applies nothing', async () => {
  const sql = pgliteSql();
  assert.deepEqual(await migrate(sql), ['001_init.sql']);
  assert.deepEqual(await migrate(sql), []);
  await sql`insert into documents (path, content) values ('config/site.yml', 'title: A')`;
  const [row] = await sql<{ version: number; updated_by: string | null }>`select version, updated_by from documents`;
  assert.equal(row.version, 1);
  assert.equal(row.updated_by, null);
  const tables = await sql<{ name: string }>`select table_name as name from information_schema.tables where table_schema = 'public' order by 1`;
  assert.deepEqual(tables.map((t) => t.name), ['documents', 'media', 'revisions', 'schema_migrations']);
});

test('begin rolls everything back when the callback throws', async () => {
  const sql = pgliteSql();
  await migrate(sql);
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx`insert into documents (path, content) values ('a', 'x')`;
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.equal((await sql`select * from documents`).length, 0);
});

test('isUnreachable: connection errors yes, query errors no', () => {
  assert.equal(isUnreachable(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), true);
  assert.equal(isUnreachable(Object.assign(new Error('x'), { code: 'CONNECT_TIMEOUT' })), true);
  assert.equal(isUnreachable(Object.assign(new Error('x'), { code: '42P01' })), false);
  assert.equal(isUnreachable('nope'), false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec tsx --test src/lib/db.test.ts`
Expected: FAIL — `Cannot find module './db'`.

- [ ] **Step 4: Implement**

`migrations/001_init.sql`:
```sql
create table if not exists documents (
  path text primary key,
  content text not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);
create table if not exists revisions (
  id bigserial primary key,
  path text not null,
  content text,
  version int not null,
  created_at timestamptz not null default now(),
  author text
);
create index if not exists revisions_path_idx on revisions (path, id desc);
create table if not exists media (
  url text primary key,
  pathname text not null,
  size int not null,
  content_type text not null,
  created_at timestamptz not null default now()
);
```

`src/lib/db.ts`:
```ts
import postgres from 'postgres';

/** The slice of postgres.js the app uses: tagged-template queries, transactions, raw multi-statement SQL. */
export interface Sql {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are typed per query
  <T = any>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  begin<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  unsafe(query: string): Promise<unknown>;
}

let pool: Sql | null = null;
let testSql: Sql | null = null;

/** Tests swap the connection; production code never calls this. */
export function setSqlForTests(sql: Sql | null): void {
  testSql = sql;
}

/** One small pool per function instance, created on first use (the build never connects). */
export function getSql(): Sql {
  if (testSql) return testSql;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  // prepare: false — poolers in transaction mode (Neon, PgBouncer) can't keep prepared statements.
  return (pool ??= postgres(process.env.DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    prepare: false,
  }) as unknown as Sql);
}

const UNREACHABLE = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNRESET',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  '57P01', // admin shutdown
  '57P03', // cannot connect now
  '53300', // too many connections
]);

/** True for "the database can't be reached right now", as opposed to a bad query. */
export function isUnreachable(e: unknown): boolean {
  return typeof e === 'object' && e !== null && UNREACHABLE.has(String((e as { code?: unknown }).code));
}
```

`src/lib/db-migrate.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Sql } from './db';

/** Applies every `<dir>/*.sql` not yet in schema_migrations, in name order, each in one transaction. */
export async function migrate(sql: Sql, dir = path.resolve('migrations')): Promise<string[]> {
  await sql.unsafe(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const done = new Set((await sql<{ name: string }>`select name from schema_migrations`).map((r) => r.name));
  const applied: string[] = [];
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    applied.push(name);
  }
  return applied;
}
```

`src/lib/pglite-sql.ts`:
```ts
import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { Sql } from './db';

/** Tests: an in-process Postgres behind the postgres.js surface the app uses (see Sql). */
export function pgliteSql(db: PGlite | Transaction = new PGlite()): Sql {
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((out, s, i) => `${out}$${i}${s}`);
    return (await db.query(text, values)).rows;
  }) as Sql;
  // A nested begin (inside a transaction) just runs in the outer one, like a savepoint-free postgres.js tx.
  sql.begin = (fn) => ('transaction' in db ? db.transaction((tx) => fn(pgliteSql(tx))) : fn(sql));
  sql.unsafe = (query) => db.exec(query);
  return sql;
}
```

`scripts/db-migrate.ts`:
```ts
#!/usr/bin/env tsx
/** pnpm db:migrate — applies migrations/*.sql to DATABASE_URL (reads .env.local from `vercel env pull`). */
import path from 'node:path';
import postgres from 'postgres';
import type { Sql } from '../src/lib/db';
import { migrate } from '../src/lib/db-migrate';

try {
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local: use the shell's environment
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (run `vercel env pull` first).');
  process.exit(1);
}
const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const applied = await migrate(client as unknown as Sql, path.resolve(import.meta.dirname, '..', 'migrations'));
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Up to date');
} finally {
  await client.end();
}
```

`package.json` scripts — add after `"migrate:al-folio"`:
```json
    "db:migrate": "tsx scripts/db-migrate.ts",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec tsx --test src/lib/db.test.ts` → PASS. Then `pnpm test` → all PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml migrations/001_init.sql src/lib/db.ts src/lib/db-migrate.ts src/lib/pglite-sql.ts src/lib/db.test.ts scripts/db-migrate.ts
git commit -m "feat(postgres): postgres.js pool, migrations, PGlite test adapter"
```

---

### Task 3: Cache tags

**Files:**
- Create: `src/lib/cache-tags.ts`, `src/lib/cache-tags.test.ts`

**Interfaces:**
- Produces: `ALL = 'all'`; `tagsForPath(path: string): string[]`; `tagsForPaths(paths: string[]): string[]`; `cacheTagHeader(tags: Iterable<string>): string`; `isValidTag(tag: string): boolean`.

- [ ] **Step 1: Write the failing test**

`src/lib/cache-tags.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL, cacheTagHeader, isValidTag, tagsForPath, tagsForPaths } from './cache-tags';

test('tagsForPath: config, entries, feeds, data files, images, unknown', () => {
  assert.deepEqual(tagsForPath('config/site.yml'), ['cfg:site']);
  assert.deepEqual(tagsForPath('config/cv-upload.yml'), ['cfg:cv-upload']);
  assert.deepEqual(tagsForPath('src/content/posts/hello.md'), ['col:posts', 'doc:posts/hello']);
  assert.deepEqual(tagsForPath('src/content/posts/legacy.mdx'), ['col:posts', 'doc:posts/legacy']);
  assert.deepEqual(tagsForPath('src/data/feeds.json'), ['col:feeds']);
  assert.deepEqual(tagsForPath('src/data/cv.json'), ['data:cv']);
  assert.deepEqual(tagsForPath('https://abc.public.blob.vercel-storage.com/fig-123456.png'), []);
  assert.deepEqual(tagsForPath('src/assets/images/x.png'), []);
  assert.deepEqual(tagsForPath('README.md'), [ALL]);
});

test('tagsForPaths: distinct', () => {
  assert.deepEqual(tagsForPaths(['src/content/posts/a.md', 'src/content/posts/b.md']), [
    'col:posts',
    'doc:posts/a',
    'doc:posts/b',
  ]);
});

test('cacheTagHeader: adds all; 128+ tags or an invalid tag → all', () => {
  assert.equal(cacheTagHeader(['cfg:site', 'col:posts', 'cfg:site']), 'cfg:site,col:posts,all');
  assert.equal(cacheTagHeader([]), 'all');
  const many = Array.from({ length: 127 }, (_, i) => `doc:posts/p${i}`);
  assert.equal(cacheTagHeader(many).split(',').length, 128);
  assert.equal(cacheTagHeader([...many, 'doc:posts/one-more']), 'all');
  assert.equal(cacheTagHeader(['a,b']), 'all');
  assert.equal(cacheTagHeader(['x'.repeat(257)]), 'all');
});

test('isValidTag', () => {
  assert.equal(isValidTag('doc:posts/a'), true);
  assert.equal(isValidTag('a,b'), false);
  assert.equal(isValidTag(''), false);
  assert.equal(isValidTag('x'.repeat(257)), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/lib/cache-tags.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/cache-tags.ts`:
```ts
/** Every cached response carries it; purging it empties the whole cache. */
export const ALL = 'all';
/** Vercel keeps at most 128 tags per response. */
const MAX_TAGS = 128;

/**
 * The cache tags a stored file feeds: config/x.yml → cfg:x; src/content/<name>/<id>.md(x) → col:<name>, doc:<name>/<id>;
 * src/data/feeds.json → col:feeds; other src/data/<x>.json → data:<x>; images → none; anything else → all.
 * Reads (request context, data layer) and purges (PostgresStore) both use this, so they always agree.
 */
export function tagsForPath(path: string): string[] {
  let m: RegExpExecArray | null;
  if ((m = /^config\/([^/]+)\.yml$/.exec(path))) return [`cfg:${m[1]}`];
  if ((m = /^src\/content\/([^/]+)\/([^/]+)\.mdx?$/.exec(path))) return [`col:${m[1]}`, `doc:${m[1]}/${m[2]}`];
  if (path === 'src/data/feeds.json') return ['col:feeds'];
  if ((m = /^src\/data\/([^/]+)\.json$/.exec(path))) return [`data:${m[1]}`];
  if (/^https:\/\//.test(path) || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(path)) return [];
  return [ALL];
}

export function tagsForPaths(paths: string[]): string[] {
  return [...new Set(paths.flatMap(tagsForPath))];
}

export const isValidTag = (tag: string) => tag.length > 0 && Buffer.byteLength(tag) <= 256 && !tag.includes(',');

/** The Vercel-Cache-Tag value for a response: its tags plus `all`; too many or an invalid tag → just `all`. */
export function cacheTagHeader(tags: Iterable<string>): string {
  const list = [...new Set([...tags].filter((t) => t !== ALL))];
  if (list.length + 1 > MAX_TAGS || !list.every(isValidTag)) return ALL;
  return [...list, ALL].join(',');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test src/lib/cache-tags.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache-tags.ts src/lib/cache-tags.test.ts
git commit -m "feat(postgres): cache tags shared by reads and purges"
```

---

### Task 4: PostgresStore (documents, history, purge)

**Files:**
- Create: `src/lib/admin/postgres-store.ts`, `src/lib/admin/postgres-store.test.ts`
- Modify: `src/lib/admin/store.ts` (`CommitResult`), `src/admin/types.ts` (`CommitResult`)

**Interfaces:**
- Consumes: `Sql`, `isUnreachable` (Task 2); `tagsForPaths` (Task 3); `ContentStore`, `ConflictError`, `UpstreamError` (`store.ts`).
- Produces:
  - `CommitResult` gains `warning?: 'cache-purge-failed'; tags?: string[]` (both `store.ts` and `src/admin/types.ts`).
  - `class PostgresStore implements ContentStore` — `constructor(sql: Sql, author?: Author, deps?: PostgresDeps)`; `read`, `list`, `commit`, `lastModified`; `history(path): Promise<Revision[]>`; `revision(id: string): Promise<{ path: string; content: string | null } | null>`; `purgeTags(tags: string[]): Promise<void>` (throws `UpstreamError` 502).
  - `interface PostgresDeps { purge(tags: string[]): Promise<void> }` (Task 5 adds `put`, `del`).
  - `interface Revision { id: string; version: number; created_at: string; author: string | null; deleted: boolean }`.

- [ ] **Step 1: Write the failing test**

`src/lib/admin/postgres-store.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Sql } from '../db';
import { migrate } from '../db-migrate';
import { pgliteSql } from '../pglite-sql';
import { PostgresStore, type PostgresDeps } from './postgres-store';
import { ConflictError, UpstreamError } from './store';

const AUTHOR = { name: 'Jane', email: 'jane@users.noreply.github.com' };
const P = 'src/content/posts/a.md';

async function setup(deps: Partial<PostgresDeps> = {}, wrap: (sql: Sql) => Sql = (s) => s) {
  const sql = pgliteSql();
  await migrate(sql);
  const purged: string[][] = [];
  const store = new PostgresStore(wrap(sql), AUTHOR, {
    purge: async (tags) => {
      purged.push(tags);
    },
    ...deps,
  });
  return { sql, store, purged };
}

/** Throws on the nth query whose text contains `needle`, inside or outside transactions. */
function failingOn(needle: string, nth: number) {
  let n = 0;
  const wrap = (inner: Sql): Sql => {
    const s = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join('?').includes(needle) && ++n === nth) throw new Error('boom');
      return inner(strings, ...values);
    }) as Sql;
    s.begin = (fn) => inner.begin((tx) => fn(wrap(tx)));
    s.unsafe = (q) => inner.unsafe(q);
    return s;
  };
  return wrap;
}

test('create → read → update → list → lastModified', async () => {
  const { store } = await setup();
  const created = await store.commit([{ path: P, content: 'one' }], 'Create', {});
  assert.deepEqual(created.versions, { [P]: '1' });
  assert.deepEqual(await store.read(P), { path: P, content: 'one', version: '1' });
  const updated = await store.commit([{ path: P, content: 'two' }], 'Update', { [P]: '1' });
  assert.deepEqual(updated.versions, { [P]: '2' });
  assert.ok(Number(updated.id) > Number(created.id));
  assert.deepEqual(await store.list('src/content/posts'), [{ path: P, version: '2' }]);
  assert.deepEqual(await store.list('src/content/post'), []);
  assert.match((await store.lastModified(P)) ?? '', /^\d{4}-\d\d-\d\dT/);
  assert.equal(await store.read('missing.md'), null);
});

test('a stale version is a 409 and writes nothing, not even the other files of the commit', async () => {
  const { store, sql } = await setup();
  await store.commit([{ path: P, content: 'one' }], 'Create', {});
  await assert.rejects(
    store.commit(
      [
        { path: 'config/site.yml', content: 'title: B' },
        { path: P, content: 'two' },
      ],
      'Update',
      { [P]: '7' },
    ),
    (e) => e instanceof ConflictError && e.path === P,
  );
  assert.equal((await store.read(P))?.content, 'one');
  assert.equal(await store.read('config/site.yml'), null);
  assert.equal((await sql`select * from revisions`).length, 1);
});

test('creating a file that exists conflicts; deleting a missing file conflicts', async () => {
  const { store } = await setup();
  await store.commit([{ path: P, content: 'one' }], 'Create', {});
  await assert.rejects(store.commit([{ path: P, content: 'x' }], 'Create', { [P]: null }), ConflictError);
  await assert.rejects(store.commit([{ path: 'nope.md', content: null }], 'Delete', {}), ConflictError);
});

test('delete records a null revision; history lists newest first with the deleted marker', async () => {
  const { store } = await setup();
  await store.commit([{ path: P, content: 'one' }], 'Create', {});
  const deleted = await store.commit([{ path: P, content: null }], 'Delete', { [P]: '1' });
  assert.deepEqual(deleted.versions, { [P]: null });
  assert.equal(await store.read(P), null);
  const history = await store.history(P);
  assert.deepEqual(
    history.map((h) => [h.version, h.deleted, h.author]),
    [
      [2, true, 'Jane'],
      [1, false, 'Jane'],
    ],
  );
  assert.deepEqual(await store.revision(history[1].id), { path: P, content: 'one' });
  assert.equal(await store.revision('not-a-number'), null);
});

test('keeps the newest 50 revisions per changed path', async () => {
  const { store } = await setup();
  let version: string | null = null;
  for (let i = 1; i <= 55; i++) {
    version = (await store.commit([{ path: P, content: `v${i}` }], 'Save', { [P]: version })).versions[P];
  }
  const history = await store.history(P);
  assert.equal(history.length, 50);
  assert.equal(history.at(-1)?.version, 6);
  assert.equal(history[0].version, 55);
});

test('restore = commit an old revision on top of the current version', async () => {
  const { store } = await setup();
  await store.commit([{ path: P, content: 'one' }], 'Create', {});
  await store.commit([{ path: P, content: 'two' }], 'Update', { [P]: '1' });
  const old = (await store.history(P)).find((h) => h.version === 1)!;
  const rev = (await store.revision(old.id))!;
  const restored = await store.commit([{ path: rev.path, content: rev.content }], 'Restore', { [P]: '2' });
  assert.deepEqual(restored.versions, { [P]: '3' });
  assert.equal((await store.read(P))?.content, 'one');
});

test('a 50-file commit is atomic: a failure mid-way leaves no rows', async () => {
  const { store, sql } = await setup({}, failingOn('insert into documents', 30));
  const changes = Array.from({ length: 50 }, (_, i) => ({ path: `src/content/posts/p${i}.md`, content: `#${i}` }));
  await assert.rejects(store.commit(changes, 'Bulk', {}), /boom/);
  assert.equal((await sql`select * from documents`).length, 0);
  assert.equal((await sql`select * from revisions`).length, 0);
});

test('base64 changes are stored as text', async () => {
  const { store } = await setup();
  await store.commit([{ path: P, content: Buffer.from('héllo').toString('base64'), encoding: 'base64' }], 'C', {});
  assert.equal((await store.read(P))?.content, 'héllo');
});

test('a commit purges the changed paths’ tags; a failed purge is a warning, the save stands', async () => {
  const { store, purged } = await setup();
  const ok = await store.commit([{ path: P, content: 'one' }], 'Create', {});
  assert.deepEqual(purged, [['col:posts', 'doc:posts/a']]);
  assert.equal(ok.warning, undefined);

  const failing = await setup({
    purge: async () => {
      throw new Error('purge down');
    },
  });
  const original = console.error;
  console.error = () => {};
  try {
    const result = await failing.store.commit([{ path: 'config/site.yml', content: 'title: A' }], 'C', {});
    assert.equal(result.warning, 'cache-purge-failed');
    assert.deepEqual(result.tags, ['cfg:site']);
    assert.equal((await failing.store.read('config/site.yml'))?.content, 'title: A');
    await assert.rejects(failing.store.purgeTags(['cfg:site']), (e) => e instanceof UpstreamError && e.status === 502);
  } finally {
    console.error = original;
  }
});

test('an unreachable database is a 503', async () => {
  const down = (async () => {
    throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  }) as unknown as Sql;
  const store = new PostgresStore(down, AUTHOR, { purge: async () => {} });
  await assert.rejects(store.read(P), (e) => e instanceof UpstreamError && e.status === 503);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/lib/admin/postgres-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/admin/store.ts` — extend `CommitResult`:
```ts
export interface CommitResult {
  id: string;
  url?: string;
  /** New version of every file in the commit (null for deletions), in the store's own versioning. */
  versions: Record<string, string | null>;
  /** Postgres mode: the save stands but the CDN cache wasn't purged; `tags` is what to retry. */
  warning?: 'cache-purge-failed';
  tags?: string[];
}
```
`src/admin/types.ts` — same two optional fields on its `CommitResult`.

`src/lib/admin/postgres-store.ts`:
```ts
import { dangerouslyDeleteByTag } from '@vercel/functions';
import { tagsForPaths } from '../cache-tags';
import { isUnreachable, type Sql } from '../db';
import {
  ConflictError,
  UpstreamError,
  type Author,
  type Change,
  type CommitResult,
  type ContentStore,
  type StoredFile,
} from './store';

const KEEP_REVISIONS = 50;

export interface Revision {
  id: string;
  version: number;
  created_at: string;
  author: string | null;
  deleted: boolean;
}

/** What the store calls outside the database; tests pass fakes. */
export interface PostgresDeps {
  purge(tags: string[]): Promise<void>;
}

const defaultDeps: PostgresDeps = {
  purge: (tags) => dangerouslyDeleteByTag(tags),
};

const text = (c: Change) =>
  c.content === null ? null : c.encoding === 'base64' ? Buffer.from(c.content, 'base64').toString('utf8') : c.content;

/** Content in Postgres: `documents` holds the repo's files by path, `revisions` every saved state. */
export class PostgresStore implements ContentStore {
  constructor(
    private sql: Sql,
    private author?: Author,
    private deps: PostgresDeps = defaultDeps,
  ) {}

  /** "Can't reach the database" becomes a 503 the admin shows as a banner; other errors pass through. */
  private async db<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      if (isUnreachable(e)) throw new UpstreamError('The database is unreachable. Try again in a moment.', 503);
      throw e;
    }
  }

  async read(path: string): Promise<StoredFile | null> {
    const [row] = await this.db(
      () => this.sql<{ content: string; version: number }>`select content, version from documents where path = ${path}`,
    );
    return row ? { path, content: row.content, version: String(row.version) } : null;
  }

  async list(dir: string): Promise<{ path: string; version: string }[]> {
    const rows = await this.db(
      () =>
        this.sql<{ path: string; version: number }>`
          select path, version from documents where starts_with(path, ${`${dir}/`}) order by path`,
    );
    return rows.map((r) => ({ path: r.path, version: String(r.version) }));
  }

  async lastModified(path: string): Promise<string | null> {
    const [row] = await this.db(
      () => this.sql<{ updated_at: Date }>`select updated_at from documents where path = ${path}`,
    );
    return row ? new Date(row.updated_at).toISOString() : null;
  }

  /** `message` is a git concept: revisions record author and time instead. */
  async commit(changes: Change[], _message: string, base: Record<string, string | null>): Promise<CommitResult> {
    const paths = changes.map((c) => c.path);
    const author = this.author?.name ?? null;
    const result = await this.db(() =>
      this.sql.begin(async (tx) => {
        const rows = await tx<{ path: string; version: number }>`
          select path, version from documents where path = any(${paths}::text[]) for update`;
        const current = new Map(rows.map((r) => [r.path, r.version]));
        for (const c of changes) {
          const have = current.has(c.path) ? String(current.get(c.path)) : null;
          if (have !== (base[c.path] ?? null) || (c.content === null && have === null)) throw new ConflictError(c.path);
        }
        const versions: Record<string, string | null> = {};
        let id = 0;
        for (const c of changes) {
          const prev = current.get(c.path);
          const version = (prev ?? 0) + 1;
          const content = text(c);
          const [rev] = await tx<{ id: string | number }>`
            insert into revisions (path, content, version, author)
            values (${c.path}, ${content}, ${version}, ${author}) returning id`;
          id = Math.max(id, Number(rev.id));
          if (content === null) {
            await tx`delete from documents where path = ${c.path}`;
          } else if (prev === undefined) {
            // A concurrent create of the same path loses here instead of overwriting the winner.
            const created = await tx`
              insert into documents (path, content, version, updated_by)
              values (${c.path}, ${content}, ${version}, ${author})
              on conflict (path) do nothing returning path`;
            if (created.length === 0) throw new ConflictError(c.path);
          } else {
            await tx`
              update documents set content = ${content}, version = ${version}, updated_at = now(), updated_by = ${author}
              where path = ${c.path}`;
          }
          versions[c.path] = content === null ? null : String(version);
        }
        await tx`
          delete from revisions where id in (
            select id from (
              select id, row_number() over (partition by path order by id desc) as n
              from revisions where path = any(${paths}::text[])
            ) ranked where n > ${KEEP_REVISIONS})`;
        return { id: String(id), versions };
      }),
    );
    return { ...result, ...(await this.purgeAfterCommit(paths)) };
  }

  /** Drops cached pages that read these tags; the next request renders fresh (the editor sees the change at once). */
  async purgeTags(tags: string[]): Promise<void> {
    try {
      await this.deps.purge(tags);
    } catch (e) {
      throw new UpstreamError(`The cache refresh failed: ${(e as Error).message}`, 502);
    }
  }

  /** A failed purge never fails the save: the edit is stored and the admin offers "Retry refresh". */
  private async purgeAfterCommit(paths: string[]): Promise<Pick<CommitResult, 'warning' | 'tags'>> {
    const tags = tagsForPaths(paths);
    if (tags.length === 0) return {};
    try {
      await this.purgeTags(tags);
      return {};
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[postgres-store] cache purge failed', tags, e);
      return { warning: 'cache-purge-failed', tags };
    }
  }

  async history(path: string): Promise<Revision[]> {
    const rows = await this.db(
      () =>
        this.sql<{ id: string | number; version: number; created_at: Date; author: string | null; deleted: boolean }>`
          select id, version, created_at, author, content is null as deleted
          from revisions where path = ${path} order by id desc`,
    );
    return rows.map((r) => ({
      id: String(r.id),
      version: r.version,
      created_at: new Date(r.created_at).toISOString(),
      author: r.author,
      deleted: r.deleted,
    }));
  }

  async revision(id: string): Promise<{ path: string; content: string | null } | null> {
    if (!/^\d{1,18}$/.test(id)) return null;
    const [row] = await this.db(
      () => this.sql<{ path: string; content: string | null }>`select path, content from revisions where id = ${id}::bigint`,
    );
    return row ? { path: row.path, content: row.content } : null;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec tsx --test src/lib/admin/postgres-store.test.ts` → PASS. `pnpm test` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/postgres-store.ts src/lib/admin/postgres-store.test.ts src/lib/admin/store.ts src/admin/types.ts
git commit -m "feat(postgres): PostgresStore with revisions, pruning and tag purges"
```

---

### Task 5: Media on the ContentStore interface (git stores + Vercel Blob)

**Files:**
- Create: `src/lib/admin/git-media.ts`, `src/lib/admin/git-media.test.ts`
- Modify: `src/lib/admin/store.ts`, `src/lib/admin/media.ts`, `src/lib/admin/media.test.ts`, `src/lib/admin/github-store.ts`, `src/lib/admin/memory-store.ts`, `src/lib/admin/postgres-store.ts`, `src/lib/admin/postgres-store.test.ts`, `src/admin/routes/api/media.ts`

**Interfaces:**
- Consumes: `PostgresStore`, `PostgresDeps` (Task 4); `prepareUpload` (`media.ts`).
- Produces:
  - `store.ts`: `type MediaFolder = 'content' | 'site'`; `interface MediaFile { path: string; url: string; version: string }`; `interface UploadResult extends MediaFile { commit: { id: string; url?: string } | null }`; `ContentStore` gains `listMedia(folder)`, `putMedia(folder, filename, base64, contentType)`, `deleteMedia(path, version)`.
  - `git-media.ts`: `mediaFolder(folder)`, `listRepoMedia(store, folder)`, `putRepoMedia(store, folder, filename, base64)`, `deleteRepoMedia(store, path, version)`.
  - `prepareUpload` returns `{ filename, base64, contentType }`.
  - `PostgresDeps` gains `put(pathname: string, body: Buffer, contentType: string): Promise<{ url: string }>` and `del(url: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`src/lib/admin/media.test.ts` — inside the existing `prepareUpload: slug + content hash + sniffed extension` test, add:
```ts
  assert.equal(a.contentType, 'image/png');
```

`src/lib/admin/git-media.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from './memory-store';
import { PathError } from './paths';
import { adminSettings } from './settings';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

test('repo media: upload once, list with URLs, delete with the version', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-media-'));
  const store = new MemoryStore(root);
  const { mediaFolder, publicFolder } = adminSettings();
  const first = await store.putMedia('content', 'fig-abc123.png', PNG, 'image/png');
  assert.equal(first.path, `${mediaFolder}/fig-abc123.png`);
  assert.equal(first.url, `${publicFolder}/fig-abc123.png`);
  assert.ok(first.commit);
  const again = await store.putMedia('content', 'fig-abc123.png', PNG, 'image/png');
  assert.equal(again.commit, null);
  assert.deepEqual(
    (await store.listMedia('content')).map((f) => f.url),
    [`${publicFolder}/fig-abc123.png`],
  );
  const site = await store.putMedia('site', 'hero-abc123.png', PNG, 'image/png');
  assert.equal(site.url, '/images/hero-abc123.png');
  await store.deleteMedia(first.path, first.version);
  assert.deepEqual(await store.listMedia('content'), []);
  await assert.rejects(store.deleteMedia('config/site.yml', 'x'), PathError);
});
```

`src/lib/admin/postgres-store.test.ts` — change the `setup` helper's deps object to:
```ts
  const blobs = new Map<string, Buffer>();
  const store = new PostgresStore(wrap(sql), AUTHOR, {
    purge: async (tags) => {
      purged.push(tags);
    },
    put: async (pathname, body) => {
      blobs.set(pathname, body);
      return { url: `https://store.public.blob.vercel-storage.com/${pathname}` };
    },
    del: async (url) => {
      blobs.delete(url.slice(url.lastIndexOf('/') + 1));
    },
    ...deps,
  });
  return { sql, store, purged, blobs };
```
and append:
```ts
test('media: Blob upload once per content hash, listed by URL, deleted only if this site uploaded it', async () => {
  const { store, blobs, purged } = await setup();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
  const up = await store.putMedia('content', 'fig-abc123.png', png, 'image/png');
  assert.equal(up.url, 'https://store.public.blob.vercel-storage.com/fig-abc123.png');
  assert.equal(up.path, up.url);
  assert.ok(up.commit);
  assert.equal(blobs.size, 1);
  const again = await store.putMedia('site', 'fig-abc123.png', png, 'image/png');
  assert.equal(again.commit, null);
  assert.deepEqual((await store.listMedia('site')).map((f) => f.url), [up.url]);
  await assert.rejects(store.deleteMedia('https://elsewhere.example/x.png', '1'), PathError);
  await store.deleteMedia(up.path, up.version);
  assert.equal(blobs.size, 0);
  assert.deepEqual(await store.listMedia('content'), []);
  assert.deepEqual(purged, []);
});

test('media: a Blob failure is a 502 with the reason', async () => {
  const { store } = await setup({
    put: async () => {
      throw new Error('token expired');
    },
  });
  await assert.rejects(
    store.putMedia('content', 'x-abc123.png', 'iVBO', 'image/png'),
    (e) => e instanceof UpstreamError && e.status === 502 && /token expired/.test(e.message),
  );
});
```
and add `import { PathError } from './paths';` to its imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/lib/admin/media.test.ts src/lib/admin/git-media.test.ts src/lib/admin/postgres-store.test.ts`
Expected: FAIL — `contentType` undefined; `store.putMedia is not a function`.

- [ ] **Step 3: Implement**

`src/lib/admin/media.ts` — add above `prepareUpload` and change its return:
```ts
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};
```
```ts
/** Validates an upload and names it `<slug>-<6 hex of sha256>.<ext>`. Throws MediaError (413 / 415). */
export function prepareUpload(
  name: string,
  bytes: Uint8Array,
): { filename: string; base64: string; contentType: string } {
```
and its last line:
```ts
  return {
    filename: `${base}-${hash}.${ext}`,
    base64: Buffer.from(bytes).toString('base64'),
    contentType: CONTENT_TYPES[ext],
  };
```

`src/lib/admin/store.ts` — add after `CommitResult`:
```ts
/** `content`: collection images (processed by image() in git mode); `site`: plain-URL images (public/). */
export type MediaFolder = 'content' | 'site';

export interface MediaFile {
  path: string;
  url: string;
  version: string;
}

export interface UploadResult extends MediaFile {
  /** null: the same image was already stored (names carry a content hash). */
  commit: { id: string; url?: string } | null;
}
```
and add to `ContentStore`:
```ts
  listMedia(folder: MediaFolder): Promise<MediaFile[]>;
  /** `filename` is already validated and content-addressed by prepareUpload. */
  putMedia(folder: MediaFolder, filename: string, base64: string, contentType: string): Promise<UploadResult>;
  /** `path` and `version` as listMedia/putMedia reported them. */
  deleteMedia(path: string, version: string): Promise<CommitResult>;
```

`src/lib/admin/git-media.ts`:
```ts
import { SITE_MEDIA, assertAllowed, assertMediaPath } from './paths';
import { adminSettings } from './settings';
import type { CommitResult, ContentStore, MediaFile, MediaFolder, UploadResult } from './store';

const IMAGE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

/** The repo folder and URL prefix of a media folder. */
export function mediaFolder(folder: MediaFolder): { dir: string; url: string } {
  return folder === 'content' ? { dir: adminSettings().mediaFolder, url: adminSettings().publicFolder } : SITE_MEDIA;
}

/** Media as files in the repo: the git-backed stores (GitHub, memory) share this. */
export async function listRepoMedia(store: ContentStore, folder: MediaFolder): Promise<MediaFile[]> {
  const { dir, url } = mediaFolder(folder);
  return (await store.list(dir))
    .filter((f) => IMAGE.test(f.path))
    .map((f) => ({ path: f.path, version: f.version, url: url + f.path.slice(dir.length) }));
}

export async function putRepoMedia(
  store: ContentStore,
  folder: MediaFolder,
  filename: string,
  base64: string,
): Promise<UploadResult> {
  const { dir, url: prefix } = mediaFolder(folder);
  const path = `${dir}/${filename}`;
  const url = `${prefix}/${filename}`;
  assertAllowed(path);
  // The name carries a content hash: the same image is already there, nothing to commit.
  const existing = (await store.list(dir)).find((f) => f.path === path);
  if (existing) return { path, url, version: existing.version, commit: null };
  const result = await store.commit([{ path, content: base64, encoding: 'base64' }], `Upload ${path}`, {
    [path]: null,
  });
  return { path, url, version: result.versions[path] ?? '', commit: { id: result.id, url: result.url } };
}

export function deleteRepoMedia(store: ContentStore, path: string, version: string): Promise<CommitResult> {
  const file = assertMediaPath(path);
  return store.commit([{ path: file, content: null }], `Delete ${file}`, { [file]: version });
}
```

`src/lib/admin/github-store.ts` and `src/lib/admin/memory-store.ts` — import and add these three methods to each class (imports: `import { deleteRepoMedia, listRepoMedia, putRepoMedia } from './git-media';` and `type MediaFolder` from `./store`):
```ts
  listMedia(folder: MediaFolder) {
    return listRepoMedia(this, folder);
  }

  putMedia(folder: MediaFolder, filename: string, base64: string) {
    return putRepoMedia(this, folder, filename, base64);
  }

  deleteMedia(path: string, version: string) {
    return deleteRepoMedia(this, path, version);
  }
```

`src/lib/admin/postgres-store.ts` — imports: add `import { del, put } from '@vercel/blob';`, `import { PathError } from './paths';`, and `type MediaFile, type MediaFolder, type UploadResult` from `./store`. Replace `PostgresDeps`/`defaultDeps`:
```ts
/** What the store calls outside the database; tests pass fakes. */
export interface PostgresDeps {
  purge(tags: string[]): Promise<void>;
  put(pathname: string, body: Buffer, contentType: string): Promise<{ url: string }>;
  del(url: string): Promise<void>;
}

const defaultDeps: PostgresDeps = {
  purge: (tags) => dangerouslyDeleteByTag(tags),
  put: (pathname, body, contentType) =>
    put(pathname, body, { access: 'public', contentType, addRandomSuffix: false, allowOverwrite: true }),
  del: (url) => del(url),
};

const blobFailure = (e: unknown) => new UpstreamError(`Image storage (Vercel Blob) failed: ${(e as Error).message}`, 502);
```
Add methods to the class:
```ts
  /** Postgres mode keeps every image in Blob, so both folders list the same library. */
  async listMedia(_folder: MediaFolder): Promise<MediaFile[]> {
    const rows = await this.db(() => this.sql<{ url: string }>`select url from media order by created_at desc, url`);
    return rows.map((r) => ({ path: r.url, url: r.url, version: '1' }));
  }

  async putMedia(_folder: MediaFolder, filename: string, base64: string, contentType: string): Promise<UploadResult> {
    const [existing] = await this.db(() => this.sql<{ url: string }>`select url from media where pathname = ${filename}`);
    if (existing) return { path: existing.url, url: existing.url, version: '1', commit: null };
    const bytes = Buffer.from(base64, 'base64');
    let url: string;
    try {
      ({ url } = await this.deps.put(filename, bytes, contentType));
    } catch (e) {
      throw blobFailure(e);
    }
    await this.db(
      () => this.sql`
        insert into media (url, pathname, size, content_type)
        values (${url}, ${filename}, ${bytes.length}, ${contentType}) on conflict (url) do nothing`,
    );
    return { path: url, url, version: '1', commit: { id: `blob:${filename}` } };
  }

  /** Only images this site uploaded (a row in `media`) can be deleted. */
  async deleteMedia(path: string, _version: string): Promise<CommitResult> {
    const [row] = await this.db(() => this.sql`select url from media where url = ${path}`);
    if (!row) throw new PathError('Not an image in this site’s library');
    try {
      await this.deps.del(path);
    } catch (e) {
      throw blobFailure(e);
    }
    await this.db(() => this.sql`delete from media where url = ${path}`);
    return { id: `blob:${path}`, versions: { [path]: null } };
  }
```

`src/admin/routes/api/media.ts` — replace the whole file:
```ts
import { posix } from 'node:path';
import { listEntries } from '../../../lib/admin/content';
import { HttpError, json, readBody, route } from '../../../lib/admin/http';
import { MAX_UPLOAD, MediaError, prepareUpload } from '../../../lib/admin/media';
import { COLLECTIONS, collectionDir } from '../../../lib/admin/paths';
import type { ContentStore, MediaFolder } from '../../../lib/admin/store';
import { adminSettings } from '../../../lib/admin/settings';

export const prerender = false;

function folderOf(value: unknown): MediaFolder {
  if (value === 'content' || value === 'site') return value;
  throw new HttpError(400, "`folder` must be 'content' or 'site'");
}

export const GET = route(async ({ url }, store) =>
  json(await store.listMedia(folderOf(url.searchParams.get('folder') ?? 'content'))),
);

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
  const { filename, base64, contentType } = prepareUpload(file.name, new Uint8Array(await file.arrayBuffer()));
  return json(await store.putMedia(folder, filename, base64, contentType));
});

const isUrl = (s: string) => /^https:\/\//.test(s);

/**
 * An image referenced from front matter must stay: in git mode image() fails the build when the file is gone; in
 * Postgres mode the page would show a broken image. Repo images match by public URL or entry-relative path.
 */
async function refuseInUse(store: ContentStore, file: string) {
  const { mediaFolder, publicFolder } = adminSettings();
  if (!isUrl(file) && !file.startsWith(`${mediaFolder}/`)) return;
  const url = isUrl(file) ? file : publicFolder + file.slice(mediaFolder.length);
  const users = (
    await Promise.all(
      COLLECTIONS.map(async (name) => {
        const relative = posix.relative(collectionDir(name), file);
        return (await listEntries(store, name))
          .filter((e) => {
            const text = JSON.stringify(e.data);
            return text.includes(url) || (!isUrl(file) && text.includes(relative));
          })
          .map((e) => `${name}/${e.slug}`);
      }),
    )
  ).flat();
  if (users.length) throw new HttpError(409, `In use by ${users.join(', ')}`);
}

export const DELETE = route(async (ctx, store) => {
  const { path, version } = await readBody<{ path?: unknown; version?: unknown }>(ctx);
  if (typeof version !== 'string' || !version) throw new HttpError(400, '`version` is required to delete');
  if (typeof path !== 'string') throw new HttpError(400, '`path` is required');
  await refuseInUse(store, path);
  return json(await store.deleteMedia(path, version));
});
```
(Path validation moved into the stores: `deleteRepoMedia` calls `assertMediaPath` → 400; `PostgresStore.deleteMedia` requires a `media` row → 400.)

- [ ] **Step 4: Run tests**

Run: `pnpm test` → all PASS, including the unchanged `routes.test.ts` media tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin src/admin/routes/api/media.ts
git commit -m "feat(postgres): media on the store interface; Vercel Blob for PostgresStore"
```

---

### Task 6: Store selection and the admin API (history, purge retry, dashboard, 503)

**Files:**
- Create: `src/admin/routes/api/history.ts`, `src/admin/routes/api/history/[id].ts`, `src/admin/routes/api/history/[id]/restore.ts`, `src/admin/routes/api/cache/purge.ts`, `src/lib/admin/routes-postgres.test.ts`
- Modify: `src/lib/admin/get-store.ts`, `src/lib/admin/http.ts`, `src/lib/admin/paths.ts`, `src/admin/routes/api/dashboard.ts`, `src/admin/routes/[...path].astro`, `src/admin/types.ts`

**Interfaces:**
- Consumes: `PostgresStore` (Tasks 4–5), `getSql` (Task 2), `getMode` (Task 1), `isValidTag` (Task 3).
- Produces:
  - `getStore()` returns `new PostgresStore(getSql(), author)` in postgres mode.
  - `http.ts`: `postgresOnly(store: ContentStore): PostgresStore` (throws `HttpError(404)`).
  - `paths.ts`: `BACKUP_JSON = 'src/data/backup.json'` (allowlisted).
  - API: `GET /api/admin/history?path=` → `Revision[]`; `GET /api/admin/history/[id]` → `{ path, content }`; `POST /api/admin/history/[id]/restore` body `{ version: string | null }` → `CommitResult`; `POST /api/admin/cache/purge` body `{ tags: string[] }` → `{ ok: true }`; dashboard JSON gains `mode: Mode` and `backup: BackupResult | null`.
  - `AdminCtx.mode: 'static' | 'git' | 'postgres'`.

- [ ] **Step 1: Write the failing test**

`src/lib/admin/routes-postgres.test.ts`:
```ts
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../db-migrate';
import { pgliteSql } from '../pglite-sql';
import type { Sql } from '../db';
import { setStoreForTests } from './get-store';
import { MemoryStore } from './memory-store';
import { PostgresStore } from './postgres-store';
import { PUT as putEntry } from '../../admin/routes/api/collections/[name]/[slug]';
import { GET as listCollection } from '../../admin/routes/api/collections/[name]';
import { GET as history } from '../../admin/routes/api/history';
import { GET as revision } from '../../admin/routes/api/history/[id]';
import { POST as restore } from '../../admin/routes/api/history/[id]/restore';
import { POST as purge } from '../../admin/routes/api/cache/purge';
import { GET as dashboard } from '../../admin/routes/api/dashboard';

const user = { login: 'jane', name: 'Jane', avatar: '' };
let sql: Sql;
let purged: string[][];
let purgeFails: boolean;

beforeEach(async () => {
  sql = pgliteSql();
  await migrate(sql);
  purged = [];
  purgeFails = false;
  setStoreForTests(
    (author) =>
      new PostgresStore(sql, author, {
        purge: async (tags) => {
          if (purgeFails) throw new Error('down');
          purged.push(tags);
        },
        put: async () => ({ url: 'https://x.public.blob.vercel-storage.com/a.png' }),
        del: async () => {},
      }),
  );
});

function call(
  handler: (ctx: never) => Response | Promise<Response>,
  opts: { method?: string; params?: Record<string, string>; body?: unknown; query?: string } = {},
): Promise<Response> {
  const url = new URL(`https://site.test/api/admin/test${opts.query ?? ''}`);
  const request = new Request(url, {
    method: opts.method ?? 'GET',
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return Promise.resolve(handler({ request, url, params: opts.params ?? {}, locals: { user } } as never));
}

const save = (title: string, version: string | null) =>
  call(putEntry, {
    method: 'PUT',
    params: { name: 'posts', slug: 'hist' },
    body: { data: { title, date: '2024-06-01' }, body: 'Hi', version },
  });

test('history: list newest first, read a revision, restore onto the current version', async () => {
  const v1 = (await (await save('One', null)).json()).versions['src/content/posts/hist.md'];
  await save('Two', v1);
  const res = await call(history, { query: '?path=src/content/posts/hist.md' });
  const revs = (await res.json()) as { id: string; version: number; author: string }[];
  assert.deepEqual(
    revs.map((r) => [r.version, r.author]),
    [
      [2, 'Jane'],
      [1, 'Jane'],
    ],
  );
  const old = await (await call(revision, { params: { id: revs[1].id } })).json();
  assert.match(old.content, /title: One/);

  const stale = await call(restore, { method: 'POST', params: { id: revs[1].id }, body: { version: '1' } });
  assert.equal(stale.status, 409);
  const ok = await call(restore, { method: 'POST', params: { id: revs[1].id }, body: { version: '2' } });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).versions, { 'src/content/posts/hist.md': '3' });
});

test('history: a deletion can’t be restored; unknown ids 404; paths outside the allowlist 400', async () => {
  const v1 = (await (await save('One', null)).json()).versions['src/content/posts/hist.md'];
  const store = new PostgresStore(sql, { name: 'Jane', email: 'j@x' }, { purge: async () => {}, put: async () => ({ url: '' }), del: async () => {} });
  await store.commit([{ path: 'src/content/posts/hist.md', content: null }], 'Delete', { 'src/content/posts/hist.md': v1 });
  const [deleted] = (await (await call(history, { query: '?path=src/content/posts/hist.md' })).json()) as { id: string }[];
  assert.equal((await call(restore, { method: 'POST', params: { id: deleted.id }, body: { version: null } })).status, 400);
  assert.equal((await call(revision, { params: { id: '999999' } })).status, 404);
  assert.equal((await call(history, { query: '?path=../../etc/passwd' })).status, 400);
});

test('history and purge are Postgres-only: 404 on the git stores', async () => {
  setStoreForTests(() => new MemoryStore());
  assert.equal((await call(history, { query: '?path=config/site.yml' })).status, 404);
  assert.equal((await call(purge, { method: 'POST', body: { tags: ['cfg:site'] } })).status, 404);
});

test('cache purge: validates tags, purges, 502 when it fails again', async () => {
  assert.equal((await call(purge, { method: 'POST', body: { tags: [] } })).status, 400);
  assert.equal((await call(purge, { method: 'POST', body: { tags: ['a,b'] } })).status, 400);
  assert.equal((await call(purge, { method: 'POST', body: { tags: 'cfg:site' } })).status, 400);
  assert.equal((await call(purge, { method: 'POST', body: { tags: ['cfg:site'] } })).status, 200);
  assert.deepEqual(purged.at(-1), ['cfg:site']);
  purgeFails = true;
  assert.equal((await call(purge, { method: 'POST', body: { tags: ['cfg:site'] } })).status, 502);
});

test('a save whose purge fails answers 200 with the warning and the tags to retry', async () => {
  purgeFails = true;
  const original = console.error;
  console.error = () => {};
  try {
    const res = await save('One', null);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.warning, 'cache-purge-failed');
    assert.deepEqual(body.tags, ['col:posts', 'doc:posts/hist']);
  } finally {
    console.error = original;
  }
});

test('dashboard reports the mode and the last backup', async () => {
  const store = new PostgresStore(sql, undefined, { purge: async () => {}, put: async () => ({ url: '' }), del: async () => {} });
  await store.commit([{ path: 'src/data/backup.json', content: '{"at":"2026-10-06T03:00:00.000Z","ok":true,"changed":2}' }], 'r', {});
  const body = await (await call(dashboard)).json();
  assert.equal(body.mode, 'static'); // tests run without VERCEL
  assert.deepEqual(body.backup, { at: '2026-10-06T03:00:00.000Z', ok: true, changed: 2 });
});

test('an unreachable database answers 503 JSON', async () => {
  const down = (async () => {
    throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' });
  }) as unknown as Sql;
  setStoreForTests((author) => new PostgresStore(down, author));
  const res = await call(listCollection, { params: { name: 'posts' } });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /unreachable/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/lib/admin/routes-postgres.test.ts`
Expected: FAIL — `Cannot find module '../../admin/routes/api/history'`.

- [ ] **Step 3: Implement**

`src/lib/admin/paths.ts` — add after `FEEDS_JSON`:
```ts
/** Last backup cron result (Postgres mode): admin-only, never rendered. */
export const BACKUP_JSON = 'src/data/backup.json';
```
and in `assertAllowed`, change the first line to:
```ts
  if (
    CONFIG_FILES.some((file) => path === configPath(file)) ||
    path === FEEDS_JSON ||
    path === BACKUP_JSON ||
    isMediaPath(path)
  )
    return;
```

`src/lib/admin/get-store.ts`:
```ts
import { getSql } from '../db';
import { getMode } from '../mode';
import { GitHubStore, githubConfig } from './github-store';
import { memoryStore } from './memory-store';
import { PostgresStore } from './postgres-store';
import type { Author, ContentStore } from './store';
```
and replace the doc comment + body of `getStore`:
```ts
/** The store for one request: Postgres in postgres mode, GitHub on git-mode Vercel, the in-memory overlay under `astro dev` with ADMIN_STORE=memory. */
export function getStore(author: Author): ContentStore {
  if (testFactory) return testFactory(author);
  if (process.env.ADMIN_STORE === 'memory') {
    if (!import.meta.env?.DEV) throw new Error('ADMIN_STORE=memory is only honored by `astro dev`');
    return memoryStore();
  }
  if (getMode() === 'postgres') return new PostgresStore(getSql(), author);
  return new GitHubStore(githubConfig(process.env), author);
}
```

`src/lib/admin/http.ts` — add the import `import { PostgresStore } from './postgres-store';` and:
```ts
/** History and cache purges only exist in Postgres mode. */
export function postgresOnly(store: ContentStore): PostgresStore {
  if (!(store instanceof PostgresStore)) throw new HttpError(404, 'Only available in Postgres mode');
  return store;
}
```

`src/admin/routes/api/history.ts`:
```ts
import { json, postgresOnly, route } from '../../../lib/admin/http';
import { assertAllowed } from '../../../lib/admin/paths';

export const prerender = false;

export const GET = route(async ({ url }, store) => {
  const path = url.searchParams.get('path') ?? '';
  assertAllowed(path);
  return json(await postgresOnly(store).history(path));
});
```

`src/admin/routes/api/history/[id].ts`:
```ts
import { HttpError, json, postgresOnly, route } from '../../../../lib/admin/http';

export const prerender = false;

export const GET = route(async ({ params }, store) => {
  const rev = await postgresOnly(store).revision(String(params.id));
  if (!rev) throw new HttpError(404, 'No such revision');
  return json(rev);
});
```

`src/admin/routes/api/history/[id]/restore.ts`:
```ts
import { HttpError, commitChanges, json, postgresOnly, readBody, route } from '../../../../../lib/admin/http';

export const prerender = false;

/** Restores a revision as a new save on top of `version` (the document's current version; null if it was deleted). */
export const POST = route(async (ctx, store) => {
  const pg = postgresOnly(store);
  const { version = null } = await readBody<{ version?: unknown }>(ctx);
  if (version !== null && typeof version !== 'string') throw new HttpError(400, '`version` must be a string or null');
  const rev = await pg.revision(String(ctx.params.id));
  if (!rev) throw new HttpError(404, 'No such revision');
  if (rev.content === null) throw new HttpError(400, 'That revision is a deletion; restore an earlier one');
  return json(
    await commitChanges(pg, [{ path: rev.path, content: rev.content }], `Restore ${rev.path}`, {
      [rev.path]: version,
    }),
  );
});
```

`src/admin/routes/api/cache/purge.ts`:
```ts
import { isValidTag } from '../../../../lib/cache-tags';
import { HttpError, json, postgresOnly, readBody, route } from '../../../../lib/admin/http';

export const prerender = false;

/** "Retry refresh" after a save whose cache purge failed. */
export const POST = route(async (ctx, store) => {
  const pg = postgresOnly(store);
  const { tags } = await readBody<{ tags?: unknown }>(ctx);
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.length > 128 ||
    !tags.every((t) => typeof t === 'string' && isValidTag(t))
  ) {
    throw new HttpError(400, '`tags` must be 1–128 cache tags');
  }
  await pg.purgeTags(tags);
  return json({ ok: true });
});
```

`src/admin/routes/api/dashboard.ts` — replace:
```ts
import { listEntries, readConfig } from '../../../lib/admin/content';
import { json, route } from '../../../lib/admin/http';
import { BACKUP_JSON, FEEDS_JSON, collectionDir, configPath } from '../../../lib/admin/paths';
import { getMode } from '../../../lib/mode';

export const prerender = false;

const parseJson = (text: string | undefined) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

export const GET = route(async (_ctx, store) => {
  const [posts, publications, feeds, feedsJson, cvUpdated, lastSync, backup] = await Promise.all([
    listEntries(store, 'posts'),
    store.list(collectionDir('publications')),
    readConfig(store, 'feeds'),
    store.read(FEEDS_JSON),
    store.lastModified(configPath('cv')),
    store.lastModified(FEEDS_JSON),
    store.read(BACKUP_JSON),
  ]);
  let feedItems: unknown = [];
  let feedsError: string | undefined;
  try {
    feedItems = feedsJson ? JSON.parse(feedsJson.content) : [];
  } catch {
    feedsError = `${FEEDS_JSON} is not valid JSON`;
  }
  return json({
    posts,
    feedItems,
    ...(feedsError ? { feedsError } : {}),
    feeds: { data: feeds.data, version: feeds.version },
    publications: publications.filter((f) => /\.mdx?$/.test(f.path)).length,
    cvUpdated,
    lastSync,
    mode: getMode(),
    backup: parseJson(backup?.content),
  });
});
```

`src/admin/types.ts` — `AdminCtx` gains:
```ts
  mode: 'static' | 'git' | 'postgres';
```
`src/admin/routes/[...path].astro` — add `import { getMode } from '../../lib/mode';` and change:
```ts
const ctx = { adminPath, siteName, user: Astro.locals.user ?? null, mode: getMode() };
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec tsx --test src/lib/admin/routes-postgres.test.ts` → PASS; `pnpm test` → all PASS (the existing `routes.test.ts` dashboard test ignores the new keys; if it uses `deepEqual` on the whole body, add `mode: 'static', backup: null` to its expected object).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin src/admin/routes src/admin/types.ts
git commit -m "feat(postgres): PostgresStore in production, history/restore and purge-retry API, dashboard mode"
```

---

### Task 7: Request context, config reads, and the caching middleware

**Files:**
- Create: `src/lib/content/context.ts`, `src/middleware-postgres.test.ts`
- Modify: `src/lib/config.ts`, `src/lib/cv.ts`, `src/middleware.ts`

**Interfaces:**
- Consumes: `getMode` (Task 1), `getSql`/`setSqlForTests`/`Sql` (Task 2), `tagsForPath`/`cacheTagHeader` (Task 3).
- Produces (`src/lib/content/context.ts`):
  - `interface RequestContext { files: Map<string, string>; tags: Set<string>; memo: Map<string, unknown>; dbFailed: boolean }`
  - `newContext(files): RequestContext`, `runWithContext<T>(ctx, fn: () => T): T`, `requestContext(): RequestContext` (throws outside a request)
  - `readSiteFile(file: string): string | null` (disk in static/git; snapshot + tags in postgres)
  - `memo<T>(key: string, compute: () => T): T`
  - `loadSiteFiles(sql: Sql): Promise<Map<string, string>>`

- [ ] **Step 1: Write the failing test**

`src/middleware-postgres.test.ts`:
```ts
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from './lib/db-migrate';
import { pgliteSql } from './lib/pglite-sql';
import { setSqlForTests, type Sql } from './lib/db';
import { getSiteConfig } from './lib/config';
import { requestContext } from './lib/content/context';
import { onRequest } from './middleware';

let sql: Sql;
const saved = { VERCEL: process.env.VERCEL, DATABASE_URL: process.env.DATABASE_URL };

before(async () => {
  process.env.VERCEL = '1';
  process.env.DATABASE_URL = 'postgres://test';
  sql = pgliteSql();
  await migrate(sql);
  await sql`insert into documents (path, content) values ('config/site.yml', 'title: A')`;
  setSqlForTests(sql);
});
after(() => {
  setSqlForTests(null);
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
});

function ctx(path: string, method = 'GET') {
  const url = new URL(path, 'https://site.test');
  return { url, isPrerendered: false, locals: {}, request: new Request(url, { method }), cookies: { get: () => undefined } };
}
const run = (path: string, next: () => Promise<Response>) =>
  onRequest(ctx(path) as never, next as never) as Promise<Response>;

/** A body that reads config only when the runtime pulls it, like a child component during streaming. */
const streamingTitle = () =>
  new Response(
    new ReadableStream({
      pull(c) {
        c.enqueue(new TextEncoder().encode(getSiteConfig().title));
        c.close();
      },
    }),
  );

test('a read while the body streams is inside the context and tagged', async () => {
  const res = await run('/blog', async () => streamingTitle());
  assert.equal(await res.text(), 'A');
  assert.equal(res.headers.get('vercel-cdn-cache-control'), 'public, max-age=31536000');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  assert.equal(res.headers.get('vercel-cache-tag'), 'cfg:site,all');
});

test('a warm function sees the next site.yml', async () => {
  await sql`update documents set content = 'title: B' where path = 'config/site.yml'`;
  assert.equal(await (await run('/', async () => streamingTitle())).text(), 'B');
});

test('404 and 500 are never cached', async () => {
  const res = await run('/nope', async () => new Response('missing', { status: 404 }));
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('vercel-cache-tag'), null);
});

test('a failed query during render → 503 with Retry-After, not a cached error page', async () => {
  const res = await run('/blog', async () => {
    requestContext().dbFailed = true;
    return new Response('error', { status: 500 });
  });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '30');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('database unreachable before render → 503', async () => {
  setSqlForTests((async () => {
    throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' });
  }) as unknown as Sql);
  const original = console.error;
  console.error = () => {};
  try {
    const res = await run('/', async () => new Response('never'));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '30');
  } finally {
    console.error = original;
    setSqlForTests(sql);
  }
});

test('config read outside a request fails loudly in postgres mode', () => {
  assert.throws(() => getSiteConfig(), /outside a request/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/middleware-postgres.test.ts`
Expected: FAIL — `Cannot find module './lib/content/context'`.

- [ ] **Step 3: Implement**

`src/lib/content/context.ts`:
```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { tagsForPath } from '../cache-tags';
import type { Sql } from '../db';
import { getMode } from '../mode';

export interface RequestContext {
  /** config/* and src/data/* documents, loaded once per request so config reads can stay synchronous. */
  files: Map<string, string>;
  /** Cache tags of everything this response read. */
  tags: Set<string>;
  /** Per-request results (parsed config, collections). */
  memo: Map<string, unknown>;
  /** A query failed while rendering: the middleware answers 503 instead of caching an error page. */
  dbFailed: boolean;
}

const als = new AsyncLocalStorage<RequestContext>();

export const newContext = (files: Map<string, string>): RequestContext => ({
  files,
  tags: new Set(),
  memo: new Map(),
  dbFailed: false,
});

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => als.run(ctx, fn);

export function requestContext(): RequestContext {
  const ctx = als.getStore();
  if (!ctx) {
    throw new Error('Content read outside a request in Postgres mode (src/middleware.ts opens the request context)');
  }
  return ctx;
}

/** A site file as text, or null when missing: from disk, or in Postgres mode from the request's snapshot (tagged). */
export function readSiteFile(file: string): string | null {
  if (getMode() !== 'postgres') {
    try {
      return fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8');
    } catch {
      return null;
    }
  }
  const ctx = requestContext();
  for (const tag of tagsForPath(file)) ctx.tags.add(tag);
  return ctx.files.get(file) ?? null;
}

/** Inside a request: computed once per request. Outside (static/git builds): every call. */
export function memo<T>(key: string, compute: () => T): T {
  const ctx = als.getStore();
  if (!ctx) return compute();
  if (!ctx.memo.has(key)) ctx.memo.set(key, compute());
  return ctx.memo.get(key) as T;
}

/** The documents every page may read synchronously (config/*, src/data/*), in one query. */
export async function loadSiteFiles(sql: Sql): Promise<Map<string, string>> {
  const rows = await sql<{ path: string; content: string }>`
    select path, content from documents where starts_with(path, 'config/') or starts_with(path, 'src/data/')`;
  return new Map(rows.map((r) => [r.path, r.content]));
}
```

`src/lib/config.ts` — replace the imports and the two readers (`getSiteConfig`, `loadYamlConfig`); everything else stays:
```ts
import yaml from 'js-yaml';
import { memo, readSiteFile } from './content/context';
import { getMode } from './mode';
import type { SiteConfig, HomepageSectionId, HomepageSectionEntry, ThemeName } from './types';

let _siteConfig: SiteConfig | null = null;
```
```ts
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
```
```ts
export function loadYamlConfig<T>(filename: string): T {
  return yaml.load(readConfigFile(filename)) as T;
}
```

`src/lib/cv.ts` — remove the `fs`/`path` imports, add `import { readSiteFile } from './content/context';`, and replace `loadCvMeta`:
```ts
/** PDF metadata written by scripts/render-cv.py; null until a PDF has been generated. */
export function loadCvMeta(): CvMetadata | null {
  try {
    const raw = readSiteFile('src/data/cv.json');
    return raw ? (JSON.parse(raw) as CvMetadata) : null;
  } catch {
    return null;
  }
}
```

`src/middleware.ts` — add imports:
```ts
import { cacheTagHeader } from './lib/cache-tags';
import { loadSiteFiles, newContext, runWithContext } from './lib/content/context';
import { getSql } from './lib/db';
import { getMode } from './lib/mode';
```
add above `onRequest`:
```ts
const UNAVAILABLE =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Temporarily unavailable</title>' +
  '<p style="font-family:system-ui;margin:4rem auto;max-width:32rem;padding:0 1rem">This site is temporarily unavailable. Please try again in a minute.</p>';

function unavailable(): Response {
  return new Response(UNAVAILABLE, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '30' },
  });
}

const NO_BODY = new Set([101, 204, 205, 304]);

/** Postgres mode, public GET/HEAD: render inside a request context, then cache on the CDN tagged with what it read. */
async function publicPage(next: () => Promise<Response>): Promise<Response> {
  let files: Map<string, string>;
  try {
    files = await loadSiteFiles(getSql());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[middleware] database unreachable', e);
    return unavailable(); // pages already in the CDN cache keep being served from it
  }
  const context = newContext(files);
  return runWithContext(context, async () => {
    const res = await next();
    // Child components read content while the body streams: finish rendering here so every read is in the context.
    const body = NO_BODY.has(res.status) ? null : await res.arrayBuffer();
    if (context.dbFailed) return unavailable();
    const out = new Response(body, res);
    if (res.status === 200) {
      out.headers.set('Vercel-CDN-Cache-Control', 'public, max-age=31536000');
      out.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
      out.headers.set('Vercel-Cache-Tag', cacheTagHeader(context.tags));
    } else {
      out.headers.set('Cache-Control', 'no-store');
    }
    return out;
  });
}
```
and change the early return in `onRequest`:
```ts
  if (!api && !page) {
    const cacheable = ctx.request.method === 'GET' || ctx.request.method === 'HEAD';
    return getMode() === 'postgres' && cacheable ? publicPage(next) : next();
  }
```
Update the `onRequest` doc comment: `Guards the admin (pages under /<adminPath>, API under /api/admin): session, same-origin writes, no caching or indexing. Postgres mode: renders public pages inside a request context and sets CDN cache headers.`

- [ ] **Step 4: Run tests**

Run: `pnpm exec tsx --test src/middleware-postgres.test.ts src/middleware.test.ts src/lib/config.test.ts src/lib/cv.test.ts` → PASS. `pnpm test` → all PASS.
Run: `pnpm build && diff -r node_modules/.cache/dist-pre-postgres dist && echo SAME` → `SAME`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/context.ts src/lib/config.ts src/lib/cv.ts src/middleware.ts src/middleware-postgres.test.ts
git commit -m "feat(postgres): per-request content context and CDN cache headers with tags"
```

---

### Task 8: Public data layer (entries, entry bodies, images, Markdown)

**Files:**
- Create: `src/lib/content/documents.ts`, `src/lib/content/index.ts`, `src/lib/content/image.ts`, `src/components/astro/EntryBody.astro`, `src/lib/content/content.test.ts`, `src/lib/markdown-parity.test.ts`
- Modify: `src/lib/markdown.ts`, `astro.config.mjs`, `.github/workflows/lint.yml`

**Interfaces:**
- Consumes: context helpers (Task 7), `getSql` (Task 2), `getMode` (Task 1), `parseMarkdown` (`src/lib/admin/serialize.ts`), `adminCollections`/`feedItemSchema` (`src/lib/schemas.ts`).
- Produces:
  - `markdown.ts`: `markdownOptions` (used by `astro.config.mjs`), `renderMarkdownDocument(md: string): Promise<{ html: string; headings: MarkdownHeading[] }>`; `renderMarkdown` unchanged.
  - `documents.ts`: `documentSchemas`, `type DocumentCollection`, `interface DocumentEntry { id; collection; data; body?; filePath? }`, `parseDocuments(name, docs: { path: string; content: string }[]): DocumentEntry[]`.
  - `index.ts`: `getEntries<C extends CollectionKey>(name: C): Promise<CollectionEntry<C>[]>`, `getEntry<C>(name: C, id: string): Promise<CollectionEntry<C> | undefined>`, `staticProps<P>(astro, paths): Promise<P | null>`, `renderEntryHtml(entry): Promise<{ html; headings }>`, `entryHeadings(entry): Promise<MarkdownHeading[]>`.
  - `image.ts`: `resolveImage(src: ImageMetadata | string, width: number): Promise<{ src: string }>`.
  - `<EntryBody entry={…} />`.

- [ ] **Step 1: Write the failing tests**

`src/lib/content/content.test.ts`:
```ts
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migrate } from '../db-migrate';
import { pgliteSql } from '../pglite-sql';
import { setSqlForTests, type Sql } from '../db';
import { newContext, runWithContext, type RequestContext } from './context';
import { parseDocuments } from './documents';
import { entryHeadings, getEntries, getEntry, renderEntryHtml, staticProps } from './index';

let sql: Sql;
const saved = { VERCEL: process.env.VERCEL, DATABASE_URL: process.env.DATABASE_URL };
/** Silences the "invalid, skipped" logs of the broken fixture while `fn` (and its awaits) run. */
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

before(async () => {
  process.env.VERCEL = '1';
  process.env.DATABASE_URL = 'postgres://test';
  sql = pgliteSql();
  await migrate(sql);
  const post = (title: string, extra = '') => `---\ntitle: ${title}\ndate: 2024-06-01\n${extra}---\n\n## Hello\n\nBody\n`;
  await sql`insert into documents (path, content) values
    ('src/content/posts/a.md', ${post('A')}),
    ('src/content/posts/draft.md', ${post('Draft', 'draft: true\n')}),
    ('src/content/posts/broken.md', ${'---\ndate: nope\n---\n'}),
    ('src/content/posts/old.mdx', ${post('Old')})`;
  setSqlForTests(sql);
});
after(() => {
  setSqlForTests(null);
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
});

const inRequest = async <T>(fn: (ctx: RequestContext) => Promise<T>, files = new Map<string, string>()) => {
  const ctx = newContext(files);
  return runWithContext(ctx, () => fn(ctx));
};

test('parseDocuments: demo content parses to getCollection-shaped entries', () => {
  const dir = 'src/content/people';
  const docs = fs.readdirSync(dir).map((f) => ({ path: `${dir}/${f}`, content: fs.readFileSync(`${dir}/${f}`, 'utf8') }));
  const entries = parseDocuments('people', docs);
  assert.equal(entries.length, docs.length);
  const jane = entries.find((e) => e.id === 'jane-smith')!;
  assert.deepEqual(Object.keys(jane).sort(), ['body', 'collection', 'data', 'filePath', 'id']);
  assert.equal(jane.collection, 'people');
  assert.equal(jane.filePath, 'src/content/people/jane-smith.md');
  assert.equal(typeof jane.data.name, 'string');
  assert.equal(jane.data.active, true); // schema default applied
});

test('parseDocuments: invalid documents are logged and skipped', () => {
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const out = parseDocuments('posts', [{ path: 'src/content/posts/x.md', content: '---\ntitle: 1\n---\n' }]);
    assert.deepEqual(out, []);
    assert.match(String((logged[0] as unknown[])[0]), /src\/content\/posts\/x\.md/);
  } finally {
    console.error = original;
  }
});

test('getEntries: valid documents from the database, tagged col:<name>, dates coerced', async () => {
  const { ids, tags } = await inRequest(async (ctx) => {
    const posts = await quiet(() => getEntries('posts'));
    return { ids: posts.map((p) => p.id), tags: [...ctx.tags], date: posts[0].data.date };
  });
  assert.deepEqual(ids, ['a', 'draft', 'old']);
  assert.deepEqual(tags, ['col:posts']);
});

test('getEntry: one document, tagged doc:<name>/<id>; unknown → undefined', async () => {
  const { a, missing, tags } = await inRequest(async (ctx) => ({
    a: await getEntry('posts', 'a'),
    missing: await getEntry('posts', 'zzz'),
    tags: [...ctx.tags],
  }));
  assert.equal(a?.data.title, 'A');
  assert.ok(a?.data.date instanceof Date);
  assert.equal(missing, undefined);
  assert.deepEqual(tags, ['doc:posts/a', 'doc:posts/zzz']);
});

test('feeds come from the request snapshot of src/data/feeds.json', async () => {
  const feeds = JSON.stringify([{ id: 'm1', title: 'T', link: 'https://medium.com/x', date: '2024-01-01', source: 'Medium' }]);
  const { items, tags } = await inRequest(
    async (ctx) => ({ items: await getEntries('feeds'), tags: [...ctx.tags] }),
    new Map([['src/data/feeds.json', feeds]]),
  );
  assert.deepEqual(items.map((i) => i.id), ['m1']);
  assert.ok(tags.includes('col:feeds'));
});

test('staticProps: unknown id → null, known → its props', async () => {
  const paths = async () => [
    { params: { id: 'a' }, props: { n: 1 } },
    { params: { id: 'b' }, props: { n: 2 } },
  ];
  assert.deepEqual(await staticProps({ props: {}, params: { id: 'b' } }, paths), { n: 2 });
  assert.equal(await staticProps({ props: {}, params: { id: 'draft' } }, paths), null);
});

test('a failed query marks the request for a 503', async () => {
  setSqlForTests((async () => {
    throw new Error('down');
  }) as unknown as Sql);
  try {
    const ctx = newContext(new Map());
    await assert.rejects(runWithContext(ctx, () => getEntries('projects')), /down/);
    assert.equal(ctx.dbFailed, true);
  } finally {
    setSqlForTests(sql);
  }
});

test('entry bodies: Markdown with headings; MDX gets the notice', async () => {
  await inRequest(async () => {
    const [a] = await quiet(() => getEntries('posts'));
    const { html } = await renderEntryHtml(a);
    assert.match(html, /<h2 id="hello">Hello<\/h2>/);
    assert.deepEqual((await entryHeadings(a)).map((h) => h.slug), ['hello']);
    const mdx = (await quiet(() => getEntries('posts'))).find((p) => p.id === 'old')!;
    assert.match((await renderEntryHtml(mdx)).html, /only supported in static\/git mode/);
  });
});
```

`src/lib/markdown-parity.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdown } from './admin/serialize';
import { renderMarkdownDocument } from './markdown';

/** Postgres mode renders entry bodies at request time; they must match what the static build produced. */
const cases = [
  ['posts', 'blog'],
  ['announcements', 'news'],
].flatMap(([dir, route]) =>
  fs
    .readdirSync(`src/content/${dir}`)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ file: `src/content/${dir}/${f}`, page: path.join('dist', route, f.replace(/\.md$/, ''), 'index.html') })),
);

/** Whitespace, and the class/style attributes shiki and Astro's compressor may write differently. */
const normalize = (html: string) =>
  html
    .replace(/\s(class|style|tabindex|data-language)="[^"]*"/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();

for (const c of cases) {
  test(`renderMarkdownDocument matches the build: ${c.file}`, { skip: !fs.existsSync(c.page) && 'no static build of this page' }, async () => {
    const { html } = await renderMarkdownDocument(parseMarkdown(fs.readFileSync(c.file, 'utf8')).body);
    assert.ok(normalize(fs.readFileSync(c.page, 'utf8')).includes(normalize(html)), `${c.file} renders differently`);
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/lib/content/content.test.ts src/lib/markdown-parity.test.ts`
Expected: FAIL — `Cannot find module './documents'` / `renderMarkdownDocument is not a function`.

- [ ] **Step 3: Implement**

`src/lib/markdown.ts` — replace the file:
```ts
import { createMarkdownProcessor, type MarkdownHeading, type MarkdownProcessor } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import { rehypeExternalLinks } from './rehype-external-links';
import { rehypeMathJaxPassthrough } from './rehype-mathjax-passthrough';

/** astro.config.mjs `markdown`: content files at build time and Postgres-mode documents at request time render alike. */
export const markdownOptions = {
  remarkPlugins: [remarkMath],
  rehypePlugins: [rehypeExternalLinks, rehypeMathJaxPassthrough],
  shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
};

let configProcessor: Promise<MarkdownProcessor> | undefined;
let documentProcessor: Promise<MarkdownProcessor> | undefined;

/** Markdown kept in YAML config (bios, research bodies) → HTML, with the same plugins as content files. */
export async function renderMarkdown(md: string | undefined): Promise<string> {
  if (!md?.trim()) return '';
  configProcessor ??= createMarkdownProcessor({
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeExternalLinks, rehypeMathJaxPassthrough],
  });
  const { code } = await (await configProcessor).render(md);
  return code;
}

/** A whole entry body (Postgres mode) → HTML and headings, like astro:content's render(). */
export async function renderMarkdownDocument(md: string): Promise<{ html: string; headings: MarkdownHeading[] }> {
  documentProcessor ??= createMarkdownProcessor(markdownOptions);
  const { code, metadata } = await (await documentProcessor).render(md);
  return { html: code, headings: metadata.headings };
}
```
(`renderMarkdown` keeps its own processor without the shiki themes so static output stays byte-identical.)

`astro.config.mjs` — replace the four plugin imports (`remarkMath`, `rehypeExternalLinks`, `rehypeMathJaxPassthrough`) with `import { markdownOptions } from './src/lib/markdown';` and the whole `markdown: { … }` block with:
```js
  markdown: markdownOptions,
```

`src/lib/content/documents.ts`:
```ts
import type { z } from 'astro/zod';
import { parseMarkdown } from '../admin/serialize';
import { adminCollections, feedItemSchema } from '../schemas';

/** The public collections in Postgres mode. Image fields are URL strings (images live in Vercel Blob). */
export const documentSchemas = { ...adminCollections, feeds: feedItemSchema };
export type DocumentCollection = keyof typeof documentSchemas;

export interface DocumentEntry {
  id: string;
  collection: string;
  data: Record<string, unknown>;
  body?: string;
  filePath?: string;
}

/** Database documents → entries shaped like getCollection's. A bad document is logged and skipped, never fatal. */
export function parseDocuments(name: DocumentCollection, docs: { path: string; content: string }[]): DocumentEntry[] {
  if (name === 'feeds') return docs.flatMap((d) => parseFeeds(d.path, d.content));
  const schema = documentSchemas[name] as z.ZodTypeAny;
  return docs.flatMap(({ path, content }) => {
    const id = /\/([^/]+)\.mdx?$/.exec(path)?.[1];
    if (!id) return [];
    let parsed: { data: Record<string, unknown>; body: string };
    try {
      parsed = parseMarkdown(content);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[content] ${path}: invalid front matter, skipped`, (e as Error).message);
      return [];
    }
    const result = schema.safeParse(parsed.data);
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.error(`[content] ${path}: invalid, skipped`, result.error.issues);
      return [];
    }
    return [{ id, collection: name, data: result.data, body: parsed.body, filePath: path }];
  });
}

function parseFeeds(path: string, content: string): DocumentEntry[] {
  let items: unknown;
  try {
    items = JSON.parse(content);
  } catch {
    // eslint-disable-next-line no-console
    console.error(`[content] ${path}: not valid JSON, skipped`);
    return [];
  }
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const result = feedItemSchema.safeParse(item);
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.error(`[content] ${path}: invalid item, skipped`, result.error.issues);
      return [];
    }
    return [{ id: result.data.id, collection: 'feeds', data: result.data }];
  });
}
```

`src/lib/content/index.ts`:
```ts
import type { MarkdownHeading } from '@astrojs/markdown-remark';
import type { CollectionEntry, CollectionKey } from 'astro:content';
import { getSql } from '../db';
import { renderMarkdownDocument } from '../markdown';
import { getMode } from '../mode';
import { memo, readSiteFile, requestContext } from './context';
import { parseDocuments, type DocumentCollection, type DocumentEntry } from './documents';

const FEEDS_JSON = 'src/data/feeds.json';

/** A query while rendering: a failure marks the request so the middleware answers 503, not a cached error page. */
async function query<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    requestContext().dbFailed = true;
    throw e;
  }
}

async function loadCollection(name: DocumentCollection): Promise<DocumentEntry[]> {
  if (name === 'feeds') {
    const content = readSiteFile(FEEDS_JSON); // in the request snapshot already
    return content === null ? [] : parseDocuments('feeds', [{ path: FEEDS_JSON, content }]);
  }
  const rows = await query(
    () =>
      getSql()<{ path: string; content: string }>`
        select path, content from documents where starts_with(path, ${`src/content/${name}/`}) order by path`,
  );
  return parseDocuments(name, rows);
}

// ponytail: in Postgres mode image fields are URL strings typed as ImageMetadata; resolveImage and <Image> take both.
const asEntries = <C extends CollectionKey>(entries: DocumentEntry[]) => entries as unknown as CollectionEntry<C>[];

/** Every entry of a collection, shaped like getCollection's. Postgres mode: from the database, tagged col:<name>. */
export async function getEntries<C extends CollectionKey>(name: C): Promise<CollectionEntry<C>[]> {
  if (getMode() !== 'postgres') return (await import('astro:content')).getCollection(name);
  requestContext().tags.add(`col:${name}`);
  return asEntries<C>(await memo(`col:${name}`, () => loadCollection(name as DocumentCollection)));
}

/** One entry, or undefined. Postgres mode: tagged doc:<name>/<id>, so edits to other entries don't purge it. */
export async function getEntry<C extends CollectionKey>(name: C, id: string): Promise<CollectionEntry<C> | undefined> {
  if (getMode() !== 'postgres') {
    const { getEntry: astroGetEntry } = await import('astro:content');
    return (astroGetEntry as (c: string, i: string) => Promise<CollectionEntry<C> | undefined>)(name, id);
  }
  requestContext().tags.add(`doc:${name}/${id}`);
  if (name === 'feeds') return (await getEntries(name)).find((e) => e.id === id);
  const base = `src/content/${name}/${id}`;
  const rows = await query(
    () =>
      getSql()<{ path: string; content: string }>`
        select path, content from documents where path = any(${[`${base}.md`, `${base}.mdx`]}::text[])`,
  );
  return asEntries<C>(parseDocuments(name as DocumentCollection, rows))[0];
}

type Paths<P> = { params: Record<string, string | number | undefined>; props: P }[];

/**
 * The props getStaticPaths gave this page. Postgres mode renders on demand, so getStaticPaths never ran: run it now
 * and pick the entry matching the URL. null (unknown id, draft, deleted entry) → the page answers 404.
 */
export async function staticProps<P>(
  astro: { props: unknown; params: Record<string, string | undefined> },
  paths: () => Promise<Paths<P>>,
): Promise<P | null> {
  if (getMode() !== 'postgres') return astro.props as P;
  const hit = (await paths()).find((p) => Object.entries(p.params).every(([k, v]) => String(v) === astro.params[k]));
  return hit?.props ?? null;
}

const rendered = new WeakMap<object, Promise<{ html: string; headings: MarkdownHeading[] }>>();

/** Postgres mode: an entry body as HTML (once per entry object). MDX needs the build, so it gets a notice. */
export function renderEntryHtml(entry: { body?: string; filePath?: string }) {
  let out = rendered.get(entry);
  if (!out) {
    out = entry.filePath?.endsWith('.mdx')
      ? Promise.resolve({ html: '<p>This post uses MDX, which is only supported in static/git mode.</p>', headings: [] })
      : renderMarkdownDocument(entry.body ?? '');
    rendered.set(entry, out);
  }
  return out;
}

/** Headings for a table of contents, in every mode. */
export async function entryHeadings(entry: CollectionEntry<CollectionKey>): Promise<MarkdownHeading[]> {
  if (getMode() !== 'postgres') return (await (await import('astro:content')).render(entry)).headings;
  return (await renderEntryHtml(entry)).headings;
}
```

`src/lib/content/image.ts`:
```ts
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

/**
 * An optimized image: build-time ImageMetadata (static/git) or a URL (Postgres mode: Vercel Blob, optimized by
 * /_vercel/image). Other strings (public/ paths) are served as they are.
 */
export async function resolveImage(src: ImageMetadata | string, width: number): Promise<{ src: string }> {
  if (typeof src === 'string' && !/^https?:\/\//.test(src)) return { src };
  return getImage({ src, width, inferSize: typeof src === 'string' });
}
```

`src/components/astro/EntryBody.astro`:
```astro
---
import { render, type CollectionEntry, type CollectionKey } from 'astro:content';
import { getMode } from '../../lib/mode';
import { renderEntryHtml } from '../../lib/content';

interface Props {
  entry: CollectionEntry<CollectionKey>;
}

const { entry } = Astro.props;
// Static/git: Astro's build-time render. Postgres: the same Markdown pipeline at request time.
const Content = getMode() === 'postgres' ? null : (await render(entry)).Content;
const html = Content ? '' : (await renderEntryHtml(entry)).html;
---

{Content ? <Content /> : <Fragment set:html={html} />}
```

`.github/workflows/lint.yml` — append to the run block of "Static build (no adapter output; Sveltia admin present)":
```yaml
          pnpm exec tsx --test src/lib/markdown-parity.test.ts
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec tsx --test src/lib/content/content.test.ts` → PASS.
Run: `pnpm build && pnpm exec tsx --test src/lib/markdown-parity.test.ts` → PASS for every built post/announcement (drafts skipped). If one fails, print both normalized strings and extend `normalize` only for attribute-level differences; a content difference is a real bug in `markdownOptions`.
Run: `diff -r node_modules/.cache/dist-pre-postgres dist && echo SAME` → `SAME`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content src/components/astro/EntryBody.astro src/lib/markdown.ts src/lib/markdown-parity.test.ts astro.config.mjs .github/workflows/lint.yml
git commit -m "feat(postgres): public data layer, request-time Markdown with build parity"
```

---

### Task 9: Pages read through the data layer; Postgres sitemap

**Files:**
- Create: `src/lib/content/sitemap.ts`
- Modify: `src/integrations/admin.ts`, `src/lib/search.ts`, `src/themes/editorial/data.ts`, `src/themes/editorial/Post.astro`, `src/themes/classic/Post.astro`, and the pages listed in Step 2

**Interfaces:**
- Consumes: `getEntries`, `getEntry`, `staticProps`, `entryHeadings` (Task 8), `resolveImage`, `EntryBody`, `readSiteFile` (Task 7).
- Produces: `GET /sitemap-index.xml` in postgres mode only.

- [ ] **Step 1: Mechanical swap in list pages and libraries**

Apply these rules (paths relative to each file):

1. `import { getCollection } from 'astro:content';` → `import { getEntries } from '<rel>/lib/content';`, and every `getCollection(` → `getEntries(`.
2. `import { getImage } from 'astro:assets';` → `import { resolveImage } from '<rel>/lib/content/image';`, and every `await getImage({ src: X, width: N })` → `await resolveImage(X, N)`.

Files and the lines affected (current line numbers):

| File | Rule 1 lines | Rule 2 lines |
|---|---|---|
| `src/pages/index.astro` | 5, 30, 40, 74, 81 | 6, 54, 66 |
| `src/pages/repositories.astro` | 4, 31 | — |
| `src/pages/research.astro` | 5, 11, 12 | — |
| `src/pages/cv.astro` | 5, 13 | — |
| `src/pages/blog/index.astro` | 5, 11, 15 | — |
| `src/pages/talks.astro` | 4, 8 | — |
| `src/pages/publications.astro` | 3, 13 | 4, 19 |
| `src/pages/positions/index.astro` | 4, 9 | — |
| `src/pages/projects/index.astro` | 4, 9 | — |
| `src/pages/people/index.astro` | 5, 12 | — |
| `src/pages/news/index.astro` | 4, 10 | 5, 20 |
| `src/lib/search.ts` | 1, 13–19 | — |

`src/pages/feed.xml.ts` — line 3 → `import { getEntries } from '../lib/content';`; line 8 →
```ts
  const posts = (await getEntries('posts')).filter(({ data }) => !data.draft);
```

`src/themes/editorial/data.ts` — line 1 →
```ts
import type { CollectionEntry } from 'astro:content';
import { getEntries, getEntry } from '../../lib/content';
```
and every `getCollection(` → `getEntries(` (lines 48, 49, 77, 101, 114, 123, 140, 176, 211, 220). `getEntry(` calls stay as written.

- [ ] **Step 2: Generated routes resolve per request (`staticProps`) and bodies render through `EntryBody`**

Each page keeps its `getStaticPaths` (with rule 1 applied inside it). Replace the props line with the three-line `staticProps` block. Exact edits:

`src/pages/blog/[id].astro` — imports lines 6–7 →
```ts
import { getEntries, staticProps } from '../../lib/content';
import { resolveImage } from '../../lib/content/image';
```
line 10 `getCollection` → `getEntries`; line 19 →
```ts
const props = await staticProps(Astro, getStaticPaths);
if (!props) return new Response(null, { status: 404 });
const { post } = props;
```
line 23 → `const resolved = await resolveImage(post.data.coverImage, 1200);`

`src/pages/blog/tag/[tag].astro` — line 4 → `import { getEntries, staticProps } from '../../../lib/content';`; line 8 → `getEntries`; line 22 →
```ts
const props = await staticProps(Astro, getStaticPaths);
if (!props) return new Response(null, { status: 404 });
const { tag, posts } = props;
```

`src/pages/news/category/[category].astro` — lines 4–5 →
```ts
import { getEntries, staticProps } from '../../../lib/content';
import { resolveImage } from '../../../lib/content/image';
```
lines 8 and 35 → `getEntries`; line 22 →
```ts
const props = await staticProps(Astro, getStaticPaths);
if (!props) return new Response(null, { status: 404 });
const { category, announcements: announcementsRaw } = props;
```
line 28 → `const resolved = await resolveImage(a.data.image, 200);`

`src/pages/news/[id].astro` — lines 3–4 →
```ts
import EntryBody from '../../components/astro/EntryBody.astro';
import { entryHeadings, getEntries, staticProps } from '../../lib/content';
import { resolveImage } from '../../lib/content/image';
```
line 7 → `getEntries`; lines 14–15 →
```ts
const props = await staticProps(Astro, getStaticPaths);
if (!props) return new Response(null, { status: 404 });
const { entry } = props;
const headings = await entryHeadings(entry);
```
line 19 → `const resolved = await resolveImage(entry.data.image, 1200);`; template line 31 `<Content />` → `<EntryBody entry={entry} />`.

`src/pages/projects/[id].astro` — lines 6–7 →
```ts
import EntryBody from '../../components/astro/EntryBody.astro';
import { getEntries, getEntry, staticProps } from '../../lib/content';
import { resolveImage } from '../../lib/content/image';
```
line 11 → `getEntries`; lines 18–19 →
```ts
const props = await staticProps(Astro, getStaticPaths);
if (!props) return new Response(null, { status: 404 });
const { project } = props;
```
line 23 → `const resolved = await resolveImage(project.data.image, 1200);`; template line 118 `<Content />` → `<EntryBody entry={project} />`.

`src/pages/positions/[id].astro` — line 6 →
```ts
import EntryBody from '../../components/astro/EntryBody.astro';
import { getEntries, staticProps } from '../../lib/content';
```
line 10 → `getEntries`; lines 17–18 →
```ts
const props = await staticProps(Astro, getStaticPaths);
if (!props) return new Response(null, { status: 404 });
const { position } = props;
```
template line 92 `<Content />` → `<EntryBody entry={position} />`.

`src/pages/people/[id].astro` — delete lines 2–3 (`fs`, `path`); lines 8–9 →
```ts
import { Image } from 'astro:assets';
import EntryBody from '../../components/astro/EntryBody.astro';
import { getEntries, staticProps } from '../../lib/content';
import { readSiteFile } from '../../lib/content/context';
import { resolveImage } from '../../lib/content/image';
```
lines 14, 24, 31 → `getEntries`; lines 21–22 →
```ts
const props = await staticProps(Astro, getStaticPaths);
if (!props) return new Response(null, { status: 404 });
const { person } = props;
```
lines 36–40 →
```ts
let personCvMeta: Record<string, { pdfPath: string }> = {};
try {
  personCvMeta = JSON.parse(readSiteFile('src/data/cv-people.json') ?? '{}');
} catch {}
```
line 45 → `const resolved = await resolveImage(person.data.photo, 1200);`; template line 171 `<Content />` → `<EntryBody entry={person} />`.

`src/themes/classic/Post.astro` — line 4 →
```ts
import type { CollectionEntry } from 'astro:content';
import EntryBody from '../../components/astro/EntryBody.astro';
import { entryHeadings } from '../../lib/content';
```
line 12 → `const headings = await entryHeadings(post);`; template line 33 `<Content />` → `<EntryBody entry={post} />`.

`src/themes/editorial/Post.astro` — line 2 → `import EntryBody from '../../components/astro/EntryBody.astro';`; delete line 14 (`const { Content } = await render(post);`); template line 41 → `<div class="ed-prose"><EntryBody entry={post} /></div>`.

- [ ] **Step 3: Postgres sitemap**

`src/lib/content/sitemap.ts`:
```ts
import type { APIRoute } from 'astro';
import { getSiteConfig } from '../config';
import { getEntries } from './index';

const ENTRY_ROUTES = [
  ['posts', '/blog'],
  ['announcements', '/news'],
  ['people', '/people'],
  ['projects', '/projects'],
  ['positions', '/positions'],
] as const;

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Postgres mode only (injected by src/integrations/admin.ts): @astrojs/sitemap only sees prerendered pages. */
export const GET: APIRoute = async ({ site }) => {
  const config = getSiteConfig();
  const base = (config.siteUrl || site?.toString() || '').replace(/\/$/, '');
  const paths = new Set<string>(['/']);
  for (const item of config.nav ?? []) if (item.href.startsWith('/')) paths.add(item.href);
  for (const [name, prefix] of ENTRY_ROUTES) {
    for (const entry of await getEntries(name)) {
      if ((entry.data as { draft?: boolean }).draft) continue;
      paths.add(`${prefix}/${entry.id}/`);
    }
  }
  const urls = [...paths].map((p) => `<url><loc>${escapeXml(base + p)}</loc></url>`).join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
```

`src/integrations/admin.ts` — after the API route loop in `astro:config:setup`:
```ts
        if (mode === 'postgres') {
          injectRoute({
            pattern: '/sitemap-index.xml',
            entrypoint: entry('src/lib/content/sitemap.ts'),
            prerender: false,
          });
        }
```
Extend the Task 1 integration test "postgres mode: …": after `setupHook(define, injected);` add
```ts
    assert.ok(injected.some((r) => r.pattern === '/sitemap-index.xml'));
```
and in "git mode" pass an `injected` array and assert `!injected.some((r) => r.pattern === '/sitemap-index.xml')`.

- [ ] **Step 4: Verify nothing still reads around the data layer**

Run:
```bash
grep -rnE "getCollection|getImage\(|readFileSync|node:fs|render\(" src/pages src/themes src/components/astro src/layouts src/lib/search.ts src/lib/cv.ts src/lib/config.ts
```
Expected: only `ProseEnhancements.astro` (Mermaid's `render`) and `EntryBody.astro` (`render(entry)`).

- [ ] **Step 5: Run everything**

Run: `pnpm test` → PASS.
Run: `pnpm build && diff -r node_modules/.cache/dist-pre-postgres dist && echo SAME` → `SAME`.
Run: `pnpm check:themes` → PASS.
Run: `rm -rf .vercel/output && VERCEL=1 DATABASE_URL=postgres://ci@localhost:1/ci SESSION_SECRET=ci-build-only-not-a-real-secret-0000 pnpm build` → succeeds.
Run: `pnpm astro check` → no new errors in the touched files.

- [ ] **Step 6: Commit**

```bash
git add src/pages src/themes src/lib/search.ts src/lib/content/sitemap.ts src/integrations
git commit -m "feat(postgres): pages read through the data layer; on-demand routes 404 for unknown ids; postgres sitemap"
```

---

### Task 10: Admin UI for Postgres mode

**Files:**
- Create: `src/admin/api.test.ts`
- Modify: `src/admin/api.ts`, `src/admin/AdminShell.vue`, `src/admin/DocBanners.vue`, `src/admin/Dashboard.vue`, `src/admin/Cv.vue`, `src/admin/Collection.vue`, `src/admin/PostEditor.vue`, `src/admin/Pages.vue`, `src/admin/Settings.vue`, `src/admin/admin.css`

**Interfaces:**
- Consumes: `AdminCtx.mode`, `CommitResult.warning/tags` (Tasks 4, 6); history and purge API (Task 6).
- Produces (`api.ts`): `session: { mode: AdminCtx['mode']; outage: string }` (reactive); `toast(text, href?, action?)`; `committed(result)` shows "Published" / retry toast in postgres mode; `api()` sets `session.outage` on 503.

- [ ] **Step 1: Write the failing test**

`src/admin/api.test.ts`:
```ts
import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { committed, session, toasts } from './api';

// Toasts expire on a timer; fake timers keep them from holding the test process open.
before(() => mock.timers.enable({ apis: ['setTimeout'] }));
beforeEach(() => {
  toasts.splice(0);
});

test('git mode: commit toast with the commit link', () => {
  session.mode = 'git';
  committed({ url: 'https://github.com/o/r/commit/c' });
  assert.equal(toasts[0].text, 'Committed · live in about a minute');
  assert.equal(toasts[0].href, 'https://github.com/o/r/commit/c');
});

test('postgres mode: "Published"; a failed purge offers Retry refresh', () => {
  session.mode = 'postgres';
  committed({});
  assert.equal(toasts[0].text, 'Published');
  committed({ warning: 'cache-purge-failed', tags: ['cfg:site'] });
  assert.match(toasts[1].text, /could not be refreshed/);
  assert.equal(toasts[1].action?.label, 'Retry refresh');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/admin/api.test.ts`
Expected: FAIL — `session` is not exported.

- [ ] **Step 3: Implement**

`src/admin/api.ts` — replace the toast section and `committed`, and set the outage in `api()`:
```ts
import { reactive } from 'vue';
import type { AdminCtx, CommitResult } from './types';
```
```ts
type ToastAction = { label: string; run: () => void };
export const toasts = reactive<{ id: number; text: string; href?: string; action?: ToastAction }[]>([]);
let lastToast = 0;

export function toast(text: string, href?: string, action?: ToastAction): void {
  const id = ++lastToast;
  toasts.push({ id, text, href, action });
  setTimeout(
    () => {
      const i = toasts.findIndex((t) => t.id === id);
      if (i >= 0) toasts.splice(i, 1);
    },
    action ? 20000 : 8000,
  );
}

/** Set by AdminShell from the page context; `outage` is the persistent "database unreachable" banner. */
export const session = reactive({ mode: 'git' as AdminCtx['mode'], outage: '' });

export function committed(result: Pick<CommitResult, 'url' | 'warning' | 'tags'>): void {
  if (result.warning === 'cache-purge-failed') {
    const tags = result.tags ?? [];
    return toast('Published, but the page cache could not be refreshed: visitors may see the old version.', undefined, {
      label: 'Retry refresh',
      run: () => void api('cache/purge', { body: { tags } }).then(() => toast('Cache refreshed'), report),
    });
  }
  if (session.mode === 'postgres') return toast('Published');
  toast('Committed · live in about a minute', result.url);
}
```
In `api()`, replace the two lines after `const data = …`:
```ts
  // The session ended: reloading lets the middleware send the page to the login screen.
  if (res.status === 401) location.reload();
  if (res.status === 503) session.outage = data?.error ?? 'The database is unreachable.';
  else if (res.ok) session.outage = '';
```

`src/admin/AdminShell.vue` — import `session` from `./api`; after `const base = …` add:
```ts
session.mode = props.ctx.mode;
```
replace line 100:
```vue
      <p v-if="banner || session.outage" class="adm-banner adm-banner-error" role="alert">
        {{ session.outage || banner }}
      </p>
```
and the toast row:
```vue
      <div v-for="t in toasts" :key="t.id" class="adm-toast">
        {{ t.text }}<a v-if="t.href" :href="t.href" target="_blank" rel="noopener">View commit</a
        ><button v-if="t.action" type="button" class="adm-btn adm-btn-small" @click="t.action.run()">
          {{ t.action.label }}
        </button>
      </div>
```

`src/admin/DocBanners.vue` — replace the script and prepend the History bar and dialog to the template:
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { api, committed, report, session } from './api';
import { vDialog } from './dialog';
import type { CommitResult } from './types';

/**
 * `stale`: the draft predates the loaded version; lists the top-level keys that differ (null when not stale).
 * `path`/`version`: the open document, for its History (Postgres mode only).
 */
const props = defineProps<{
  draft: boolean;
  conflict: boolean;
  stale?: string[] | null;
  path?: string;
  version?: string | null;
}>();
const emit = defineEmits<{ restore: []; discard: []; reload: [] }>();

interface Revision {
  id: string;
  version: number;
  created_at: string;
  author: string | null;
  deleted: boolean;
}
const historyOpen = ref(false);
const revisions = ref<Revision[]>([]);
const preview = ref<{ id: string; content: string | null } | null>(null);

async function showHistory() {
  historyOpen.value = true;
  preview.value = null;
  try {
    revisions.value = await api<Revision[]>(`history?path=${encodeURIComponent(props.path ?? '')}`);
  } catch (e) {
    report(e);
  }
}

async function showRevision(id: string) {
  try {
    preview.value = { id, ...(await api<{ content: string | null }>(`history/${id}`)) };
  } catch (e) {
    report(e);
  }
}

/** A 409 means the document changed since it was loaded: the toast says so; reload, then restore again. */
async function restoreRevision(id: string) {
  try {
    committed(await api<CommitResult>(`history/${id}/restore`, { body: { version: props.version ?? null } }));
    historyOpen.value = false;
    emit('reload');
  } catch (e) {
    report(e);
  }
}
</script>
```
Template additions (before the existing conflict dialog):
```vue
  <p v-if="session.mode === 'postgres' && path" class="adm-history-bar">
    <button type="button" class="adm-btn adm-btn-small" @click="showHistory">History</button>
  </p>
  <div
    v-if="historyOpen"
    v-dialog
    class="adm-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="adm-history-title"
  >
    <div>
      <h2 id="adm-history-title" class="adm-h2">History</h2>
      <p v-if="revisions.length === 0" class="adm-muted">No saved versions yet.</p>
      <ol class="adm-history">
        <li v-for="r in revisions" :key="r.id">
          <span
            >{{ new Date(r.created_at).toLocaleString() }} · {{ r.author ?? 'unknown' }}<strong v-if="r.deleted">
              · deleted</strong
            ></span
          >
          <span v-if="!r.deleted" class="adm-actions">
            <button type="button" class="adm-btn adm-btn-small" @click="showRevision(r.id)">Preview</button>
            <button type="button" class="adm-btn adm-btn-small" @click="restoreRevision(r.id)">Restore</button>
          </span>
        </li>
      </ol>
      <pre v-if="preview" class="adm-history-preview" aria-label="Revision preview">{{ preview.content }}</pre>
      <div class="adm-actions">
        <button type="button" class="adm-btn" @click="historyOpen = false">Close</button>
      </div>
    </div>
  </div>
```
(`$emit('…')` calls already in the template keep working; the existing `defineEmits` is replaced by the `emit` constant above.)

`src/admin/admin.css` — append:
```css
.adm-history-bar {
  display: flex;
  justify-content: flex-end;
  margin: 0 0 8px;
}
.adm-history {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  max-height: 50vh;
  overflow: auto;
}
.adm-history li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--adm-rule, #e4e7ee);
}
.adm-history-preview {
  max-height: 40vh;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 13px;
}
```

Pass `path` and `version` at every `<DocBanners` call site (add the two attributes):

| File | `:path` | `:version` |
|---|---|---|
| `Collection.vue` | `selected && !creating ? path(selected) : undefined` | `doc.version` |
| `PostEditor.vue` | `isNew ? undefined : \`src/content/posts/${slug}.md\`` | `doc.version` |
| `Cv.vue` | `'config/cv.yml'` | `doc.version` |
| `Pages.vue` (home banner) | `'config/site.yml'` | `home.version` |
| `Pages.vue` (research banner) | `'config/research.yml'` | `research.version` |
| `Settings.vue` (site banner) | `'config/site.yml'` | `site.version` |
| `Settings.vue` (feeds banner) | `'config/feeds.yml'` | `feeds.version` |

(Check `Collection.vue`'s `selected`/`creating` refs and `Pages.vue`'s file mapping by reading the `save` functions shown; if `home` edits a different file, use the path that function passes to `doc.save`.)

`src/admin/Dashboard.vue` — extend `DashboardData`:
```ts
  mode: 'static' | 'git' | 'postgres';
  backup: { at: string; ok: boolean; changed?: number; commit?: string; skipped?: string; error?: string } | null;
```
add a fifth tile after "CV last updated":
```vue
        <div class="adm-card adm-tile">
          <b>{{ d.mode === 'postgres' ? 'Postgres' : 'Git' }}</b><span>Content storage</span>
        </div>
```
and, in postgres mode, a backup line right after the tiles `</div>`:
```vue
      <p v-if="d.mode === 'postgres'" class="adm-muted" role="status">
        Last backup:
        <template v-if="!d.backup">never</template>
        <template v-else>
          {{ new Date(d.backup.at).toLocaleString() }} ·
          {{ d.backup.skipped ? `skipped (${d.backup.skipped})` : d.backup.ok ? `${d.backup.changed ?? 0} files` : `failed: ${d.backup.error}` }}
          <a v-if="d.backup.commit" :href="d.backup.commit" target="_blank" rel="noopener">commit</a>
        </template>
      </p>
```

`src/admin/Cv.vue` — line 47 → `const props = defineProps<{ ctx: AdminCtx }>();` (first confirm no other `props` binding exists in the file: `grep -n "\bprops\b" src/admin/Cv.vue`). In `checkPdf`, first line: `if (props.ctx.mode === 'postgres') return;`. Replace the Generate PDF button:
```vue
      <button type="button" class="adm-btn" :disabled="ctx.mode === 'postgres'" @click="generatePdf">
        Generate PDF
      </button>
      <span v-if="ctx.mode === 'postgres'" class="adm-muted"
        >PDF generation in Postgres mode — coming in sub-project 4</span
      >
```

- [ ] **Step 4: Run tests and a dev smoke check**

Run: `pnpm exec tsx --test src/admin/api.test.ts` → PASS; `pnpm test` → all PASS.
Run: `pnpm exec playwright test tests/e2e/admin.spec.ts` → PASS (git-mode admin unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/admin
git commit -m "feat(postgres): admin Published toast, purge retry, outage banner, History, mode badge"
```

---

### Task 11: Seed and export

**Files:**
- Create: `src/lib/db-seed.ts`, `src/lib/db-seed.test.ts`, `scripts/db-setup.ts`, `scripts/db-export.ts`
- Modify: `src/lib/admin/paths.ts`, `package.json`

**Interfaces:**
- Consumes: `migrate`, `Sql` (Task 2); `prepareUpload` (Task 5); `parseMarkdown`; `loadAdminSettings`.
- Produces:
  - `paths.ts`: `DATA_FILES: string[]`, `isDocumentPath(path: string): boolean`.
  - `db-seed.ts`: `seedFiles(root): { documents: string[]; skipped: string[] }`, `mediaFiles(root, mediaFolder): string[]`, `resolveReference(ref, docPath, publicFolder, mediaFolder): string | null`, `rewriteReferences(docPath, content, urls: Map<string, string>, folders): string`, `exportTarget(dir, docPath): string | null`.
  - Scripts `pnpm db:setup [--force]`, `pnpm db:export [dir]`.

- [ ] **Step 1: Write the failing test**

`src/lib/db-seed.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportTarget, mediaFiles, resolveReference, rewriteReferences, seedFiles } from './db-seed';
import { isDocumentPath } from './admin/paths';

const folders = { publicFolder: '/src/assets/images', mediaFolder: 'src/assets/images' };

function repo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-'));
  for (const [p, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), content);
  }
  return root;
}

test('seedFiles copies config, entries, MDX and data files, and reports what it can’t copy', () => {
  const root = repo({
    'config/site.yml': 'title: A',
    'src/content/posts/hello.md': '---\ntitle: H\n---\n',
    'src/content/posts/legacy.mdx': '---\ntitle: L\n---\n',
    'src/content/posts/Bad_Name.md': '---\ntitle: B\n---\n',
    'src/content/posts/2024/nested.md': '---\ntitle: N\n---\n',
    'src/data/feeds.json': '[]',
    'src/data/cv.json': '{}',
  });
  const { documents, skipped } = seedFiles(root);
  assert.deepEqual(documents.sort(), [
    'config/site.yml',
    'src/content/posts/hello.md',
    'src/content/posts/legacy.mdx',
    'src/data/cv.json',
    'src/data/feeds.json',
  ]);
  assert.deepEqual(skipped.sort(), ['src/content/posts/2024/nested.md', 'src/content/posts/Bad_Name.md']);
});

test('mediaFiles: images from media_folder and public/images only', () => {
  const root = repo({ 'src/assets/images/a.png': 'x', 'src/assets/images/notes.txt': 'x', 'public/images/b.svg': 'x' });
  assert.deepEqual(mediaFiles(root, 'src/assets/images').sort(), ['public/images/b.svg', 'src/assets/images/a.png']);
});

test('resolveReference: public URLs, public_folder URLs, relative paths; external ignored', () => {
  assert.equal(resolveReference('/images/x.svg', 'config/site.yml', folders.publicFolder, folders.mediaFolder), 'public/images/x.svg');
  assert.equal(resolveReference('/src/assets/images/y.png', 'src/content/posts/a.md', folders.publicFolder, folders.mediaFolder), 'src/assets/images/y.png');
  assert.equal(
    resolveReference('../../assets/images/people/p.svg', 'src/content/people/jane.md', folders.publicFolder, folders.mediaFolder),
    'src/assets/images/people/p.svg',
  );
  assert.equal(resolveReference('https://cdn.example/x.png', 'config/site.yml', folders.publicFolder, folders.mediaFolder), null);
  assert.equal(resolveReference('plain text', 'config/site.yml', folders.publicFolder, folders.mediaFolder), null);
});

test('relative front-matter paths are rewritten; so are YAML values and Markdown images', () => {
  const urls = new Map([
    ['src/assets/images/people/p.svg', 'https://b.public.blob.vercel-storage.com/p-111111.svg'],
    ['public/images/hero.svg', 'https://b.public.blob.vercel-storage.com/hero-222222.svg'],
    ['src/assets/images/fig.png', 'https://b.public.blob.vercel-storage.com/fig-333333.png'],
  ]);
  const person = "---\nname: Jane\nphoto: '../../assets/images/people/p.svg'\n---\n\nBio\n";
  assert.match(rewriteReferences('src/content/people/jane.md', person, urls, folders), /photo: 'https:\/\/b\.public\.blob\.vercel-storage\.com\/p-111111\.svg'/);
  const site = "hero:\n  image: '/images/hero.svg' # figure\nother: '/images/missing.svg'\n";
  const out = rewriteReferences('config/site.yml', site, urls, folders);
  assert.match(out, /image: 'https:\/\/b\.public\.blob\.vercel-storage\.com\/hero-222222\.svg' # figure/);
  assert.match(out, /other: '\/images\/missing\.svg'/);
  const post = '---\ntitle: T\n---\n\n![Fig](/src/assets/images/fig.png)\n\n<img src="/images/hero.svg" alt="">\n[link](https://x.y)\n';
  const rewritten = rewriteReferences('src/content/posts/t.md', post, urls, folders);
  assert.match(rewritten, /!\[Fig\]\(https:\/\/b\.public\.blob\.vercel-storage\.com\/fig-333333\.png\)/);
  assert.match(rewritten, /<img src="https:\/\/b\.public\.blob\.vercel-storage\.com\/hero-222222\.svg"/);
  assert.match(rewritten, /\[link\]\(https:\/\/x\.y\)/);
});

test('exportTarget: only document paths, never outside the folder', () => {
  const dir = '/tmp/site';
  assert.equal(exportTarget(dir, 'config/site.yml'), path.resolve(dir, 'config/site.yml'));
  assert.equal(exportTarget(dir, '../escape.yml'), null);
  assert.equal(exportTarget(dir, 'config/../../etc/passwd'), null);
  assert.equal(exportTarget(dir, 'scripts/evil.ts'), null);
});

test('isDocumentPath: allowlist minus images, plus MDX and data files', () => {
  assert.equal(isDocumentPath('config/site.yml'), true);
  assert.equal(isDocumentPath('src/content/posts/a.mdx'), true);
  assert.equal(isDocumentPath('src/data/cv-people.json'), true);
  assert.equal(isDocumentPath('src/assets/images/a.png'), false);
  assert.equal(isDocumentPath('package.json'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/lib/db-seed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/admin/paths.ts` — add after `assertAllowed`:
```ts
/** Read-only data files Postgres mode keeps beside the editable ones: pages read them, the admin never writes them. */
export const DATA_FILES = ['src/data/cv.json', 'src/data/cv-people.json'];

/** A file Postgres mode stores as a document: the write allowlist without images, plus MDX entries and DATA_FILES. */
export function isDocumentPath(path: string): boolean {
  if (DATA_FILES.includes(path)) return true;
  const mdx = /^src\/content\/([^/]+)\/([^/]+)\.mdx$/.exec(path);
  if (mdx) return COLLECTIONS.includes(mdx[1] as CollectionName) && SLUG.test(mdx[2]);
  try {
    assertAllowed(path);
  } catch {
    return false;
  }
  return !isMediaPath(path);
}
```

`src/lib/db-seed.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import {
  COLLECTIONS,
  CONFIG_FILES,
  DATA_FILES,
  FEEDS_JSON,
  SITE_MEDIA,
  collectionDir,
  configPath,
  isDocumentPath,
} from './admin/paths';
import { parseMarkdown } from './admin/serialize';

const IMAGE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

/** Repo-relative POSIX paths of the files under `dir`; [] when it doesn't exist. */
function walk(root: string, dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(path.join(root, dir), { recursive: true, encoding: 'utf8' });
  } catch {
    return [];
  }
  return names
    .map((n) => `${dir}/${n.split(path.sep).join('/')}`)
    .filter((p) => fs.statSync(path.join(root, p)).isFile());
}

/** The repo files Postgres mode stores, and the content files it can't (reported, never silently dropped). */
export function seedFiles(root: string): { documents: string[]; skipped: string[] } {
  const candidates = [
    ...CONFIG_FILES.map(configPath),
    FEEDS_JSON,
    ...DATA_FILES,
    ...COLLECTIONS.flatMap((name) => walk(root, collectionDir(name))),
  ].filter((p) => fs.existsSync(path.join(root, p)));
  return { documents: candidates.filter(isDocumentPath), skipped: candidates.filter((p) => !isDocumentPath(p)) };
}

export function mediaFiles(root: string, mediaFolder: string): string[] {
  return [...new Set([...walk(root, mediaFolder), ...walk(root, SITE_MEDIA.dir)])].filter((p) => IMAGE.test(p));
}

/** The repo file a reference inside `docPath` points at: a public/ URL, a public_folder URL, or a relative path. */
export function resolveReference(ref: string, docPath: string, publicFolder: string, mediaFolder: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) return null;
  if (ref.startsWith(`${publicFolder}/`)) return mediaFolder + ref.slice(publicFolder.length);
  if (ref.startsWith('/')) return `public${ref}`;
  if (ref.startsWith('./') || ref.startsWith('../')) return path.posix.join(path.posix.dirname(docPath), ref);
  return null;
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function references(docPath: string, content: string): string[] {
  try {
    if (docPath.endsWith('.yml')) return strings(parse(content));
    if (!/\.mdx?$/.test(docPath)) return [];
    const { data, body } = parseMarkdown(content);
    return [
      ...strings(data),
      ...[...body.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)].map((m) => m[1]),
      ...[...body.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]),
    ];
  } catch {
    return []; // unparsable documents are copied as they are
  }
}

/** Rewrites image references (YAML and front-matter string values, Markdown images, <img src>) to Blob URLs. */
export function rewriteReferences(
  docPath: string,
  content: string,
  urls: Map<string, string>,
  folders: { publicFolder: string; mediaFolder: string },
): string {
  let out = content;
  // Longest first, so a reference that contains a shorter one is replaced whole.
  for (const ref of [...new Set(references(docPath, content))].sort((a, b) => b.length - a.length)) {
    const target = resolveReference(ref, docPath, folders.publicFolder, folders.mediaFolder);
    const url = target ? urls.get(path.posix.normalize(target)) : undefined;
    if (url) out = out.split(ref).join(url);
  }
  return out;
}

/** Where db:export writes a document, or null: the database never chooses where files go. */
export function exportTarget(dir: string, docPath: string): string | null {
  if (!isDocumentPath(docPath)) return null;
  const base = path.resolve(dir);
  const target = path.resolve(base, docPath);
  return target.startsWith(base + path.sep) ? target : null;
}
```

`scripts/db-setup.ts`:
```ts
#!/usr/bin/env tsx
/**
 * pnpm db:setup [--force] — copies this repo's content into Postgres (DATABASE_URL) and its images into Vercel Blob
 * (BLOB_READ_WRITE_TOKEN), rewriting image references to Blob URLs. Run once, locally, after `vercel env pull`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { put } from '@vercel/blob';
import postgres from 'postgres';
import { MediaError, prepareUpload } from '../src/lib/admin/media';
import { loadAdminSettings } from '../src/lib/admin/settings';
import type { Sql } from '../src/lib/db';
import { migrate } from '../src/lib/db-migrate';
import { mediaFiles, rewriteReferences, seedFiles } from '../src/lib/db-seed';

try {
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local: use the shell's environment
}
const ROOT = path.resolve(import.meta.dirname, '..');
if (!process.env.DATABASE_URL || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('DATABASE_URL and BLOB_READ_WRITE_TOKEN must be set (run `vercel env pull` first).');
  process.exit(1);
}
const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const sql = client as unknown as Sql;
try {
  await migrate(sql, path.join(ROOT, 'migrations'));
  const [{ count }] = await sql<{ count: number }>`select count(*)::int as count from documents`;
  if (count > 0 && !process.argv.includes('--force')) {
    console.error(`The database already has ${count} documents. Re-run with --force to overwrite them with the repo's files.`);
    process.exitCode = 1;
  } else {
    const { mediaFolder, publicFolder } = loadAdminSettings(ROOT);
    const urls = new Map<string, string>();
    for (const file of mediaFiles(ROOT, mediaFolder)) {
      const bytes = fs.readFileSync(path.join(ROOT, file));
      try {
        const { filename, contentType } = prepareUpload(path.basename(file), bytes);
        const { url } = await put(filename, bytes, { access: 'public', contentType, addRandomSuffix: false, allowOverwrite: true });
        await sql`insert into media (url, pathname, size, content_type)
          values (${url}, ${filename}, ${bytes.length}, ${contentType}) on conflict (url) do nothing`;
        urls.set(file, url);
      } catch (e) {
        if (!(e instanceof MediaError)) throw e;
        console.warn(`  image not uploaded: ${file} (${e.message})`);
      }
    }
    const { documents, skipped } = seedFiles(ROOT);
    for (const file of documents) {
      const content = rewriteReferences(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), urls, { publicFolder, mediaFolder });
      await sql.begin(async (tx) => {
        const [row] = await tx<{ version: number }>`
          insert into documents (path, content, updated_by) values (${file}, ${content}, 'seed')
          on conflict (path) do update set content = excluded.content, version = documents.version + 1,
            updated_at = now(), updated_by = 'seed'
          returning version`;
        await tx`insert into revisions (path, content, version, author) values (${file}, ${content}, ${row.version}, 'seed')`;
      });
    }
    console.log(`Documents: ${documents.length}`);
    console.log(`Images uploaded to Blob: ${urls.size}`);
    if (skipped.length) {
      console.log(`Not copied (Postgres mode edits only slug-named files the admin allows):\n  ${skipped.join('\n  ')}`);
    }
  }
} finally {
  await client.end();
}
```

`scripts/db-export.ts`:
```ts
#!/usr/bin/env tsx
/** pnpm db:export [dir] — writes every database document to `dir` (default: the repo) at its path. Images stay Blob URLs. */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import type { Sql } from '../src/lib/db';
import { exportTarget } from '../src/lib/db-seed';

try {
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local: use the shell's environment
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (run `vercel env pull` first).');
  process.exit(1);
}
const dir = path.resolve(process.argv[2] ?? path.resolve(import.meta.dirname, '..'));
const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const rows = await (client as unknown as Sql)<{ path: string; content: string }>`select path, content from documents order by path`;
  let written = 0;
  for (const row of rows) {
    const target = exportTarget(dir, row.path);
    if (!target) {
      console.warn(`  skipped ${row.path}: not a document path`);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, row.content);
    written++;
  }
  console.log(`Wrote ${written} files to ${dir}`);
} finally {
  await client.end();
}
```

`package.json` scripts — add after `db:migrate`:
```json
    "db:setup": "tsx scripts/db-setup.ts",
    "db:export": "tsx scripts/db-export.ts",
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec tsx --test src/lib/db-seed.test.ts` → PASS. `pnpm test` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db-seed.ts src/lib/db-seed.test.ts src/lib/admin/paths.ts scripts/db-setup.ts scripts/db-export.ts package.json
git commit -m "feat(postgres): db:setup seeds documents and Blob images; db:export writes them back"
```

---

### Task 12: Daily backup cron

**Files:**
- Create: `src/lib/admin/backup.ts`, `src/lib/admin/backup.test.ts`, `src/admin/routes/api/cron/backup.ts`, `vercel.json`
- Modify: `src/lib/admin/github-store.ts`, `src/lib/admin/github-store.test.ts`, `src/middleware.ts`

**Interfaces:**
- Consumes: `GitHubStore`, `githubConfig`; `isDocumentPath`, `BACKUP_JSON`; `gitBlobSha`; `getStore`, `getSql`, `getMode`.
- Produces:
  - `GitHubStore.tree(): Promise<Map<string, string> | null>`; `GitHubStore.createBranch(): Promise<void>`.
  - `backup.ts`: `BACKUP_BRANCH = 'content-backup'`; `interface BackupResult { at: string; ok: boolean; changed?: number; commit?: string; skipped?: string; error?: string }`; `backupToGit(sql, gh: Pick<GitHubStore, 'tree' | 'createBranch' | 'commit'>, now?): Promise<BackupResult>`; `recordBackup(store: ContentStore, result): Promise<void>`.
  - `GET /api/admin/cron/backup` (Bearer `CRON_SECRET`).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/admin/github-store.test.ts`:
```ts
test('tree: blobs of the branch by path; null when the branch is missing', async () => {
  const { fetchFn } = fakeGitHub({
    'GET /git/trees/main?recursive=1': () => ({
      json: { truncated: false, tree: [{ path: 'a.md', type: 'blob', sha: 's1' }, { path: 'src', type: 'tree', sha: 't' }] },
    }),
  });
  assert.deepEqual(await new GitHubStore(cfg, author, fetchFn).tree(), new Map([['a.md', 's1']]));
  const missing = fakeGitHub({});
  assert.equal(await new GitHubStore(cfg, author, missing.fetchFn).tree(), null);
});

test('createBranch: from the default branch head', async () => {
  const { fetchFn, calls } = fakeGitHub({
    'GET ': () => ({ json: { default_branch: 'main' } }),
    'GET /git/ref/heads/main': () => ({ json: { object: { sha: 'head1' } } }),
    'POST /git/refs': () => ({ status: 201, json: {} }),
  });
  await new GitHubStore({ ...cfg, branch: 'content-backup' }, author, fetchFn).createBranch();
  assert.deepEqual(calls.at(-1), {
    method: 'POST',
    path: '/git/refs',
    body: { ref: 'refs/heads/content-backup', sha: 'head1' },
  });
});
```
(The fake maps `https://api.github.com/repos/o/r` to the key `'GET '`: path `''` + no query.)

`src/lib/admin/backup.test.ts`:
```ts
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../db-migrate';
import { pgliteSql } from '../pglite-sql';
import { setSqlForTests, type Sql } from '../db';
import { backupToGit } from './backup';
import { setStoreForTests } from './get-store';
import { PostgresStore } from './postgres-store';
import { gitBlobSha, type Change } from './store';
import { GET as cron } from '../../admin/routes/api/cron/backup';

let sql: Sql;
before(async () => {
  sql = pgliteSql();
  await migrate(sql);
  await sql`insert into documents (path, content) values
    ('config/site.yml', 'title: A'), ('src/content/posts/new.md', 'changed'), ('src/content/posts/same.md', 'same')`;
});

function fakeGh(tree: Map<string, string> | null) {
  const commits: { changes: Change[]; base: Record<string, string | null> }[] = [];
  let branches = 0;
  return {
    commits,
    get branches() {
      return branches;
    },
    gh: {
      tree: async () => tree,
      createBranch: async () => {
        branches++;
        tree = new Map();
      },
      commit: async (changes: Change[], _m: string, base: Record<string, string | null>) => {
        commits.push({ changes, base });
        return { id: 'c1', url: 'https://github.com/o/r/commit/c1', versions: {} };
      },
    },
  };
}

test('backup writes changed documents, deletes removed ones, keeps code and images', async () => {
  const tree = new Map([
    ['config/site.yml', gitBlobSha('title: A')], // unchanged
    ['src/content/posts/same.md', gitBlobSha('same')], // unchanged
    ['src/content/posts/new.md', 'oldsha'], // changed
    ['src/content/posts/gone.md', 'gonesha'], // deleted in the database
    ['src/assets/images/a.png', 'imgsha'], // images are never deleted
    ['package.json', 'pkgsha'], // code is never touched
  ]);
  const { gh, commits } = fakeGh(tree);
  const result = await backupToGit(sql, gh, new Date('2026-10-06T03:00:00Z'));
  assert.deepEqual(result, { at: '2026-10-06T03:00:00.000Z', ok: true, changed: 2, commit: 'https://github.com/o/r/commit/c1' });
  assert.deepEqual(commits[0].changes, [
    { path: 'src/content/posts/new.md', content: 'changed' },
    { path: 'src/content/posts/gone.md', content: null },
  ]);
  assert.deepEqual(commits[0].base, { 'src/content/posts/new.md': 'oldsha', 'src/content/posts/gone.md': 'gonesha' });
});

test('no changes → no commit', async () => {
  const docs = await sql<{ path: string; content: string }>`select path, content from documents`;
  const { gh, commits } = fakeGh(new Map(docs.map((d) => [d.path, gitBlobSha(d.content)])));
  assert.deepEqual(await backupToGit(sql, gh, new Date('2026-10-06T03:00:00Z')), { at: '2026-10-06T03:00:00.000Z', ok: true, changed: 0 });
  assert.equal(commits.length, 0);
});

test('a missing branch is created from the default branch first', async () => {
  const fake = fakeGh(null);
  await backupToGit(sql, fake.gh);
  assert.equal(fake.branches, 1);
  assert.equal(fake.commits[0].changes.length, 3);
});

test('cron: 401 without or with a wrong secret; git mode skips', async () => {
  const saved = { CRON_SECRET: process.env.CRON_SECRET, VERCEL: process.env.VERCEL, DATABASE_URL: process.env.DATABASE_URL };
  const req = (auth?: string) =>
    cron({ request: new Request('https://site.test/api/admin/cron/backup', { headers: auth ? { authorization: auth } : {} }) } as never);
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await req('Bearer anything')).status, 401);
    process.env.CRON_SECRET = 's3cret';
    assert.equal((await req()).status, 401);
    assert.equal((await req('Bearer wrong!')).status, 401);
    process.env.VERCEL = '1';
    delete process.env.DATABASE_URL;
    assert.deepEqual(await (await req('Bearer s3cret')).json(), { skipped: 'not in Postgres mode' });
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('cron without GITHUB_TOKEN records { skipped: "no token" } as src/data/backup.json', async () => {
  const saved = { CRON_SECRET: process.env.CRON_SECRET, VERCEL: process.env.VERCEL, DATABASE_URL: process.env.DATABASE_URL, GITHUB_TOKEN: process.env.GITHUB_TOKEN };
  Object.assign(process.env, { CRON_SECRET: 's3cret', VERCEL: '1', DATABASE_URL: 'postgres://test' });
  delete process.env.GITHUB_TOKEN;
  setSqlForTests(sql);
  setStoreForTests((a) => new PostgresStore(sql, a, { purge: async () => {}, put: async () => ({ url: '' }), del: async () => {} }));
  try {
    const res = await cron({ request: new Request('https://site.test/x', { headers: { authorization: 'Bearer s3cret' } }) } as never);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).skipped, 'no token');
    const [row] = await sql<{ content: string }>`select content from documents where path = 'src/data/backup.json'`;
    assert.equal(JSON.parse(row.content).skipped, 'no token');
  } finally {
    setSqlForTests(null);
    setStoreForTests(null);
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

after(() => setSqlForTests(null));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/lib/admin/backup.test.ts src/lib/admin/github-store.test.ts`
Expected: FAIL — `./backup` not found; `tree is not a function`.

- [ ] **Step 3: Implement**

`src/lib/admin/github-store.ts` — add to the class:
```ts
  /** Every file on the branch with its blob sha; null when the branch doesn't exist. */
  async tree(): Promise<Map<string, string> | null> {
    const t = await this.gh<{ truncated: boolean; tree: { path: string; type: string; sha: string }[] }>(
      'GET',
      `/git/trees/${encodePath(this.cfg.branch)}?recursive=1`,
      undefined,
      true,
    );
    if (!t) return null;
    if (t.truncated) throw new UpstreamError('The repository tree is too large to compare in one request.');
    return new Map(t.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
  }

  /** Creates the configured branch at the head of the repository's default branch. */
  async createBranch(): Promise<void> {
    const repo = await this.gh<{ default_branch: string }>('GET', '');
    const head = await this.gh<{ object: { sha: string } }>('GET', `/git/ref/heads/${encodePath(repo!.default_branch)}`);
    await this.gh('POST', '/git/refs', { ref: `refs/heads/${this.cfg.branch}`, sha: head!.object.sha });
  }
```

`src/lib/admin/backup.ts`:
```ts
import type { Sql } from '../db';
import type { GitHubStore } from './github-store';
import { BACKUP_JSON, isDocumentPath } from './paths';
import { gitBlobSha, type Change, type ContentStore } from './store';

export const BACKUP_BRANCH = 'content-backup';

export interface BackupResult {
  at: string;
  ok: boolean;
  changed?: number;
  commit?: string;
  skipped?: string;
  error?: string;
}

/**
 * Mirrors every database document onto the backup branch in one commit: changed files written, files deleted in the
 * database deleted on the branch. Code and images on the branch are never touched. No changes → no commit.
 */
export async function backupToGit(
  sql: Sql,
  gh: Pick<GitHubStore, 'tree' | 'createBranch' | 'commit'>,
  now = new Date(),
): Promise<BackupResult> {
  const at = now.toISOString();
  const docs = await sql<{ path: string; content: string }>`
    select path, content from documents where path <> ${BACKUP_JSON} order by path`;
  let tree = await gh.tree();
  if (!tree) {
    await gh.createBranch();
    tree = (await gh.tree()) ?? new Map();
  }
  const inDb = new Set(docs.map((d) => d.path));
  const changes: Change[] = [];
  const base: Record<string, string | null> = {};
  for (const d of docs) {
    const sha = tree.get(d.path) ?? null;
    if (sha === gitBlobSha(d.content)) continue;
    changes.push({ path: d.path, content: d.content });
    base[d.path] = sha;
  }
  for (const [p, sha] of tree) {
    if (inDb.has(p) || p === BACKUP_JSON || !isDocumentPath(p)) continue;
    changes.push({ path: p, content: null });
    base[p] = sha;
  }
  if (changes.length === 0) return { at, ok: true, changed: 0 };
  const result = await gh.commit(changes, `Content backup ${at.slice(0, 10)}`, base);
  return { at, ok: true, changed: changes.length, commit: result.url };
}

/** The dashboard shows the last result. */
export async function recordBackup(store: ContentStore, result: BackupResult): Promise<void> {
  const current = await store.read(BACKUP_JSON);
  await store.commit([{ path: BACKUP_JSON, content: `${JSON.stringify(result, null, 2)}\n` }], 'Record backup', {
    [BACKUP_JSON]: current?.version ?? null,
  });
}
```

`src/admin/routes/api/cron/backup.ts`:
```ts
import { timingSafeEqual } from 'node:crypto';
import type { APIRoute } from 'astro';
import { BACKUP_BRANCH, backupToGit, recordBackup, type BackupResult } from '../../../../lib/admin/backup';
import { getStore } from '../../../../lib/admin/get-store';
import { GitHubStore, githubConfig } from '../../../../lib/admin/github-store';
import { json } from '../../../../lib/admin/http';
import { getSql } from '../../../../lib/db';
import { getMode } from '../../../../lib/mode';

export const prerender = false;

const BOT = { name: 'ScholarOS backup', email: 'scholaros-backup@users.noreply.github.com' };

/** Never open: no CRON_SECRET means every call is refused. */
function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const got = Buffer.from(header);
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Vercel Cron (vercel.json), daily at 03:00 UTC: snapshot the database onto the content-backup branch. */
export const GET: APIRoute = async ({ request }) => {
  if (!authorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (getMode() !== 'postgres') return json({ skipped: 'not in Postgres mode' });
  let result: BackupResult;
  if (!process.env.GITHUB_TOKEN) {
    result = { at: new Date().toISOString(), ok: true, skipped: 'no token' };
  } else {
    try {
      const gh = new GitHubStore({ ...githubConfig(process.env), branch: BACKUP_BRANCH }, BOT);
      result = await backupToGit(getSql(), gh);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[cron/backup]', e);
      result = { at: new Date().toISOString(), ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  await recordBackup(getStore(BOT), result);
  return json(result, result.ok ? 200 : 502);
};
```

`src/middleware.ts` — the cron authenticates with its own secret, not a session. Change the open-route condition:
```ts
  } else if (
    pathname.startsWith('/api/admin/auth/') ||
    pathname.startsWith('/api/admin/cron/') ||
    pathname === `/${adminPath}/login`
  ) {
```

`vercel.json`:
```json
{
  "crons": [{ "path": "/api/admin/cron/backup", "schedule": "0 3 * * *" }]
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec tsx --test src/lib/admin/backup.test.ts src/lib/admin/github-store.test.ts src/middleware.test.ts` → PASS. `pnpm test` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/backup.ts src/lib/admin/backup.test.ts src/lib/admin/github-store.ts src/lib/admin/github-store.test.ts src/admin/routes/api/cron/backup.ts src/middleware.ts vercel.json
git commit -m "feat(postgres): daily backup of the database to the content-backup branch"
```

---

### Task 13: Setup docs and final verification

**Files:**
- Modify: `README.md`, `.env.example`

- [ ] **Step 1: `.env.example`** — append:
```
# Postgres mode (README → "Postgres mode"). Set by the Neon and Vercel Blob integrations:
DATABASE_URL=
BLOB_READ_WRITE_TOKEN=
# At least 32 random characters; Vercel Cron sends it as `Authorization: Bearer …`
CRON_SECRET=
```

- [ ] **Step 2: README** — add after the section "Deploy on Vercel (custom admin)":
```markdown
### Postgres mode (live edits, no rebuilds)

With a Postgres database on Vercel, content lives in the database instead of git: a published edit shows on the
next page load, images go to Vercel Blob, and pages are cached on Vercel's CDN and refreshed precisely when you
publish. Git stays a safety net: every save keeps a revision (History in the admin) and a daily job commits all
content to the `content-backup` branch.

1. In the Vercel project: **Storage → Marketplace → Neon** (sets `DATABASE_URL`) and **Storage → Blob**
   (sets `BLOB_READ_WRITE_TOKEN`). Add `CRON_SECRET` (`openssl rand -base64 48`). Keep `GITHUB_TOKEN` for the backup.
2. Locally: `vercel env pull .env.local`, then `pnpm db:setup`. It creates the tables, copies `config/`,
   `src/content/` and `src/data/` into the database, uploads `src/assets/images` and `public/images` to Blob, and
   rewrites image references to Blob URLs. It lists any file it could not copy.
3. Redeploy. The admin dashboard now shows **Postgres**.

Notes: MDX posts are shown with a notice (MDX needs a build). PDF CV generation arrives in a later release.
Editing `adminUsers` takes effect after a redeploy.

**Back to git mode:** `pnpm db:export` (writes the database's files into the repo; image references stay Blob
URLs), commit, remove `DATABASE_URL` from the project, redeploy.
```

- [ ] **Step 3: Full verification**

```bash
pnpm test
pnpm build && diff -r node_modules/.cache/dist-pre-postgres dist && echo SAME
pnpm exec tsx --test src/lib/markdown-parity.test.ts
pnpm check:themes
rm -rf .vercel/output && VERCEL=1 SESSION_SECRET=ci-build-only-not-a-real-secret-0000 pnpm build && test -e .vercel/output/static/index.html && echo GIT-OK
rm -rf .vercel/output && VERCEL=1 DATABASE_URL=postgres://ci@localhost:1/ci SESSION_SECRET=ci-build-only-not-a-real-secret-0000 pnpm build && test ! -e .vercel/output/static/index.html && echo PG-OK
pnpm astro check
pnpm lint
```
Expected: all tests PASS; `SAME`; `GIT-OK`; `PG-OK`; no new check/lint errors in touched files.

- [ ] **Step 4: Manual check on a Vercel preview (Neon + Blob), per spec §11** — record results in the PR description:
1. `pnpm db:setup` against the preview database; deploy.
2. `curl -sI https://<preview>/blog/<post>/ | grep -i x-vercel-cache` twice → `MISS` then `HIT`.
3. Edit the post in the admin → toast "Published"; reload → new content; headers `MISS` then `HIT`.
4. Edit `site.yml` title → every page shows it on next load.
5. `curl -s -o /dev/null -w '%{http_code}' https://<preview>/blog/does-not-exist/` → `404` (the 404 page renders).
6. History → Preview → Restore an older revision of the post; the page shows it.
7. Upload an image in Media, use it as a cover; the page's `<img>` points at `/_vercel/image?url=…blob…`.
8. `curl -H "Authorization: Bearer $CRON_SECRET" https://<preview>/api/admin/cron/backup` → JSON with `commit`; the `content-backup` branch has the commit; dashboard shows the time.
9. `curl https://<preview>/api/admin/cron/backup` (no header) → `401`.

- [ ] **Step 5: Clean up and commit**

```bash
rm -rf node_modules/.cache/dist-pre-postgres
git add README.md .env.example
git commit -m "docs: Postgres mode setup and switching back"
```
