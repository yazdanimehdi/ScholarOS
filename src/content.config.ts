import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import {
  announcementsSchema,
  feedItemSchema,
  peopleSchema,
  positionsSchema,
  postsSchema,
  projectsSchema,
  publicationsSchema,
  talksSchema,
} from './lib/schemas';

const markdown = (dir: string) => glob({ pattern: '**/*.{md,mdx}', base: `src/content/${dir}` });

export const collections = {
  people: defineCollection({ loader: markdown('people'), schema: ({ image }) => peopleSchema(image) }),
  announcements: defineCollection({
    loader: markdown('announcements'),
    schema: ({ image }) => announcementsSchema(image),
  }),
  projects: defineCollection({ loader: markdown('projects'), schema: ({ image }) => projectsSchema(image) }),
  posts: defineCollection({ loader: markdown('posts'), schema: ({ image }) => postsSchema(image) }),
  publications: defineCollection({
    loader: markdown('publications'),
    schema: ({ image }) => publicationsSchema(image),
  }),
  talks: defineCollection({ loader: markdown('talks'), schema: talksSchema }),
  feeds: defineCollection({ loader: file('src/data/feeds.json'), schema: feedItemSchema }),
  positions: defineCollection({ loader: markdown('positions'), schema: positionsSchema }),
};
