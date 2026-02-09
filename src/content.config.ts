import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

/** Treat empty/whitespace-only strings as absent (CMS writes '' instead of omitting). */
const emptyToUndefined = z.string().optional()
  .transform(v => (v?.trim() ? v.trim() : undefined));

/** Same but with .url() validation after stripping empties. */
const optionalUrl = emptyToUndefined.pipe(z.string().url().optional());

/** Same but with .email() validation after stripping empties. */
const optionalEmail = emptyToUndefined.pipe(z.string().email().optional());

const people = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/people' }),
  schema: ({ image }) =>
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
    }),
});

const announcements = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/announcements' }),
  schema: ({ image }) =>
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
    }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/projects' }),
  schema: ({ image }) =>
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
    }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      author: z.string().optional(),
      excerpt: z.string().optional(),
      coverImage: image().optional(),
      tags: z.array(z.string()).optional(),
      keywords: z.string().optional(),
      draft: z.boolean().default(false),
    }),
});

const publications = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/publications' }),
  schema: ({ image }) =>
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
    }),
});

const positions = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/positions' }),
  schema: z.object({
    title: z.string(),
    type: z.enum(['phd', 'postdoc', 'masters', 'undergrad', 'research-assistant', 'visiting', 'other']),
    status: z.enum(['open', 'closed']),
    deadline: z.coerce.date().optional(),
    excerpt: z.string().optional(),
    tags: z.array(z.string()).optional(),
    contact: z.string().optional(),
    sortOrder: z.number().default(99),
  }),
});

const talks = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/talks' }),
  schema: z.object({
    title: z.string(),
    event: z.string(),
    date: z.string(),
    location: z.string().optional(),
    type: z.enum(['Conference Talk', 'Invited Talk', 'Seminar', 'Tutorial', 'Workshop', 'Keynote', 'Panel']),
    slidesUrl: optionalUrl,
    videoUrl: optionalUrl,
    sortDate: z.coerce.date().optional(),
  }),
});

const feeds = defineCollection({
  loader: file('src/data/feeds.json'),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    link: z.string().url(),
    date: z.string(),
    source: z.string(),
    excerpt: z.string().optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = {
  people,
  announcements,
  projects,
  posts,
  publications,
  talks,
  feeds,
  positions,
};
