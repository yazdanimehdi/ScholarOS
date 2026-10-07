#!/usr/bin/env tsx
/**
 * pnpm db:setup [--force] — copies this repo's content into Postgres (DATABASE_URL) and its images into Vercel Blob
 * (BLOB_READ_WRITE_TOKEN), rewriting image references to Blob URLs. Run once, locally, after `vercel env pull`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { put } from '@vercel/blob';
import postgres from 'postgres';
import { MediaError, prepareUpload } from '../src/lib/admin/media';
import { loadAdminSettings } from '../src/lib/admin/settings';
import type { Sql } from '../src/lib/db';
import { migrate } from '../src/lib/db-migrate';
import { mediaFiles, rewriteReferences, seedFiles } from '../src/lib/db-seed';

try {
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local: use the shell's environment
}
const ROOT = path.resolve(import.meta.dirname, '..');
if (!process.env.DATABASE_URL || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('DATABASE_URL and BLOB_READ_WRITE_TOKEN must be set (run `vercel env pull` first).');
  process.exit(1);
}
const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const sql = client as unknown as Sql;
try {
  await migrate(sql, path.join(ROOT, 'migrations'));
  const [{ count }] = await sql<{ count: number }>`select count(*)::int as count from documents`;
  if (count > 0 && !process.argv.includes('--force')) {
    console.error(
      `The database already has ${count} documents. Re-run with --force to overwrite them with the repo's files.`,
    );
    process.exitCode = 1;
  } else {
    const { mediaFolder, publicFolder } = loadAdminSettings(ROOT);
    const urls = new Map<string, string>();
    for (const file of mediaFiles(ROOT, mediaFolder)) {
      const bytes = fs.readFileSync(path.join(ROOT, file));
      try {
        const { filename, contentType } = prepareUpload(path.basename(file), bytes);
        const { url } = await put(filename, bytes, {
          access: 'public',
          contentType,
          addRandomSuffix: false,
          allowOverwrite: true,
        });
        await sql`insert into media (url, pathname, size, content_type)
          values (${url}, ${filename}, ${bytes.length}, ${contentType}) on conflict (url) do nothing`;
        urls.set(file, url);
      } catch (e) {
        if (!(e instanceof MediaError)) throw e;
        console.warn(`  image not uploaded: ${file} (${e.message})`);
      }
    }
    const { documents, skipped } = seedFiles(ROOT);
    for (const file of documents) {
      const content = rewriteReferences(file, fs.readFileSync(path.join(ROOT, file), 'utf8'), urls, {
        publicFolder,
        mediaFolder,
      });
      await sql.begin(async (tx) => {
        const [row] = await tx<{ version: number }>`
          insert into documents (path, content, updated_by) values (${file}, ${content}, 'seed')
          on conflict (path) do update set content = excluded.content, version = documents.version + 1,
            updated_at = now(), updated_by = 'seed'
          returning version`;
        await tx`insert into revisions (path, content, version, author) values (${file}, ${content}, ${row.version}, 'seed')`;
      });
    }
    console.log(`Documents: ${documents.length}`);
    console.log(`Images uploaded to Blob: ${urls.size}`);
    if (skipped.length) {
      console.log(
        `Not copied (Postgres mode edits only slug-named files the admin allows):\n  ${skipped.join('\n  ')}`,
      );
    }
  }
} finally {
  await client.end();
}
