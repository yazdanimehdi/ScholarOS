import fs from 'node:fs';
import path from 'node:path';
import { ConflictError, gitBlobSha, type Change, type ContentStore, type StoredFile } from './store';

type Overlay = { content: string; encoding: 'utf-8' | 'base64' } | null;

/** The working tree plus in-memory edits: reads fall through to disk, commits never touch it. Dev and tests only. */
export class MemoryStore implements ContentStore {
  private overlay = new Map<string, Overlay>();
  private modified = new Map<string, string>();
  /** Every commit, oldest first. */
  readonly log: { id: string; message: string; paths: string[] }[] = [];

  constructor(private root = process.cwd()) {}

  private version(p: string): string | null {
    if (this.overlay.has(p)) {
      const file = this.overlay.get(p);
      return file ? gitBlobSha(file.content, file.encoding) : null;
    }
    try {
      return gitBlobSha(fs.readFileSync(path.join(this.root, p)));
    } catch {
      return null;
    }
  }

  async read(p: string): Promise<StoredFile | null> {
    const version = this.version(p);
    if (version === null) return null;
    const file = this.overlay.get(p);
    const content = file
      ? Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8')
      : fs.readFileSync(path.join(this.root, p), 'utf8');
    return { path: p, content, version };
  }

  async list(dir: string): Promise<{ path: string; version: string }[]> {
    const paths = new Set<string>();
    const walk = (d: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(path.join(this.root, d), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) walk(`${d}/${e.name}`);
        else if (e.isFile()) paths.add(`${d}/${e.name}`);
      }
    };
    walk(dir);
    for (const p of this.overlay.keys()) if (p.startsWith(`${dir}/`)) paths.add(p);
    return [...paths].sort().flatMap((p) => {
      const version = this.version(p);
      return version ? [{ path: p, version }] : [];
    });
  }

  async commit(changes: Change[], message: string, base: Record<string, string | null>) {
    for (const c of changes) if (this.version(c.path) !== (base[c.path] ?? null)) throw new ConflictError(c.path);
    const now = new Date().toISOString();
    for (const c of changes) {
      this.overlay.set(c.path, c.content === null ? null : { content: c.content, encoding: c.encoding ?? 'utf-8' });
      this.modified.set(c.path, now);
    }
    const id = `memory-${this.log.length + 1}`;
    this.log.push({ id, message, paths: changes.map((c) => c.path) });
    return { id };
  }

  async lastModified(p: string): Promise<string | null> {
    return this.modified.get(p) ?? null;
  }
}

const holder = globalThis as { __scholarosMemoryStore?: MemoryStore };

/** One store per dev-server process, so edits survive across requests and Vite module reloads. */
export function memoryStore(): MemoryStore {
  return (holder.__scholarosMemoryStore ??= new MemoryStore());
}
