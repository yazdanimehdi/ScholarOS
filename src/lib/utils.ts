export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  });
}

export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatYear(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getFullYear();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getRoleName(role: string): string {
  const roleNames: Record<string, string> = {
    pi: 'Principal Investigator',
    postdoc: 'Postdoctoral Researcher',
    phd: 'PhD Student',
    masters: "Master's Student",
    undergrad: 'Undergraduate Researcher',
    'research-assistant': 'Research Assistant',
    visiting: 'Visiting Researcher',
    alumni: 'Alumni',
  };
  return roleNames[role] || role;
}

export function getRoleGroup(role: string): string {
  const groups: Record<string, string> = {
    pi: 'Faculty',
    postdoc: 'Researchers',
    phd: 'Students',
    masters: 'Students',
    undergrad: 'Students',
    'research-assistant': 'Researchers',
    visiting: 'Researchers',
    alumni: 'Alumni',
  };
  return groups[role] || 'Other';
}

export function getCategoryColor(category: string): { bg: string; text: string } {
  const colors: Record<string, { bg: string; text: string }> = {
    paper: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
    grant: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' },
    award: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    talk: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
    media: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300' },
    general: { bg: 'bg-gray-100 dark:bg-gray-900/30', text: 'text-gray-700 dark:text-gray-300' },
  };
  return colors[category] || colors.general;
}

export function getStatusColor(status: string): { bg: string; text: string } {
  const colors: Record<string, { bg: string; text: string }> = {
    active: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' },
    completed: { bg: 'bg-gray-100 dark:bg-gray-900/30', text: 'text-gray-700 dark:text-gray-300' },
    upcoming: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  };
  return colors[status] || colors.active;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
}

export function extractGitHubUsername(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'github.com') {
      const parts = parsed.pathname.replace(/\/$/, '').split('/').filter(Boolean);
      return parts.length === 1 ? parts[0] : null;
    }
  } catch {}
  return null;
}

/** Minutes to read `body` at 230 words per minute; never less than 1. */
export function readingTime(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 230));
}

export type DatePrecision = 'day' | 'month' | 'year';

/** "Oct 3, 2025" / "Oct 2025" / "2025". UTC, because date-only frontmatter parses as UTC midnight. */
export function formatNewsDate(date: Date, precision: DatePrecision = 'month'): string {
  const parts: Intl.DateTimeFormatOptions =
    precision === 'year'
      ? { year: 'numeric' }
      : precision === 'day'
        ? { year: 'numeric', month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'short' };
  return date.toLocaleDateString('en-US', { ...parts, timeZone: 'UTC' });
}

/** The content layer's entry order is not stable, so lists get an id tie-break before their real sort. */
export const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

/** Feed items minus the ids listed in config/feeds.yml `hidden`. */
export function withoutHidden<T extends { id: string }>(items: T[], hidden: string[]): T[] {
  const set = new Set(hidden);
  return items.filter((item) => !set.has(item.id));
}
