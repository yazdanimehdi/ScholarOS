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
    /** Set when the post was cross-posted: the Writing page then hides Medium's copy of it. */
    medium: z.object({ url: optionalUrl, id: emptyToUndefined }).optional(),
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
const cvEntry = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ visible: z.boolean().optional(), ...shape }).passthrough();

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
    /** The JS PDF renderer's paper size (Postgres mode); RenderCV ignores it. */
    pdf: z
      .object({ pageSize: z.enum(['LETTER', 'A4']).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const siteSchema = z
  .object({
    siteMode: z.enum(['personal', 'lab']),
    title: z.string().min(1),
    author: z.string(),
    theme: z.enum(['classic', 'editorial', '']).optional(),
    adminPath: z
      .string()
      .regex(/^[a-z0-9-]*$/, 'Use lowercase letters, digits and dashes')
      .optional(),
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
