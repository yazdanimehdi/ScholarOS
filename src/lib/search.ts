import { getCollection } from 'astro:content';

export interface SearchItem {
  title: string;
  href: string;
  type: string;
  content?: string;
}

export async function getSearchItems(): Promise<SearchItem[]> {
  const [posts, publications, people, projects, announcements, positions, talks] = await Promise.all([
    getCollection('posts'),
    getCollection('publications'),
    getCollection('people'),
    getCollection('projects'),
    getCollection('announcements'),
    getCollection('positions'),
    getCollection('talks'),
  ]);

  const items: SearchItem[] = [];

  for (const post of posts) {
    if (post.data.draft) continue;
    items.push({
      title: post.data.title,
      href: `/blog/${post.id}`,
      type: 'blog',
      content: post.data.excerpt,
    });
  }

  for (const pub of publications) {
    items.push({
      title: pub.data.title,
      href: `/publications#${pub.id}`,
      type: 'publication',
      content: pub.data.abstract,
    });
  }

  for (const person of people) {
    if (!person.data.active) continue;
    items.push({
      title: person.data.name,
      href: `/people/${person.id}`,
      type: 'person',
      content: person.data.title,
    });
  }

  for (const project of projects) {
    items.push({
      title: project.data.title,
      href: `/projects/${project.id}`,
      type: 'project',
      content: project.data.excerpt,
    });
  }

  for (const announcement of announcements) {
    items.push({
      title: announcement.data.title,
      href: `/news/${announcement.id}`,
      type: 'news',
      content: announcement.data.excerpt,
    });
  }

  for (const position of positions) {
    items.push({
      title: position.data.title,
      href: `/positions#${position.id}`,
      type: 'position',
      content: position.data.excerpt,
    });
  }

  for (const talk of talks) {
    items.push({
      title: talk.data.title,
      href: '/talks',
      type: 'talk',
      content: `${talk.data.event} ${talk.data.location || ''}`.trim(),
    });
  }

  return items;
}
