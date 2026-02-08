# Contributing to ScholarOS

First off, thank you for considering contributing to ScholarOS! This project exists to help academics build professional websites without fighting with web development, and every contribution -- no matter how small -- helps make that a reality for more researchers around the world.

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Community](#community)

---

## Ways to Contribute

There are many ways to contribute, and not all of them involve writing code:

### No Code Required

- **Report bugs** -- found something broken? [Open an issue](https://github.com/yazdanimehdi/ScholarOS/issues/new)
- **Improve documentation** -- fix typos, clarify instructions, add examples
- **Share your site** -- using ScholarOS? Let us know so we can feature you in the README
- **Answer questions** -- help others in [Discussions](https://github.com/yazdanimehdi/ScholarOS/discussions)
- **Spread the word** -- star the repo, share it with colleagues

### Code Contributions

- **Fix bugs** -- check [open issues](https://github.com/yazdanimehdi/ScholarOS/issues) labeled `bug`
- **Add features** -- see issues labeled `enhancement` or `feature-request`
- **Improve accessibility** -- help make ScholarOS usable for everyone
- **Add tests** -- increase test coverage
- **Optimize performance** -- make the site faster
- **Add new content templates** -- new collection types, page templates, etc.

### Good First Issues

New to the project? Look for issues labeled [`good first issue`](https://github.com/yazdanimehdi/ScholarOS/labels/good%20first%20issue). These are specifically chosen to be approachable for newcomers.

---

## Development Setup

### Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [pnpm](https://pnpm.io/) (install with `npm install -g pnpm`)
- [Git](https://git-scm.com/)

### Getting Started

1. **Fork the repository** on GitHub

2. **Clone your fork:**

```bash
git clone https://github.com/YOUR_USERNAME/ScholarOS.git
cd ScholarOS
```

3. **Install dependencies:**

```bash
pnpm install
```

4. **Start the development server:**

```bash
pnpm dev
```

The site will be available at `http://localhost:4321` with hot-reload enabled.

5. **Create a branch for your changes:**

```bash
git checkout -b feature/your-feature-name
```

### Useful Commands

```bash
pnpm dev              # Start dev server with hot-reload
pnpm build            # Build for production
pnpm preview          # Preview production build locally
pnpm sync:feeds       # Test RSS feed sync locally
pnpm generate:keywords # Test SEO keyword generation
```

---

## Project Architecture

Understanding the codebase structure will help you contribute effectively.

### Key Directories

```
src/
├── components/
│   ├── astro/     # Static components (no client-side JS)
│   └── vue/       # Interactive islands (hydrated on demand)
├── content/       # Markdown content collections
├── layouts/       # Page layouts (BaseLayout, PageLayout, etc.)
├── lib/           # Utilities, config loader, types
├── pages/         # File-based routing
└── styles/        # Global CSS and Tailwind config
config/            # YAML configuration files
scripts/           # Automation scripts (migration, sync, etc.)
```

### Design Principles

1. **Static by default** -- use Astro components (zero JS) whenever possible. Only reach for Vue when you need interactivity (search, forms, filters).

2. **Configuration over code** -- users should never need to edit `.astro`, `.vue`, or `.ts` files. Everything customizable goes in `config/*.yml`.

3. **Content collections** -- all user content lives in `src/content/` as Markdown with typed frontmatter schemas.

4. **Minimal dependencies** -- think twice before adding a new npm package. The lighter the template, the better.

5. **Accessible first** -- semantic HTML, ARIA labels, keyboard navigation, color contrast, and proper heading hierarchy are non-negotiable.

### Component Conventions

- **Astro components** (`src/components/astro/`) are for static rendering. They receive props, render HTML, and ship zero JavaScript.
- **Vue components** (`src/components/vue/`) are for interactive features. They use Astro's island architecture with directives:
  - `client:load` -- hydrate immediately (search, filters)
  - `client:visible` -- hydrate when scrolled into view (forms, newsletter)
  - `client:only="vue"` -- skip SSR entirely (theme toggle, mobile nav)

---

## Making Changes

### Before You Start

1. **Check existing issues** -- someone may already be working on it
2. **Open an issue first** for significant changes -- let's discuss the approach before you invest time
3. **Keep changes focused** -- one feature or fix per PR

### Guidelines

- **Don't break existing configuration** -- users' `config/site.yml` files should continue to work after your change. Add new config options with sensible defaults.
- **Test both modes** -- verify your change works in both `personal` and `lab` site modes.
- **Test dark mode** -- ensure your UI changes look correct in both light and dark themes.
- **Test responsive** -- check mobile, tablet, and desktop breakpoints.
- **Keep it accessible** -- use semantic HTML, add ARIA labels to interactive elements, ensure keyboard navigability, and maintain color contrast ratios.

### Editing Configuration Schema

If you add a new config option:

1. Add the field to `config/site.yml` with a sensible default
2. Update the TypeScript types in `src/lib/types.ts`
3. Update the config loader in `src/lib/config.ts` if needed
4. Document the option in the README

### Adding a New Content Collection

1. Define the schema in `src/content.config.ts`
2. Create a sample content file in `src/content/your-collection/`
3. Create the listing page in `src/pages/your-collection/index.astro`
4. Create the detail page in `src/pages/your-collection/[id].astro`
5. Add it to the search index in `src/lib/search.ts`
6. Document it in the README

### Adding a New Page

1. Create the page in `src/pages/`
2. Use `PageLayout` as the wrapper layout
3. Include `<SEO>` component for structured data
4. Add a nav entry example in the README config section

---

## Pull Request Process

1. **Ensure your code builds** -- run `pnpm build` and verify no errors
2. **Test locally** -- run `pnpm preview` and manually verify your changes
3. **Write a clear PR description** -- explain what changed and why
4. **Link related issues** -- use "Closes #123" in the description
5. **Keep commits clean** -- use clear, descriptive commit messages

### PR Title Format

Use conventional commit style:

```
feat: add new hero animation preset
fix: resolve dark mode flash on page load
docs: update deployment instructions
refactor: simplify color palette generation
style: fix alignment in publication cards
```

### What We Look For in Reviews

- Does the change work in both personal and lab modes?
- Does it look correct in light and dark themes?
- Is it responsive on mobile?
- Does it maintain accessibility standards?
- Does `pnpm build` succeed?
- Is the code consistent with existing patterns?

---

## Code Style

### General

- **TypeScript** for all `.ts` files with strict mode
- **2 spaces** for indentation (HTML, CSS, TypeScript, YAML)
- **Double quotes** for strings in TypeScript, single quotes in YAML
- **Trailing commas** in TypeScript arrays and objects
- **Semicolons** at the end of TypeScript statements

### Astro Components

```astro
---
// Imports first
import SomeComponent from './SomeComponent.astro';

// Props interface
interface Props {
  title: string;
  count?: number;
}

// Destructure props with defaults
const { title, count = 0 } = Astro.props;

// Logic
const items = await getCollection('posts');
---

<!-- Template: semantic HTML with Tailwind classes -->
<section class="mx-auto max-w-[930px] px-4 sm:px-6">
  <h2 class="font-serif text-2xl">{title}</h2>
</section>
```

### Vue Components

```vue
<template>
  <div class="...">
    <!-- Template -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

// Props
const props = defineProps<{
  items: string[];
}>();

// State
const query = ref('');

// Computed
const filtered = computed(() => props.items.filter((item) => item.includes(query.value)));
</script>
```

### Tailwind CSS

- Use the project's design tokens: `text-surface-900`, `dark:text-dm-heading`, `text-primary-600`, etc.
- Follow the responsive pattern: mobile-first with `sm:`, `md:`, `lg:` breakpoints
- Use `dark:` variants for dark mode styles
- Keep the max content width at `max-w-[930px]`

### File Naming

- Astro/Vue components: `PascalCase.astro` / `PascalCase.vue`
- Pages: `kebab-case.astro`
- Utilities: `camelCase.ts`
- Content: `kebab-case.md`
- Config: `kebab-case.yml`

---

## Reporting Bugs

When reporting a bug, please include:

1. **Description** -- what happened vs. what you expected
2. **Steps to reproduce** -- minimum steps to trigger the bug
3. **Environment** -- OS, browser, Node.js version
4. **Screenshots** -- if it's a visual issue
5. **Console errors** -- any errors in the browser console or build output
6. **Configuration** -- relevant parts of your `config/site.yml` (redact sensitive info)

Use the [bug report template](https://github.com/yazdanimehdi/ScholarOS/issues/new?template=bug_report.md) when creating an issue.

---

## Suggesting Features

We love hearing ideas! When suggesting a feature:

1. **Check existing issues** -- it may already be requested
2. **Describe the use case** -- who benefits and how?
3. **Propose an approach** -- how should it work? What config options are needed?
4. **Consider scope** -- does it fit ScholarOS's mission of serving academics?

Use the [feature request template](https://github.com/yazdanimehdi/ScholarOS/issues/new?template=feature_request.md) when creating an issue.

---

## Community

- **GitHub Issues** -- bug reports and feature requests
- **GitHub Discussions** -- questions, ideas, and show-and-tell
- **Pull Requests** -- code contributions

### Code of Conduct

Be kind, be respectful, and remember that everyone is here to build something useful for the academic community. We are committed to providing a welcoming and inclusive experience for everyone.

---

## Recognition

All contributors are recognized in the project. Significant contributions will be acknowledged in release notes and the README.

Thank you for helping make academic websites better for everyone!
