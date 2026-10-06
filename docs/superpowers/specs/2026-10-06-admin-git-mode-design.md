# Custom admin (git mode) on Vercel — design spec

Date: 2026-10-06 · Status: approved in chat, pending written-spec review
Sub-project 2 of 4. Depends on sub-project 1 (`2026-10-06-editorial-theme-design.md`) for the
editorial tokens and new content fields.

## Intent

Give ScholarOS owners a real admin panel — the screens in
`personal-site-handoff/design/Admin*.dc.html` plus hand-built screens for every other content
type — backed by server code on Vercel. In git mode (this spec) every save is a commit to the
site's repo; Vercel redeploys. Postgres mode (sub-project 3) plugs in behind the same storage
interface without changing the admin.

Success:
- On Vercel with the env vars set, the owner signs in with GitHub at `/<adminPath>` and can
  edit every piece of site content without touching code; each publish is one commit and the
  change is live after the redeploy.
- Static hosts (GitHub Pages, Netlify) are unaffected: purely static build, Sveltia at
  `/<adminPath>` as today.
- No secret ever reaches the browser; only `adminUsers` can sign in.

Out of scope: Postgres mode, a request-time data layer for public pages, Vercel Blob
(sub-project 3); Medium daily cron, "Also publish to Medium", PDF generation without GitHub
Actions (sub-project 4).

## 1. Runtime

- Add `@astrojs/vercel@^8` (Astro 5 compatible; v9+ require newer Astro).
- `astro.config.mjs`: `adapter: process.env.VERCEL ? vercel() : undefined`; `output` stays
  `'static'`. Public pages remain prerendered on every host.
- Admin page and API route files live outside `src/pages` (`src/admin/routes/**`) and set
  `export const prerender = false`. A tiny local integration (`src/integrations/admin.ts`,
  `astro:config:setup` + `injectRoute`) injects them under `/<adminPath>/…` and
  `/api/admin/…` only when `VERCEL` is set; otherwise it injects the existing Sveltia page
  (moved from `src/pages/[...cms].astro` and `[...cmsConfig].ts` to `src/admin/sveltia/`).
  Static builds therefore contain no admin functions.
- `vercel.json`: `headers` for `/<adminPath>/(.*)` and `/api/admin/(.*)`:
  `Cache-Control: no-store`, `X-Robots-Tag: noindex`.

## 2. Auth

- GitHub OAuth App, scope `read:user`, used only for identity.
  - `GET /api/admin/auth/login` → sets a short-lived `oauth_state` cookie (random 32 bytes),
    redirects to GitHub authorize.
  - `GET /api/admin/auth/callback` → verifies `state` against the cookie, exchanges the code,
    fetches `/user`, checks `login` (case-insensitive) is in `site.yml` `adminUsers`
    (entries may be usernames or `https://github.com/<user>` URLs, as Sveltia accepts today),
    then issues the session cookie and redirects to the dashboard. Otherwise 403 page.
  - `POST /api/admin/auth/logout` clears the cookie.
- Session cookie `scholaros_session`: AES-GCM (Web Crypto) over `{ login, name, avatar, exp }`,
  key derived (HKDF-SHA-256) from `SESSION_SECRET` (≥ 32 chars, checked at startup).
  `HttpOnly; Secure; SameSite=Lax; Path=/`, 7-day expiry, no refresh.
- `src/middleware.ts`: for admin pages and `/api/admin/**` (except `auth/*`), decrypt the
  session; pages redirect to `/<adminPath>/login`, API returns 401. For mutating methods,
  require `Origin` to equal the site origin, else 403.
- Writes use a server-only fine-grained PAT `GITHUB_TOKEN` scoped to the one repo with
  Contents: read/write and Actions: read/write. (Chosen over the user's OAuth token, which
  would need `repo` scope over all repositories.) Commit author = signed-in user's
  name/login with `<login>@users.noreply.github.com`.

## 3. Storage interface

`src/lib/admin/store.ts`:
```ts
interface StoredFile { path: string; content: string; version: string } // version = blob sha (git) / row version (pg)
interface Change { path: string; content: string | null; encoding?: 'utf-8' | 'base64' } // null = delete
interface ContentStore {
  list(dir: string): Promise<{ path: string; version: string }[]>;
  read(path: string): Promise<StoredFile | null>;
  commit(changes: Change[], message: string, base: Record<string, string | null>): Promise<{ id: string; url?: string }>;
}
```
- `GitHubStore` (`src/lib/admin/github-store.ts`), repo from `GITHUB_REPO` or
  `VERCEL_GIT_REPO_OWNER/VERCEL_GIT_REPO_SLUG`, branch from `GITHUB_BRANCH` or
  `VERCEL_GIT_COMMIT_REF` or `main`:
  - `read`/`list` via Contents API (raw media type for text), always from the branch head —
    never from the deployed build, which may be stale.
  - `commit` via Git Data API: get ref → base tree → compare each changed path's current blob
    sha with `base[path]` (null = must not exist); mismatch → `ConflictError` (409); create
    blobs → tree → commit → update ref (non-force). Ref update race (422) → retry once from
    the top, then 409.
- `MemoryStore` (`src/lib/admin/memory-store.ts`): seeded from the working tree, used when
  `ADMIN_STORE=memory`, which is honored only when `import.meta.env.DEV`.
- `getStore()` picks the implementation; sub-project 3 adds `PostgresStore`.

## 4. Shared schemas and serialization

- Move the zod object schemas out of `src/content.config.ts` into `src/lib/schemas.ts`;
  `content.config.ts` imports them (with `image()` passed in where used). The admin validates
  with the same schemas, using a string in place of `image()`.
- New zod schemas for config files edited by the admin: `site.yml`, `research.yml`,
  `feeds.yml`, `cv.yml` (permissive: RenderCV sections are `Record<string, unknown[]>`, with
  per-entry-type schemas for education/experience/normal/one-line/bullet entries).
- `src/lib/admin/serialize.ts`:
  - Markdown files: `---\n<yaml>\n---\n\n<body>`; front-matter keys written in schema order,
    unknown keys preserved after them.
  - YAML config files: edited with the `yaml` package's Document API (`parseDocument` →
    `setIn`/`deleteIn` → `toString`) so comments and key order survive. Adds dependency `yaml`
    (js-yaml cannot preserve comments).
- Path allowlist (`src/lib/admin/paths.ts`): `config/{site,research,feeds,cv,cv-upload}.yml`,
  `src/content/<collection>/<slug>.md`, `src/data/feeds.json`, media folder from
  `config/cms.yml` `media_folder`. Slugs: lowercase `[a-z0-9-]`, 1–80 chars; anything else,
  `..`, or absolute paths → 400.

## 5. API (`src/pages/api/admin/`)

All JSON. Errors: `{ error: string, details?: unknown }`.

| Route | Methods | Notes |
|---|---|---|
| `auth/login`, `auth/callback`, `auth/logout` | GET/GET/POST | §2 |
| `me` | GET | session user + capability check (token valid, has Contents/Actions access) for the banner |
| `collections/[name]` | GET | list entries `{ slug, data, version }` (front matter only) |
| `collections/[name]/[slug]` | GET, PUT, DELETE | read `{ data, body, version }`; PUT `{ data, body, version|null, message? }` validated → commit; DELETE with `version` |
| `config/[file]` | GET, PUT | `site`, `research`, `feeds`, `cv`, `cv-upload`; PUT takes the full object + version |
| `cv/publish` | POST | `{ cv, cvVersion, publications: [{slug, data, body, version}] }` → one commit |
| `cv/import` | POST | RenderCV YAML text → `{ summary, cv, publications }` preview (no commit); 422 on parse/validation failure |
| `cv/pdf` | POST / GET | dispatch `render-cv.yml` / latest run status |
| `feeds/sync` | POST | run feed sync (shared lib), commit `src/data/feeds.json` |
| `feeds/hidden` | PUT | `{ id, hidden }` → update `feeds.yml` `hidden: []` |
| `media` | GET, POST, DELETE | list; upload (multipart, ≤ 4 MB); delete with version |

Status codes: 400 validation, 401 no session, 403 not allowed / bad Origin, 409 version
conflict, 413 upload too large, 415 unsupported media type, 422 import failure, 502 GitHub
error (message includes the missing permission when GitHub returns 403/404 for the token).

## 6. Content-model changes required by the admin

- `posts`: add `featured: boolean` (default false) — "Show on home page"; editorial Home
  prefers featured posts, then newest.
- CV entries: optional `visible: false` on any entry. Page (`src/lib/cv.ts`) and
  `scripts/render-cv.py` skip hidden entries.
- Publications single source: the `publications` collection is authoritative. When
  `cv.yml` has no `publications` section, `render-cv.py` builds the RenderCV publications
  section from the collection (front matter parsed with PyYAML: title, authors, venue, year →
  date, doi, url); the page already falls back to the collection. CV import moves
  publications into the collection and removes the section from `cv.yml`.
- `feeds.yml`: add `hidden: string[]` (feed item ids); the `feeds` collection consumers filter
  them out (shared helper in `src/lib/utils.ts`).
- `config/cms.yml` (Sveltia) gains the same fields (`featured`, entry `visible`, feeds
  `hidden`) so static-host users keep parity.
- Feed sync logic moves from `scripts/sync-feeds.ts` into `src/lib/feeds.ts`
  (`syncFeeds(config, existing) → items`, no fs); the script becomes a thin fs wrapper.

## 7. Admin UI

- One Astro page per screen under `src/admin/routes/` (injected at `/<adminPath>/…`), each mounting
  a Vue 3 component `client:only="vue"` from `src/admin/`. Shared: `AdminShell.vue` (sidebar per
  mockup: name + "Site admin"; Dashboard · Posts · CV · Publications · Content ▸ News, People,
  Projects, Talks, Positions · Pages · Media · Settings; View site ↗; Sign out), `api.ts`
  (fetch wrapper, error → toast/field errors), `useDraft.ts` (localStorage draft per path,
  cleared on successful commit), form controls (text, textarea, select, checkbox, date,
  list-of-strings, reorderable list, image picker, author list).
- Styling: editorial tokens (`src/themes/editorial/editorial.css` variables) + scoped styles
  matching the mockups; independent of the public theme. Phone width usable (sidebar
  collapses to a top menu); not optimized.
- After every successful commit: toast "Committed · live in about a minute" + commit link.

Screens:

| Screen | Content |
|---|---|
| Login | "Sign in with GitHub" button; error messages for denied/expired. |
| Dashboard | Tiles (site posts, imported posts, publications, CV last updated = last commit date of `config/cv.yml`); posts table (site posts + feed items, search, status Published/Draft/Hidden, Edit / Hide / Unhide); Medium panel (`mediumUrl` field saved to `feeds.yml`, "Check now" → `feeds/sync`, last sync time). |
| Posts | List (title, status, date) + "New post". |
| Post editor | Tiptap 3 (`@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-mathematics` + `katex`, image, table, link). Toolbar: Bold, Italic, Heading, Quote, Link, List, Code, Equation, Image. `/` menu: heading, quote, code block, equation, image, table. Title + subtitle inputs. Preview toggle renders the Markdown with editorial `.ed-prose` styles. Sidebar: slug (URL), date, tags, related publication (select), summary (`excerpt`), Show on home page (`featured`). Save draft (`draft: true`) / Publish (`draft: false`). Math serializes as `$…$` / `$$…$$`; images as `![alt](path)`. MDX posts open read-only with a notice. |
| CV | Three columns per mockup: sections (from `cv.yml`, with counts; add/rename/delete custom section), entries (add, delete, ↑/↓ reorder), form by RenderCV entry type with live preview and Visible toggle. "Publications" section links to the Publications screen. Header: Import YAML (file/paste → preview summary → apply into the editor state), Generate PDF (dispatch + status), Publish (`cv/publish`). Warns when `cv-upload.yml` is enabled (import turns it off). |
| Publications | List with year/topic filters; form: title, ordered authors (owner highlighted), venue, venueShort, year, type, topic (select from research areas + other), note, doi, arxiv, url, pdf, code, featured, abstract, image, BibTeX override with "Regenerate". |
| News / People / Projects / Talks / Positions | Hand-built list + form per collection with its schema's fields; Markdown body with the compact Tiptap editor (no slash menu); image fields via the Media picker. |
| Pages | Home: `editorial` block, `about`, `homepageSections` order/enable. Research: headline, description, areas (all fields incl. figure upload, related publications multi-select). |
| Media | Grid of files in the media folder; upload (drag/drop); copy path; delete. |
| Settings | `site.yml` grouped: Identity, Theme & colors (theme select, accent picker), Fonts, Navigation (reorderable), Socials, Top bar, Hero, Admin users, Feeds. |

## 8. Media uploads

- Allowed: PNG, JPEG, WebP, GIF, AVIF, SVG; max 4 MB; type sniffed from magic bytes (SVG:
  UTF-8 text whose root element is `<svg`).
- SVG rejected if it contains `<script`, `on…=` attributes, `javascript:`, or
  `<foreignObject`.
- Filename: slugified base + 6-char content hash + extension; committed base64 to the
  `media_folder`; the returned path follows the `public_folder` convention used by Sveltia so
  existing `image()` fields keep resolving.

## 9. Error handling

- Field-level zod errors shown inline; other errors as toasts.
- 409: dialog "This file changed since you opened it" → Reload (local draft kept and offered
  for re-apply).
- Local drafts cleared only after a successful commit.
- `me` capability check drives a persistent banner when the token is missing, expired or
  lacks Contents/Actions permission.

## 10. Setup

- README "Deploy on Vercel" section: import repo in Vercel; create GitHub OAuth App (callback
  `https://<domain>/api/admin/auth/callback`); create fine-grained PAT; set env vars
  `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN`, `SESSION_SECRET`, optional
  `GITHUB_REPO`, `GITHUB_BRANCH`; add your GitHub username to `adminUsers`.
- `.env.example` with the same keys.
- Static-host docs unchanged.

## 11. Testing

- `node:test` (no new test framework), `pnpm test` → `node --test --import tsx 'tests/**/*.test.ts'`:
  - serialization round-trip (front matter order + unknown keys; YAML comments preserved);
  - path allowlist and slug sanitization (incl. `..`, absolute, unicode);
  - session encrypt/decrypt, tamper rejection, expiry;
  - RenderCV import mapping using `personal-site-handoff/cv.yaml` as fixture (copied to
    `tests/fixtures/rendercv.yaml`);
  - BibTeX generation;
  - Tiptap ↔ Markdown round-trip (headings, lists, code, inline/block math, images, tables)
    run headless with `@tiptap/core` under `happy-dom` (dev dependency, registered in the
    test file);
  - `GitHubStore` against a fake `fetch`: multi-file commit, stale-version 409, ref-race retry,
    403 → 502 with permission message;
  - upload sniffing and SVG rejection.
- Playwright e2e against `astro dev` with `ADMIN_STORE=memory` and a dev-only session stub:
  edit + publish a CV entry; create post, save draft, publish; upload media; hide an imported
  post; 409 dialog via a store version bump.
- CI (`lint.yml`): `pnpm build` (static, no adapter output) and `VERCEL=1 pnpm build`
  (adapter output present, admin routes are functions); `pnpm test`.
- Manual: Vercel preview deploy against a throwaway fork; one commit from each screen.
