import type { Sql } from '../db';
import type { GitHubStore } from './github-store';
import { BACKUP_JSON, isDocumentPath } from './paths';
import { gitBlobSha, type Change, type ContentStore } from './store';

export const BACKUP_BRANCH = 'content-backup';

export interface BackupResult {
  at: string;
  ok: boolean;
  changed?: number;
  commit?: string;
  skipped?: string;
  error?: string;
}

/**
 * Mirrors every database document onto the backup branch in one commit: changed files written, files deleted in the
 * database deleted on the branch. Code and images on the branch are never touched. No changes → no commit.
 */
export async function backupToGit(
  sql: Sql,
  gh: Pick<GitHubStore, 'tree' | 'createBranch' | 'commit'>,
  now = new Date(),
): Promise<BackupResult> {
  const at = now.toISOString();
  const docs = await sql<{ path: string; content: string }>`
    select path, content from documents where path <> ${BACKUP_JSON} order by path`;
  let tree = await gh.tree();
  if (!tree) {
    await gh.createBranch();
    tree = (await gh.tree()) ?? new Map();
  }
  const inDb = new Set(docs.map((d) => d.path));
  const changes: Change[] = [];
  const base: Record<string, string | null> = {};
  for (const d of docs) {
    const sha = tree.get(d.path) ?? null;
    if (sha === gitBlobSha(d.content)) continue;
    changes.push({ path: d.path, content: d.content });
    base[d.path] = sha;
  }
  for (const [p, sha] of tree) {
    if (inDb.has(p) || p === BACKUP_JSON || !isDocumentPath(p)) continue;
    changes.push({ path: p, content: null });
    base[p] = sha;
  }
  if (changes.length === 0) return { at, ok: true, changed: 0 };
  const result = await gh.commit(changes, `Content backup ${at.slice(0, 10)}`, base);
  return { at, ok: true, changed: changes.length, commit: result.url };
}

/** The dashboard shows the last result. */
export async function recordBackup(store: ContentStore, result: BackupResult): Promise<void> {
  const current = await store.read(BACKUP_JSON);
  await store.commit([{ path: BACKUP_JSON, content: `${JSON.stringify(result, null, 2)}\n` }], 'Record backup', {
    [BACKUP_JSON]: current?.version ?? null,
  });
}
