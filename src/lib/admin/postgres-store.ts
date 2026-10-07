import { del, put } from '@vercel/blob';
import { dangerouslyDeleteByTag } from '@vercel/functions';
import { tagsForPaths } from '../cache-tags';
import { isUnreachable, type Sql } from '../db';
import { PathError } from './paths';
import {
  ConflictError,
  UpstreamError,
  type Author,
  type Change,
  type CommitResult,
  type ContentStore,
  type MediaFile,
  type MediaFolder,
  type StoredFile,
  type UploadResult,
} from './store';

const KEEP_REVISIONS = 50;

export interface Revision {
  id: string;
  version: number;
  created_at: string;
  author: string | null;
  deleted: boolean;
}

/** What the store calls outside the database; tests pass fakes. */
export interface PostgresDeps {
  purge(tags: string[]): Promise<void>;
  put(pathname: string, body: Buffer, contentType: string): Promise<{ url: string }>;
  del(url: string): Promise<void>;
}

const defaultDeps: PostgresDeps = {
  purge: (tags) => dangerouslyDeleteByTag(tags),
  put: (pathname, body, contentType) =>
    put(pathname, body, { access: 'public', contentType, addRandomSuffix: false, allowOverwrite: true }),
  del: (url) => del(url),
};

const blobFailure = (e: unknown) =>
  new UpstreamError(`Image storage (Vercel Blob) failed: ${(e as Error).message}`, 502);

const text = (c: Change) =>
  c.content === null ? null : c.encoding === 'base64' ? Buffer.from(c.content, 'base64').toString('utf8') : c.content;

/** Content in Postgres: `documents` holds the repo's files by path, `revisions` every saved state. */
export class PostgresStore implements ContentStore {
  constructor(
    private sql: Sql,
    private author?: Author,
    private deps: PostgresDeps = defaultDeps,
  ) {}

  /** "Can't reach the database" becomes a 503 the admin shows as a banner; other errors pass through. */
  private async db<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      if (isUnreachable(e)) throw new UpstreamError('The database is unreachable. Try again in a moment.', 503);
      throw e;
    }
  }

  async read(path: string): Promise<StoredFile | null> {
    const [row] = await this.db(
      () => this.sql<{ content: string; version: number }>`select content, version from documents where path = ${path}`,
    );
    return row ? { path, content: row.content, version: String(row.version) } : null;
  }

  async list(dir: string): Promise<{ path: string; version: string }[]> {
    const rows = await this.db(
      () =>
        this.sql<{ path: string; version: number }>`
          select path, version from documents where starts_with(path, ${`${dir}/`}) order by path`,
    );
    return rows.map((r) => ({ path: r.path, version: String(r.version) }));
  }

  async lastModified(path: string): Promise<string | null> {
    const [row] = await this.db(
      () => this.sql<{ updated_at: Date }>`select updated_at from documents where path = ${path}`,
    );
    return row ? new Date(row.updated_at).toISOString() : null;
  }

  /** `message` is a git concept: revisions record author and time instead. */
  async commit(changes: Change[], _message: string, base: Record<string, string | null>): Promise<CommitResult> {
    const paths = changes.map((c) => c.path);
    const author = this.author?.name ?? null;
    const result = await this.db(() =>
      this.sql.begin(async (tx) => {
        const rows = await tx<{ path: string; version: number }>`
          select path, version from documents where path = any(${paths}::text[]) for update`;
        const current = new Map(rows.map((r) => [r.path, r.version]));
        for (const c of changes) {
          const have = current.has(c.path) ? String(current.get(c.path)) : null;
          if (have !== (base[c.path] ?? null) || (c.content === null && have === null)) throw new ConflictError(c.path);
        }
        const versions: Record<string, string | null> = {};
        let id = 0;
        for (const c of changes) {
          const prev = current.get(c.path);
          let version = (prev ?? 0) + 1;
          if (prev === undefined) {
            // A re-created path continues after its history, so an editor holding a pre-delete version conflicts.
            const [last] = await tx<{ v: number }>`
              select coalesce(max(version), 0) as v from revisions where path = ${c.path}`;
            version = last.v + 1;
          }
          const content = text(c);
          const [rev] = await tx<{ id: string | number }>`
            insert into revisions (path, content, version, author)
            values (${c.path}, ${content}, ${version}, ${author}) returning id`;
          id = Math.max(id, Number(rev.id));
          if (content === null) {
            await tx`delete from documents where path = ${c.path}`;
          } else if (prev === undefined) {
            // A concurrent create of the same path loses here instead of overwriting the winner.
            const created = await tx`
              insert into documents (path, content, version, updated_by)
              values (${c.path}, ${content}, ${version}, ${author})
              on conflict (path) do nothing returning path`;
            if (created.length === 0) throw new ConflictError(c.path);
          } else {
            await tx`
              update documents set content = ${content}, version = ${version}, updated_at = now(), updated_by = ${author}
              where path = ${c.path}`;
          }
          versions[c.path] = content === null ? null : String(version);
        }
        await tx`
          delete from revisions where id in (
            select id from (
              select id, row_number() over (partition by path order by id desc) as n
              from revisions where path = any(${paths}::text[])
            ) ranked where n > ${KEEP_REVISIONS})`;
        return { id: String(id), versions };
      }),
    );
    return { ...result, ...(await this.purgeAfterCommit(paths)) };
  }

  /** Drops cached pages that read these tags; the next request renders fresh (the editor sees the change at once). */
  async purgeTags(tags: string[]): Promise<void> {
    try {
      await this.deps.purge(tags);
    } catch (e) {
      throw new UpstreamError(`The cache refresh failed: ${(e as Error).message}`, 502);
    }
  }

  /** A failed purge never fails the save: the edit is stored and the admin offers "Retry refresh". */
  private async purgeAfterCommit(paths: string[]): Promise<Pick<CommitResult, 'warning' | 'tags'>> {
    const tags = tagsForPaths(paths);
    if (tags.length === 0) return {};
    try {
      await this.purgeTags(tags);
      return {};
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[postgres-store] cache purge failed', tags, e);
      return { warning: 'cache-purge-failed', tags };
    }
  }

  async history(path: string): Promise<Revision[]> {
    const rows = await this.db(
      () =>
        this.sql<{ id: string | number; version: number; created_at: Date; author: string | null; deleted: boolean }>`
          select id, version, created_at, author, content is null as deleted
          from revisions where path = ${path} order by id desc`,
    );
    return rows.map((r) => ({
      id: String(r.id),
      version: r.version,
      created_at: new Date(r.created_at).toISOString(),
      author: r.author,
      deleted: r.deleted,
    }));
  }

  async revision(id: string): Promise<{ path: string; content: string | null } | null> {
    if (!/^\d{1,18}$/.test(id)) return null;
    const [row] = await this.db(
      () =>
        this.sql<{
          path: string;
          content: string | null;
        }>`select path, content from revisions where id = ${id}::bigint`,
    );
    return row ? { path: row.path, content: row.content } : null;
  }

  /** Postgres mode keeps every image in Blob, so both folders list the same library. */
  async listMedia(_folder: MediaFolder): Promise<MediaFile[]> {
    const rows = await this.db(() => this.sql<{ url: string }>`select url from media order by created_at desc, url`);
    return rows.map((r) => ({ path: r.url, url: r.url, version: '1' }));
  }

  async putMedia(_folder: MediaFolder, filename: string, base64: string, contentType: string): Promise<UploadResult> {
    const [existing] = await this.db(
      () => this.sql<{ url: string }>`select url from media where pathname = ${filename}`,
    );
    if (existing) return { path: existing.url, url: existing.url, version: '1', commit: null };
    const bytes = Buffer.from(base64, 'base64');
    let url: string;
    try {
      ({ url } = await this.deps.put(filename, bytes, contentType));
    } catch (e) {
      throw blobFailure(e);
    }
    await this.db(
      () => this.sql`
        insert into media (url, pathname, size, content_type)
        values (${url}, ${filename}, ${bytes.length}, ${contentType}) on conflict (url) do nothing`,
    );
    return { path: url, url, version: '1', commit: { id: `blob:${filename}` } };
  }

  /** Only images this site uploaded (a row in `media`) can be deleted. */
  async deleteMedia(path: string, _version: string): Promise<CommitResult> {
    const [row] = await this.db(() => this.sql`select url from media where url = ${path}`);
    if (!row) throw new PathError('Not an image in this site’s library');
    try {
      await this.deps.del(path);
    } catch (e) {
      throw blobFailure(e);
    }
    await this.db(() => this.sql`delete from media where url = ${path}`);
    return { id: `blob:${path}`, versions: { [path]: null } };
  }
}
