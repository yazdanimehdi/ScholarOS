/* eslint-disable @typescript-eslint/no-explicit-any -- front matter is user data of any shape */

export interface AdminCtx {
  adminPath: string;
  siteName: string;
  user: { login: string; name: string; avatar: string } | null;
}

export interface CommitResult {
  id: string;
  url?: string;
  versions: Record<string, string | null>;
  warning?: 'cache-purge-failed';
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
