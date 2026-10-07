import fs from 'node:fs';
import path from 'node:path';
import type { Sql } from './db';

/** Applies every `<dir>/*.sql` not yet in schema_migrations, in name order, each in one transaction. */
export async function migrate(sql: Sql, dir = path.resolve('migrations')): Promise<string[]> {
  await sql.unsafe(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const done = new Set((await sql<{ name: string }>`select name from schema_migrations`).map((r) => r.name));
  const applied: string[] = [];
  for (const name of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (done.has(name)) continue;
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    applied.push(name);
  }
  return applied;
}
