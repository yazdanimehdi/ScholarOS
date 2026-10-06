# Jobs: CV PDF on Vercel, daily cron, scheduled posts, Medium cross-post — design spec

Date: 2026-10-06 · Status: approved in chat, pending written-spec review
Sub-project 4 of 4. Depends on sub-projects 1–3 (editorial CV layout, admin + `ContentStore`,
Postgres mode, data layer, cache tags).

## Intent

Close the remaining gaps from `HANDOFF.md`: a downloadable CV PDF in Postgres mode, automatic
Medium import, scheduled publishing, and "Also publish to Medium" — without adding services
beyond Vercel, GitHub and the database already in use.

Success:
- In Postgres mode the CV page always links a PDF that reflects the last published CV.
- Medium posts appear on the Writing page within a day of publication, in every mode.
- A post dated in the future appears on its date (day precision) in every mode.
- A published site post can be pushed to Medium as a draft (token) or via Medium's import tool
  (no token), with the canonical URL pointing at the site, and never shows twice on Writing.

## 1. CV PDF (Postgres mode)

- Dependency: `pdfmake` (server-side only).
- `src/lib/cv-pdf/definition.ts`: `buildCvDocument(cv, publications, site, options) →
  TDocumentDefinitions` — pure. Layout mirrors the editorial CV page: header (name, contact
  line from `cv` email/phone/location/website + social networks), then each visible section as
  a two-column row (section label left ~25%, entries right). Entry: title (bold), organization,
  date range right-aligned, highlights as bullets. Publications section built from the
  `publications` collection (sorted by year desc) with `site.author` in bold; omitted entries:
  `visible: false`. Section order = `cv.yml` order; publications placed where the
  `publications` key appears, else after experience.
- `src/lib/cv-pdf/render.ts`: `renderCvPdf(definition) → Promise<Uint8Array>` using pdfmake's
  server printer with fonts from `src/lib/cv-pdf/fonts/` (Source Serif 4 Regular/SemiBold/
  Italic, IBM Plex Sans Regular/Medium/SemiBold — TTF, SIL OFL; `OFL.txt` included). Fonts are
  fixed for the PDF regardless of `site.yml` fonts.
- Page size: optional `pdf: { pageSize: 'LETTER' | 'A4' }` in `cv.yml` (default `LETTER`);
  schema updated in `src/lib/schemas.ts`; `render-cv.py` ignores the key.
- Triggers (Postgres mode only):
  - `POST /api/admin/cv/pdf` ("Generate PDF" button, re-enabled in Postgres mode).
  - Automatically after any successful commit touching `config/cv.yml` or
    `src/content/publications/*` (API layer, after the store commit).
- Output: `putMedia('cv/cv-<sha256-8>.pdf', bytes, 'application/pdf')` (Blob), then commit
  `src/data/cv.json` `{ lastGenerated, pdfPath: <blob url>, pdfSize }` → purges the CV page's
  tags. Previous PDF blob deleted after the new `cv.json` commits.
- Failure: the triggering save still succeeds; response carries
  `warning: 'pdf-failed', detail` → toast "Saved; PDF generation failed: …".
- Git mode and static hosts: unchanged (RenderCV GitHub Action). The two modes intentionally
  produce different-looking PDFs.
- Lab per-person CVs (`cv/*.yml`): git mode only in this version.

## 2. Daily cron (Postgres mode)

- Supersedes sub-project 3's backup-only cron: `vercel.json`
  `crons: [{ path: '/api/admin/cron/daily', schedule: '0 3 * * *' }]` (Hobby plans allow daily
  crons; Pro users may change the schedule).
- `GET /api/admin/cron/daily`: requires `Authorization: Bearer ${CRON_SECRET}` (else 401).
  Runs three independent steps, each wrapped so one failure doesn't stop the others:
  1. `feeds` — `syncFeeds()` (sub-project 2 shared lib) → commit `src/data/feeds.json` when
     changed.
  2. `scheduled` — release posts that became due (§3).
  3. `backup` — sub-project 3 git backup.
  Results `{ step: { ok, at, detail } }` committed as `src/data/jobs.json` (replaces
  sub-project 3's `backup.json`; allowlisted, admin-only, never rendered) and shown on the
  dashboard with a "Run now" button (`POST /api/admin/cron/daily/run`, session-authenticated,
  same code path).
- Git mode on Vercel and static hosts: no Vercel cron. The existing `sync-feeds.yml` GitHub
  workflow already syncs daily and its commit triggers the redeploy.

## 3. Scheduled posts (all modes)

- Definition: a post is *published* when `!draft && date <= now`; *scheduled* when
  `!draft && date > now`. Helper `isPublished(post, now = new Date())` in `src/lib/utils.ts`,
  applied inside the data layer's `getEntries('posts')`/`getEntry('posts', id)` for public
  callers (blog list, tag pages, home, RSS, sitemap, search, `[id]` → 404 until due). The admin
  reads through the store, unaffected.
- Admin: status "Scheduled · <date>" in tables; the editor's primary button reads "Schedule"
  when the date is in the future.
- Release:
  - Postgres: the `scheduled` cron step finds posts with
    `last_run < date <= now` (`last_run` from `jobs.json`, default 24 h ago) and purges
    `col:posts` and `doc:posts/<id>` (home, listings, RSS and sitemap all read `col:posts`).
  - Git on Vercel: new `.github/workflows/release-scheduled.yml` (daily 06:00 UTC +
    `workflow_dispatch`) runs `scripts/due-posts.ts` (exit 0 when a post became due in the last
    24 h, else 78/neutral); on due → `curl -X POST "$VERCEL_DEPLOY_HOOK_URL"` (repo secret;
    step skipped with a notice when unset).
  - GitHub Pages: `deploy.yml` gains the same daily schedule, gated by `due-posts.ts`, so it
    only rebuilds when needed.
- Precision: one day (documented).

## 4. "Also publish to Medium"

- Post schema: `medium: { url?: string (url), id?: string }` (also in `config/cms.yml`).
- Editor checkbox "Also publish to Medium" (default off). On Publish (not Save draft):
  - **Token path** (`MEDIUM_TOKEN` set; Medium no longer issues new tokens, existing ones
    work): server `GET https://api.medium.com/v1/me` → `POST /v1/users/{id}/posts` with
    `title`, `contentFormat: 'markdown'`, content = `# title` + `## subtitle` + body with
    relative image/link URLs made absolute against `siteUrl` (math left as `$…$`),
    `canonicalUrl` = site post URL, `tags` = first 5 tags, `publishStatus: 'draft'`. Store
    `medium.url`/`medium.id` in front matter via a follow-up commit.
  - **No-token path**: after a successful publish the editor shows "Import to Medium": copies
    the post URL to the clipboard and opens `https://medium.com/p/import` in a new tab (Medium
    sets the canonical link on import). A "Medium URL" field in the settings sidebar records
    the resulting link in `medium.url`.
  - Once-only: if `medium.url` exists the checkbox is replaced by "Already on Medium ↗".
  - Failure: publish still succeeds; warning toast "Published; Medium cross-post failed: …"
    with Retry → `POST /api/admin/posts/[slug]/medium`.
- Writing dedupe (shared feeds filter helper, sub-project 2): a feed item is hidden from public
  listings if its normalized link equals any post's `medium.url`, or its normalized title
  (lowercase, collapsed whitespace, stripped punctuation) equals the title of a post that has
  `medium.url`. The site copy is shown instead.

## 5. Config & setup

- New env: `MEDIUM_TOKEN` (optional). Repo secret: `VERCEL_DEPLOY_HOOK_URL` (optional, git
  mode on Vercel). Existing: `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `DATABASE_URL`.
- README: "Scheduled posts", "Cross-posting to Medium", "CV PDF in Postgres mode" sections;
  `.env.example` updated.

## 6. Amendments to earlier specs

- Sub-project 3 §7 backup cron → step 3 of the daily cron here; `backup.json` → `jobs.json`.
- Sub-project 3 §8 "Generate PDF disabled in postgres mode" → enabled (§1).

## 7. Testing (`node:test`)

- `buildCvDocument`: snapshot for the demo CV; hidden entries omitted; owner bold in
  publications; section order; page size from config.
- `renderCvPdf`: bytes start with `%PDF-`, size < 1 MB, demo CV ≤ 2 pages (pdfmake page count
  from the document's `pages` callback).
- Daily cron: 401 without/with wrong secret; one failing step doesn't block others; `jobs.json`
  written with per-step results.
- `isPublished`: draft, future, past, exact boundary; `due-posts.ts` against fixtures (due,
  not due, draft).
- Medium: payload builder (canonical, absolute URLs, 5-tag cap, draft status); fake `fetch`
  for success, 401, and the once-only guard.
- Dedupe helper: link match, normalized title match, no false positive on a different title.
- Manual on a Vercel preview: generate and open the PDF; schedule a post for tomorrow and run
  the daily cron via "Run now" after changing the date to today; cross-post without a token
  through Medium's import; Medium feed item for that post is hidden on Writing after sync.
