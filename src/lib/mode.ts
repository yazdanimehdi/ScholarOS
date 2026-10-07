export type Mode = 'static' | 'git' | 'postgres';

/** Replaced at build time by src/integrations/admin.ts (Vite define): functions keep the mode the build chose. */
declare const __SCHOLAROS_MODE__: Mode | undefined;

/** Where content lives: Postgres on Vercel with DATABASE_URL, git on Vercel, otherwise a static build. */
export function modeFromEnv(env: Record<string, string | undefined>): Mode {
  if (env.DATABASE_URL && !env.VERCEL) {
    throw new Error(
      'DATABASE_URL is set but VERCEL is not: Postgres mode only runs on Vercel. ' +
        'Unset DATABASE_URL for a static build, or build on Vercel (or with `vercel build`).',
    );
  }
  if (env.VERCEL) return env.DATABASE_URL ? 'postgres' : 'git';
  return 'static';
}

export function getMode(): Mode {
  return typeof __SCHOLAROS_MODE__ !== 'undefined' ? __SCHOLAROS_MODE__ : modeFromEnv(process.env);
}
