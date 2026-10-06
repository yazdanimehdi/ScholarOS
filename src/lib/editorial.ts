/** "Prof. Jane Smith" → "Jane Smith". Used to find the site owner in author lists. */
export function stripHonorific(name: string): string {
  return name
    .trim()
    .replace(/^(prof|dr)\.?\s+/i, '')
    .trim();
}

export function isOwner(author: string, siteAuthor: string): boolean {
  return stripHonorific(author) === stripHonorific(siteAuthor);
}

/** "https://doi.org/10.1/x" → "10.1/x". */
export function bareDoi(doi: string): string {
  return doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
}

/** "arXiv:2410.12459" or "https://arxiv.org/abs/2410.12459" → "2410.12459". */
export function bareArxiv(id: string): string {
  return id
    .trim()
    .replace(/^arxiv:/i, '')
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//i, '');
}

/** Paper link priority: url → doi → arXiv. */
export function paperLink(p: { url?: string; doi?: string; arxiv?: string }): string | undefined {
  if (p.url) return p.url;
  if (p.doi) return `https://doi.org/${bareDoi(p.doi)}`;
  if (p.arxiv) return `https://arxiv.org/abs/${bareArxiv(p.arxiv)}`;
  return undefined;
}

/** "HELM: Hierarchical Encoding…" → "HELM"; titles without a usable colon prefix stay whole. */
export function shortTitle(title: string): string {
  return title.split(':')[0].trim() || title.trim();
}
