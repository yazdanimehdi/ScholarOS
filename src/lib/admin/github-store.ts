import { ConflictError, UpstreamError, type Author, type Change, type ContentStore, type StoredFile } from './store';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface WorkflowRun {
  status: string;
  conclusion: string | null;
  url: string;
  createdAt: string;
}

/** Repo from GITHUB_REPO ("owner/name") or Vercel's git metadata; branch from GITHUB_BRANCH, the deployed ref, or main. */
export function githubConfig(env: Record<string, string | undefined>): GitHubConfig {
  const [owner, repo] = env.GITHUB_REPO
    ? env.GITHUB_REPO.split('/')
    : [env.VERCEL_GIT_REPO_OWNER, env.VERCEL_GIT_REPO_SLUG];
  if (!env.GITHUB_TOKEN) {
    throw new UpstreamError('GITHUB_TOKEN is not set. Add a fine-grained token in the Vercel project settings.', 500);
  }
  if (!owner || !repo)
    throw new UpstreamError('Set GITHUB_REPO to "owner/name" (Vercel git metadata is missing).', 500);
  return { token: env.GITHUB_TOKEN, owner, repo, branch: env.GITHUB_BRANCH || env.VERCEL_GIT_COMMIT_REF || 'main' };
}

class GitHubError extends UpstreamError {
  constructor(
    message: string,
    readonly githubStatus: number,
  ) {
    super(message);
  }
}

/** The branch moved between reading the head and updating the ref. */
class RefRace extends Error {}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export class GitHubStore implements ContentStore {
  constructor(
    private cfg: GitHubConfig,
    private author?: Author,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private async gh<T>(method: string, route: string, body?: unknown, allow404 = false): Promise<T | null> {
    const res = await this.fetchFn(`https://api.github.com/repos/${this.cfg.owner}/${this.cfg.repo}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ScholarOS-admin',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (allow404 && res.status === 404) return null;
    if (res.status === 204) return null;
    if (!res.ok) throw await this.error(res);
    return (await res.json()) as T;
  }

  private async error(res: Response): Promise<GitHubError> {
    const text = await res.text().catch(() => '');
    let message = text;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      // not JSON: keep the text
    }
    if (res.status === 401)
      return new GitHubError(`GitHub rejected GITHUB_TOKEN (expired or revoked): ${message}`, 401);
    if (res.status === 403 || res.status === 404) {
      const needed =
        res.headers.get('x-accepted-github-permissions') || 'Contents: read and write, Actions: read and write';
      return new GitHubError(
        `GitHub refused the request (${res.status}: ${message}). The token needs ${needed} on ${this.cfg.owner}/${this.cfg.repo}.`,
        res.status,
      );
    }
    return new GitHubError(`GitHub error ${res.status}: ${message}`, res.status);
  }

  private ref(ref = this.cfg.branch): string {
    return `?ref=${encodeURIComponent(ref)}`;
  }

  async read(path: string): Promise<StoredFile | null> {
    const file = await this.gh<{ type?: string; sha: string; content?: string; encoding?: string }>(
      'GET',
      `/contents/${encodePath(path)}${this.ref()}`,
      undefined,
      true,
    );
    if (!file || Array.isArray(file) || file.type !== 'file') return null;
    if (file.encoding !== 'base64')
      throw new UpstreamError(`${path} is larger than 1 MB and can't be edited here.`, 413);
    return { path, content: Buffer.from(file.content ?? '', 'base64').toString('utf8'), version: file.sha };
  }

  async list(dir: string): Promise<{ path: string; version: string }[]> {
    const entries = await this.gh<{ type: string; path: string; sha: string }[]>(
      'GET',
      `/contents/${encodePath(dir)}${this.ref()}`,
      undefined,
      true,
    );
    if (!Array.isArray(entries)) return [];
    const nested = await Promise.all(
      entries.map(async (e) =>
        e.type === 'dir' ? this.list(e.path) : e.type === 'file' ? [{ path: e.path, version: e.sha }] : [],
      ),
    );
    return nested.flat();
  }

  async commit(changes: Change[], message: string, base: Record<string, string | null>) {
    try {
      return await this.tryCommit(changes, message, base);
    } catch (e) {
      if (!(e instanceof RefRace)) throw e;
      // The branch moved: start again from the new head (versions are checked again there).
      try {
        return await this.tryCommit(changes, message, base);
      } catch (again) {
        throw again instanceof RefRace ? new ConflictError(changes[0]?.path ?? this.cfg.branch) : again;
      }
    }
  }

  private async tryCommit(changes: Change[], message: string, base: Record<string, string | null>) {
    const branch = encodePath(this.cfg.branch);
    const head = (await this.gh<{ object: { sha: string } }>('GET', `/git/ref/heads/${branch}`))!.object.sha;
    const baseTree = (await this.gh<{ tree: { sha: string } }>('GET', `/git/commits/${head}`))!.tree.sha;
    const current = await Promise.all(
      changes.map((c) =>
        this.gh<{ sha: string }>('GET', `/contents/${encodePath(c.path)}${this.ref(head)}`, undefined, true),
      ),
    );
    changes.forEach((c, i) => {
      const file = current[i];
      const sha = file && !Array.isArray(file) ? file.sha : null;
      if (sha !== (base[c.path] ?? null)) throw new ConflictError(c.path);
    });
    const tree = await Promise.all(
      changes.map(async (c) => ({
        path: c.path,
        mode: '100644',
        type: 'blob',
        sha:
          c.content === null
            ? null
            : (await this.gh<{ sha: string }>('POST', '/git/blobs', {
                content: c.content,
                encoding: c.encoding ?? 'utf-8',
              }))!.sha,
      })),
    );
    const newTree = (await this.gh<{ sha: string }>('POST', '/git/trees', { base_tree: baseTree, tree }))!.sha;
    const author = this.author && { ...this.author, date: new Date().toISOString() };
    const commit = (await this.gh<{ sha: string; html_url: string }>('POST', '/git/commits', {
      message,
      tree: newTree,
      parents: [head],
      ...(author ? { author } : {}),
    }))!;
    try {
      await this.gh('PATCH', `/git/refs/heads/${branch}`, { sha: commit.sha, force: false });
    } catch (e) {
      if (e instanceof GitHubError && e.githubStatus === 422) throw new RefRace();
      throw e;
    }
    return { id: commit.sha, url: commit.html_url };
  }

  async lastModified(path: string): Promise<string | null> {
    const commits = await this.gh<{ commit: { committer: { date: string } } }[]>(
      'GET',
      `/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(this.cfg.branch)}&per_page=1`,
    );
    return commits?.[0]?.commit.committer.date ?? null;
  }

  /** Starts a workflow_dispatch run (e.g. render-cv.yml) on the configured branch. */
  async dispatchWorkflow(file: string): Promise<void> {
    await this.gh('POST', `/actions/workflows/${encodeURIComponent(file)}/dispatches`, { ref: this.cfg.branch });
  }

  async latestRun(file: string): Promise<WorkflowRun | null> {
    const runs = await this.gh<{
      workflow_runs: { status: string; conclusion: string | null; html_url: string; created_at: string }[];
    }>(
      'GET',
      `/actions/workflows/${encodeURIComponent(file)}/runs?per_page=1&branch=${encodeURIComponent(this.cfg.branch)}`,
    );
    const run = runs?.workflow_runs[0];
    return run
      ? { status: run.status, conclusion: run.conclusion, url: run.html_url, createdAt: run.created_at }
      : null;
  }

  /** Read probes for the admin's permission banner; missing write access shows up as a 502 on the first save. */
  async capabilities(): Promise<{ contents: boolean; actions: boolean; error?: string }> {
    const probe = (route: string) =>
      this.gh('GET', route).then(
        () => true,
        () => false,
      );
    const [contents, actions] = await Promise.all([
      probe(`/contents/config/site.yml${this.ref()}`),
      probe('/actions/workflows?per_page=1'),
    ]);
    const error = !contents
      ? `The GitHub token can't read ${this.cfg.owner}/${this.cfg.repo}. It needs Contents: read and write.`
      : !actions
        ? 'The GitHub token lacks Actions: read and write, so "Generate PDF" will not work.'
        : undefined;
    return { contents, actions, ...(error ? { error } : {}) };
  }
}
