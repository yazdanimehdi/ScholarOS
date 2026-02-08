import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

const people = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/people' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.enum(['pi', 'postdoc', 'phd', 'masters', 'undergrad', 'research-assistant', 'visiting', 'alumni']),
      title: z.string().optional(),
      photo: image().optional(),
      email: z.string().email().optional(),
      socials: z
        .object({
          github: z.string().url().optional(),
          scholar: z.string().url().optional(),
          twitter: z.string().url().optional(),
          linkedin: z.string().url().optional(),
          orcid: z.string().url().optional(),
          mastodon: z.string().url().optional(),
          bluesky: z.string().url().optional(),
          website: z.string().url().optional(),
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
      url: z.string().url().optional(),
      repoUrl: z.string().url().optional(),
      paperUrl: z.string().url().optional(),
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
      doi: z.string().optional(),
      url: z.string().url().optional(),
      pdf: z.string().url().optional(),
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
    slidesUrl: z.string().optional(),
    videoUrl: z.string().optional(),
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
