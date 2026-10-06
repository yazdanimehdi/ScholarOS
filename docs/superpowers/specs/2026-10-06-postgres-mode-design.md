# Postgres mode on Vercel — design spec

Date: 2026-10-06 · Status: approved in chat, pending written-spec review
Sub-project 3 of 4. Depends on sub-project 1 (editorial theme, `src/lib/cv.ts`) and
sub-project 2 (`ContentStore`, shared schemas, path allowlist, admin, Vercel integration).

## Intent

When a ScholarOS site on Vercel has a Postgres database configured, content lives in the
database instead of git: admin edits are live within seconds (no rebuild), images go to Vercel
Blob, and public pages are server-rendered and cached on Vercel's CDN with precise purge on
publish. The database stores **the same documents as the repo** (path → YAML/Markdown text), so
both modes share parsers and schemas and switching modes is a copy, not a migration. Git
remains a safety net through per-file revisions and a daily backup branch.

Success:
- With `DATABASE_URL` set on Vercel, a published edit is visible on the next page load.
- Pages are served from the CDN cache (`x-vercel-cache: HIT`) except right after a related edit.
- Static and git modes behave exactly as before.
- Every save is recoverable: in-DB revisions + daily `content-backup` branch.

Out of scope (sub-project 4): PDF CV generation in Postgres mode, Medium daily cron,
"Also publish to Medium".

## 1. Mode selection

- `src/lib/mode.ts`: `getMode(): 'static' | 'git' | 'postgres'` —
  `postgres` when `VERCEL` and `DATABASE_URL` are set at build; `git` when only `VERCEL`;
  else `static`. `DATABASE_URL` without `VERCEL` fails the build with an explanatory error.
- The sub-project 2 integration (`src/integrations/admin.ts`) additionally, in postgres mode,
  sets `route.prerender = false` for every public route in `astro:route:setup`.
- The build does not connect to the database.

## 2. Database

- Driver: `postgres` (postgres.js) — works with Neon (Vercel Marketplace) and any Postgres.
  No ORM. `src/lib/db.ts` exports a lazily created `sql` (tagged template) with
  `max: 5`, `idle_timeout: 20`, `prepare: false` (pooler-compatible).
- `migrations/001_init.sql` (applied by `pnpm db:migrate`, `IF NOT EXISTS`, tracked in a
  `schema_migrations(name text primary key, applied_at timestamptz)` table):
  ```sql
  create table documents (path text primary key, content text not null,
    version int not null default 1, updated_at timestamptz not null default now(), updated_by text);
  create table revisions (id bigserial primary key, path text not null, content text,
    version int not null, created_at timestamptz not null default now(), author text);
  create index revisions_path_idx on revisions (path, id desc);
  create table media (url text primary key, pathname text not null, size int not null,
    content_type text not null, created_at timestamptz not null default now());
  ```
  `revisions.content` null = the change was a delete.

## 3. PostgresStore

Implements sub-project 2's `ContentStore` (`src/lib/admin/postgres-store.ts`), taking the
`sql` function as a constructor argument (test seam).
- `read(path)` → `{ path, content, version: String(version) }`; `list(dir)` → `path like dir || '/%'`.
- `commit(changes, message, base)` in one transaction:
  1. `select path, version, content from documents where path = any($paths) for update`.
  2. For each change, `base[path]` must equal the current version (null = must not exist);
     otherwise throw `ConflictError` (409) and roll back.
  3. Insert the new state into `revisions` (content or null, new version, author); upsert or
     delete in `documents` with `version = version + 1`.
  4. Prune: keep the newest 50 revisions per changed path.
  5. Return `{ id, versions }` (`CommitResult` in `src/lib/admin/store.ts`): `id` is the max
     revision id, `versions` maps each changed path to its new row version, or null for a delete.
  After commit: purge cache tags (§6). `message` is stored nowhere in v1 (git-only concept);
  revisions record author and time.
- Interface amendment to sub-project 2's `ContentStore` (applies to both stores):
  `putMedia(name, bytes, contentType) → { path }`, `deleteMedia(path)`, `listMedia()`.
  - `GitHubStore`: commits into `media_folder` (behavior already specified in sub-project 2).
  - `PostgresStore`: `@vercel/blob` `put(<hash>-<slug>.<ext>, bytes, { access: 'public',
    contentType, addRandomSuffix: false })`, row in `media`; path = Blob URL;
    `deleteMedia` → `del(url)` + delete row.
  Upload validation (magic bytes, SVG rules, 4 MB) stays in the API layer before either store.
- History (new store methods, PostgresStore only; the admin hides History in git mode):
  `history(path) → { id, version, created_at, author, deleted }[]`,
  `revision(id) → { path, content }`, restore = `commit([{ path, content }], …, { [path]: current })`.

## 4. Public data layer (`src/lib/content/`)

Used by all pages, layouts and components instead of `astro:content` calls, `fs` reads and
direct `getImage` calls.

- `getEntries(name)`, `getEntry(name, id)` → `{ id, data, body, filePath? }` (the shape pages use
  today). Static/git: delegate to `getCollection`/`getEntry`. Postgres: read
  `src/content/<name>/*.md` and `src/data/feeds.json` (for `feeds`) from `documents`, parse
  front matter (`yaml` package), validate with the shared schemas (image fields: URL strings);
  invalid documents are logged (`console.error` with path + zod issues) and skipped.
- `<EntryBody entry={…} />` (`src/components/astro/EntryBody.astro`):
  static/git → `const { Content } = await render(entry)`;
  postgres → `renderMarkdown(body)` → `set:html`.
- `renderMarkdown` (`src/lib/content/markdown.ts`): unified with `remark-parse`, `remark-gfm`,
  `remark-math`, `remark-rehype` (`allowDangerousHtml: true`), `rehype-raw`, the repo's
  `rehypeExternalLinks` and `rehypeMathJaxPassthrough`, `@shikijs/rehype` with themes
  `github-light`/`github-dark`, `rehype-stringify`. MDX documents (`.mdx`) render a notice
  "This post uses MDX, which is only supported in static/git mode."
- `resolveImage(src, width)` (`src/lib/content/image.ts`): accepts `ImageMetadata` or a URL;
  calls `getImage({ src, width, inferSize: typeof src === 'string' })`.
- Config: `getSiteConfig()` and `loadYamlConfig()` keep their synchronous signatures. In
  postgres mode `src/middleware.ts` opens an `AsyncLocalStorage` request context, loads every
  `config/*.yml` document in one query, and the two functions read from it (throwing if called
  outside a context in postgres mode). `src/data/cv.json` is read the same way. Static/git:
  filesystem as today.
- Files changed by this refactor: every file in `src/pages`, `src/components/astro`,
  `src/layouts` and `src/lib` that currently calls `getCollection`, `getEntry`, `render`,
  `getImage` or reads `fs` (≈ 35 files); the swap is mechanical.

## 5. Generated routes in postgres mode

- `sitemap-index.xml` (`src/pages/sitemap-index.xml.ts`, postgres only — `@astrojs/sitemap`
  only covers prerendered routes and stays for static/git): lists static pages from `nav`
  plus every entry route from the data layer.
  `astro.config.mjs` omits the `sitemap()` integration in postgres mode so the two never
  emit the same file.
- `feed.xml`, the header search index (`src/lib/search.ts`), tag/category pages and all `[id]`
  routes use the data layer; unknown ids render the 404 page with status 404.
- `getStaticPaths` stays for static/git; in postgres mode routes are not prerendered so it is
  ignored and params are resolved per request.

## 6. Caching

- Middleware, for public GET responses with status 200 in postgres mode:
  `Vercel-CDN-Cache-Control: public, max-age=31536000`,
  `Cache-Control: public, max-age=0, must-revalidate`,
  `Vercel-Cache-Tag: <tags>`. 404/5xx: `Cache-Control: no-store`.
- Tags recorded automatically by the data layer into the request context:
  `cfg:<file>` (config read), `col:<name>` (`getEntries`), `doc:<name>/<id>` (`getEntry`).
  All tags ≤ 256 bytes, no commas; > 128 distinct tags → single tag `all`. Every response also
  carries `all`.
- After a successful commit, `PostgresStore` maps changed paths to tags
  (`config/x.yml` → `cfg:x`; `src/content/<name>/<id>.md` → `col:<name>`, `doc:<name>/<id>`;
  `src/data/feeds.json` → `col:feeds`; media changes purge nothing) and calls
  `dangerouslyDeleteByTag(tags)` from `@vercel/functions` (foreground regeneration, so the
  editor sees the change immediately).
- Purge failure: logged; API returns 200 with `warning: 'cache-purge-failed'`; the admin
  toast offers "Retry refresh" (`POST /api/admin/cache/purge` with the tags).

## 7. Seed, export, backup

- `pnpm db:setup` (`scripts/db-setup.ts`): run migrations; refuse if `documents` is non-empty
  unless `--force`; insert every allowlisted repo file as a document (version 1, author
  `seed`); upload files from `media_folder` and `public/images/` to Blob; rewrite references
  in documents (front-matter string values and Markdown `![…](…)`/`<img src>`) from their
  repo paths to Blob URLs; print a summary.
- `pnpm db:export [dir]` (`scripts/db-export.ts`): write every document to `dir` (default
  repo root) at its path. Media references stay Blob URLs.
- Backup cron (amended by sub-project 4: runs as step 3 of `/api/admin/cron/daily`, and the
  result is stored in `src/data/jobs.json` instead of `backup.json`): `vercel.json` `crons: [{ path: '/api/admin/cron/backup', schedule: '0 3 * * *' }]`.
  The route requires `Authorization: Bearer ${CRON_SECRET}`; snapshots all documents and
  commits changed files to branch `content-backup` via `GitHubStore` (branch created from the
  default branch if missing; files deleted in the DB are deleted on the branch). No changes →
  no commit. Without `GITHUB_TOKEN` it returns `{ skipped: 'no token' }`. Last result is
  stored as document `src/data/backup.json` (allowlisted, admin-only, not rendered) and shown
  on the dashboard.

## 8. Admin changes

- History drawer on every editor screen (postgres mode): revision list (date, author,
  "deleted" marker), Preview (read-only rendering of that revision), Restore.
- API: `GET /api/admin/history?path=…`, `GET /api/admin/history/[id]`,
  `POST /api/admin/history/[id]/restore` (body `{ version }` of the current document).
- Dashboard: mode badge (Git / Postgres) and last backup time/result.
- Generate PDF disabled in postgres mode (amended by sub-project 4: enabled with a JS renderer) with note "PDF generation in Postgres mode — coming in
  sub-project 4".
- Post-save toast in postgres mode: "Published" (no deploy delay); with purge warning when
  applicable.

## 9. Errors

- DB unreachable on a public request: CDN cache keeps serving cached pages; uncached ones get
  a minimal 503 page, `Cache-Control: no-store`, `Retry-After: 30`.
- DB unreachable in admin: 503 JSON → persistent banner.
- Blob failure → 502 with reason. Conflict → 409 (same dialog as git mode).

## 10. Setup

README "Postgres mode" section: add Neon via the Vercel Marketplace (sets `DATABASE_URL`) and
Vercel Blob (sets `BLOB_READ_WRITE_TOKEN`); set `CRON_SECRET`; `vercel env pull` and run
`pnpm db:setup` locally against the production database; redeploy. `.env.example` adds
`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`. Switching back to git mode:
`pnpm db:export`, commit, remove `DATABASE_URL`, redeploy.

## 11. Testing

- `node:test` with `@electric-sql/pglite` (dev dependency, in-process Postgres) behind a small
  adapter exposing the postgres.js tagged-template + `begin()` interface used by the store:
  - commit, stale-version 409 with rollback, create-must-not-exist, delete records a null
    revision, pruning to 50, restore, 50-file commit atomic (failure mid-way leaves no rows);
  - path → tag mapping and tag collection (incl. > 128 → `all`);
  - document parsing/validation (invalid skipped, valid shape equals `getCollection` shape for
    demo content);
  - `renderMarkdown` parity with Astro's build output for every demo post and announcement
    (normalize whitespace and shiki class/style differences);
  - seed reference rewriting.
- CI: keep static and `VERCEL=1` builds; add `VERCEL=1 DATABASE_URL=postgres://ci@localhost/ci
  pnpm build` asserting the Vercel output config marks public routes as functions (build makes
  no DB connection).
- Manual on a Vercel preview with Neon + Blob: `db:setup`; edit a post and observe
  `x-vercel-cache` MISS → HIT → (publish) MISS → HIT; edit `site.yml` and confirm all pages
  refresh; restore a revision; upload an image and see it optimized via `/_vercel/image`;
  call the cron route with `CRON_SECRET` and confirm the `content-backup` commit.
