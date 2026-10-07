import type { Sql } from '../db';
import type { GitHubStore } from './github-store';
import { JOBS_JSON, isDocumentPath } from './paths';
import { gitBlobSha, type Change } from './store';

export const BACKUP_BRANCH = 'content-backup';
/** Left in the database by sub-project 3's backup record; never backed up (like jobs.json). */
const LEGACY_BACKUP_JSON = 'src/data/backup.json';

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
    select path, content from documents where path <> ${JOBS_JSON} and path <> ${LEGACY_BACKUP_JSON} order by path`;
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
    if (inDb.has(p) || p === JOBS_JSON || p === LEGACY_BACKUP_JSON || !isDocumentPath(p)) continue;
    changes.push({ path: p, content: null });
    base[p] = sha;
  }
  if (changes.length === 0) return { at, ok: true, changed: 0 };
  const result = await gh.commit(changes, `Content backup ${at.slice(0, 10)}`, base);
  return { at, ok: true, changed: changes.length, commit: result.url };
}
