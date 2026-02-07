import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { getSiteConfig, getSiteName } from '../lib/config';

export async function GET(context: APIContext) {
  const config = getSiteConfig();
  const posts = await getCollection('posts', ({ data }) => !data.draft);

  return rss({
    title: getSiteName(),
    description: config.description,
    site: context.site!.toString(),
    items: posts
      .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
      .map((post) => ({
        title: post.data.title,
        pubDate: post.data.date,
        description: post.data.excerpt ?? '',
        link: `/blog/${post.id}/`,
        author: post.data.author ?? config.author,
        categories: post.data.tags,
      })),
  });
}
