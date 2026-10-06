import { nextTick, reactive, watch } from 'vue';
import { ApiError, committed, report } from './api';
import type { CommitResult } from './types';

const storageKey = (key: string) => `scholaros-draft:${key}`;

function readDraft(key: string): unknown {
  try {
    const saved = localStorage.getItem(storageKey(key));
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, value: unknown): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    // Storage full or blocked: drafts are a convenience.
  }
}
function dropDraft(key: string): void {
  try {
    localStorage.removeItem(storageKey(key));
  } catch {
    // ignore
  }
}

type Loader<T> = () => Promise<{ value: T; version: string | null }>;

/**
 * One editable document: load it, keep every edit as a localStorage draft (cleared only after a successful
 * commit), save with the version it was loaded at, and expose the conflict and field-error states.
 * Use it as `doc.current`, `doc.save(…)`; don't destructure (that drops reactivity).
 */
export function useDocument<T extends object>() {
  let loader: Loader<T> | null = null;
  let tracking = false;
  const doc = reactive({
    key: '',
    current: null as T | null,
    version: null as string | null,
    draft: null as T | null,
    errors: {} as Record<string, string>,
    conflict: false,
    saving: false,
    async open(key: string, load: Loader<T>) {
      doc.key = key;
      loader = load;
      await doc.reload();
    },
    /** Point the document at a new key and loader without reloading (a read right after a commit can be stale). */
    retarget(key: string, load: Loader<T>) {
      doc.key = key;
      loader = load;
    },
    async reload() {
      if (!loader) return;
      tracking = false;
      try {
        const { value, version } = await loader();
        const saved = readDraft(doc.key) as T | null;
        doc.draft = (saved && JSON.stringify(saved) !== JSON.stringify(value) ? saved : null) as typeof doc.draft;
        doc.current = value as typeof doc.current;
        doc.version = version;
        doc.conflict = false;
        doc.errors = {};
      } catch (e) {
        report(e);
      }
      await nextTick(); // let the watcher see the loaded value before drafts are recorded
      tracking = true;
    },
    restore() {
      if (doc.draft) doc.current = doc.draft;
      doc.draft = null;
    },
    discard() {
      doc.draft = null;
      dropDraft(doc.key);
    },
    async save(send: (value: T, version: string | null) => Promise<CommitResult>, path: string) {
      if (!doc.current) return undefined;
      doc.saving = true;
      doc.errors = {};
      try {
        const result = await send(doc.current as T, doc.version);
        doc.version = result.versions[path] ?? null;
        doc.discard();
        committed(result);
        return result;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          doc.conflict = true;
          return undefined;
        }
        if (
          e instanceof ApiError &&
          e.status === 400 &&
          e.details &&
          typeof e.details === 'object' &&
          !Array.isArray(e.details)
        ) {
          doc.errors = e.details as Record<string, string>;
        }
        report(e);
        return undefined;
      } finally {
        doc.saving = false;
      }
    },
  });
  watch(
    () => doc.current,
    (value) => {
      if (tracking && !doc.draft && value && doc.key) writeDraft(doc.key, value);
    },
    { deep: true },
  );
  return doc;
}
