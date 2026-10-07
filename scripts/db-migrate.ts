#!/usr/bin/env tsx
/** pnpm db:migrate — applies migrations/*.sql to DATABASE_URL (reads .env.local from `vercel env pull`). */
import path from 'node:path';
import postgres from 'postgres';
import type { Sql } from '../src/lib/db';
import { migrate } from '../src/lib/db-migrate';

try {
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local: use the shell's environment
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (run `vercel env pull` first).');
  process.exit(1);
}
const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const applied = await migrate(client as unknown as Sql, path.resolve(import.meta.dirname, '..', 'migrations'));
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Up to date');
} finally {
  await client.end();
}
