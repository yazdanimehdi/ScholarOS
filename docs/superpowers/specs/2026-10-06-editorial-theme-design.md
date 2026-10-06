# Editorial theme — design spec

Date: 2026-10-06 · Status: approved in chat, pending written-spec review
Sub-project 1 of 4 (see "Roadmap" at the end).

## Intent

ScholarOS is a forkable academic website template. The owner has an approved visual design
(`personal-site-handoff/design/*.dc.html`, tokens in `HANDOFF.md` §4) for a restrained
researcher site. Add it to ScholarOS as a **second selectable theme** ("editorial") so any fork
can choose it via config, while the existing look ("classic") stays the default and keeps
working unchanged.

Success:
- `theme: 'editorial'` in `config/site.yml` renders `/`, `/research`, `/publications`, `/cv`,
  `/blog`, `/blog/[id]` to match the mockups at desktop and phone width.
- All other pages render inside the editorial shell with editorial tokens.
- `theme: 'classic'` (or no `theme` key) produces the same site as today.
- Static build only; works on GitHub Pages, Netlify and Vercel.

Out of scope (later sub-projects): custom admin, Vercel adapter, Postgres, Medium cron, PDF
generation on Vercel, dark mode for editorial, migrating the owner's real content
(`personal-site-handoff/cv.yaml`) — that goes into the owner's fork, not the template.

## 1. Theme mechanism

- `config/site.yml` gains `theme: 'classic' | 'editorial'` (default `classic`).
  `SiteConfig.theme` added to `src/lib/types.ts`.
- `getSiteConfig()` applies `process.env.SCHOLAROS_THEME` as an override when set (used by CI
  and the regression script to build both themes).
- Designed pages keep their route files. Each route file loads data (as today) then renders
  `src/themes/classic/<Page>.astro` or `src/themes/editorial/<Page>.astro` with that data as
  props. The classic markup is moved verbatim into the classic component. Pages:
  `index`, `research`, `publications`, `cv`, `blog/index`, `blog/[id]`.
- The `/blog` route is kept; the nav label ("Writing") comes from `site.yml` `nav`.
- `src/layouts/PageLayout.astro` (and `BaseLayout.astro` where needed) is theme-aware: under
  editorial it renders the editorial header/footer and loads `editorial.css`, which overrides
  the CSS variables the classic Tailwind classes use (surface/primary colors, fonts) so
  undesigned pages (people, projects, positions, talks, news, repositories, contact, join)
  look consistent without per-page redesigns.
- Editorial is light-only: the theme toggle is hidden and `dark` class is never applied.

## 2. Styling

`src/themes/editorial/editorial.css`:
- Tokens (CSS custom properties): ink `#15192B`, body-2 `#3D4357`, muted `#4A5068`,
  caption `#6A7085`, rule `#E4E7EE`, tint `#F3F5FA`, hover `#F6F8FC`, accent (from
  `colors.light.primary`, editorial default `#1F3C88`), accent-hover (`#142A63` default, or
  accent darkened), selection `#DCE3F5`, footer `#15192B`.
- Fonts from `fonts.families` (editorial defaults: Source Serif 4 / IBM Plex Sans / IBM Plex
  Mono via the existing `FontStyles.astro` loading path).
- Utilities from the design: `.ul` (animated underline), `.row` (hover tint) + `.arr` (4px
  nudge on row/link hover), `.num` (tabular numerals), eyebrow label style (12px, 600,
  uppercase, 1.6px tracking, accent).
- Layout: content width 1080px, article width 680px, 32px side padding (16px on phones);
  radius 4–6px; no pills, gradients or emoji.
- Visible `:focus-visible` outline in accent on all interactive elements.
- `prefers-reduced-motion`: transitions disabled.

## 3. Content model (all additions optional, backward compatible)

### `config/site.yml`
```yaml
theme: 'classic'
editorial:
  eyebrow: 'Associate Professor · Computer Science'
  tagline: 'One-sentence italic research summary.'
  bio: 'Markdown paragraph(s).'
  figure: { image: '/images/hero-figure.svg', alt: '...', caption: '...' }
  affiliations: ['University of Technology', '...']
  contact: { heading: 'Interested in collaborating?', text: '...' }
```
Name, email and social links come from existing `author`, `socials`.
If `editorial.figure` is absent the hero is single-column.

### `config/research.yml`
```yaml
headline: 'Models that respect the structure of biology.'   # new, home section + page h1
description: '...'                                            # existing, page intro
areas:
  - id: 'nlp'                # new: anchor + publication topic key
    label: 'NLP'             # new: short label for publication filter
    title: '...'             # existing
    description: '...'       # existing: short summary (home cards)
    body: 'Markdown'         # new: long form on /research
    result: '...'            # new: "Result." aside
    figure: '/images/...'    # new: image path (SVG allowed)
    caption: '...'           # new
    publications: ['smith2024adaptive']  # new: related publication ids
    tags: [...]              # existing (classic only)
```
Areas without `id` get one from slugified title. Numerals (i., ii., …) are generated.
Home research cards list related publications by `venueShort`-less short title (text before
the first `:` in the title, fallback full title).

### `publications` collection (`src/content.config.ts`)
Add: `venueShort` (string), `topic` (string, matches a research area `id`; unmatched → "Other"),
`note` (string, e.g. "Oral"), `arxiv` (arXiv id), `code` (url).
- Paper link priority: `url` → `doi` (https://doi.org/…) → `arxiv` (https://arxiv.org/abs/…).
- BibTeX: use `bibtex` field when present; otherwise generate (`src/lib/bibtex.ts`):
  key = first author's last name + year + first title word, `@inproceedings` for type
  conference/workshop, `@article` otherwise, with title, author (joined " and "),
  journal/booktitle = `venue`, year, doi when present.
- Owner highlighting / first-author toggle: author string equals `site.author`
  (comparison trims and ignores a leading "Prof." / "Dr.").

### `announcements` collection
Add `datePrecision: 'day' | 'month' | 'year'` (default `month`) controlling the news date
format ("Oct 3, 2025" / "Oct 2025" / "2025").

### `posts` collection
Add `subtitle` (string) and `relatedPublication` (publication id).
Reading time = ceil(words / 230) minutes, computed from the raw body (`src/lib/utils.ts`).

### Software
Reuse `projects` with `type: software`: name = title, link = `repoUrl` ?? `url`,
description = `excerpt`, tech line = `tags.join(' · ')`. No schema change.

### Writing merge
Site posts (`posts`, non-draft) + external (`feeds` collection, already populated from
`config/feeds.yml`, including Medium). Tabs: All / On this site / Elsewhere — the third
tab's label is the single feed `source` name when all feeds share one (e.g. "Medium"),
else "Elsewhere". External rows link out with ↗ and never render content.

### CV
CV loading/normalization (upload-vs-structured precedence, `normalizeKeys`, `cv.json` PDF
metadata, section title formatting, date-range formatting) moves from `src/pages/cv.astro` into
`src/lib/cv.ts`; both themes consume its output. No data change.

### CMS
`config/cms.yml` gets the new fields: theme select + `editorial` object in the site settings
file collection; new research area fields; new publication, announcement and post fields.

### Demo content
Jane Smith demo data gets values for every new field (editorial block, research ids/body/
figures, two generic SVG figures in `public/images/`, publication topics/venueShort/note/
arxiv/code, one post with subtitle + relatedPublication, one announcement with year precision).

## 4. Components (`src/themes/editorial/`)

| File | Purpose |
|---|---|
| `Layout.astro` | Header (diamond mark + name, nav with accent underline on active item via `aria-current`), slot, light footer (© year · name, email). Prop `contactFooter` swaps in the dark contact footer. |
| `Eyebrow.astro` | Eyebrow label. |
| `PaperRow.astro` | Venue tile (venueShort + year), title link, authors (owner bold), venue line with note, Paper / Code / Cite (Cite → `/publications#<id>`). Optional BibTeX `<details>` (publications page). |
| `NewsList.astro` | Date column (tabular) + text. |
| `PostRow.astro` | Title, meta (date · read time or source ↗), arrow. |
| `Home.astro` | Hero (+ optional figure), affiliations band, research summary cards, selected papers (featured, max 4, "All N publications →"), news (5) + writing (3), dark contact footer. Sections respect `homepageSections` order/enabled; `about`→hero bio, `news`, `publications`, `blog` map to their blocks; affiliations and research render when configured. |
| `Research.astro` | Headline + intro, "On this page" nav, one section per area (numeral, title, body, result aside, related paper rows, figure + caption), software grid. |
| `Publications.astro` | Header, topic filter + first-author toggle, groups by year, `PaperRow` with BibTeX expander. |
| `Cv.astro` | Section label left / entries right (title, org, dates, highlights), Download PDF button when `cv.json` has a PDF. |
| `Blog.astro` | Tabs, merged rows sorted by date desc, RSS link. |
| `Post.astro` | 680px article: back link, eyebrow (tags), title, subtitle, byline (author · date · read time), prose, related-paper aside, prev/next nav. |

Prose styling for post bodies (headings, tables, code, figures, KaTeX/MathJax output) lives in
`editorial.css` under `.ed-prose`, matching `Post.dc.html`.

## 5. Interactivity

No framework on editorial pages. One small inline `<script>` per page:
- Publications: buttons with `aria-pressed` set `data-filter`; script toggles `hidden` on
  `<li data-topic data-first>` and on empty year groups; filter counts rendered server-side.
  BibTeX uses native `<details>`. Without JS all papers show.
- Blog: same pattern on `data-kind`.
Scripts re-bind on `astro:page-load` (ClientRouter is in use).

## 6. SEO & accessibility

- Reuse `SEO.astro`/`BaseHead.astro`, sitemap, `feed.xml`.
- JSON-LD: `Person` on `/` (name, jobTitle from eyebrow, affiliations, sameAs socials, email);
  `ScholarlyArticle` list on `/publications` (headline, author, datePublished, isPartOf venue,
  sameAs doi/arxiv).
- Landmarks: header/nav/main/footer; skip link preserved; heading order h1→h2→h3.
- Contrast ≥ 4.5:1 for text (measured: caption `#6A7085` on white 4.92, on tint `#F3F5FA`
  4.51; footer `#9AA0B4` on `#15192B` 6.69). Caption text is never placed on `#F6F8FC` hover
  tint without re-checking.

## 7. Testing / verification

- `pnpm build` passes with `SCHOLAROS_THEME=classic` and `SCHOLAROS_THEME=editorial`;
  `pnpm check` and `pnpm lint` pass.
- `scripts/check-themes.mjs` (Node, `assert` only): builds are produced into
  `dist-classic/` and `dist-editorial/`; asserts each designed page exists and contains a
  theme marker (`data-theme="editorial"` / `"classic"` on `<html>`) and key landmarks
  (e.g. editorial `/publications` has `[data-topic]` rows and a `<details>` BibTeX), and that
  classic HTML for all pages matches a baseline built from `main` before the refactor after
  normalizing hashed asset names and `data-astro-cid-*` attributes (scoped-style ids change
  when markup moves files).
- Playwright screenshots of all six editorial pages at 1440px and 390px, reviewed against the
  mockups; no horizontal scroll at 390px.
- Lighthouse on editorial `/` and `/publications`: ≥ 95 in all four categories.
- `.github/workflows/lint.yml` builds both themes.

## Roadmap (separate specs)

2. Content data layer + `@astrojs/vercel` adapter + owner-only GitHub OAuth + custom admin
   (Dashboard, CV editor, Post editor) writing to git via GitHub API; Sveltia stays on static hosts.
3. Postgres mode (`DATABASE_URL` on Vercel): DB stores the same documents (path → text),
   Vercel Blob for images, SSR + ISR with on-demand revalidation, seed from repo.
4. Jobs: Medium RSS Vercel Cron, PDF CV in Postgres mode, "Also publish to Medium".
