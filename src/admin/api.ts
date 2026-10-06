import { reactive } from 'vue';
import type { CommitResult } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const toasts = reactive<{ id: number; text: string; href?: string }[]>([]);
let lastToast = 0;

export function toast(text: string, href?: string): void {
  const id = ++lastToast;
  toasts.push({ id, text, href });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, 8000);
}

export function committed(result: Pick<CommitResult, 'url'>): void {
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
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data?.details);
  return data as T;
}
