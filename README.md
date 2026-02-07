# Academic Website Template

A modern, forkable website template for academic labs and research groups. Built with **Astro 5**, **Vue 3**, and **Tailwind CSS v4**.

## Features

- **Modern Design**: Vibrant gradients, card-based layouts, dark mode support
- **Content Collections**: People, announcements, projects, blog posts, publications, feeds
- **Interactive Components**: Publication filtering, dark mode toggle, mobile navigation, contact form
- **Multi-Platform Deploy**: GitHub Pages, Netlify, Cloudflare Pages
- **SEO Optimized**: OpenGraph tags, JSON-LD structured data, sitemap generation
- **Fully Static**: Zero runtime JS where possible, Vue islands for interactivity
- **CMS Ready**: Decap CMS configuration included (Phase 2)

## Quick Start

### Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [pnpm](https://pnpm.io/)

### Setup

```bash
# Clone or fork the repository
git clone https://github.com/your-username/academic-website.git
cd academic-website

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Configuration

All site configuration lives in the `config/` directory:

### `config/site.yml`

Main site settings:

```yaml
title: "Your Lab Name"
description: "Your lab description"
author: "Prof. Your Name"
labName: "Your Research Lab"
university: "Your University"
department: "Department of Computer Science"
siteUrl: "https://your-site.com"

nav:
  - label: "Home"
    href: "/"
  # ... more nav items

socials:
  email: "lab@university.edu"
  github: "https://github.com/your-lab"
  scholar: "https://scholar.google.com/citations?user=YOUR_ID"
```

### Content

Content is organized in `src/content/`:

| Collection | Location | Description |
|-----------|----------|-------------|
| People | `src/content/people/` | Lab members (Markdown) |
| Announcements | `src/content/announcements/` | News items (Markdown) |
| Projects | `src/content/projects/` | Research projects (Markdown) |
| Posts | `src/content/posts/` | Blog posts (Markdown) |
| Publications | `src/data/publications.json` | Publication entries (JSON) |
| Feeds | `src/data/feeds.json` | External feed items (JSON) |

### Adding a Person

Create a file in `src/content/people/your-name.md`:

```yaml
---
name: "Your Name"
role: "phd" # pi, postdoc, phd, masters, undergrad, research-assistant, visiting, alumni
title: "PhD Student"
email: "your.email@example.com"
researchInterests:
  - "Machine Learning"
  - "NLP"
sortOrder: 20
active: true
---

Your bio goes here in Markdown format.
```

### Adding a Publication

Add an entry to `src/data/publications.json`:

```json
{
  "id": "unique-id",
  "title": "Paper Title",
  "authors": ["Author One", "Author Two"],
  "venue": "Conference 2024",
  "year": 2024,
  "type": "conference",
  "featured": true
}
```

## Deployment

### GitHub Pages

1. Go to Settings > Pages > Source: GitHub Actions
2. Push to `main` branch - the included workflow handles the rest

### Netlify

1. Connect your repository on Netlify
2. Build settings are auto-detected from `netlify.toml`

### Cloudflare Pages

1. Connect your repository on Cloudflare Pages
2. Set build command: `pnpm build`
3. Set build output directory: `dist`
4. Set Node.js version: `22`

## Project Structure

```
├── config/              # YAML configuration files
│   ├── site.yml         # Site metadata, nav, socials
│   ├── scholar.yml      # Scholar sync config (Phase 3)
│   ├── feeds.yml        # RSS feed config (Phase 3)
│   └── cv.yml           # CV data (Phase 4)
├── public/              # Static assets
├── src/
│   ├── assets/images/   # Optimized images
│   ├── components/
│   │   ├── astro/       # Static components (zero JS)
│   │   └── vue/         # Interactive islands
│   ├── content/         # Markdown content collections
│   ├── data/            # JSON data files
│   ├── layouts/         # Page layouts
│   ├── lib/             # Utilities and config loader
│   ├── pages/           # Route pages
│   └── styles/          # Global CSS with Tailwind
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Homepage with hero, news, publications, projects |
| `/research` | Research areas and overview |
| `/people` | Team directory with tabs |
| `/people/[id]` | Individual profile |
| `/publications` | Searchable publication list |
| `/projects` | Project gallery |
| `/projects/[id]` | Project detail |
| `/news` | Announcements |
| `/news/[id]` | Single announcement |
| `/blog` | Blog posts + external feeds |
| `/blog/[id]` | Single post |
| `/talks` | Talks and presentations |
| `/join` | Open positions |
| `/contact` | Contact form |
| `/cv` | Curriculum vitae |

## Tech Stack

- [Astro 5](https://astro.build/) - Static site generator
- [Vue 3](https://vuejs.org/) - Interactive islands
- [Tailwind CSS v4](https://tailwindcss.com/) - Styling
- [MDX](https://mdxjs.com/) - Enhanced Markdown

## License

MIT
