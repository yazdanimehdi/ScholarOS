#!/usr/bin/env tsx
/** Exit 0 when a post became public since the last daily check (a rebuild is needed), 78 when none did. */
import fs from 'node:fs';
import path from 'node:path';
import { duePosts } from '../src/lib/due-posts';

const DIR = path.resolve(import.meta.dirname, '..', 'src', 'content', 'posts');
const files = fs.existsSync(DIR)
  ? fs
      .readdirSync(DIR)
      .filter((f) => /\.mdx?$/.test(f))
      .map((f) => ({ path: f, content: fs.readFileSync(path.join(DIR, f), 'utf-8') }))
  : [];
const due = duePosts(files);
console.log(due.length ? `Due: ${due.join(', ')}` : 'No post became due since the last daily check');
process.exit(due.length ? 0 : 78);
