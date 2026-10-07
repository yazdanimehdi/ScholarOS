import { getSql } from '../db';
import { getMode } from '../mode';
import { GitHubStore, githubConfig } from './github-store';
import { memoryStore } from './memory-store';
import { PostgresStore } from './postgres-store';
import type { Author, ContentStore } from './store';

let testFactory: ((author: Author) => ContentStore) | null = null;

/** Tests swap the store; production code never calls this. */
export function setStoreForTests(factory: ((author: Author) => ContentStore) | null): void {
  testFactory = factory;
}

/** The store for one request: Postgres in postgres mode, GitHub on git-mode Vercel, the in-memory overlay under `astro dev` with ADMIN_STORE=memory. */
export function getStore(author: Author): ContentStore {
  if (testFactory) return testFactory(author);
  if (process.env.ADMIN_STORE === 'memory') {
    if (!import.meta.env?.DEV) throw new Error('ADMIN_STORE=memory is only honored by `astro dev`');
    return memoryStore();
  }
  if (getMode() === 'postgres') return new PostgresStore(getSql(), author);
  return new GitHubStore(githubConfig(process.env), author);
}
