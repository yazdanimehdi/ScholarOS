#!/usr/bin/env tsx
/** pnpm db:export [dir] — writes every database document to `dir` (default: the repo) at its path. Images stay Blob URLs. */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import type { Sql } from '../src/lib/db';
import { exportTarget } from '../src/lib/db-seed';

try {
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local: use the shell's environment
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (run `vercel env pull` first).');
  process.exit(1);
}
const dir = path.resolve(process.argv[2] ?? path.resolve(import.meta.dirname, '..'));
const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const rows = await (client as unknown as Sql)<{ path: string; content: string }>`select path, content from documents order by path`;
  let written = 0;
  for (const row of rows) {
    const target = exportTarget(dir, row.path);
    if (!target) {
      console.warn(`  skipped ${row.path}: not a document path`);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, row.content);
    written++;
  }
  console.log(`Wrote ${written} files to ${dir}`);
} finally {
  await client.end();
}
