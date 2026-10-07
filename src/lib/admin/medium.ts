export interface MediumPost {
  title: string;
  contentFormat: 'markdown';
  content: string;
  canonicalUrl: string;
  tags: string[];
  publishStatus: 'draft';
}

export class MediumError extends Error {}

const API = 'https://api.medium.com/v1';
const KEEP = /^([a-z][a-z0-9+.-]*:|#|\/\/)/i;
const absolute = (target: string, base: string) => (KEEP.test(target) ? target : new URL(target, base).href);

// ponytail: git-mode posts reference content images by repo path (../../assets/…), which no URL resolves; Medium shows
// those broken. Postgres-mode images are Blob URLs already.
/** Relative Markdown link/image targets and HTML src/href values made absolute against `base` (the post URL). */
export function absoluteUrls(markdown: string, base: string): string {
  return markdown
    .replace(/(\]\(\s*)([^)\s]+)/g, (_, open: string, target: string) => open + absolute(target, base))
    .replace(/(\s(?:src|href)=")([^"]+)"/g, (_, open: string, target: string) => `${open}${absolute(target, base)}"`);
}

/** The Medium API body for a site post: canonical link back to the site, at most 5 tags, always a draft. */
export function mediumPayload(
  post: { title: string; subtitle?: string; tags?: string[] },
  body: string,
  postUrl: string,
): MediumPost {
  const head = [`# ${post.title}`, ...(post.subtitle ? [`## ${post.subtitle}`] : [])].join('\n\n');
  return {
    title: post.title,
    contentFormat: 'markdown',
    content: `${head}\n\n${absoluteUrls(body, postUrl)}`,
    canonicalUrl: postUrl,
    tags: (post.tags ?? []).slice(0, 5),
    publishStatus: 'draft',
  };
}

async function medium<T>(fetchFn: typeof fetch, token: string, path: string, body?: unknown): Promise<T> {
  const res = await fetchFn(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as { data?: T; errors?: { message?: string }[] } | null;
  if (!res.ok || !data?.data) {
    const why = data?.errors?.[0]?.message ?? res.statusText;
    throw new MediumError(
      res.status === 401 ? `Medium rejected the token (401): ${why}` : `Medium answered ${res.status}: ${why}`,
    );
  }
  return data.data;
}

/** Token path: a Medium draft of the post under the token's user. */
export async function crossPost(
  token: string,
  payload: MediumPost,
  fetchFn: typeof fetch = fetch,
): Promise<{ id: string; url: string }> {
  const me = await medium<{ id: string }>(fetchFn, token, '/me');
  const post = await medium<{ id: string; url: string }>(fetchFn, token, `/users/${me.id}/posts`, payload);
  return { url: post.url, id: post.id }; // key order = front matter order (url first)
}
