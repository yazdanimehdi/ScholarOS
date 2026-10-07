/* eslint-disable @typescript-eslint/no-explicit-any -- front matter is user data of any shape */

export interface AdminCtx {
  adminPath: string;
  siteName: string;
  user: { login: string; name: string; avatar: string } | null;
  mode: 'static' | 'git' | 'postgres';
  /** MEDIUM_TOKEN is set: "Also publish to Medium" posts through the API. */
  mediumToken?: boolean;
  /** siteUrl from config/site.yml (post editor only): the public post URL handed to Medium's import tool. */
  siteUrl?: string;
}

export interface CommitResult {
  id: string;
  url?: string;
  versions: Record<string, string | null>;
  warning?: 'cache-purge-failed' | 'pdf-failed';
  detail?: string;
  tags?: string[];
}

export interface Entry {
  slug: string;
  data: Record<string, any>;
  version: string;
  readonly?: boolean;
}

export interface MediaFile {
  path: string;
  url: string;
  version: string;
}
