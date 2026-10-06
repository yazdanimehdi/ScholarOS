import { nextTick, reactive, watch } from 'vue';
import { ApiError, committed, report } from './api';
import type { CommitResult } from './types';

const storageKey = (key: string) => `scholaros-draft:${key}`;

/** A draft and the version it was edited from (undefined: a draft saved before versions were recorded). */
type Draft = { base?: string | null; value: unknown };

function readDraft(key: string): Draft | null {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(key)) ?? 'null');
    if (!saved || typeof saved !== 'object') return null;
    const keys = Object.keys(saved);
    return keys.length === 2 && keys.includes('base') && keys.includes('value') ? saved : { value: saved };
  } catch {
    return null;
  }
}
function writeDraft(key: string, draft: Draft): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(draft));
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

function changedKeys(a: object, b: object): string[] {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter(
    (k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]),
  );
}

/** `readonly`: the document can't be saved here (e.g. MDX), so no drafts are offered or recorded. */
type Loader<T> = () => Promise<{ value: T; version: string | null; readonly?: boolean }>;

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
    readonly: false,
    draft: null as T | null,
    /** The draft was edited from an older version than the one loaded: restoring it overwrites newer changes. */
    draftStale: false,
    /** Top-level keys where the draft and the loaded value differ. */
    draftChanges: [] as string[],
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
        const { value, version, readonly = false } = await loader();
        const saved = readonly ? null : readDraft(doc.key);
        const offered = saved && JSON.stringify(saved.value) !== JSON.stringify(value) ? (saved.value as T) : null;
        doc.draft = offered as typeof doc.draft;
        doc.draftStale = !!offered && saved!.base !== undefined && saved!.base !== version;
        doc.draftChanges = offered ? changedKeys(offered, value) : [];
        doc.current = value as typeof doc.current;
        doc.version = version;
        doc.readonly = readonly;
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
      doc.draftStale = false;
    },
    discard() {
      doc.draft = null;
      doc.draftStale = false;
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
        const exists = e instanceof ApiError && (e.details as { exists?: boolean } | undefined)?.exists === true;
        if (e instanceof ApiError && e.status === 409 && !exists) {
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
      if (tracking && !doc.readonly && !doc.draft && value && doc.key)
        writeDraft(doc.key, { base: doc.version, value });
    },
    { deep: true },
  );
  return doc;
}
