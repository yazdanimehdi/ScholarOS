import { createHash } from 'node:crypto';

export interface StoredFile {
  path: string;
  content: string;
  /** Git blob sha (GitHub, memory) or row version (Postgres, sub-project 3). */
  version: string;
}

export interface Change {
  path: string;
  /** null deletes the file. */
  content: string | null;
  encoding?: 'utf-8' | 'base64';
}

export interface Author {
  name: string;
  email: string;
}

export interface ContentStore {
  /** Files under `dir`, recursively; [] when the folder doesn't exist. */
  list(dir: string): Promise<{ path: string; version: string }[]>;
  read(path: string): Promise<StoredFile | null>;
  /**
   * One atomic commit. `base[path]` is the version the caller started from (null or missing: the file must not
   * exist yet). Any mismatch throws ConflictError and writes nothing.
   */
  commit(
    changes: Change[],
    message: string,
    base: Record<string, string | null>,
  ): Promise<{ id: string; url?: string }>;
  /** ISO time of the last change to `path`, or null when unknown. */
  lastModified(path: string): Promise<string | null>;
}

export class ConflictError extends Error {
  constructor(readonly path: string) {
    super(`${path} changed since you opened it`);
  }
}

/** The backing store failed; `status` is what the admin API answers with. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** The sha git assigns to a blob with these bytes: the version of a file the admin just wrote. */
export function gitBlobSha(content: string | Uint8Array, encoding: 'utf-8' | 'base64' = 'utf-8'): string {
  const bytes =
    typeof content === 'string'
      ? Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8')
      : Buffer.from(content);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
