import { reactive } from 'vue';
import type { AdminCtx, CommitResult } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type ToastAction = { label: string; run: () => void };
export const toasts = reactive<{ id: number; text: string; href?: string; action?: ToastAction }[]>([]);
let lastToast = 0;

export function toast(text: string, href?: string, action?: ToastAction): void {
  const id = ++lastToast;
  toasts.push({ id, text, href, action });
  setTimeout(
    () => {
      const i = toasts.findIndex((t) => t.id === id);
      if (i >= 0) toasts.splice(i, 1);
    },
    action ? 20000 : 8000,
  );
}

/** Set by AdminShell from the page context; `outage` is the persistent "database unreachable" banner. */
export const session = reactive({ mode: 'git' as AdminCtx['mode'], outage: '' });

export function committed(result: Pick<CommitResult, 'url' | 'warning' | 'tags' | 'detail'>): void {
  if (result.warning === 'cache-purge-failed') {
    const tags = result.tags ?? [];
    return toast('Published, but the page cache could not be refreshed: visitors may see the old version.', undefined, {
      label: 'Retry refresh',
      run: () => void api('cache/purge', { body: { tags } }).then(() => toast('Cache refreshed'), report),
    });
  }
  if (result.warning === 'pdf-failed')
    return toast(`Saved; PDF generation failed: ${result.detail ?? 'unknown error'}`);
  if (session.mode === 'postgres') return toast('Published');
  toast('Committed · live in about a minute', result.url);
}

/** A toast for any failure, listing field errors or import problems when the API sent them. */
export function report(e: unknown): void {
  if (e instanceof ApiError && Array.isArray(e.details)) return toast(`${e.message}: ${e.details.join('; ')}`);
  if (e instanceof ApiError && e.status === 400 && e.details && typeof e.details === 'object') {
    const fields = Object.entries(e.details as Record<string, string>).map(([k, v]) => `${k}: ${v}`);
    return toast(`${e.message} (${fields.join('; ')})`);
  }
  toast(e instanceof Error ? e.message : String(e));
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  // The session ended: reloading lets the middleware send the page to the login screen.
  if (res.status === 401) location.reload();
  if (res.status === 503) session.outage = data?.error ?? 'The database is unreachable.';
  else if (res.ok) session.outage = '';
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data?.details);
  return data as T;
}
